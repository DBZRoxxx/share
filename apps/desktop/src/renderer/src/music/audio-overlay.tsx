import { youtubeThumb } from '@share/shared/music'
import { ListMusic, Maximize2, Minimize2, Pause, Play } from 'lucide-react'
import { Tooltip } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { useRoomUi } from '@/room/room-ui'
import { ModeIcon, ProgressBar, TransportButtons, VolumeControl } from './music-controls'
import { useCurrentItem, useMusic } from './music-store'
import { musicActions } from './use-music'
import { YtPlayer } from './yt-player'

/**
 * Player in the bottom-right corner while the room listens to audio only.
 * The YouTube player sits invisible underneath the card (in view, so the
 * browser doesn't throttle it).
 */
export function AudioOverlay() {
  const item = useCurrentItem()
  const minimized = useMusic((s) => s.overlayMinimized)
  const setMinimized = useMusic((s) => s.setOverlayMinimized)
  const playing = useMusic((s) => !!s.room?.playing)
  const panel = useRoomUi((s) => s.panel)
  const togglePanel = useRoomUi((s) => s.togglePanel)

  if (!item || item.mode !== 'audio') return null

  return (
    <div
      role="region"
      aria-label="Música tocando"
      className={cn(
        'animate-scale-in border-border bg-surface/95 fixed bottom-24 isolate z-30 overflow-hidden border shadow-2xl shadow-black/50 backdrop-blur',
        minimized ? 'rounded-full' : 'w-80 rounded-2xl',
        // Clear of the side panel (w-80), so it never covers the chat box.
        panel ? 'right-[21rem]' : 'right-4',
      )}
    >
      <YtPlayer className="absolute inset-0 -z-10 size-full opacity-0" />

      {minimized ? (
        <div className="flex items-center gap-2 py-1.5 pr-2 pl-1.5">
          <img
            src={youtubeThumb(item.videoId)}
            alt=""
            className={cn(
              'size-8 rounded-full object-cover',
              playing && 'animate-[spin_8s_linear_infinite]',
            )}
          />
          <span className="max-w-40 truncate text-xs font-medium">{item.title}</span>
          <button
            type="button"
            aria-label={playing ? 'Pausar para todos' : 'Tocar para todos'}
            onClick={musicActions.togglePlay}
            className="hover:bg-surface-3 flex size-7 items-center justify-center rounded-full [&_svg]:size-3.5 [&_svg]:fill-current"
          >
            {playing ? <Pause /> : <Play />}
          </button>
          <Tooltip content="Abrir player">
            <button
              type="button"
              aria-label="Abrir player"
              onClick={() => setMinimized(false)}
              className="text-muted hover:bg-surface-3 hover:text-fg flex size-7 items-center justify-center rounded-full [&_svg]:size-3.5"
            >
              <Maximize2 />
            </button>
          </Tooltip>
        </div>
      ) : (
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-start gap-3">
            <img
              src={youtubeThumb(item.videoId)}
              alt=""
              className="aspect-video w-24 shrink-0 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-sm leading-snug font-medium" title={item.title}>
                {item.title}
              </p>
              <p className="text-muted mt-0.5 flex items-center gap-1 truncate text-xs">
                <ModeIcon mode="audio" className="size-3" />
                <span className="truncate">
                  {item.channel ? `${item.channel} · ` : ''}por {item.addedByName}
                </span>
              </p>
            </div>
            <Tooltip content="Minimizar">
              <button
                type="button"
                aria-label="Minimizar player"
                onClick={() => setMinimized(true)}
                className="text-muted hover:bg-surface-3 hover:text-fg -mt-1 -mr-1 rounded-lg p-1.5 [&_svg]:size-3.5"
              >
                <Minimize2 />
              </button>
            </Tooltip>
          </div>
          <ProgressBar compact />
          <div className="flex items-center justify-between">
            <VolumeControl />
            <TransportButtons />
            <Tooltip content="Fila">
              <button
                type="button"
                aria-label="Ver a fila"
                aria-pressed={panel === 'music'}
                onClick={() => togglePanel('music')}
                className={cn(
                  'flex size-8 items-center justify-center rounded-full transition-colors [&_svg]:size-4',
                  panel === 'music' ? 'bg-white/15 text-white' : 'text-white/85 hover:bg-white/10',
                )}
              >
                <ListMusic />
              </button>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  )
}
