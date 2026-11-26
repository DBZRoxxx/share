import type { Room } from 'livekit-client'
import { create } from 'zustand'

export type SettingsTab = 'profile' | 'audio' | 'video' | 'notifications' | 'app'

interface SettingsUiState {
  open: boolean
  /** Last tab shown, kept while the app runs. */
  tab: SettingsTab
  /** The connected room, if any: its device and video settings show up too. */
  room: Room | null
  setOpen: (open: boolean) => void
  setTab: (tab: SettingsTab) => void
}

/** The settings dialog is app-wide (notifications apply everywhere), not per room. */
export const useSettingsUi = create<SettingsUiState>()((set) => ({
  open: false,
  tab: 'audio',
  room: null,
  setOpen: (open) => set({ open }),
  setTab: (tab) => set({ tab }),
}))
