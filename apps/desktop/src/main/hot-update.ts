import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, net } from 'electron'
// Electron's patched `fs` treats *.asar paths as archives; writing, renaming and
// hashing the archive files themselves needs the unpatched module.
import fs from 'original-fs'
import {
  activeBundle,
  canHotUpdate,
  effectiveVersion,
  parseManifest,
  parseState,
  type HotManifest,
  type HotState,
  type ShellInfo,
} from './hot-logic'

/**
 * Interface ("hot") updates: when a release only changed the renderer, the app
 * downloads that renderer as an .asar archive and loads it instead of the
 * built-in one — no reinstall, no restart. Releases that touched the main
 * process, preload or native modules have a different shell hash and go
 * through the regular installer instead.
 */

const DEFAULT_FEED = 'https://github.com/DBZRoxxx/share/releases/latest/download'

const hotDir = () => join(app.getPath('userData'), 'hot')
const statePath = () => join(hotDir(), 'state.json')

let shellCache: ShellInfo | null | undefined

/** Identity of the installed app, written at build time by scripts/hot-bundle.mjs. */
export function getShell(): ShellInfo | null {
  if (shellCache !== undefined) return shellCache
  try {
    // Lives inside app.asar, so this read needs Electron's asar-aware fs.
    const raw = JSON.parse(readFileSync(join(__dirname, '../shell.json'), 'utf8')) as ShellInfo
    shellCache =
      typeof raw.shellHash === 'string' && typeof raw.version === 'string'
        ? { version: app.getVersion(), shellHash: raw.shellHash }
        : null
  } catch {
    shellCache = null // dev builds: interface updates disabled
  }
  return shellCache
}

function readState(): HotState {
  try {
    return parseState(JSON.parse(fs.readFileSync(statePath(), 'utf8')))
  } catch {
    return { active: null, bad: [] }
  }
}

function writeState(state: HotState): void {
  fs.mkdirSync(hotDir(), { recursive: true })
  const tmp = `${statePath()}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2))
  fs.renameSync(tmp, statePath())
}

/** Version shown to the user (installed app + applied interface update). */
export function currentVersion(): string {
  const shell = getShell()
  return shell ? effectiveVersion(shell, readState()) : app.getVersion()
}

/** index.html of the interface to load, or null for the built-in one. */
export function activeRendererEntry(): string | null {
  const shell = getShell()
  if (!shell) return null
  const active = activeBundle(shell, readState())
  if (!active) return null
  const archive = join(hotDir(), active.file)
  if (!fs.existsSync(archive)) return null
  return join(archive, 'index.html')
}

/** The loaded hot bundle failed to start: never use this version again. */
export function markActiveBad(): void {
  const state = readState()
  if (!state.active) return
  console.error('[hot-update] interface', state.active.version, 'failed to start; reverting')
  writeState({ active: null, bad: [...state.bad, state.active.version] })
}

/**
 * Removes archives that are no longer used (older versions, or ones made
 * obsolete because the installed app caught up).
 */
export function cleanupHotBundles(keep: string | null = null): void {
  const shell = getShell()
  const state = readState()
  const active = shell ? activeBundle(shell, state) : null
  if (state.active && !active) writeState({ ...state, active: null })
  let files: string[]
  try {
    files = fs.readdirSync(hotDir())
  } catch {
    return
  }
  for (const f of files) {
    if (f === 'state.json' || f === active?.file || f === keep) continue
    try {
      fs.rmSync(join(hotDir(), f), { force: true })
    } catch {
      // In use or locked; try again next launch.
    }
  }
}

/**
 * Feed with hot.json and the archives. Overridable for local testing with
 * SHARE_UPDATE_FEED (a folder or an http(s) URL).
 */
function feed(): string {
  return (process.env['SHARE_UPDATE_FEED'] || DEFAULT_FEED).replace(/[\\/]+$/, '')
}

const isRemote = (base: string) => /^https?:\/\//i.test(base)

async function fetchManifest(): Promise<HotManifest | null> {
  const base = feed()
  try {
    let body: unknown
    if (isRemote(base)) {
      const res = await net.fetch(`${base}/hot.json`, { cache: 'no-store' })
      if (!res.ok) return null // releases without a hot bundle (e.g. 404)
      body = await res.json()
    } else {
      body = JSON.parse(fs.readFileSync(join(base, 'hot.json'), 'utf8'))
    }
    return parseManifest(body)
  } catch (error) {
    console.warn('[hot-update] manifest unavailable', error)
    return null
  }
}

async function download(manifest: HotManifest, onProgress: (percent: number) => void) {
  const base = feed()
  const target = join(hotDir(), manifest.file)
  const tmp = `${target}.download`
  fs.mkdirSync(hotDir(), { recursive: true })

  let data: Buffer
  if (isRemote(base)) {
    const res = await net.fetch(`${base}/${manifest.file}`, { cache: 'no-store' })
    if (!res.ok || !res.body) throw new Error(`download failed (${res.status})`)
    const chunks: Uint8Array[] = []
    let received = 0
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.byteLength
      if (received > manifest.size) throw new Error('download larger than announced')
      onProgress(Math.round((received / manifest.size) * 100))
    }
    data = Buffer.concat(chunks)
  } else {
    data = fs.readFileSync(join(base, manifest.file))
  }

  const sha512 = createHash('sha512').update(data).digest('base64')
  if (data.byteLength !== manifest.size || sha512 !== manifest.sha512) {
    throw new Error('checksum mismatch')
  }
  fs.writeFileSync(tmp, data)
  fs.renameSync(tmp, target)
}

export interface StagedHotUpdate {
  version: string
  shellHash: string
  file: string
}

/**
 * Looks for a newer interface built for this exact app and downloads it.
 * Returns the staged update, or null when there is none (or it needs a full update).
 */
export async function checkHotUpdate(
  onDownloading: (version: string, percent: number | null) => void,
): Promise<StagedHotUpdate | null> {
  const shell = getShell()
  if (!shell) return null
  const manifest = await fetchManifest()
  if (!manifest || !canHotUpdate(manifest, shell, readState())) return null

  const staged = { version: manifest.version, shellHash: manifest.shellHash, file: manifest.file }
  if (!fs.existsSync(join(hotDir(), manifest.file))) {
    onDownloading(manifest.version, null)
    await download(manifest, (p) => onDownloading(manifest.version, p))
  }
  return staged
}

/**
 * Makes the staged interface the one to load. Also used on quit, so an update
 * the user postponed is in place on the next launch.
 */
export function activateHotUpdate(staged: StagedHotUpdate): string {
  const state = readState()
  writeState({ ...state, active: staged })
  cleanupHotBundles(staged.file)
  return join(hotDir(), staged.file, 'index.html')
}
