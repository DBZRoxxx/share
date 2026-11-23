import { create } from 'zustand'

export type View =
  { name: 'home' } | { name: 'prejoin'; roomId: string } | { name: 'room'; roomId: string }

interface NavState {
  view: View
  goHome: () => void
  goPrejoin: (roomId: string) => void
  enterRoom: (roomId: string) => void
}

export const useNav = create<NavState>()((set) => ({
  view: { name: 'home' },
  goHome: () => set({ view: { name: 'home' } }),
  goPrejoin: (roomId) => set({ view: { name: 'prejoin', roomId } }),
  enterRoom: (roomId) => set({ view: { name: 'room', roomId } }),
}))
