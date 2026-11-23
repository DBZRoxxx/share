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

/** How the app gets the user's attention. Per user: applies to every room. */
export interface NotificationPrefs {
  /** New chat messages. */
  messages: boolean
  /** Replies to the user's own messages (own wording and sound). */
  replies: boolean
  /** Reactions to the user's own messages (never to other people's). */
  reactions: boolean
  /** People joining and leaving the room. */
  joinLeave: boolean
  /** Windows notifications while the app is in the background (tray, minimized, unfocused). */
  desktop: boolean
  sounds: boolean
  /** 0–1 */
  volume: number
}

export const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  messages: true,
  replies: true,
  reactions: true,
  joinLeave: true,
  desktop: true,
  sounds: true,
  volume: 0.6,
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
  notifications: NotificationPrefs
  set: (
    partial: Partial<
      Omit<
        PrefsState,
        'set' | 'addRecentRoom' | 'removeRecentRoom' | 'nameRecentRoom' | 'setNotifications'
      >
    >,
  ) => void
  /** `name`: undefined keeps the one already known. */
  addRecentRoom: (id: string, name?: string | null) => void
  nameRecentRoom: (id: string, name: string | null) => void
  removeRecentRoom: (id: string) => void
  setNotifications: (partial: Partial<NotificationPrefs>) => void
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
      notifications: DEFAULT_NOTIFICATIONS,
      set: (partial) => set(partial),
      setNotifications: (partial) =>
        set((s) => ({ notifications: { ...s.notifications, ...partial } })),
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
      // Saved prefs from older versions lack newer notification options: fill in defaults.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PrefsState>
        return {
          ...current,
          ...saved,
          notifications: {
            ...DEFAULT_NOTIFICATIONS,
            ...saved.notifications,
            // Pre-release builds stored a choice ('all' | 'mine' | 'off').
            reactions:
              typeof saved.notifications?.reactions === 'boolean'
                ? saved.notifications.reactions
                : saved.notifications?.reactions !== 'off',
          },
        }
      },
    },
  ),
)
