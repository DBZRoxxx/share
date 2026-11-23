import type { ResumeState } from '@shared/ipc'
import { create } from 'zustand'

export type View =
  | { name: 'home' }
  | ({ name: 'prejoin'; roomId: string } & JoinOptions)
  /** `resume`: coming back after an update, restore cam/mic/screen/chat. */
  | ({ name: 'room'; roomId: string; resume?: ResumeState } & JoinOptions)

export interface JoinOptions {
  /** The user is creating this room (with these name and password). */
  create?: { name?: string; password?: string }
  /** Access to a private room for this session (not remembered). */
  roomKey?: string
  /** Shown on the prejoin screen (e.g. the password changed). */
  error?: string
}

interface NavState {
  view: View
  goHome: () => void
  goPrejoin: (roomId: string, opts?: JoinOptions) => void
  enterRoom: (roomId: string, opts?: JoinOptions & { resume?: ResumeState }) => void
}

export const useNav = create<NavState>()((set) => ({
  view: { name: 'home' },
  goHome: () => set({ view: { name: 'home' } }),
  goPrejoin: (roomId, opts) => set({ view: { name: 'prejoin', roomId, ...opts } }),
  enterRoom: (roomId, opts) => set({ view: { name: 'room', roomId, ...opts } }),
}))
