import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type ScreenQuality = 'motion' | 'detail'
export type PreferredCodec = 'h264' | 'vp9' | 'vp8' | 'av1'

export interface RecentRoom {
  id: string
  lastJoinedAt: number
}

interface PrefsState {
  /** Random per-install id used as the LiveKit identity. */
  identity: string
  name: string
  recentRooms: RecentRoom[]
  cameraId: string | null
  micId: string | null
  speakerId: string | null
  joinWithCamera: boolean
  joinWithMic: boolean
  screenQuality: ScreenQuality
  shareAudio: boolean
  videoCodec: PreferredCodec
  showStats: boolean
  showOwnScreen: boolean
  set: (partial: Partial<Omit<PrefsState, 'set' | 'addRecentRoom' | 'removeRecentRoom'>>) => void
  addRecentRoom: (id: string) => void
  removeRecentRoom: (id: string) => void
}

const MAX_RECENT = 6

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      identity: crypto.randomUUID(),
      name: '',
      recentRooms: [],
      cameraId: null,
      micId: null,
      speakerId: null,
      joinWithCamera: false,
      joinWithMic: false,
      screenQuality: 'motion',
      shareAudio: true,
      videoCodec: 'h264',
      showStats: false,
      showOwnScreen: true,
      set: (partial) => set(partial),
      addRecentRoom: (id) =>
        set((s) => ({
          recentRooms: [
            { id, lastJoinedAt: Date.now() },
            ...s.recentRooms.filter((r) => r.id !== id),
          ].slice(0, MAX_RECENT),
        })),
      removeRecentRoom: (id) =>
        set((s) => ({ recentRooms: s.recentRooms.filter((r) => r.id !== id) })),
    }),
    {
      name: 'share-prefs',
      version: 1,
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
