import { app, type BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { IPC, type UpdateStatus } from '../shared/ipc'

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000

/** Downloads updates from GitHub Releases in the background; the UI offers "restart". */
export function setupAutoUpdates(getWindow: () => BrowserWindow | null): void {
  if (!app.isPackaged) return

  const send = (status: UpdateStatus) => getWindow()?.webContents.send(IPC.updateStatus, status)

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => send({ state: 'available', version: info.version }))
  autoUpdater.on('download-progress', (p) =>
    send({ state: 'downloading', percent: Math.round(p.percent) }),
  )
  autoUpdater.on('update-downloaded', (info) => send({ state: 'ready', version: info.version }))
  autoUpdater.on('error', (error) => {
    console.error('[updater]', error)
    send({ state: 'error', message: error.message })
  })

  const check = () =>
    autoUpdater.checkForUpdates().catch((e) => console.error('[updater] check failed', e))
  setTimeout(check, 10_000)
  setInterval(check, CHECK_INTERVAL_MS)
}

export function installUpdate(): void {
  // isSilent: run the installer without UI; isForceRunAfter: relaunch afterwards.
  autoUpdater.quitAndInstall(true, true)
}
