/** Types shared by the main process, the preload bridge and the renderer. */

export type CaptureSourceKind = 'screen' | 'window'

export interface CaptureSource {
  id: string
  name: string
  kind: CaptureSourceKind
  /** PNG data URL of the source preview. */
  thumbnail: string
  /** PNG data URL of the window's app icon, if any. */
  appIcon: string | null
}

/**
 * How the audio of a screen share is captured.
 * - `app`: native per-process loopback (only the shared window's app, or the
 *   whole PC minus Share itself when sharing a screen). No echo.
 * - `system`: Chromium's plain system loopback. Captures everything that plays
 *   on the PC, including other people's voices from the call (echo).
 * - `none`: video only.
 */
export type ShareAudioMode = 'app' | 'system' | 'none'

export interface AudioSupport {
  /** Native per-process loopback is available (Windows build ≥ 20348). */
  appAudio: boolean
}

export type AppAudioTarget =
  { kind: 'process'; pid: number; appName: string | null } | { kind: 'system-except-self' }

export type StartAppAudioResult =
  | { ok: true; target: AppAudioTarget; sampleRate: number; channels: number }
  | { ok: false; error: string }

/** Message posted to the renderer's main world carrying the PCM MessagePort. */
export const AUDIO_PORT_MESSAGE = 'share:app-audio-port'

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'ready'; version: string }
  | { state: 'error'; message: string }

export interface AppInfo {
  version: string
  isPackaged: boolean
  /** Separate dev profile number when running a second instance for testing. */
  profile: string | null
}

export interface ShareApi {
  app: {
    info(): Promise<AppInfo>
    openExternal(url: string): Promise<void>
  }
  capture: {
    getSources(): Promise<CaptureSource[]>
    /** Picks the source the next getDisplayMedia() call will receive. */
    select(sourceId: string, systemAudio: boolean): Promise<void>
    audioSupport(): Promise<AudioSupport>
    /** Starts native app-audio capture; PCM arrives via a MessagePort (see AUDIO_PORT_MESSAGE). */
    startAppAudio(sourceId: string): Promise<StartAppAudioResult>
    stopAppAudio(): Promise<void>
  }
  deepLink: {
    /** Returns (and clears) a room link the app was launched with. */
    consumePending(): Promise<string | null>
    onOpen(callback: (url: string) => void): () => void
  }
  updater: {
    onStatus(callback: (status: UpdateStatus) => void): () => void
    install(): Promise<void>
  }
}

export const IPC = {
  appInfo: 'app:info',
  openExternal: 'app:open-external',
  getSources: 'capture:get-sources',
  selectSource: 'capture:select',
  audioSupport: 'capture:audio-support',
  startAppAudio: 'capture:start-app-audio',
  stopAppAudio: 'capture:stop-app-audio',
  appAudioPort: 'capture:app-audio-port',
  consumeDeepLink: 'deeplink:consume',
  deepLinkOpen: 'deeplink:open',
  updateStatus: 'updater:status',
  updateInstall: 'updater:install',
} as const
