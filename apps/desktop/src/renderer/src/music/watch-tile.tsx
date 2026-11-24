import { Expand, ListMusic, MonitorPlay, Pin, PinOff } from 'lucide-react'
import { useRef, type CSSProperties, type ReactNode } from 'react'
import { Tooltip } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { WATCH_KEY, useRoomUi } from '@/room/room-ui'
import { ProgressBar, TransportButtons, VolumeControl } from './music-controls'
import { useCurrentItem } from './music-store'
import { YtPlayer } from './yt-player'

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

/** The watch party on the stage: the room's video, like one more shared screen. */
export function WatchTile({
  variant,
  doubleClick = 'spotlight',
  style,
}: {
  variant: 'main' | 'strip'
  doubleClick?: 'spotlight' | 'fullscreen'
  style?: CSSProperties
}) {
  const item = useCurrentItem()
  const tileRef = useRef<HTMLDivElement>(null)
  const layout = useRoomUi((s) => s.layout)
  const spotlightKey = useRoomUi((s) => s.spotlightKey)
  const toggleSpotlight = useRoomUi((s) => s.toggleSpotlight)
  const togglePanel = useRoomUi((s) => s.togglePanel)
  const isSpotlit = layout === 'spotlight' && spotlightKey === WATCH_KEY

  if (!item) return null

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
      onDoubleClick={() =>
        doubleClick === 'fullscreen' ? fullscreen() : toggleSpotlight(WATCH_KEY)
      }
      className={cn(
        'group relative isolate overflow-hidden rounded-xl bg-black select-none',
        variant === 'strip' && 'aspect-video w-full shrink-0',
        isSpotlit && variant === 'strip' && 'ring-accent ring-2',
      )}
    >
      <YtPlayer className="absolute inset-0 size-full" />

      {/* Name label */}
      <div className="pointer-events-none absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-lg bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur transition-opacity group-hover:opacity-0">
        <MonitorPlay className="size-3.5 shrink-0" />
        <span className="truncate">
          Watch party · {item.title}
          <span className="text-white/60"> · por {item.addedByName}</span>
        </span>
      </div>

      {/* Hover actions */}
      <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <TileButton label="Fila" onClick={() => togglePanel('music')}>
          <ListMusic />
        </TileButton>
        <TileButton
          label={isSpotlit ? 'Sair do destaque' : 'Destacar'}
          onClick={() => toggleSpotlight(WATCH_KEY)}
        >
          {isSpotlit ? <PinOff /> : <Pin />}
        </TileButton>
        {variant === 'main' && (
          <TileButton label="Tela cheia" onClick={fullscreen}>
            <Expand />
          </TileButton>
        )}
      </div>

      {/* Playback controls, for everyone */}
      {variant === 'main' && (
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/85 to-transparent px-3 pt-8 pb-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <p className="truncate text-sm font-medium text-white">
            {item.title}
            <span className="text-white/60"> · {item.channel}</span>
          </p>
          <ProgressBar />
          <div className="flex items-center justify-between">
            <VolumeControl />
            <TransportButtons />
            <span className="w-28 truncate text-right text-[11px] text-white/60">
              por {item.addedByName}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
