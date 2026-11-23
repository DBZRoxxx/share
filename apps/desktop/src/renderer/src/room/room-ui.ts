import { Track, type Participant } from 'livekit-client'
import { create } from 'zustand'

export type LayoutMode = 'grid' | 'spotlight'

/** Stable key for a participant's track slot, e.g. `abc123:screen_share`. */
export function tileKey(participant: Participant, source: Track.Source): string {
  return `${participant.identity}:${source}`
}

export function screenAudioKey(identity: string): string {
  return `${identity}:${Track.Source.ScreenShareAudio}`
}

export function micKey(identity: string): string {
  return `${identity}:${Track.Source.Microphone}`
}

interface RoomUiState {
  layout: LayoutMode
  /** Tile shown big in spotlight mode (null = first screen share). */
  spotlightKey: string | null
  panelOpen: boolean
  pickerOpen: boolean
  settingsOpen: boolean
  poppedOut: Record<string, true>
  /** Per audio track volume, 0..1 (missing = 1). */
  volumes: Record<string, number>
  /** Last non-zero volume before muting, to restore on unmute. */
  lastVolumes: Record<string, number>

  reset: () => void
  setLayout: (layout: LayoutMode) => void
  toggleSpotlight: (key: string) => void
  setPanelOpen: (open: boolean) => void
  setPickerOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setPoppedOut: (key: string, popped: boolean) => void
  setVolume: (key: string, volume: number) => void
  toggleMute: (key: string) => void
}

const initial = {
  layout: 'grid' as LayoutMode,
  spotlightKey: null,
  panelOpen: false,
  pickerOpen: false,
  settingsOpen: false,
  poppedOut: {},
  volumes: {},
  lastVolumes: {},
}

export const useRoomUi = create<RoomUiState>()((set) => ({
  ...initial,
  reset: () => set(initial),
  setLayout: (layout) => set({ layout }),
  toggleSpotlight: (key) =>
    set((s) =>
      s.layout === 'spotlight' && s.spotlightKey === key
        ? { layout: 'grid', spotlightKey: null }
        : { layout: 'spotlight', spotlightKey: key },
    ),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setPickerOpen: (pickerOpen) => set({ pickerOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setPoppedOut: (key, popped) =>
    set((s) => {
      const poppedOut = { ...s.poppedOut }
      if (popped) poppedOut[key] = true
      else delete poppedOut[key]
      return { poppedOut }
    }),
  setVolume: (key, volume) =>
    set((s) => ({
      volumes: { ...s.volumes, [key]: volume },
      lastVolumes: volume > 0 ? { ...s.lastVolumes, [key]: volume } : s.lastVolumes,
    })),
  toggleMute: (key) =>
    set((s) => {
      const current = s.volumes[key] ?? 1
      const next = current > 0 ? 0 : (s.lastVolumes[key] ?? 1)
      return {
        volumes: { ...s.volumes, [key]: next },
        lastVolumes: current > 0 ? { ...s.lastVolumes, [key]: current } : s.lastVolumes,
      }
    }),
}))
