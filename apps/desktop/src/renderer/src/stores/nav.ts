import type { ResumeState } from '@shared/ipc'
import { create } from 'zustand'

export type View =
  | { name: 'home' }
  /** `roomName`: name chosen for a room being created. */
  | { name: 'prejoin'; roomId: string; roomName?: string }
  /** `resume`: coming back after an update, restore cam/mic/screen/chat. */
  | { name: 'room'; roomId: string; resume?: ResumeState; roomName?: string }

interface NavState {
  view: View
  goHome: () => void
  goPrejoin: (roomId: string, roomName?: string) => void
  enterRoom: (roomId: string, opts?: { resume?: ResumeState; roomName?: string }) => void
}

export const useNav = create<NavState>()((set) => ({
  view: { name: 'home' },
  goHome: () => set({ view: { name: 'home' } }),
  goPrejoin: (roomId, roomName) => set({ view: { name: 'prejoin', roomId, roomName } }),
  enterRoom: (roomId, opts) => set({ view: { name: 'room', roomId, ...opts } }),
}))
