import {
  MUSIC_QUEUE_MAX,
  currentItem,
  type MusicPlayback,
  type QueueItem,
} from '@share/shared/music'
import { describe, expect, it } from 'vitest'
import {
  EMPTY_PLAYBACK,
  acceptsState,
  acceptsTick,
  advance,
  applyCommand,
  electHost,
  expectedPosition,
  formatTime,
  lostItems,
  needsSeek,
} from './music-logic'

const item = (id: string, extra: Partial<QueueItem> = {}): QueueItem => ({
  id,
  videoId: `video${id.padStart(6, '0')}`.slice(0, 11),
  title: `Song ${id}`,
  channel: 'Artist',
  durationS: 200,
  mode: 'audio',
  addedBy: 'a',
  addedByName: 'A',
  ...extra,
})

const playing = (ids: string[], index = 0, positionS = 10): MusicPlayback => ({
  queue: ids.map((id) => item(id)),
  index,
  playing: true,
  positionS,
})

describe('applyCommand', () => {
  it('starts playing what is added to an empty room', () => {
    const p = applyCommand(EMPTY_PLAYBACK, { op: 'add', items: [item('1'), item('2')] }, 0)!
    expect(currentItem(p)?.id).toBe('1')
    expect(p).toMatchObject({ index: 0, playing: true, positionS: 0 })
  })

  it('starts at the link time', () => {
    const p = applyCommand(EMPTY_PLAYBACK, { op: 'add', items: [item('1', { startS: 42 })] }, 0)!
    expect(p.positionS).toBe(42)
  })

  it('queues behind what is playing', () => {
    const p = applyCommand(playing(['1']), { op: 'add', items: [item('2')] }, 0)!
    expect(p.queue.map((i) => i.id)).toEqual(['1', '2'])
    expect(p).toMatchObject({ index: 0, positionS: 10, playing: true })
  })

  it('plays the new song when the queue had finished', () => {
    const ended: MusicPlayback = { ...playing(['1']), index: 1, playing: false, positionS: 0 }
    const p = applyCommand(ended, { op: 'add', items: [item('2')] }, 0)!
    expect(currentItem(p)?.id).toBe('2')
    expect(p.playing).toBe(true)
  })

  it('ignores items it already has', () => {
    expect(applyCommand(playing(['1']), { op: 'add', items: [item('1')] }, 0)).toBeNull()
  })

  it('drops played songs first when the queue is full', () => {
    const ids = Array.from({ length: MUSIC_QUEUE_MAX }, (_, i) => String(i))
    const p = applyCommand(playing(ids, 5), { op: 'add', items: [item('new')] }, 0)!
    expect(p.queue).toHaveLength(MUSIC_QUEUE_MAX)
    expect(currentItem(p)?.id).toBe('5')
    expect(p.queue.at(-1)?.id).toBe('new')
  })

  it('pauses and resumes at a position', () => {
    const paused = applyCommand(playing(['1']), { op: 'pause', positionS: 33 }, 0)!
    expect(paused).toMatchObject({ playing: false, positionS: 33 })
    expect(applyCommand(paused, { op: 'pause', positionS: 40 }, 0)).toBeNull()
    expect(applyCommand(paused, { op: 'play' }, 34)).toMatchObject({ playing: true, positionS: 34 })
  })

  it('keeps seeks inside the song', () => {
    expect(applyCommand(playing(['1']), { op: 'seek', positionS: 999 }, 0)?.positionS).toBe(200)
    const live = { ...playing(['1']), queue: [item('1', { durationS: 0 })] }
    expect(applyCommand(live, { op: 'seek', positionS: 999 }, 0)?.positionS).toBe(999)
  })

  it('skips once even when two people press next', () => {
    const p = playing(['1', '2', '3'])
    const once = applyCommand(p, { op: 'next', from: '1' }, 0)!
    expect(currentItem(once)?.id).toBe('2')
    expect(applyCommand(once, { op: 'next', from: '1' }, 0)).toBeNull()
  })

  it('stops after the last song', () => {
    const p = applyCommand(playing(['1']), { op: 'next', from: '1' }, 0)!
    expect(currentItem(p)).toBeUndefined()
    expect(p.playing).toBe(false)
  })

  it('goes back, or restarts a song already under way', () => {
    const p = playing(['1', '2'], 1, 1)
    expect(currentItem(applyCommand(p, { op: 'prev', from: '2', positionS: 1 }, 0)!)?.id).toBe('1')
    const restarted = applyCommand(p, { op: 'prev', from: '2', positionS: 50 }, 0)!
    expect(restarted).toMatchObject({ index: 1, positionS: 0, playing: true })
  })

  it('jumps to a song in the queue', () => {
    const p = applyCommand(playing(['1', '2', '3']), { op: 'jump', itemId: '3' }, 0)!
    expect(p).toMatchObject({ index: 2, positionS: 0, playing: true })
    expect(applyCommand(p, { op: 'jump', itemId: 'nope' }, 0)).toBeNull()
  })

  it('removes songs around the current one', () => {
    const p = playing(['1', '2', '3'], 1)
    const before = applyCommand(p, { op: 'remove', itemId: '1' }, 0)!
    expect(currentItem(before)?.id).toBe('2')
    expect(before.positionS).toBe(10)
    const after = applyCommand(p, { op: 'remove', itemId: '3' }, 0)!
    expect(currentItem(after)?.id).toBe('2')
    const self = applyCommand(p, { op: 'remove', itemId: '2' }, 0)!
    expect(currentItem(self)?.id).toBe('3')
    expect(self).toMatchObject({ positionS: 0, playing: true })
    const last = applyCommand(playing(['1']), { op: 'remove', itemId: '1' }, 0)!
    expect(last).toMatchObject({ queue: [], playing: false })
  })

  it('clears everything', () => {
    expect(applyCommand(playing(['1', '2']), { op: 'clear' }, 0)).toEqual(EMPTY_PLAYBACK)
    expect(applyCommand(EMPTY_PLAYBACK, { op: 'clear' }, 0)).toBeNull()
  })
})

