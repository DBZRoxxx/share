import {
  currentItem,
  musicPlaybackSchema,
  type MusicPlayback,
  type QueueItem,
} from '@share/shared/music'
import { create } from 'zustand'
import { expectedPosition, type Versioned } from './music-logic'

export type RoomMusic = MusicPlayback & Versioned

/** YouTube player states (YT.PlayerState). */
export const YT_STATE = {
  unstarted: -1,
  ended: 0,
  playing: 1,
  paused: 2,
  buffering: 3,
  cued: 5,
} as const

export interface LocalPlayer {
  videoId: string | null
  positionS: number
  /** Local clock (ms) of the last report. */
  at: number
  state: number
}

interface MusicStore {
  /** This app's copy of the room's music; null until someone plays something. */
  room: RoomMusic | null
  /** Local clock (ms) when `room.positionS` was true. */
  syncedAt: number
  /**
   * Grows whenever where playback should be changes (someone else's state or
   * tick, or a change made here), so players check their drift.
   */
  syncSeq: number
  player: LocalPlayer
  overlayMinimized: boolean
  setOverlayMinimized: (minimized: boolean) => void
  reset: () => void
}

const initial = {
  room: null,
  syncedAt: 0,
  syncSeq: 0,
  player: { videoId: null, positionS: 0, at: 0, state: YT_STATE.unstarted },
  overlayMinimized: false,
}

export const useMusic = create<MusicStore>()((set) => ({
  ...initial,
  setOverlayMinimized: (overlayMinimized) => set({ overlayMinimized }),
  reset: () => set(initial),
}))

export function useCurrentItem(): QueueItem | undefined {
  return useMusic((s) => (s.room ? currentItem(s.room) : undefined))
}

/** Where the room's current song should be right now. */
export function roomPosition(s = useMusic.getState()): number {
  return s.room ? expectedPosition(s.room, Date.now() - s.syncedAt) : 0
}

/**
 * Where this app's player is on the current song, or where the room is when
 * the player isn't on it (still loading, or not mounted).
 */
export function localPosition(s = useMusic.getState()): number {
  const item = s.room ? currentItem(s.room) : undefined
  const { player } = s
  if (!item || player.videoId !== item.videoId || !player.at) return roomPosition(s)
  const running = player.state === YT_STATE.playing
  return player.positionS + (running ? (Date.now() - player.at) / 1000 : 0)
}

/**
 * The room's music as this app last saw it, carried across a reload, an
 * update or a dropped connection, so someone alone in the room doesn't lose it.
 */
export interface MusicSnapshot {
  playback: MusicPlayback
  /** Local clock (ms) when `playback.positionS` was true. */
  savedAt: number
}

/** Snapshots older than this are dropped: the room has moved on. */
const SNAPSHOT_MAX_AGE_MS = 10 * 60_000

export function takeMusicSnapshot(s = useMusic.getState()): MusicSnapshot | null {
  if (!s.room || !currentItem(s.room)) return null
  const { queue, index, playing } = s.room
  return { playback: { queue, index, playing, positionS: localPosition(s) }, savedAt: Date.now() }
}

/** Validates a snapshot that went through JSON (an update's resume file). */
export function parseMusicSnapshot(value: unknown): MusicSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const { playback, savedAt } = value as Partial<MusicSnapshot>
  if (typeof savedAt !== 'number' || Date.now() - savedAt > SNAPSHOT_MAX_AGE_MS) return null
  const parsed = musicPlaybackSchema.safeParse(playback)
  return parsed.success ? { playback: parsed.data, savedAt } : null
}
