import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type ScreenQuality = 'motion' | 'detail'
export type PreferredCodec = 'h264' | 'vp9' | 'vp8' | 'av1'

export interface RecentRoom {
  id: string
  lastJoinedAt: number
  /** Custom room name, when it has one. */
  name?: string | null
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
  set: (
    partial: Partial<
      Omit<PrefsState, 'set' | 'addRecentRoom' | 'removeRecentRoom' | 'nameRecentRoom'>
    >,
  ) => void
  /** `name`: undefined keeps the one already known. */
  addRecentRoom: (id: string, name?: string | null) => void
  nameRecentRoom: (id: string, name: string | null) => void
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
      addRecentRoom: (id, name) =>
        set((s) => {
          const known = s.recentRooms.find((r) => r.id === id)
          return {
            recentRooms: [
              { id, lastJoinedAt: Date.now(), name: name === undefined ? known?.name : name },
              ...s.recentRooms.filter((r) => r.id !== id),
            ].slice(0, MAX_RECENT),
          }
        }),
      nameRecentRoom: (id, name) =>
        set((s) => ({
          recentRooms: s.recentRooms.map((r) => (r.id === id ? { ...r, name } : r)),
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
