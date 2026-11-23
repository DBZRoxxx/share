import { app, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC, type UpdateCheckResult, type UpdateStatus } from '../shared/ipc'
import { compareVersions } from './hot-logic'
import {
  activateHotUpdate,
  checkHotUpdate,
  currentVersion,
  getShell,
  type StagedHotUpdate,
} from './hot-update'
import { saveResume } from './resume'

const CHECK_INTERVAL_MS = 30 * 60 * 1000
/** Coming back to the window checks again if the last check is older than this. */
const STALE_AFTER_MS = 10 * 60 * 1000

/**
 * Two kinds of updates:
 * - interface only (hot): downloaded as a renderer archive and applied by
 *   reloading the window, see hot-update.ts;
 * - full: the regular installer via electron-updater, applied by restarting.
 *
 * Nothing is applied without the user clicking "Atualizar" (or quitting): the
 * renderer saves where the user was so it can put them back in the room.
 */

let status: UpdateStatus = { state: 'idle' }
let staged: StagedHotUpdate | null = null
let fullVersion: string | null = null
let silentFull = false
let running: Promise<void> | null = null
let lastCheckAt = 0
let enabled = false
let getWindow: () => BrowserWindow | null = () => null
let loadRenderer: (entry: string | null) => void = () => undefined

function setStatus(next: UpdateStatus) {
  status = next
  getWindow()?.webContents.send(IPC.updateStatus, next)
}

export function getUpdateStatus(): UpdateStatus {
  return status
}

/** The update the user would get by clicking "Atualizar", full taking precedence. */
function readyStatus(): UpdateStatus {
  if (fullVersion) return { state: 'ready', kind: 'full', version: fullVersion }
  if (staged) return { state: 'ready', kind: 'hot', version: staged.version }
  return { state: 'idle' }
}

async function checkHot() {
  try {
    const found = await checkHotUpdate((version, percent) => {
      if (!fullVersion) setStatus({ state: 'downloading', kind: 'hot', version, percent })
    })
    if (found) staged = found
  } catch (error) {
    console.error('[updater] interface update failed', error)
  }
  setStatus(readyStatus())
}

async function checkFull() {
  const result = await autoUpdater.checkForUpdates()
  if (!result?.isUpdateAvailable) return
  const version = result.updateInfo.version
  if (fullVersion === version) return
  // An interface update already brings the user to this version; download the
  // installer quietly so the app itself catches up the next time it quits.
  silentFull = !!staged && compareVersions(staged.version, version) >= 0
  if (!silentFull) setStatus({ state: 'downloading', kind: 'full', version, percent: null })
  await autoUpdater.downloadUpdate()
  if (!silentFull) {
    fullVersion = version
    setStatus(readyStatus())
  }
}

let lastError: string | null = null

/** One check at a time; concurrent callers share it. */
function check(): Promise<void> {
  if (status.state === 'applying') return Promise.resolve()
  running ??= (async () => {
    lastCheckAt = Date.now()
    lastError = null
    try {
      await checkHot()
      await checkFull()
    } catch (error) {
      console.error('[updater] check failed', error)
      lastError = error instanceof Error ? error.message : String(error)
      if (status.state === 'downloading' || status.state === 'checking') setStatus(readyStatus())
    } finally {
      running = null
    }
  })()
  return running
}

/** "Verificar atualizações": checks now and says what it found. */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  if (!enabled) return { outcome: 'unsupported' }
  if (status.state === 'idle') setStatus({ state: 'checking' })
  await check()
  if (status.state === 'checking') setStatus(readyStatus())
  const ready = readyStatus()
  if (ready.state === 'ready') return { outcome: 'available', version: ready.version }
  if (status.state === 'downloading') return { outcome: 'available', version: status.version }
  if (lastError) return { outcome: 'error', message: lastError }
  return { outcome: 'up-to-date', version: currentVersion() }
}

/** The window came back (e.g. from the tray): check if it has been a while. */
export function checkIfStale(): void {
  if (enabled && !running && Date.now() - lastCheckAt > STALE_AFTER_MS) void check()
}

export function setupAutoUpdates(opts: {
  getWindow: () => BrowserWindow | null
  loadRenderer: (entry: string | null) => void
}): void {
  getWindow = opts.getWindow
  loadRenderer = opts.loadRenderer
  // Packaged builds only, unless pointed at a local feed for testing.
  if (!app.isPackaged && !process.env['SHARE_UPDATE_FEED']) return
  enabled = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.on('download-progress', (p) => {
    if (silentFull || status.state !== 'downloading' || status.kind !== 'full') return
    setStatus({ ...status, percent: Math.round(p.percent) })
  })
  autoUpdater.on('error', (error) => console.error('[updater]', error))

  // A postponed interface update is in place on the next launch.
  app.on('before-quit', () => {
    if (staged && !fullVersion) activateHotUpdate(staged)
  })

  if (getShell() === null) console.warn('[updater] no shell.json: interface updates disabled')
  setTimeout(() => void check(), 8_000)
  setInterval(() => void check(), CHECK_INTERVAL_MS)
}

/** Applies the ready update. `resume` lets the renderer put the user back in the room. */
export function applyUpdate(resume: unknown): void {
  if (status.state !== 'ready') return
  if (resume) saveResume(resume)

  if (status.kind === 'hot' && staged) {
    setStatus({ state: 'applying', kind: 'hot' })
    const entry = activateHotUpdate(staged)
    staged = null
    status = { state: 'idle' }
    loadRenderer(entry)
    return
  }

  setStatus({ state: 'applying', kind: 'full' })
  // isSilent: no installer UI; isForceRunAfter: relaunch when done.
  setImmediate(() => autoUpdater.quitAndInstall(true, true))
}
