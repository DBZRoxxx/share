import type { Room } from 'livekit-client'
import { create } from 'zustand'

interface SettingsUiState {
  open: boolean
  /** The connected room, if any: its device and video settings show up too. */
  room: Room | null
  setOpen: (open: boolean) => void
}

/** The settings dialog is app-wide (notifications apply everywhere), not per room. */
export const useSettingsUi = create<SettingsUiState>()((set) => ({
  open: false,
  room: null,
  setOpen: (open) => set({ open }),
}))
