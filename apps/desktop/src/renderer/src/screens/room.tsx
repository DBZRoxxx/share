import {
  RoomContext,
  useConnectionQualityIndicator,
  useLocalParticipant,
} from '@livekit/components-react'
import { CHAT_SYNC_MAX, parseChatHistory, type ChatEnvelope } from '@share/shared/chat'
import type { ResumeState } from '@shared/ipc'
import {
  ConnectionQuality,
  DisconnectReason,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from 'livekit-client'
import { Copy, Loader2, RotateCw, Signal, SignalLow, SignalMedium, WifiOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { TitleBar } from '@/components/title-bar'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/primitives'
import { copyInvite } from '@/lib/invite'
import { CAMERA_CAPTURE, cameraPublishOptions, MIC_CAPTURE, ROOM_OPTIONS } from '@/lib/media'
import { setChatAuth } from '@/lib/chat-api'
import { AudioOverlay } from '@/music/audio-overlay'
import { takeMusicSnapshot, type MusicSnapshot } from '@/music/music-store'
import { useMusicTransport } from '@/music/use-music'
import { fetchToken, TokenError } from '@/lib/token'
import { useNav, type JoinOptions } from '@/stores/nav'
import { usePrefs } from '@/stores/prefs'
import { useSettingsUi } from '@/stores/settings-ui'
import { setResumeProvider } from '@/stores/update'
import { AudioRenderer } from '@/room/audio-renderer'
import { ControlBar, useMediaToggles } from '@/room/control-bar'
import { displayName } from '@/room/media-tile'
import { notifyPresence } from '@/room/notify'
import { tileKey, useRoomUi } from '@/room/room-ui'
import { ScreenPicker } from '@/room/screen-picker'
import { ScreenShareController } from '@/room/screen-share'
import { SidePanel } from '@/room/side-panel'
import { useChatTransport } from '@/room/use-chat'
import { useChat } from '@/room/chat-store'
import { RoomAccess, RoomTitle, useRoomInfo, useRoomNameSync } from '@/room/room-name'
import { Stage } from '@/room/stage'

type Status =
  | { state: 'connecting' }
  | {
      state: 'connected'
      room: Room
      controller: ScreenShareController
      chatSeed: ChatEnvelope[]
      /** Music to carry on with if nobody in the room has it. */
      musicSeed: unknown
    }
  | { state: 'error'; message: string }
  | { state: 'disconnected'; message: string }

/** Participant attribute announcing an update in progress. */
const ATTR_STATUS = 'share.status'
const UPDATE_REJOIN_WINDOW_MS = 90_000

/** Chat carried over by a v0.2 app updating in the room (newer versions keep it locally). */
function restoreChat(chat: unknown[]): ChatEnvelope[] {
  const history = parseChatHistory(JSON.stringify({ v: 1, messages: chat.slice(-CHAT_SYNC_MAX) }))
  return (history?.messages ?? []).map(({ payload, from, fromName }) => ({
    from,
    fromName,
    event: payload,
  }))
}

async function resumeScreenShare(
  controller: ScreenShareController,
  screen: NonNullable<ResumeState['screen']>,
) {
  const reopenPicker = () => useRoomUi.getState().setPickerOpen(true)
  try {
    const sources = await window.share.capture.getSources()
    if (!sources.some((s) => s.id === screen.sourceId)) {
      toast('Escolha de novo o que compartilhar', {
        description: `“${screen.sourceName}” não está mais aberto.`,
        action: { label: 'Compartilhar', onClick: reopenPicker },
      })
      return
    }
    await controller.start({ ...screen, codec: usePrefs.getState().videoCodec })
  } catch (error) {
    console.error('[room] could not resume screen share', error)
    toast.error('Não foi possível voltar a compartilhar a tela.', {
      action: { label: 'Escolher', onClick: reopenPicker },
    })
  }
}

/** Lets an update capture where the user is, so they come back to the same state. */
function useResumeProvider(roomId: string, room: Room, controller: ScreenShareController) {
  useEffect(
    () =>
      setResumeProvider(async () => {
        const share = controller.getState()
        const ui = useRoomUi.getState()
        const state: ResumeState = {
          roomId,
          camera: room.localParticipant.isCameraEnabled,
          mic: room.localParticipant.isMicrophoneEnabled,
          screen:
            share.status === 'live'
              ? {
                  sourceId: share.request.sourceId,
                  sourceKind: share.request.sourceKind,
                  sourceName: share.request.sourceName,
                  quality: share.request.quality,
                  audio: share.request.audio,
                }
              : null,
          layout: ui.layout,
          spotlightKey: ui.spotlightKey,
          // The chat is cached locally and on the server.
          chat: [],
          roomKey: useRoomInfo.getState().roomKey,
          music: takeMusicSnapshot(),
        }
        // Tell the others before the connection drops (best effort, short wait).
        await Promise.race([
          room.localParticipant.setAttributes({ [ATTR_STATUS]: 'updating' }),
          new Promise((resolve) => setTimeout(resolve, 800)),
        ]).catch(() => undefined)
        return state
      }),
    [roomId, room, controller],
  )
}

function disconnectMessage(reason: DisconnectReason | undefined): string | null {
  switch (reason) {
    case DisconnectReason.CLIENT_INITIATED:
      return null
    case DisconnectReason.DUPLICATE_IDENTITY:
      return 'Você entrou nesta sala em outro lugar.'
    case DisconnectReason.PARTICIPANT_REMOVED:
      return 'Você foi removido da sala.'
    case DisconnectReason.ROOM_DELETED:
      return 'A sala foi encerrada.'
    default:
      return 'A conexão com a sala caiu.'
  }
}

export function RoomScreen({
  roomId,
  resume,
  create,
  roomKey,
}: {
  roomId: string
  resume?: ResumeState
} & Pick<JoinOptions, 'create' | 'roomKey'>) {
  const goHome = useNav((s) => s.goHome)
  // Only the first connection attempt restores the pre-update state.
  const [initialResume] = useState(() => resume ?? null)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ attempt: number; status: Status } | null>(null)
  // What was playing when the last connection to this room ended ("Tentar de novo").
  const musicCarry = useRef<MusicSnapshot | null>(null)
  // A new attempt starts as "connecting" until its own result arrives.
  const status: Status = result?.attempt === attempt ? result.status : { state: 'connecting' }

  useEffect(() => {
    const resume = attempt === 0 ? initialResume : null
    useRoomUi.getState().reset()
    useChat.getState().reset()
    // Show the name we already know right away; the server's answer follows.
    const known = usePrefs.getState().recentRooms.find((r) => r.id === roomId)
    useRoomInfo.setState({
      name: create?.name ?? known?.name ?? null,
      private: !!create?.password || !!known?.private,
      owner: !!create || !!known?.ownerKey,
      roomKey: roomKey ?? resume?.roomKey ?? null,
    })
    const chatSeed = resume ? restoreChat(resume.chat) : []
    const musicSeed = resume?.music ?? musicCarry.current
    musicCarry.current = null
    if (resume) {
      useRoomUi.setState({ layout: resume.layout, spotlightKey: resume.spotlightKey })
    }
    const prefs = usePrefs.getState()
    const room = new Room({
      ...ROOM_OPTIONS,
      audioOutput: prefs.speakerId ? { deviceId: prefs.speakerId } : undefined,
    })
    const controller = new ScreenShareController(room)
    let cancelled = false
    const setStatus = (s: Status) => setResult({ attempt, status: s })

    room.on(RoomEvent.Disconnected, (reason) => {
      if (cancelled) return
      const message = disconnectMessage(reason)
      if (message) setStatus({ state: 'disconnected', message })
    })

    void (async () => {
      try {
        const sessionKey = roomKey ?? resume?.roomKey ?? known?.roomKey ?? undefined
        const request = {
          roomId,
          name: prefs.name,
          identity: prefs.identity,
          roomName: create?.name,
          create: create ? true : undefined,
          password: create?.password,
          roomKey: sessionKey,
          ownerKey: known?.ownerKey ?? undefined,
        }
        const res = await fetchToken(request)
        if (cancelled) return
        // Later refreshes (token expiry) prove access with the keys, not the password.
        const refreshRequest = {
          roomId,
          name: prefs.name,
          identity: prefs.identity,
          roomKey: res.roomKey ?? sessionKey,
          ownerKey: res.ownerKey ?? known?.ownerKey ?? undefined,
        }
        setChatAuth({
          roomId,
          token: res.token,
          refresh: async () => (await fetchToken(refreshRequest)).token,
        })
        await room.connect(res.url, res.token)
        if (cancelled) return
        prefs.addRecentRoom(roomId, {
          name: res.roomName,
          private: res.private,
          createdByMe: res.owner ? true : undefined,
          ownerKey: res.ownerKey ?? undefined,
        })
        useRoomInfo.setState({
          ...(res.roomName !== undefined ? { name: res.roomName } : {}),
          private: !!res.private,
          owner: !!res.owner,
          roomKey: res.private && !res.owner ? (res.roomKey ?? null) : null,
        })
        setStatus({ state: 'connected', room, controller, chatSeed, musicSeed })

        const withMic = resume ? resume.mic : prefs.joinWithMic
        const withCamera = resume ? resume.camera : prefs.joinWithCamera
        if (withMic) {
          room.localParticipant
            .setMicrophoneEnabled(true, { ...MIC_CAPTURE, deviceId: prefs.micId ?? undefined })
            .catch(() => toast.error('Não foi possível ligar o microfone.'))
        }
        if (withCamera) {
          room.localParticipant
            .setCameraEnabled(
              true,
              { ...CAMERA_CAPTURE, deviceId: prefs.cameraId ?? undefined },
              cameraPublishOptions(prefs.videoCodec),
            )
            .catch(() => toast.error('Não foi possível ligar a câmera.'))
        }
        if (resume?.screen) void resumeScreenShare(controller, resume.screen)
      } catch (error) {
        if (cancelled) return
        // Private room without (valid) access: ask for the password.
        if (error instanceof TokenError && error.code?.startsWith('password_')) {
          usePrefs.getState().updateRecentRoom(roomId, { roomKey: null, private: true })
          useNav.getState().goPrejoin(roomId, { error: error.message })
          return
        }
        console.error('[room] connect failed', error)
        setStatus({
          state: 'error',
          message: error instanceof Error ? error.message : 'Erro desconhecido ao entrar na sala.',
        })
      }
    })()

    return () => {
      cancelled = true
      setChatAuth(null)
      controller.dispose()
      void room.disconnect()
    }
  }, [roomId, attempt, initialResume, create, roomKey])

  if (status.state === 'connected') {
    return (
      <RoomContext.Provider value={status.room}>
        <ConnectedRoom
          roomId={roomId}
          room={status.room}
          controller={status.controller}
          chatSeed={status.chatSeed}
          musicSeed={status.musicSeed}
          onMusicCarry={(snapshot) => (musicCarry.current = snapshot)}
        />
      </RoomContext.Provider>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        {status.state === 'connecting' ? (
          <>
            <Loader2 className="text-accent size-8 animate-spin" />
            <p className="text-muted">Entrando na sala…</p>
          </>
        ) : (
          <>
            <WifiOff className="text-danger size-10" />
            <div>
              <h1 className="text-xl font-semibold">
                {status.state === 'error' ? 'Não foi possível entrar na sala' : 'Você saiu da sala'}
              </h1>
              <p className="text-muted mt-1 max-w-md text-sm">{status.message}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={goHome}>
                Voltar ao início
              </Button>
              <Button variant="primary" onClick={() => setAttempt((n) => n + 1)}>
                <RotateCw /> Tentar de novo
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ConnectedRoom({
  roomId,
  room,
  controller,
  chatSeed,
  musicSeed,
  onMusicCarry,
}: {
  roomId: string
  room: Room
  controller: ScreenShareController
  chatSeed: ChatEnvelope[]
  musicSeed: unknown
  onMusicCarry: (snapshot: MusicSnapshot | null) => void
}) {
  const goHome = useNav((s) => s.goHome)
  const [reconnecting, setReconnecting] = useState(false)
  const invite = () => void copyInvite(roomId)

  // Unmounting RoomScreen disposes the controller and disconnects the room.
  const leave = goHome

  useRoomToasts(room)
  useShortcuts(controller)
  useChatTransport(room, roomId, chatSeed)
  useMusicTransport(room, roomId, musicSeed, onMusicCarry)
  useResumeProvider(roomId, room, controller)
  useRoomNameSync(room, roomId)

  // The app-wide settings dialog shows this room's devices while connected.
  useEffect(() => {
    useSettingsUi.setState({ room })
    return () => useSettingsUi.setState({ room: null })
  }, [room])
  const roomName = useRoomInfo((s) => s.name)

  useEffect(() => {
    void window.share.app.setRoom(roomId, roomName)
  }, [roomId, roomName])
  useEffect(() => () => void window.share.app.setRoom(null), [])

  useEffect(() => {
    const onReconnecting = () => setReconnecting(true)
    const onReconnected = () => setReconnecting(false)
    room.on(RoomEvent.Reconnecting, onReconnecting).on(RoomEvent.Reconnected, onReconnected)
    return () => {
      room.off(RoomEvent.Reconnecting, onReconnecting).off(RoomEvent.Reconnected, onReconnected)
    }
  }, [room])

  return (
    <div className="flex h-full flex-col">
      <TitleBar>
        <RoomTitle room={room} roomId={roomId} />
        <RoomAccess room={room} roomId={roomId} />
        <Tooltip content="Copiar link de convite" side="bottom">
          <button
            type="button"
            onClick={invite}
            data-room-id={roomId}
            className="no-drag bg-surface-2 hover:bg-surface-3 flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium"
          >
            <Copy className="size-3.5" /> Convidar
          </button>
        </Tooltip>
        <ConnectionIndicator />
      </TitleBar>

      {reconnecting && (
        <div
          className="bg-warning/15 text-warning flex items-center justify-center gap-2 py-1.5 text-sm"
          role="status"
        >
          <Loader2 className="size-4 animate-spin" /> Conexão instável — reconectando…
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <Stage onInvite={invite} />
        <SidePanel onInvite={invite} />
      </div>

      <ControlBar controller={controller} onLeave={leave} />
      <AudioRenderer />
      <AudioOverlay />
      <ScreenPicker controller={controller} />
    </div>
  )
}

function ConnectionIndicator() {
  const { localParticipant } = useLocalParticipant()
  const { quality } = useConnectionQualityIndicator({ participant: localParticipant })
  const map = {
    [ConnectionQuality.Excellent]: { icon: Signal, text: 'Conexão excelente', cls: 'text-success' },
    [ConnectionQuality.Good]: { icon: SignalMedium, text: 'Conexão boa', cls: 'text-success' },
    [ConnectionQuality.Poor]: { icon: SignalLow, text: 'Conexão fraca', cls: 'text-warning' },
    [ConnectionQuality.Lost]: { icon: WifiOff, text: 'Sem conexão', cls: 'text-danger' },
    [ConnectionQuality.Unknown]: { icon: Signal, text: 'Medindo conexão…', cls: 'text-muted' },
  }
  const { icon: Icon, text, cls } = map[quality] ?? map[ConnectionQuality.Unknown]
  return (
    <Tooltip content={text} side="bottom">
      <span className={`no-drag flex items-center ${cls}`} aria-label={text}>
        <Icon className="size-4" />
      </span>
    </Tooltip>
  )
}

function useRoomToasts(room: Room) {
  const toggleSpotlight = useRoomUi((s) => s.toggleSpotlight)

  useEffect(() => {
    // Someone applying an update leaves and comes back seconds later: say so
    // instead of announcing a leave and a join.
    const updating = new Map<string, number>()
    // ...and whose restored screen share is not news.
    const returned = new Map<string, number>()
    const joined = (p: RemoteParticipant) => {
      const since = updating.get(p.identity)
      updating.delete(p.identity)
      if (since && Date.now() - since < UPDATE_REJOIN_WINDOW_MS) {
        returned.set(p.identity, Date.now())
        toast(`${displayName(p)} voltou (app atualizado)`, { id: `updating-${p.identity}` })
      } else if (notifyPresence({ identity: p.identity, name: displayName(p) }, true)) {
        toast(`${displayName(p)} entrou na sala`)
      }
    }
    const left = (p: RemoteParticipant) => {
      if (p.attributes[ATTR_STATUS] === 'updating') {
        updating.set(p.identity, Date.now())
        toast(`${displayName(p)} está atualizando o app…`, { id: `updating-${p.identity}` })
        return
      }
      if (notifyPresence({ identity: p.identity, name: displayName(p) }, false))
        toast(`${displayName(p)} saiu da sala`)
    }
    const published = (pub: RemoteTrackPublication, p: RemoteParticipant) => {
      if (pub.source !== Track.Source.ScreenShare) return
      const back = returned.get(p.identity)
      if (back && Date.now() - back < 20_000) return
      toast(`${displayName(p)} começou a compartilhar a tela`, {
        action: {
          label: 'Destacar',
          onClick: () => toggleSpotlight(tileKey(p as Participant, Track.Source.ScreenShare)),
        },
      })
    }
    room
      .on(RoomEvent.ParticipantConnected, joined)
      .on(RoomEvent.ParticipantDisconnected, left)
      .on(RoomEvent.TrackPublished, published)
    return () => {
      room
        .off(RoomEvent.ParticipantConnected, joined)
        .off(RoomEvent.ParticipantDisconnected, left)
        .off(RoomEvent.TrackPublished, published)
    }
  }, [room, toggleSpotlight])
}

function useShortcuts(controller: ScreenShareController) {
  const media = useMediaToggles()
  const { toggleCamera, toggleMic } = media

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || !e.shiftKey || e.altKey || e.repeat) return
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      const ui = useRoomUi.getState()
      switch (e.key.toLowerCase()) {
        case 's':
          if (controller.getState().status === 'live') void controller.stop()
          else ui.setPickerOpen(true)
          break
        case 'v':
          void toggleCamera()
          break
        case 'm':
          void toggleMic()
          break
        case 'l':
          ui.setLayout(ui.layout === 'grid' ? 'spotlight' : 'grid')
          break
        case 'c':
          ui.togglePanel('chat')
          break
        case 'p':
          ui.togglePanel('music')
          break
        default:
          return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [controller, toggleCamera, toggleMic])
}
