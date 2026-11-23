import { execFile } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { app, shell, type BrowserWindow } from 'electron'

/**
 * How Windows names and draws the app (notifications, taskbar).
 *
 * Windows caches the name and icon it resolves for an AppUserModelID (in
 * the notification database and the taskbar), and never refreshes them.
 * Development runs (electron.exe) used to share the installed app's ID, so
 * "com.dbzroxxx.share" is stuck as "Electron" with the Electron icon on
 * machines that ran them. The installed app therefore uses a fresh ID, and
 * development keeps its own.
 */
export const APP_ID = app.isPackaged ? 'com.dbzroxxx.share.desktop' : 'com.dbzroxxx.share.dev'
const DISPLAY_NAME = app.isPackaged ? 'Share' : 'Share (dev)'

const run = promisify(execFile)

/**
 * Registers the notification identity explicitly (the documented way for
 * unpackaged desktop apps): toasts then say "Share" with the app's icon,
 * whatever Windows cached before. The icon must be a real file, so it is
 * copied out of app.asar into userData.
 */
export async function registerToastIdentity(iconInAsar: string): Promise<void> {
  if (process.platform !== 'win32') return
  try {
    // The installed app's folder, not a test profile's: the registry is shared.
    const icon = join(app.getPath('appData'), 'Share', 'notification-icon.png')
    mkdirSync(dirname(icon), { recursive: true })
    const bytes = readFileSync(iconInAsar)
    if (!existsSync(icon) || !readFileSync(icon).equals(bytes)) copyFileSync(iconInAsar, icon)

    const key = `HKCU\\Software\\Classes\\AppUserModelId\\${APP_ID}`
    const wanted: Record<string, string> = { DisplayName: DISPLAY_NAME, IconUri: icon }
    let current = ''
    try {
      current = (await run('reg', ['query', key], { windowsHide: true })).stdout
    } catch {
      // Key not there yet.
    }
    for (const [name, value] of Object.entries(wanted)) {
      const line = new RegExp(`^\\s*${name}\\s+REG_\\w+\\s+(.*)$`, 'm').exec(current)
      if (line?.[1]?.trim() === value) continue
      await run('reg', ['add', key, '/v', name, '/t', 'REG_SZ', '/d', value, '/f'], {
        windowsHide: true,
      })
    }
  } catch (error) {
    console.warn('[identity] could not register the notification identity', error)
  }
}

/** Taskbar name, icon and relaunch target for a window, regardless of cached data. */
export function applyWindowIdentity(win: BrowserWindow): void {
  if (process.platform !== 'win32') return
  // In development the executable is electron.exe: keep its icon out of it.
  win.setAppDetails(
    app.isPackaged
      ? {
          appId: APP_ID,
          appIconPath: process.execPath,
          appIconIndex: 0,
          relaunchCommand: `"${process.execPath}"`,
          relaunchDisplayName: DISPLAY_NAME,
        }
      : { appId: APP_ID },
  )
}

/**
 * The installer stamps its shortcuts (Start menu, desktop, pinned to the
 * taskbar) with the electron-builder appId. Point those that open this app
 * at APP_ID so the running window groups with them in the taskbar. Runs on
 * every start: an update reinstalls the shortcuts with the old ID.
 */
export function adoptShortcuts(): void {
  if (process.platform !== 'win32' || !app.isPackaged) return
  const appData = app.getPath('appData')
  const candidates = [
    join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Share.lnk'),
    join(app.getPath('desktop'), 'Share.lnk'),
    join(
      appData,
      'Microsoft',
      'Internet Explorer',
      'Quick Launch',
      'User Pinned',
      'TaskBar',
      'Share.lnk',
    ),
  ]
  const exe = process.execPath.toLowerCase()
  for (const link of candidates) {
    try {
      if (!existsSync(link)) continue
      const current = shell.readShortcutLink(link)
      if (current.target.toLowerCase() !== exe || current.appUserModelId === APP_ID) continue
      shell.writeShortcutLink(link, 'update', { ...current, appUserModelId: APP_ID })
    } catch (error) {
      console.warn('[identity] could not update shortcut', link, error)
    }
  }
}
