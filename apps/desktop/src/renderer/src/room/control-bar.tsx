import { useLocalParticipant, useParticipants } from '@livekit/components-react'
import {
  Camera,
  CameraOff,
  LayoutGrid,
  Loader2,
  MessageCircle,
  Mic,
  MicOff,
  MonitorOff,
  MonitorUp,
  Music,
  PhoneOff,
  RectangleHorizontal,
  Repeat2,
  Settings,
  Users,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/primitives'
import { describeMediaError } from '@/lib/devices'
import { CAMERA_CAPTURE, cameraPublishOptions, micCaptureOptions } from '@/lib/media'
import { cn } from '@/lib/utils'
import { usesPushToTalk } from '@/audio/mic-chain'
import { useMic } from '@/audio/mic-state'
import { useMusic } from '@/music/music-store'
import { usePrefs } from '@/stores/prefs'
import { useChat } from './chat-store'
import { useRoomUi } from './room-ui'
import { useSettingsUi } from '@/stores/settings-ui'
import { useScreenShareState, type ScreenShareController } from './screen-share'

function ControlButton({
  label,
  shortcut,
  active,
  danger,
  busy,
  live,
  onClick,
  children,
  badge,
}: {
  label: string
  shortcut?: string
  active?: boolean
  danger?: boolean
  busy?: boolean
  /** Ring around the button: the mic is transmitting right now. */
  live?: boolean
  onClick: () => void
  children: ReactNode
  badge?: ReactNode
}) {
  return (
    <Tooltip content={label} shortcut={shortcut}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        onClick={onClick}
        disabled={busy}
        className={cn(
          'relative flex size-12 items-center justify-center rounded-2xl transition-colors disabled:opacity-60 [&_svg]:size-5',
          danger
            ? 'bg-danger/15 text-danger hover:bg-danger/25'
            : active
              ? 'bg-accent hover:bg-accent-hover text-white'
              : 'bg-surface-2 text-fg hover:bg-surface-3',
          live && 'ring-success ring-offset-surface ring-2 ring-offset-2',
        )}
      >
        {busy ? <Loader2 className="animate-spin" /> : children}
        {badge}
      </button>
    </Tooltip>
  )
}

function Badge({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <span
      className={cn(
        'absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold',
        accent ? 'bg-accent ring-surface text-white ring-2' : 'bg-fg text-bg',
      )}
    >
      {children}
    </span>
  )
}

export function useMediaToggles() {
  const { localParticipant, isCameraEnabled, isMicrophoneEnabled } = useLocalParticipant()
  const { cameraId, videoCodec } = usePrefs()
  const [busy, setBusy] = useState<'camera' | 'mic' | null>(null)

  const toggleCamera = async () => {
    if (busy) return
    setBusy('camera')
    try {
      await localParticipant.setCameraEnabled(
        !isCameraEnabled,
        { ...CAMERA_CAPTURE, deviceId: cameraId ?? undefined },
        cameraPublishOptions(videoCodec),
      )
    } catch (error) {
      toast.error(describeMediaError(error, 'câmera'))
    } finally {
      setBusy(null)
    }
  }

  const toggleMic = async () => {
    if (busy) return
    setBusy('mic')
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled, micCaptureOptions())
    } catch (error) {
      toast.error(describeMediaError(error, 'microfone'))
    } finally {
      setBusy(null)
    }
  }

  return { isCameraEnabled, isMicrophoneEnabled, toggleCamera, toggleMic, busy }
}

