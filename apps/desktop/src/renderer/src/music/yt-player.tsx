import { currentItem } from '@share/shared/music'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { usePrefs } from '@/stores/prefs'
import { needsSeek } from './music-logic'
import { YT_STATE, localPosition, roomPosition, useCurrentItem, useMusic } from './music-store'
import { PLAYER_ORIGIN, PLAYER_URL, musicActions } from './use-music'

/** A seek or load needs this long to settle before drift is measured again. */
const SETTLE_MS = 3000

interface PlayerEvent {
  source: 'share-player'
  type: 'ready' | 'time' | 'state' | 'ended' | 'error'
  videoId?: string | null
  t?: number
  state?: number
  code?: number
}

function isPlayerEvent(data: unknown): data is PlayerEvent {
  return (
    typeof data === 'object' && data !== null && (data as PlayerEvent).source === 'share-player'
  )
}

function postTo(frame: HTMLIFrameElement | null, msg: Record<string, unknown>) {
  frame?.contentWindow?.postMessage({ target: 'share-player', ...msg }, PLAYER_ORIGIN)
}

/**
 * The official YouTube player (inside the web app's player page), playing
 * whatever the room is on. Mounted where the current song is shown: the
 * watch party tile, or hidden behind the music overlay.
 */
export function YtPlayer({ className }: { className?: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [ready, setReady] = useState(false)
  const loaded = useRef<string | null>(null)
  const settledAt = useRef(0)

  const item = useCurrentItem()
  const playing = useMusic((s) => !!s.room?.playing)
  const syncSeq = useMusic((s) => s.syncSeq)
  const volume = usePrefs((s) => (s.musicMuted ? 0 : s.musicVolume))

  // Reports from the player page.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow || e.origin !== PLAYER_ORIGIN) return
      if (!isPlayerEvent(e.data)) return
      const ev = e.data
      switch (ev.type) {
        case 'ready':
          setReady(true)
          break
        case 'time':
        case 'state':
          useMusic.setState({
            player: {
              videoId: ev.videoId ?? null,
              positionS: ev.t ?? 0,
              at: Date.now(),
              state: ev.state ?? YT_STATE.unstarted,
            },
          })
          break
        case 'ended':
          if (ev.videoId) musicActions.ended(ev.videoId)
          break
        case 'error':
          musicActions.failed(ev.videoId ?? null, ev.code ?? 0)
          break
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // A new song: load it at the room's position.
  useEffect(() => {
    if (!ready || !item || loaded.current === item.id) return
    loaded.current = item.id
    settledAt.current = Date.now()
    const s = useMusic.getState()
    postTo(frameRef.current, {
      cmd: 'load',
      videoId: item.videoId,
      startS: roomPosition(s),
      autoplay: !!s.room?.playing,
    })
  }, [ready, item])

  useEffect(() => {
    if (ready && item) postTo(frameRef.current, { cmd: playing ? 'play' : 'pause' })
    // Only on play/pause changes; loads carry their own autoplay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, playing])

  useEffect(() => {
    if (ready) postTo(frameRef.current, { cmd: 'volume', volume: Math.round(volume * 100) })
  }, [ready, volume])

  // The room said where it is: seek back if this player drifted.
  useEffect(() => {
    if (!ready) return
    const s = useMusic.getState()
    const song = s.room ? currentItem(s.room) : undefined
    if (!song || s.player.videoId !== song.videoId) return
    if (Date.now() - settledAt.current < SETTLE_MS) return
    // seekTo on a cued video would start it: wait for play.
    if (s.player.state === YT_STATE.cued || s.player.state === YT_STATE.unstarted) return
    const expected = roomPosition(s)
    if (!needsSeek(localPosition(s), expected)) return
    settledAt.current = Date.now()
    postTo(frameRef.current, { cmd: 'seek', t: expected })
  }, [ready, syncSeq])

  if (!PLAYER_URL) return null
  return (
    <iframe
      ref={frameRef}
      src={PLAYER_URL}
      title="Player do YouTube"
      allow="autoplay; encrypted-media; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
      tabIndex={-1}
      // Play, pause and seek go through the room, never the player itself.
      className={cn('pointer-events-none border-0', className)}
    />
  )
}
