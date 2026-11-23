import { execFile } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { app, type BrowserWindow } from 'electron'

/**
 * How Windows names and draws the app (notifications, taskbar).
 *
 * The installed app and development runs must not share an AppUserModelID:
 * Windows caches the name and icon it resolves for an ID, and a dev run
 * (electron.exe) would make the installed app show up as "Electron".
 */
export const APP_ID = app.isPackaged ? 'com.dbzroxxx.share' : 'com.dbzroxxx.share.dev'
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