export function ControlBar({
  controller,
  onLeave,
}: {
  controller: ScreenShareController
  onLeave: () => void
}) {
  const media = useMediaToggles()
  const share = useScreenShareState(controller)
  const participants = useParticipants()
  const layout = useRoomUi((s) => s.layout)
  const setLayout = useRoomUi((s) => s.setLayout)
  const panel = useRoomUi((s) => s.panel)
  const togglePanel = useRoomUi((s) => s.togglePanel)
  const unread = useChat((s) => s.unread)
  const musicPlaying = useMusic((s) => !!s.room?.playing)
  const setPickerOpen = useRoomUi((s) => s.setPickerOpen)
  const setSettingsOpen = useSettingsUi((s) => s.setOpen)
  const transmitting = useMic((s) => !!s.level?.open)
  const pttKey = usePrefs((s) => (usesPushToTalk(s.audio) ? s.audio.pttBinding?.label : null))

  const sharing = share.status === 'live'

  return (
    <footer className="border-border bg-surface flex h-20 shrink-0 items-center justify-between gap-4 border-t px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {sharing && (
          <div className="bg-accent/10 flex min-w-0 items-center gap-2 rounded-xl px-3 py-2 text-sm">
            <span className="relative flex size-2.5 shrink-0">
              <span className="bg-accent absolute inline-flex size-full animate-ping rounded-full opacity-60" />
              <span className="bg-accent relative inline-flex size-2.5 rounded-full" />
            </span>
            <span className="truncate">
              Compartilhando <strong className="font-medium">{share.sourceName}</strong>
              {share.audio !== 'none' && <span className="text-muted"> · com áudio</span>}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <ControlButton
          label={
            media.isMicrophoneEnabled
              ? pttKey
                ? `Desligar microfone · segure ${pttKey} para falar`
                : 'Desligar microfone'
              : 'Ligar microfone'
          }
          shortcut="Ctrl+Shift+M"
          active={media.isMicrophoneEnabled}
          live={media.isMicrophoneEnabled && transmitting}
          busy={media.busy === 'mic'}
          onClick={() => void media.toggleMic()}
        >
          {media.isMicrophoneEnabled ? <Mic /> : <MicOff />}
        </ControlButton>
        <ControlButton
          label={media.isCameraEnabled ? 'Desligar câmera' : 'Ligar câmera'}
          shortcut="Ctrl+Shift+V"
          active={media.isCameraEnabled}
          busy={media.busy === 'camera'}
          onClick={() => void media.toggleCamera()}
        >
          {media.isCameraEnabled ? <Camera /> : <CameraOff />}
        </ControlButton>

        {sharing ? (
          <>
            <ControlButton
              label="Trocar o que está sendo compartilhado"
              onClick={() => setPickerOpen(true)}
            >
              <Repeat2 />
            </ControlButton>
            <Tooltip content="Parar de compartilhar" shortcut="Ctrl+Shift+S">
              <Button
                variant="danger"
                className="h-12 rounded-2xl px-5"
                onClick={() => void controller.stop()}
              >
                <MonitorOff className="size-5" /> Parar
              </Button>
            </Tooltip>
          </>
        ) : (
          <Tooltip content="Compartilhar tela" shortcut="Ctrl+Shift+S">
            <Button
              variant="primary"
              className="h-12 rounded-2xl px-5"
              disabled={share.status === 'starting'}
              onClick={() => setPickerOpen(true)}
            >
              {share.status === 'starting' ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <MonitorUp className="size-5" />
              )}
              Compartilhar tela
            </Button>
          </Tooltip>
        )}

        <ControlButton
          label={layout === 'grid' ? 'Modo destaque' : 'Modo grade'}
          shortcut="Ctrl+Shift+L"
          onClick={() => setLayout(layout === 'grid' ? 'spotlight' : 'grid')}
        >
          {layout === 'grid' ? <RectangleHorizontal /> : <LayoutGrid />}
        </ControlButton>

        <div className="bg-border mx-1 h-8 w-px" />

        <ControlButton label="Sair da sala" danger onClick={onLeave}>
          <PhoneOff />
        </ControlButton>
      </div>

      <div className="flex flex-1 items-center justify-end gap-2">
        <ControlButton
          label="Chat"
          shortcut="Ctrl+Shift+C"
          active={panel === 'chat'}
          onClick={() => togglePanel('chat')}
          badge={
            unread > 0 && panel !== 'chat' ? (
              <Badge accent>{unread > 99 ? '99+' : unread}</Badge>
            ) : undefined
          }
        >
          <MessageCircle />
        </ControlButton>
        <ControlButton
          label="Música e watch party"
          shortcut="Ctrl+Shift+P"
          active={panel === 'music'}
          onClick={() => togglePanel('music')}
          badge={
            musicPlaying ? (
              <span
                className="bg-accent ring-surface absolute -top-0.5 -right-0.5 size-3 rounded-full ring-2"
                aria-label="Tocando"
              />
            ) : undefined
          }
        >
          <Music />
        </ControlButton>
        <ControlButton
          label="Pessoas na sala"
          active={panel === 'people'}
          onClick={() => togglePanel('people')}
          badge={<Badge>{participants.length}</Badge>}
        >
          <Users />
        </ControlButton>
        <ControlButton label="Configurações" onClick={() => setSettingsOpen(true)}>
          <Settings />
        </ControlButton>
      </div>
    </footer>
  )
}
