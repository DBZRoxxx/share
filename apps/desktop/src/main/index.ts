import { join } from 'node:path'
import { PROTOCOL } from '@share/shared'
import { app, BrowserWindow, ipcMain, nativeTheme, session, shell } from 'electron'
import icon from '../../resources/icon.png?asset'
import { IPC, type AppInfo } from '../shared/ipc'
import { getAudioSupport, startAppAudio, stopAppAudio } from './app-audio'
import { installDisplayMediaHandler, listSources, selectSource } from './capture'
import { installUpdate, setupAutoUpdates } from './updater'

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
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
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
    else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  // The installer registers the protocol too; registering at runtime keeps it
  // pointing at the current install. Skipped in dev so it doesn't hijack links.
  if (app.isPackaged) app.setAsDefaultProtocolClient(PROTOCOL)

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

  win.once('ready-to-show', () => win.show())
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

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) void win.loadURL(devUrl)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

const ALLOWED_PERMISSIONS = new Set([
  'media',
  'display-capture',
  'fullscreen',
  'clipboard-sanitized-write',
  'speaker-selection',
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
    version: app.getVersion(),
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
  ipcMain.handle(IPC.updateInstall, () => installUpdate())
}

function onReady() {
  app.setAppUserModelId('com.dbzroxxx.share')
  configureSession()
  registerIpc()
  createWindow()
  setupAutoUpdates(() => mainWindow)
}

app.on('window-all-closed', () => {
  stopAppAudio()
  app.quit()
})

app.on('before-quit', () => stopAppAudio())