describe('hosting', () => {
  it('elects the smallest identity', () => {
    expect(electHost(['c', 'a', 'b'])).toBe('a')
    expect(electHost([])).toBeNull()
  })

  it('accepts newer states from their own host only', () => {
    expect(acceptsState(null, { rev: 1, host: 'b' }, 'b')).toBe(true)
    expect(acceptsState(null, { rev: 1, host: 'b' }, 'c')).toBe(false)
    expect(acceptsState({ rev: 5, host: 'b' }, { rev: 4, host: 'c' }, 'c')).toBe(false)
    expect(acceptsState({ rev: 5, host: 'b' }, { rev: 6, host: 'c' }, 'c')).toBe(true)
    // Re-sent state (answer to a hello).
    expect(acceptsState({ rev: 5, host: 'b' }, { rev: 5, host: 'b' }, 'b')).toBe(true)
  })

  it('settles two hosts that started at once', () => {
    expect(acceptsState({ rev: 1, host: 'b' }, { rev: 1, host: 'a' }, 'a')).toBe(true)
    expect(acceptsState({ rev: 1, host: 'a' }, { rev: 1, host: 'b' }, 'b')).toBe(false)
  })

  it('takes ticks only for the current state', () => {
    expect(acceptsTick({ rev: 3, host: 'a' }, { rev: 3, host: 'a' }, 'a')).toBe(true)
    expect(acceptsTick({ rev: 3, host: 'a' }, { rev: 2, host: 'a' }, 'a')).toBe(false)
    expect(acceptsTick({ rev: 3, host: 'a' }, { rev: 3, host: 'b' }, 'b')).toBe(false)
    expect(acceptsTick(null, { rev: 3, host: 'a' }, 'a')).toBe(false)
  })

  it('finds what a losing host queued', () => {
    const mine = playing(['x', 'y'])
    const winner = playing(['z', 'y'])
    expect(lostItems(mine, winner).map((i) => i.id)).toEqual(['x'])
  })
})

describe('timing', () => {
  it('moves the position only while playing', () => {
    expect(expectedPosition({ playing: true, positionS: 10 }, 2500)).toBe(12.5)
    expect(expectedPosition({ playing: false, positionS: 10 }, 2500)).toBe(10)
  })

  it('seeks only past the drift limit', () => {
    expect(needsSeek(10, 11)).toBe(false)
    expect(needsSeek(10, 12)).toBe(true)
  })

  it('formats times', () => {
    expect(formatTime(5)).toBe('0:05')
    expect(formatTime(213.9)).toBe('3:33')
    expect(formatTime(3723)).toBe('1:02:03')
  })
})

describe('advance', () => {
  it('moves the position along the queue as the host would have', () => {
    const p = playing(['1', '2', '3'], 0, 190)
    expect(advance(p, 5)).toMatchObject({ index: 0, positionS: 195 })
    expect(advance(p, 30)).toMatchObject({ index: 1, positionS: 20, playing: true })
    expect(advance(p, 400)).toMatchObject({ index: 2, positionS: 190 })
  })

  it('stops past the end of the queue', () => {
    expect(advance(playing(['1'], 0, 190), 60)).toMatchObject({ index: 1, playing: false })
  })

  it('leaves paused rooms and live streams where they are', () => {
    const paused = { ...playing(['1'], 0, 50), playing: false }
    expect(advance(paused, 600)).toBe(paused)
    const live = { ...playing(['1']), queue: [item('1', { durationS: 0 })] }
    expect(advance(live, 600)).toMatchObject({ index: 0, positionS: 610 })
  })
})
