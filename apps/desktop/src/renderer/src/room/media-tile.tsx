import {
  isTrackReference,
  useIsSpeaking,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-react'
import { Track, type Participant, type VideoTrack } from 'livekit-client'
import {
  Expand,
  MicOff,
  MonitorUp,
  PictureInPicture2,
  Pin,
  PinOff,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Slider, Tooltip } from '@/components/ui/primitives'
import { cn, hueFor, initials } from '@/lib/utils'
import { usePrefs } from '@/stores/prefs'
import { PopoutWindow } from './popout'
import { screenAudioKey, tileKey, useRoomUi } from './room-ui'
import { formatStats, useVideoStats } from './use-video-stats'
import { ForeignVideoView, VideoView } from './video-view'

export function displayName(p: Participant): string {
  return p.name || p.identity.slice(0, 8)
}

function useParticipantFlag(participant: Participant, source: Track.Source) {
  const pub = participant.getTrackPublication(source)
  return { published: !!pub, muted: pub?.isMuted ?? true }
}

export function Avatar({
  participant,
  size = 'md',
  speaking,
}: {
  participant: Participant
  size?: 'sm' | 'md' | 'lg'
  speaking?: boolean
}) {
  const hue = hueFor(participant.identity)
  const sizes = { sm: 'size-8 text-xs', md: 'size-16 text-xl', lg: 'size-24 text-3xl' }
  return (
    <span
      className={cn(
        'ring-offset-surface flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-offset-2 transition-shadow',
        sizes[size],
        speaking && 'ring-success ring-2',
      )}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 70% 58%), hsl(${(hue + 40) % 360} 65% 45%))`,
      }}
      aria-hidden="true"
    >
      {initials(displayName(participant))}
    </span>
  )
}

function TileButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Tooltip content={label} side="bottom">
      <button
        type="button"
        aria-label={label}
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        className="flex size-8 items-center justify-center rounded-lg bg-black/55 text-white backdrop-blur transition-colors hover:bg-black/80 [&_svg]:size-4"
      >
        {children}
      </button>
    </Tooltip>
  )
}

export function MediaTile({
  trackRef,
  variant,
  hasScreenAudio = false,
  doubleClick = 'spotlight',
  style,
}: {
  trackRef: TrackReferenceOrPlaceholder
  variant: 'main' | 'strip'
  hasScreenAudio?: boolean
  /** What double-clicking the tile does. */
  doubleClick?: 'spotlight' | 'fullscreen'
  style?: CSSProperties
}) {
  const { participant, source } = trackRef
  const key = tileKey(participant, source)
  const isScreen = source === Track.Source.ScreenShare
  const isLocal = participant.isLocal

  const tileRef = useRef<HTMLDivElement>(null)
  const speaking = useIsSpeaking(participant)
  const mic = useParticipantFlag(participant, Track.Source.Microphone)
  const showStats = usePrefs((s) => s.showStats)

  const layout = useRoomUi((s) => s.layout)
  const spotlightKey = useRoomUi((s) => s.spotlightKey)
  const toggleSpotlight = useRoomUi((s) => s.toggleSpotlight)
  const poppedOut = useRoomUi((s) => !!s.poppedOut[key])
  const setPoppedOut = useRoomUi((s) => s.setPoppedOut)
  const audioKey = screenAudioKey(participant.identity)
  const volume = useRoomUi((s) => s.volumes[audioKey] ?? 1)
  const setVolume = useRoomUi((s) => s.setVolume)
  const toggleMute = useRoomUi((s) => s.toggleMute)
  const [hovered, setHovered] = useState(false)

  const pub = isTrackReference(trackRef) ? trackRef.publication : undefined
  const track = pub?.track as VideoTrack | undefined
  const hasVideo = !!track && !pub?.isMuted
  const isSpotlit = layout === 'spotlight' && spotlightKey === key
  const stats = useVideoStats(track, showStats && hasVideo && !poppedOut)

  const name = displayName(participant)
  const label = isScreen
    ? isLocal
      ? 'Sua tela'
      : `Tela de ${name}`
    : isLocal
      ? `${name} (você)`
      : name
  const mirror = isLocal && source === Track.Source.Camera

  const fullscreen = () => {
    const el = tileRef.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen()
  }

  return (
    <div
      ref={tileRef}
      style={style}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={() => (doubleClick === 'fullscreen' ? fullscreen() : toggleSpotlight(key))}
      className={cn(
        'group bg-surface-2 relative isolate overflow-hidden rounded-xl select-none',
        variant === 'strip' && 'aspect-video w-full shrink-0',
        speaking && !isScreen && 'ring-success ring-2',
        isSpotlit && variant === 'strip' && 'ring-accent ring-2',
      )}
    >
      {poppedOut ? (
        <div className="bg-surface-2 text-muted flex size-full flex-col items-center justify-center gap-2 text-center text-sm">
          <PictureInPicture2 className="size-6" />
          {variant === 'main' && <span>Aberta em outra janela</span>}
          <button
            type="button"
            onClick={() => setPoppedOut(key, false)}
            className="bg-surface-3 text-fg hover:bg-border flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs"
          >
            <Undo2 className="size-3.5" /> Trazer de volta
          </button>
        </div>
      ) : hasVideo && track ? (
        <VideoView
          track={track}
          fit={isScreen || variant === 'main' ? 'contain' : 'cover'}
          mirror={mirror}
        />
      ) : (
        <div className="flex size-full items-center justify-center">
          <Avatar
            participant={participant}
            size={variant === 'main' ? 'lg' : 'md'}
            speaking={speaking}
          />
        </div>
      )}

      {/* Name label */}
      <div className="pointer-events-none absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-lg bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur">
        {isScreen && <MonitorUp className="size-3.5 shrink-0" />}
        {!isScreen && mic.published && mic.muted && (
          <MicOff className="text-danger size-3.5 shrink-0" />
        )}
        <span className="truncate">{label}</span>
      </div>

      {/* Stats */}
      {stats && (
        <div className="pointer-events-none absolute top-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-white/90">
          {formatStats(stats)}
        </div>
      )}

      {/* Hover actions */}
      <div
        className={cn(
          'absolute top-2 right-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100',
          hovered && 'opacity-100',
        )}
      >
        {isScreen && hasScreenAudio && !isLocal && (
          <div
            className="flex items-center gap-2 rounded-lg bg-black/55 pr-3 backdrop-blur"
            onDoubleClick={(e) => e.stopPropagation()}
          >
            <TileButton
              label={volume > 0 ? 'Silenciar' : 'Ativar som'}
              onClick={() => toggleMute(audioKey)}
            >
              {volume > 0 ? <Volume2 /> : <VolumeX />}
            </TileButton>
            <Slider
              className="w-20"
              min={0}
              max={1}
              step={0.01}
              value={[volume]}
              onValueChange={([v]) => setVolume(audioKey, v ?? 0)}
            />
          </div>
        )}
        <TileButton
          label={isSpotlit ? 'Sair do destaque' : 'Destacar'}
          onClick={() => toggleSpotlight(key)}
        >
          {isSpotlit ? <PinOff /> : <Pin />}
        </TileButton>
        {hasVideo && !poppedOut && (
          <TileButton label="Abrir em outra janela" onClick={() => setPoppedOut(key, true)}>
            <PictureInPicture2 />
          </TileButton>
        )}
        {variant === 'main' && hasVideo && !poppedOut && (
          <TileButton label="Tela cheia" onClick={fullscreen}>
            <Expand />
          </TileButton>
        )}
      </div>

      {poppedOut && track && (
        <PopoutWindow id={key} title={`${label} — Share`} onClose={() => setPoppedOut(key, false)}>
          <PopoutContent track={track} label={label} mirror={mirror} />
        </PopoutWindow>
      )}
    </div>
  )
}

function PopoutContent({
  track,
  label,
  mirror,
}: {
  track: VideoTrack
  label: string
  mirror: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const toggleFullscreen = () => {
    const el = ref.current
    if (!el) return
    const doc = el.ownerDocument
    if (doc.fullscreenElement) void doc.exitFullscreen()
    else void el.requestFullscreen()
  }
  return (
    <div
      ref={ref}
      onDoubleClick={toggleFullscreen}
      className="group relative size-full bg-black"
      title="Clique duas vezes para tela cheia"
    >
      <ForeignVideoView track={track} mirror={mirror} />
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-black/60 px-2.5 py-1 text-sm font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
        {label}
      </div>
    </div>
  )
}
