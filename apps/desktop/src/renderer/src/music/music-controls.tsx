import { currentItem, type MusicMode } from '@share/shared/music'
import {
  Headphones,
  MonitorPlay,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { Slider, Tooltip } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { usePrefs } from '@/stores/prefs'
import { formatTime } from './music-logic'
import { localPosition, useMusic } from './music-store'
import { musicActions } from './use-music'

/** Where the current song is, refreshed as the player reports (twice a second). */
export function usePlaybackPosition(): { positionS: number; durationS: number } {
  // Subscribing to these re-renders on every report and every room change.
  useMusic((s) => s.player.at)
  useMusic((s) => s.syncSeq)
  const durationS = useMusic((s) => (s.room ? (currentItem(s.room)?.durationS ?? 0) : 0))
  const positionS = localPosition()
  return { positionS: durationS ? Math.min(positionS, durationS) : positionS, durationS }
}

export function ModeIcon({ mode, className }: { mode: MusicMode; className?: string }) {
  const Icon = mode === 'video' ? MonitorPlay : Headphones
  return (
    <Icon
      className={cn('shrink-0', className)}
      aria-label={mode === 'video' ? 'Áudio e vídeo' : 'Só áudio'}
    />
  )
}

/** Progress bar that seeks for the whole room when released. */
export function ProgressBar({ compact }: { compact?: boolean }) {
  const { positionS, durationS } = usePlaybackPosition()
  const [dragging, setDragging] = useState<number | null>(null)
  const live = durationS === 0
  const shown = dragging ?? positionS

  return (
    <div
      className={cn(
        'flex items-center gap-2 text-[11px] text-white/80 tabular-nums',
        compact && 'gap-1.5',
      )}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <span className="w-9 shrink-0 text-right">{formatTime(shown)}</span>
      {live ? (
        <span className="text-danger flex-1 text-center text-[10px] font-semibold tracking-wide uppercase">
          Ao vivo
        </span>
      ) : (
        <Slider
          className="flex-1"
          thumbLabel="Posição"
          min={0}
          max={durationS}
          step={1}
          value={[shown]}
          onValueChange={([v]) => setDragging(v ?? 0)}
          onValueCommit={([v]) => {
            setDragging(null)
            musicActions.seek(v ?? 0)
          }}
        />
      )}
      <span className="w-9 shrink-0">{live ? '' : formatTime(durationS)}</span>
    </div>
  )
}

function RoundButton({
  label,
  onClick,
  children,
  primary,
  disabled,
}: {
  label: string
  onClick: () => void
  children: ReactNode
  primary?: boolean
  disabled?: boolean
}) {
  return (
    <Tooltip content={label}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation()
          onClick()
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        className={cn(
          'flex items-center justify-center rounded-full transition-colors disabled:opacity-40',
          primary
            ? 'size-9 bg-white text-black hover:bg-white/85 [&_svg]:size-4 [&_svg]:fill-current'
            : 'size-8 text-white/85 hover:bg-white/10 hover:text-white [&_svg]:size-4',
        )}
      >
        {children}
      </button>
    </Tooltip>
  )
}

export function TransportButtons() {
  const playing = useMusic((s) => !!s.room?.playing)
  const hasCurrent = useMusic((s) => !!(s.room && currentItem(s.room)))
  const hasNext = useMusic((s) => !!s.room && s.room.index + 1 < s.room.queue.length)
  const hasQueue = useMusic((s) => !!s.room?.queue.length)
  return (
    <div className="flex items-center gap-1">
      <RoundButton label="Anterior" onClick={musicActions.prev} disabled={!hasQueue}>
        <SkipBack />
      </RoundButton>
      <RoundButton
        primary
        label={playing ? 'Pausar para todos' : 'Tocar para todos'}
        onClick={musicActions.togglePlay}
        disabled={!hasCurrent}
      >
        {playing ? <Pause /> : <Play />}
      </RoundButton>
      <RoundButton
        label={hasNext ? 'Próxima' : 'Encerrar'}
        onClick={musicActions.next}
        disabled={!hasCurrent}
      >
        <SkipForward />
      </RoundButton>
    </div>
  )
}

/** This computer's music volume (doesn't change it for anyone else). */
export function VolumeControl({ className }: { className?: string }) {
  const volume = usePrefs((s) => s.musicVolume)
  const muted = usePrefs((s) => s.musicMuted || s.musicVolume === 0)
  const set = usePrefs((s) => s.set)
  return (
    <div
      className={cn('flex items-center gap-1.5', className)}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <RoundButton
        label={muted ? 'Ativar som (só para você)' : 'Silenciar (só para você)'}
        onClick={() =>
          set(muted ? { musicMuted: false, musicVolume: volume || 0.5 } : { musicMuted: true })
        }
      >
        {muted ? <VolumeX /> : <Volume2 />}
      </RoundButton>
      <Slider
        className="w-20"
        min={0}
        max={1}
        step={0.01}
        value={[muted ? 0 : volume]}
        onValueChange={([v]) => set({ musicVolume: v ?? 0, musicMuted: false })}
      />
    </div>
  )
}
