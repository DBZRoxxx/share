import {
  MUSIC_DRIFT_MAX_S,
  MUSIC_QUEUE_MAX,
  currentItem,
  type MusicCommand,
  type MusicPlayback,
  type QueueItem,
} from '@share/shared/music'

/**
 * Pure rules of the room's music, kept apart from LiveKit so they can be
 * tested: what each command does, who hosts, which state wins, when to seek.
 */

export const EMPTY_PLAYBACK: MusicPlayback = { queue: [], index: 0, playing: false, positionS: 0 }

/** Pressing "previous" this far into a song restarts it instead. */
export const PREV_RESTARTS_AFTER_S = 3

function goTo(p: MusicPlayback, index: number): MusicPlayback {
  const item = p.queue[index]
  return { ...p, index, playing: !!item, positionS: item?.startS ?? 0 }
}

function clampPosition(item: QueueItem, positionS: number): number {
  const max = item.durationS > 0 ? item.durationS : Infinity
  return Math.min(Math.max(0, positionS), max)
}

/**
 * The host applies every command here. `nowS` is where the host's own player
 * is on the current item. Returns null when the command changes nothing
 * (e.g. a second "next" for a song that was already skipped).
 */
export function applyCommand(
  p: MusicPlayback,
  cmd: MusicCommand,
  nowS: number,
): MusicPlayback | null {
  const current = currentItem(p)
  switch (cmd.op) {
    case 'add': {
      const known = new Set(p.queue.map((i) => i.id))
      const added = cmd.items.filter((i) => !known.has(i.id))
      if (!added.length) return null
      let queue = [...p.queue, ...added]
      let next: MusicPlayback = current
        ? { ...p, queue }
        : goTo({ ...p, queue }, Math.min(p.index, p.queue.length))
      // Full: forget songs already played first, then the newest additions.
      const overflow = queue.length - MUSIC_QUEUE_MAX
      if (overflow > 0) {
        const played = Math.min(overflow, next.index)
        queue = queue.slice(played, played + MUSIC_QUEUE_MAX)
        next = { ...next, queue, index: next.index - played }
      }
      return next
    }
    case 'play':
      if (!current || p.playing) return null
      return { ...p, playing: true, positionS: clampPosition(current, cmd.positionS ?? nowS) }
    case 'pause':
      if (!current || !p.playing) return null
      return { ...p, playing: false, positionS: clampPosition(current, cmd.positionS) }
    case 'seek':
      if (!current) return null
      return { ...p, positionS: clampPosition(current, cmd.positionS) }
    case 'next':
      if (current?.id !== cmd.from) return null
      return goTo(p, p.index + 1)
    case 'prev':
      if (current?.id !== cmd.from) return null
      if (p.index === 0 || cmd.positionS > PREV_RESTARTS_AFTER_S) {
        return { ...p, playing: true, positionS: 0 }
      }
      return goTo(p, p.index - 1)
    case 'jump': {
      const index = p.queue.findIndex((i) => i.id === cmd.itemId)
      return index < 0 ? null : goTo(p, index)
    }
    case 'remove': {
      const index = p.queue.findIndex((i) => i.id === cmd.itemId)
      if (index < 0) return null
      const queue = p.queue.filter((_, i) => i !== index)
      if (index < p.index) return { ...p, queue, index: p.index - 1 }
      if (index > p.index) return { ...p, queue }
      // The current song: the next one takes its place, keeping play/pause.
      const next = queue[index]
      return {
        ...p,
        queue,
        playing: !!next && p.playing,
        positionS: next?.startS ?? 0,
      }
    }
    case 'clear':
      return p.queue.length ? EMPTY_PLAYBACK : null
  }
}

/** Everyone picks the same host from the same list: the smallest identity. */
export function electHost(identities: Iterable<string>): string | null {
  let best: string | null = null
  for (const id of identities) if (best === null || id < best) best = id
  return best
}

export interface Versioned {
  rev: number
  host: string
}

/**
 * Whether a state sent by `sender` replaces the one we know. Only a host
 * speaks for itself; a newer revision wins, and two hosts that made the same
 * revision at once (both started the music) settle on the smaller identity.
 */
export function acceptsState(known: Versioned | null, incoming: Versioned, sender: string) {
  if (incoming.host !== sender) return false
  if (!known) return true
  if (incoming.rev !== known.rev) return incoming.rev > known.rev
  return incoming.host <= known.host
}

/** A tick only updates the position of the state it belongs to. */
export function acceptsTick(known: Versioned | null, tick: Versioned, sender: string) {
  return !!known && tick.host === sender && tick.host === known.host && tick.rev === known.rev
}

/** Songs a losing host had queued that the winner doesn't know about. */
export function lostItems(mine: MusicPlayback, winner: MusicPlayback): QueueItem[] {
  const known = new Set(winner.queue.map((i) => i.id))
  return mine.queue.slice(mine.index).filter((i) => !known.has(i.id))
}

/** Where the room is now, given where it was `elapsedMs` ago. */
export function expectedPosition(
  p: Pick<MusicPlayback, 'playing' | 'positionS'>,
  elapsedMs: number,
) {
  return p.positionS + (p.playing ? Math.max(0, elapsedMs) / 1000 : 0)
}

export function needsSeek(localS: number, expectedS: number): boolean {
  return Math.abs(localS - expectedS) > MUSIC_DRIFT_MAX_S
}

export function formatTime(totalS: number): string {
  const s = Math.max(0, Math.floor(totalS))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

/**
 * Where the room would be `elapsedS` later if nobody touched it: songs that
 * would have ended in the meantime are skipped, like the host would have.
 */
export function advance(p: MusicPlayback, elapsedS: number): MusicPlayback {
  if (!p.playing || elapsedS <= 0) return p
  let next: MusicPlayback = { ...p, positionS: p.positionS + elapsedS }
  for (;;) {
    const item = currentItem(next)
    if (!item) return { ...next, playing: false, positionS: 0 }
    if (item.durationS <= 0 || next.positionS < item.durationS) return next
    const rest = next.positionS - item.durationS
    next = {
      ...next,
      index: next.index + 1,
      positionS: (next.queue[next.index + 1]?.startS ?? 0) + rest,
    }
  }
}
