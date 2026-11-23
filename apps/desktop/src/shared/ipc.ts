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

/**
 * - `hot`: only the interface changed; applied by reloading the window (no restart).
 * - `full`: the app itself changed; applied by restarting into the new installer.
 */
export type UpdateKind = 'hot' | 'full'

export type UpdateStatus =
  | { state: 'idle' }
  /** Looking for a new version (only reported for checks the user started). */
  | { state: 'checking' }
  | { state: 'downloading'; kind: UpdateKind; version: string; percent: number | null }
  | { state: 'ready'; kind: UpdateKind; version: string }
  | { state: 'applying'; kind: UpdateKind }
  | { state: 'error'; message: string }

/** Outcome of a check the user asked for ("Verificar atualizações"). */
export type UpdateCheckResult =
  | { outcome: 'available'; version: string }
  | { outcome: 'up-to-date'; version: string }
  /** Development builds don't update. */
  | { outcome: 'unsupported' }
  | { outcome: 'error'; message: string }

/**
 * What the renderer needs to put the user back where they were after an
 * update reloads or restarts the app. Opaque to the main process.
 */
export interface ResumeState {
  roomId: string
  camera: boolean
  mic: boolean
  screen: {
    sourceId: string
    sourceKind: CaptureSourceKind
    sourceName: string
    quality: 'motion' | 'detail'
    audio: ShareAudioMode
  } | null
  layout: 'grid' | 'spotlight'
  spotlightKey: string | null
  /** Chat messages (shape of @share/shared ChatMessage). */
  chat: unknown[]
  /** Access key of a private room entered without "remember" (v0.5.2+). */
  roomKey?: string | null
}

/** Settings owned by the main process (they apply before the renderer loads). */
export interface MainSettings {
  /** Closing the window hides it to the notification area instead of quitting. */
  closeToTray: boolean
  /** The one-time "still running" balloon was shown. */
  trayHintShown: boolean
}

export interface AppInfo {
  /** Version the user is running (includes an applied interface update). */
  version: string
  /** Version of the installed app (main process, preload, Electron). */
  shellVersion: string
  isPackaged: boolean
  /** Separate dev profile number when running a second instance for testing. */
  profile: string | null
}

export interface ShareApi {
  app: {
    info(): Promise<AppInfo>
    openExternal(url: string): Promise<void>
    /** Brings the main window back (e.g. from the notification area). */
    show(): Promise<void>
    /** Tells the main process which room the user is in (tray menu/tooltip). */
    setRoom(roomId: string | null, name?: string | null): Promise<void>
    /** Called once the interface has mounted; guards against a broken update. */
    rendererReady(): Promise<void>
    /** Returns (and clears) the state saved before an update reloaded the app. */
    consumeResume(): Promise<ResumeState | null>
    /** "Sair da sala" was clicked in the tray menu. */
    onLeaveRoomRequest(callback: () => void): () => void
  }
  settings: {
    get(): Promise<MainSettings>
    set(partial: Partial<MainSettings>): Promise<MainSettings>
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
    getStatus(): Promise<UpdateStatus>
    onStatus(callback: (status: UpdateStatus) => void): () => void
    /** Looks for a new version right now. */
    check(): Promise<UpdateCheckResult>
    /** Applies the ready update; `resume` puts the user back in the room afterwards. */
    apply(resume: ResumeState | null): Promise<void>
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
  showWindow: 'app:show',
  setRoom: 'app:set-room',
  rendererReady: 'app:renderer-ready',
  consumeResume: 'app:consume-resume',
  trayLeaveRoom: 'tray:leave-room',
  getSettings: 'settings:get',
  setSettings: 'settings:set',
  updateStatus: 'updater:status',
  updateGetStatus: 'updater:get-status',
  updateApply: 'updater:apply',
  updateCheck: 'updater:check',
} as const
