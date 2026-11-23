import {
  RoomContext,
  useConnectionQualityIndicator,
  useLocalParticipant,
} from '@livekit/components-react'
import { formatRoomId } from '@share/shared'
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
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { TitleBar } from '@/components/title-bar'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/primitives'
import { copyInvite } from '@/lib/invite'
import { CAMERA_CAPTURE, cameraPublishOptions, MIC_CAPTURE, ROOM_OPTIONS } from '@/lib/media'
import { fetchToken } from '@/lib/token'
import { useNav } from '@/stores/nav'
import { usePrefs } from '@/stores/prefs'
import { AudioRenderer } from '@/room/audio-renderer'
import { ControlBar, useMediaToggles } from '@/room/control-bar'
import { displayName } from '@/room/media-tile'
import { ParticipantsPanel } from '@/room/participants-panel'
import { tileKey, useRoomUi } from '@/room/room-ui'
import { ScreenPicker } from '@/room/screen-picker'
import { ScreenShareController } from '@/room/screen-share'
import { SettingsDialog } from '@/room/settings-dialog'
import { Stage } from '@/room/stage'

type Status =
  | { state: 'connecting' }
  | { state: 'connected'; room: Room; controller: ScreenShareController }
  | { state: 'error'; message: string }
  | { state: 'disconnected'; message: string }

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

export function RoomScreen({ roomId }: { roomId: string }) {
  const goHome = useNav((s) => s.goHome)
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{ attempt: number; status: Status } | null>(null)
  // A new attempt starts as "connecting" until its own result arrives.
  const status: Status = result?.attempt === attempt ? result.status : { state: 'connecting' }

  useEffect(() => {
    useRoomUi.getState().reset()
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
        const { token, url } = await fetchToken({
          roomId,
          name: prefs.name,
          identity: prefs.identity,
        })
        if (cancelled) return
        await room.connect(url, token)
        if (cancelled) return
        prefs.addRecentRoom(roomId)
        setStatus({ state: 'connected', room, controller })

        if (prefs.joinWithMic) {
          room.localParticipant
            .setMicrophoneEnabled(true, { ...MIC_CAPTURE, deviceId: prefs.micId ?? undefined })
            .catch(() => toast.error('Não foi possível ligar o microfone.'))
        }
        if (prefs.joinWithCamera) {
          room.localParticipant
            .setCameraEnabled(
              true,
              { ...CAMERA_CAPTURE, deviceId: prefs.cameraId ?? undefined },
              cameraPublishOptions(prefs.videoCodec),
            )
            .catch(() => toast.error('Não foi possível ligar a câmera.'))
        }
      } catch (error) {
        if (cancelled) return
        console.error('[room] connect failed', error)
        setStatus({
          state: 'error',
          message: error instanceof Error ? error.message : 'Erro desconhecido ao entrar na sala.',
        })
      }
    })()

    return () => {
      cancelled = true
      controller.dispose()
      void room.disconnect()
    }
  }, [roomId, attempt])

  if (status.state === 'connected') {
    return (
      <RoomContext.Provider value={status.room}>
        <ConnectedRoom roomId={roomId} room={status.room} controller={status.controller} />
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
            <p className="text-muted">Entrando na sala {formatRoomId(roomId)}…</p>
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
}: {
  roomId: string
  room: Room
  controller: ScreenShareController
}) {
  const goHome = useNav((s) => s.goHome)
  const panelOpen = useRoomUi((s) => s.panelOpen)
  const [reconnecting, setReconnecting] = useState(false)
  const invite = () => void copyInvite(roomId)

  // Unmounting RoomScreen disposes the controller and disconnects the room.
  const leave = goHome

  useRoomToasts(room)
  useShortcuts(controller)

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
        <div className="no-drag bg-surface-2 flex items-center gap-1 rounded-lg py-0.5 pr-0.5 pl-2.5">
          <span className="text-muted font-mono text-xs">{formatRoomId(roomId)}</span>
          <Tooltip content="Copiar link de convite" side="bottom">
            <button
              type="button"
              onClick={invite}
              className="hover:bg-surface-3 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium"
            >
              <Copy className="size-3.5" /> Convidar
            </button>
          </Tooltip>
        </div>
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
        {panelOpen && <ParticipantsPanel onInvite={invite} />}
      </div>

      <ControlBar controller={controller} onLeave={leave} />
      <AudioRenderer />
      <ScreenPicker controller={controller} />
      <SettingsDialog />
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
    const joined = (p: RemoteParticipant) => toast(`${displayName(p)} entrou na sala`)
    const left = (p: RemoteParticipant) => toast(`${displayName(p)} saiu da sala`)
    const published = (pub: RemoteTrackPublication, p: RemoteParticipant) => {
      if (pub.source !== Track.Source.ScreenShare) return
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
        default:
          return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [controller, toggleCamera, toggleMic])
}
