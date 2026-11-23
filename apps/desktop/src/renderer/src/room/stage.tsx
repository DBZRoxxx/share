import {
  isTrackReference,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import { Link2, MonitorUp } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { bestGrid } from '@/lib/layout'
import { usePrefs } from '@/stores/prefs'
import { MediaTile } from './media-tile'
import { tileKey, useRoomUi } from './room-ui'

const GAP = 8

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
  tiles: TrackReferenceOrPlaceholder[]
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
          tiles.map((ref) => (
            <MediaTile
              key={tileKey(ref.participant, ref.source)}
              trackRef={ref}
              variant="main"
              hasScreenAudio={screenAudio.has(ref.participant.identity)}
              doubleClick={tiles.length === 1 ? singleDoubleClick : 'spotlight'}
              style={{ width: grid.tileWidth, height: grid.tileHeight }}
            />
          ))}
      </div>
    </div>
  )
}

function EmptyState({ onShare, onInvite }: { onShare: () => void; onInvite: () => void }) {
  return (
    <div className="animate-fade-in border-border bg-surface/95 pointer-events-auto absolute inset-x-0 bottom-6 mx-auto flex w-fit items-center gap-3 rounded-2xl border px-4 py-3 shadow-xl backdrop-blur">
      <span className="text-muted text-sm">Ninguém está compartilhando a tela ainda.</span>
      <Button size="sm" variant="primary" onClick={onShare}>
        <MonitorUp /> Compartilhar tela
      </Button>
      <Button size="sm" variant="ghost" onClick={onInvite}>
        <Link2 /> Copiar convite
      </Button>
    </div>
  )
}

export function Stage({ onInvite }: { onInvite: () => void }) {
  const showOwnScreen = usePrefs((s) => s.showOwnScreen)
  const layout = useRoomUi((s) => s.layout)
  const spotlightKey = useRoomUi((s) => s.spotlightKey)
  const setPickerOpen = useRoomUi((s) => s.setPickerOpen)

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

  const all: TrackReferenceOrPlaceholder[] = [...sortedScreens, ...cameras]
  const spotlit =
    layout === 'spotlight'
      ? (all.find((r) => tileKey(r.participant, r.source) === spotlightKey) ?? sortedScreens[0])
      : undefined

  let main: TrackReferenceOrPlaceholder[]
  let strip: TrackReferenceOrPlaceholder[]
  if (spotlit) {
    const spotKey = tileKey(spotlit.participant, spotlit.source)
    main = [spotlit]
    strip = [...sortedScreens, ...cameras].filter(
      (r) => tileKey(r.participant, r.source) !== spotKey,
    )
  } else if (sortedScreens.length > 0) {
    main = sortedScreens
    strip = activeCameras
  } else {
    main = cameras
    strip = []
  }

  const nobodySharing = screens.length === 0

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 gap-2 p-2">
      <div className="relative min-h-0 min-w-0 flex-1">
        <TileGrid
          tiles={main}
          screenAudio={screenAudio}
          singleDoubleClick={spotlit ? 'fullscreen' : 'spotlight'}
        />
        {nobodySharing && <EmptyState onShare={() => setPickerOpen(true)} onInvite={onInvite} />}
      </div>
      {strip.length > 0 && (
        <aside
          aria-label="Outros vídeos"
          className="animate-fade-in flex w-60 shrink-0 flex-col gap-2 overflow-y-auto pr-0.5 xl:w-72"
        >
          {strip.map((ref) => (
            <MediaTile
              key={tileKey(ref.participant, ref.source)}
              trackRef={ref}
              variant="strip"
              hasScreenAudio={screenAudio.has(ref.participant.identity)}
            />
          ))}
        </aside>
      )}
    </div>
  )
}
