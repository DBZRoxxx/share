import {
  isTrackReference,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import { Link2, MonitorUp, X } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { bestGrid } from '@/lib/layout'
import { useCurrentItem } from '@/music/music-store'
import { WatchTile } from '@/music/watch-tile'
import { usePrefs } from '@/stores/prefs'
import { MediaTile } from './media-tile'
import { WATCH_KEY, tileKey, useRoomUi } from './room-ui'

const GAP = 8

/** What the stage shows: people's cameras and screens, and the watch party. */
type StageTile = { kind: 'track'; ref: TrackReferenceOrPlaceholder } | { kind: 'watch' }

const WATCH_TILE: StageTile = { kind: 'watch' }

function keyOf(tile: StageTile): string {
  return tile.kind === 'watch' ? WATCH_KEY : tileKey(tile.ref.participant, tile.ref.source)
}

const asTiles = (refs: TrackReferenceOrPlaceholder[]): StageTile[] =>
  refs.map((ref) => ({ kind: 'track', ref }))

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setSize({ width: el.clientWidth, height: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

/** Tiles laid out as large as possible (16:9) inside the available space. */
function TileGrid({
  tiles,
  screenAudio,
  singleDoubleClick,
}: {
  tiles: StageTile[]
  screenAudio: Set<string>
  singleDoubleClick: 'spotlight' | 'fullscreen'
}) {
  const [ref, size] = useElementSize<HTMLDivElement>()
  const grid = bestGrid(tiles.length, size.width, size.height, 16 / 9, GAP)

  return (
    <div ref={ref} className="relative size-full min-h-0 min-w-0">
      <div
        className="absolute inset-0 flex flex-wrap content-center items-center justify-center"
        style={{ gap: GAP }}
      >
        {grid.cols > 0 &&
          tiles.map((tile) => {
            const doubleClick = tiles.length === 1 ? singleDoubleClick : 'spotlight'
            const style = { width: grid.tileWidth, height: grid.tileHeight }
            return tile.kind === 'watch' ? (
              <WatchTile key={WATCH_KEY} variant="main" doubleClick={doubleClick} style={style} />
            ) : (
              <MediaTile
                key={keyOf(tile)}
                trackRef={tile.ref}
                variant="main"
                hasScreenAudio={screenAudio.has(tile.ref.participant.identity)}
                doubleClick={doubleClick}
                style={style}
              />
            )
          })}
      </div>
    </div>
  )
}

function EmptyState({
  onShare,
  onInvite,
  onDismiss,
}: {
  onShare: () => void
  onInvite: () => void
  onDismiss: () => void
}) {
  return (
    <div className="animate-fade-in border-border bg-surface/95 pointer-events-auto absolute inset-x-0 bottom-6 mx-auto flex w-fit items-center gap-3 rounded-2xl border py-3 pr-2 pl-4 shadow-xl backdrop-blur">
      <span className="text-muted text-sm">Ninguém está compartilhando a tela ainda.</span>
      <Button size="sm" variant="primary" onClick={onShare}>
        <MonitorUp /> Compartilhar tela
      </Button>
      <Button size="sm" variant="ghost" onClick={onInvite}>
        <Link2 /> Copiar convite
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Fechar aviso"
        title="Fechar"
        onClick={onDismiss}
        className="text-muted hover:text-fg"
      >
        <X />
      </Button>
    </div>
  )
}

export function Stage({ onInvite }: { onInvite: () => void }) {
  const showOwnScreen = usePrefs((s) => s.showOwnScreen)
  const layout = useRoomUi((s) => s.layout)
  const spotlightKey = useRoomUi((s) => s.spotlightKey)
  const setPickerOpen = useRoomUi((s) => s.setPickerOpen)
  const watching = useCurrentItem()?.mode === 'video'

  const screens = useTracks([Track.Source.ScreenShare], { onlySubscribed: false }).filter(
    (ref) => showOwnScreen || !ref.participant.isLocal,
  )
  const cameras = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], {
    onlySubscribed: false,
  })
  const screenAudioRefs = useTracks([Track.Source.ScreenShareAudio], { onlySubscribed: false })
  const screenAudio = useMemo(
    () => new Set(screenAudioRefs.map((r) => r.participant.identity)),
    [screenAudioRefs],
  )

  // Local tiles go last so friends' screens get the prime spots.
  const sortedScreens = [...screens].sort(
    (a, b) => Number(a.participant.isLocal) - Number(b.participant.isLocal),
  )
  const activeCameras = cameras.filter((ref) => isTrackReference(ref) && !ref.publication.isMuted)

  // The watch party takes the prime spot, ahead of shared screens.
  const shared: StageTile[] = [...(watching ? [WATCH_TILE] : []), ...asTiles(sortedScreens)]
  const all: StageTile[] = [...shared, ...asTiles(cameras)]
  const spotlit =
    layout === 'spotlight' ? (all.find((t) => keyOf(t) === spotlightKey) ?? shared[0]) : undefined

  let main: StageTile[]
  let strip: StageTile[]
  if (spotlit) {
    const spotKey = keyOf(spotlit)
    main = [spotlit]
    strip = all.filter((t) => keyOf(t) !== spotKey)
  } else if (shared.length > 0) {
    main = shared
    strip = asTiles(activeCameras)
  } else {
    main = asTiles(cameras)
    strip = []
  }

  const nobodySharing = shared.length === 0
  // Closing the hint hides it until you leave the room.
  const [emptyDismissed, setEmptyDismissed] = useState(false)

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 gap-2 p-2">
      <div className="relative min-h-0 min-w-0 flex-1">
        <TileGrid
          tiles={main}
          screenAudio={screenAudio}
          singleDoubleClick={spotlit ? 'fullscreen' : 'spotlight'}
        />
        {nobodySharing && !emptyDismissed && (
          <EmptyState
            onShare={() => setPickerOpen(true)}
            onInvite={onInvite}
            onDismiss={() => setEmptyDismissed(true)}
          />
        )}
      </div>
      {strip.length > 0 && (
        <aside
          aria-label="Outros vídeos"
          className="animate-fade-in flex w-60 shrink-0 flex-col gap-2 overflow-y-auto pr-0.5 xl:w-72"
        >
          {strip.map((tile) =>
            tile.kind === 'watch' ? (
              <WatchTile key={WATCH_KEY} variant="strip" />
            ) : (
              <MediaTile
                key={keyOf(tile)}
                trackRef={tile.ref}
                variant="strip"
                hasScreenAudio={screenAudio.has(tile.ref.participant.identity)}
              />
            ),
          )}
        </aside>
      )}
    </div>
  )
}
