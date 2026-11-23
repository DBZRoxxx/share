import type { ResumeState } from '@shared/ipc'
import { create } from 'zustand'

export type View =
  | { name: 'home' }
  | { name: 'prejoin'; roomId: string }
  /** `resume`: coming back after an update, restore cam/mic/screen/chat. */
  | { name: 'room'; roomId: string; resume?: ResumeState }

interface NavState {
  view: View
  goHome: () => void
  goPrejoin: (roomId: string) => void
  enterRoom: (roomId: string, resume?: ResumeState) => void
}

export const useNav = create<NavState>()((set) => ({
  view: { name: 'home' },
  goHome: () => set({ view: { name: 'home' } }),
  goPrejoin: (roomId) => set({ view: { name: 'prejoin', roomId } }),
  enterRoom: (roomId, resume) => set({ view: { name: 'room', roomId, resume } }),
}))
