import { join } from 'node:path'
import { PROTOCOL } from '@share/shared/room'
import { app, BrowserWindow, ipcMain, nativeTheme, screen, session, shell } from 'electron'
import icon from '../../resources/icon.png?asset'
import { IPC, type AppInfo } from '../shared/ipc'
import { getAudioSupport, startAppAudio, stopAppAudio } from './app-audio'
import { installDisplayMediaHandler, listSources, selectSource } from './capture'
import { activeRendererEntry, cleanupHotBundles, currentVersion, markActiveBad } from './hot-update'
import { consumeResume } from './resume'
import { getSettings, updateSettings } from './settings'
import { AppTray } from './tray'
import {
  applyUpdate,
  checkForUpdates,
  checkIfStale,
  getUpdateStatus,
  setupAutoUpdates,
} from './updater'
import {
  adoptShortcuts,
  APP_ID,
  applyWindowIdentity,
  IS_REAL_INSTALL,
  registerToastIdentity,
} from './windows-identity'

// ---------------------------------------------------------------------------
// Dev helpers: `--multi-instance --profile=2` runs a second, isolated client on
// the same machine (own storage, no single-instance lock) to test calls locally.
// ---------------------------------------------------------------------------
const multiInstance = process.argv.includes('--multi-instance')
const profile = process.argv.find((a) => a.startsWith('--profile='))?.split('=')[1] ?? null
if (profile && /^[\w-]+$/.test(profile)) {
  app.setPath('userData', `${app.getPath('userData')}-${profile}`)
}

const BG_COLOR = '#0a0b10'
let mainWindow: BrowserWindow | null = null
/** True once the app is really quitting (tray menu, update, OS shutdown). */
let isQuitting = false
const tray = new AppTray(icon, () => mainWindow, showMainWindow)

function showMainWindow() {
  const win = mainWindow
  if (!win) {
    if (app.isReady()) createWindow()
    return
  }
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}
let pendingDeepLink: string | null = findDeepLink(process.argv)

function findDeepLink(argv: string[]): string | null {
  return argv.find((arg) => arg.startsWith(`${PROTOCOL}://`)) ?? null
}

function deliverDeepLink(url: string) {
  if (mainWindow && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send(IPC.deepLinkOpen, url)
  } else {
    pendingDeepLink = url
  }
  showMainWindow()
}

// ---------------------------------------------------------------------------
// Single instance + share:// protocol
// ---------------------------------------------------------------------------
if (!multiInstance && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const url = findDeepLink(argv)
    if (url) deliverDeepLink(url)
    else showMainWindow()
  })

  // The installer registers the protocol too; registering at runtime keeps it
  // pointing at the current install. Skipped in dev so it doesn't hijack links.
  if (IS_REAL_INSTALL) app.setAsDefaultProtocolClient(PROTOCOL)

  app.whenReady().then(onReady)
}

function isAppUrl(url: string): boolean {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) return url.startsWith(devUrl)
  return url.startsWith('file://')
}

function createWindow() {
  nativeTheme.themeSource = 'dark'
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: BG_COLOR,
    title: 'Share',
    icon,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: BG_COLOR, symbolColor: '#c9cce0', height: 40 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      // Keep decoding/encoding streams at full rate while minimized or behind
      // a pop-out window.
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  })
  mainWindow = win
  applyWindowIdentity(win)
  // Pop-out stream windows group with the app in the taskbar too.
  win.webContents.on('did-create-window', (child) => applyWindowIdentity(child))

  win.once('ready-to-show', () => win.show())
  // The app lives in the tray for days: look for updates when the user comes back to it.
  win.on('show', checkIfStale)
  win.on('focus', checkIfStale)

  // Closing hides to the notification area so a call keeps going.
  win.on('close', (event) => {
    if (isQuitting || !getSettings().closeToTray) return
    event.preventDefault()
    win.hide()
    if (!getSettings().trayHintShown) {
      tray.showHint()
      updateSettings({ trayHintShown: true })
    }
  })
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
    stopAppAudio()
    // Pop-out windows belong to the main window's session; close them too.
    for (const other of BrowserWindow.getAllWindows()) other.close()
  })

  win.webContents.on('did-finish-load', () => {
    if (profile) win.setTitle(`Share (perfil ${profile})`)
  })

  // Pop-out stream windows are same-origin `about:blank` children the renderer
  // fills via a React portal. Everything else opens in the system browser.
  win.webContents.setWindowOpenHandler(({ url, frameName }) => {
    if (url === 'about:blank' && frameName.startsWith('popout-')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1280,
          height: 760,
          minWidth: 320,
          minHeight: 200,
          backgroundColor: '#000000',
          autoHideMenuBar: true,
          icon,
          webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false },
        },
      }
    }
    if (/^https:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault()
  })

  win.webContents.on('did-fail-load', (_e, code, description, url, isMainFrame) => {
    if (!isMainFrame || code === -3 /* aborted by a newer navigation */) return
    console.error('[window] load failed', code, description, url)
    if (rendererWatchdog) revertToBuiltInRenderer()
  })

  loadRenderer(win, activeRendererEntry())
}

