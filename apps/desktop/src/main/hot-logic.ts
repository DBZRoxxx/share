/**
 * Pure helpers for interface ("hot") updates — no Electron imports so they can
 * be unit tested.
 */

/** Published next to the installer in every GitHub release. */
export interface HotManifest {
  version: string
  /** Hash of the main process + preload + native deps this interface was built against. */
  shellHash: string
  /** File name of the renderer archive in the same release. */
  file: string
  /** Base64 sha512 of that file. */
  sha512: string
  size: number
}

/** Written into the app at build time (out/shell.json). */
export interface ShellInfo {
  version: string
  shellHash: string
}

/** Persisted in userData/hot/state.json. */
export interface HotState {
  /** Bundle the window loads instead of the built-in interface. */
  active: { version: string; shellHash: string; file: string } | null
  /** Versions that failed to start; never tried again. */
  bad: string[]
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/

/** Compares x.y.z[-pre] versions. Returns <0, 0 or >0. Invalid versions sort lowest. */
export function compareVersions(a: string, b: string): number {
  const pa = SEMVER.exec(a)
  const pb = SEMVER.exec(b)
  if (!pa || !pb) return pa ? 1 : pb ? -1 : 0
  for (let i = 1; i <= 3; i++) {
    const diff = Number(pa[i]) - Number(pb[i])
    if (diff) return diff
  }
  // A release sorts after its pre-releases (1.0.0 > 1.0.0-beta).
  if (pa[4] === pb[4]) return 0
  if (!pa[4]) return 1
  if (!pb[4]) return -1
  return pa[4] < pb[4] ? -1 : 1
}

const FILE_RE = /^renderer-[0-9A-Za-z.-]+\.asar$/

export function parseManifest(value: unknown): HotManifest | null {
  if (!value || typeof value !== 'object') return null
  const m = value as Record<string, unknown>
  if (
    typeof m.version !== 'string' ||
    !SEMVER.test(m.version) ||
    typeof m.shellHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(m.shellHash) ||
    typeof m.file !== 'string' ||
    !FILE_RE.test(m.file) ||
    typeof m.sha512 !== 'string' ||
    m.sha512.length < 80 ||
    typeof m.size !== 'number' ||
    m.size <= 0 ||
    m.size > 200 * 1024 * 1024
  ) {
    return null
  }
  return {
    version: m.version,
    shellHash: m.shellHash,
    file: m.file,
    sha512: m.sha512,
    size: m.size,
  }
}

/** The interface version the user is running: the active hot bundle if it applies. */
export function effectiveVersion(shell: ShellInfo, state: HotState): string {
  const active = activeBundle(shell, state)
  return active ? active.version : shell.version
}

/** The hot bundle to load, if it still applies to this installed app. */
export function activeBundle(shell: ShellInfo, state: HotState): HotState['active'] {
  const a = state.active
  if (!a) return null
  if (a.shellHash !== shell.shellHash) return null
  if (compareVersions(a.version, shell.version) <= 0) return null
  if (state.bad.includes(a.version)) return null
  return a
}

/** Whether a published interface update can be applied without reinstalling. */
export function canHotUpdate(manifest: HotManifest, shell: ShellInfo, state: HotState): boolean {
  return (
    manifest.shellHash === shell.shellHash &&
    compareVersions(manifest.version, effectiveVersion(shell, state)) > 0 &&
    !state.bad.includes(manifest.version)
  )
}

export function parseState(value: unknown): HotState {
  const empty: HotState = { active: null, bad: [] }
  if (!value || typeof value !== 'object') return empty
  const s = value as Record<string, unknown>
  const bad = Array.isArray(s.bad) ? s.bad.filter((v): v is string => typeof v === 'string') : []
  const a = s.active as Record<string, unknown> | null | undefined
  const active =
    a &&
    typeof a.version === 'string' &&
    typeof a.shellHash === 'string' &&
    typeof a.file === 'string' &&
    FILE_RE.test(a.file)
      ? { version: a.version, shellHash: a.shellHash, file: a.file }
      : null
  return { active, bad: bad.slice(-20) }
}