// ---------------------------------------------------------------------------
// Renderer loading. An interface update may replace the built-in renderer; if
// it doesn't come up, fall back to the built-in one and never use it again.
// ---------------------------------------------------------------------------
const RENDERER_START_TIMEOUT_MS = 20_000
let rendererWatchdog: NodeJS.Timeout | null = null

function clearWatchdog() {
  if (rendererWatchdog) clearTimeout(rendererWatchdog)
  rendererWatchdog = null
}

function revertToBuiltInRenderer() {
  clearWatchdog()
  markActiveBad()
  if (mainWindow) loadRenderer(mainWindow, null)
}

function loadRenderer(win: BrowserWindow, hotEntry: string | null) {
  clearWatchdog()
  // The page (and anything it was capturing) goes away; pop-outs belong to it.
  stopAppAudio()
  for (const other of BrowserWindow.getAllWindows()) if (other !== win) other.close()

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (hotEntry) {
    rendererWatchdog = setTimeout(revertToBuiltInRenderer, RENDERER_START_TIMEOUT_MS)
    void win.loadFile(hotEntry)
  } else if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

const ALLOWED_PERMISSIONS = new Set([
  'media',
  'display-capture',
  'fullscreen',
  'clipboard-sanitized-write',
  'speaker-selection',
  'notifications',
])

function configureSession() {
  const ses = session.defaultSession
  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents.getURL()
    callback((isAppUrl(url) || url === 'about:blank') && ALLOWED_PERMISSIONS.has(permission))
  })
  ses.setPermissionCheckHandler((_webContents, permission) => ALLOWED_PERMISSIONS.has(permission))
  installDisplayMediaHandler(ses)
}

function registerIpc() {
  ipcMain.handle(IPC.appInfo, (): AppInfo => ({
    version: currentVersion(),
    shellVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    profile,
  }))
  ipcMain.handle(IPC.openExternal, (_e, url: unknown) => {
    if (typeof url === 'string' && /^https:\/\//i.test(url)) return shell.openExternal(url)
  })

  ipcMain.handle(IPC.getSources, () => listSources())
  ipcMain.handle(IPC.selectSource, (_e, sourceId: unknown, systemAudio: unknown) => {
    if (typeof sourceId !== 'string') throw new Error('sourceId inválido')
    selectSource(sourceId, systemAudio === true)
  })
  ipcMain.handle(IPC.audioSupport, () => getAudioSupport())
  ipcMain.handle(IPC.startAppAudio, (event, sourceId: unknown) => {
    if (typeof sourceId !== 'string') throw new Error('sourceId inválido')
    return startAppAudio(event.sender, sourceId)
  })
  ipcMain.handle(IPC.stopAppAudio, () => stopAppAudio())

  ipcMain.handle(IPC.consumeDeepLink, () => {
    const url = pendingDeepLink
    pendingDeepLink = null
    return url
  })
  ipcMain.handle(IPC.showWindow, () => showMainWindow())
  ipcMain.handle(IPC.setRoom, (_e, roomId: unknown, name: unknown) => {
    tray.setRoom(
      typeof roomId === 'string' && roomId ? roomId : null,
      typeof name === 'string' && name ? name.slice(0, 64) : null,
    )
  })
  ipcMain.handle(IPC.rendererReady, (event) => {
    if (event.sender === mainWindow?.webContents) clearWatchdog()
  })
  ipcMain.handle(IPC.consumeResume, () => consumeResume())
  ipcMain.handle(IPC.getSettings, () => getSettings())
  ipcMain.handle(IPC.setSettings, (_e, partial: unknown) =>
    updateSettings(typeof partial === 'object' && partial ? partial : {}),
  )

  ipcMain.handle(IPC.updateGetStatus, () => getUpdateStatus())
  ipcMain.handle(IPC.updateApply, (_e, resume: unknown) => applyUpdate(resume))
  ipcMain.handle(IPC.updateCheck, () => checkForUpdates())
}

function onReady() {
  app.setAppUserModelId(APP_ID)
  adoptShortcuts()
  void registerToastIdentity(icon)
  configureSession()
  registerIpc()
  cleanupHotBundles()
  createWindow()
  tray.create()
  setupAutoUpdates({
    getWindow: () => mainWindow,
    loadRenderer: (entry) => {
      if (mainWindow) loadRenderer(mainWindow, entry)
    },
  })
  screen.on('display-metrics-changed', () => tray.refreshIcon())
}

// With the tray the window is only hidden, so this fires only when it was
// really closed (tray disabled, or quitting).
app.on('window-all-closed', () => {
  stopAppAudio()
  app.quit()
})

app.on('before-quit', () => {
  isQuitting = true
  stopAppAudio()
})

app.on('will-quit', () => tray.destroy())
