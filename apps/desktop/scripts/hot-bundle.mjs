// Runs after `electron-vite build`. Produces:
//   out/shell.json                         identity of this build's main/preload (ships in the installer)
//   release-hot/renderer-<version>.asar    the interface, for "hot" updates
//   release-hot/hot.json                   manifest uploaded next to the installer
//
// An installed app applies a release's renderer without reinstalling only when
// its own shell hash equals the one in hot.json, i.e. nothing outside the
// renderer changed (main process, preload, Electron, native modules).
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createPackage } from '@electron/asar'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'package.json'))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const out = join(root, 'out')

function listFiles(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)]))
    .filter((f) => !f.endsWith('.map'))
    .sort()
}

function versionOf(name) {
  return JSON.parse(readFileSync(require.resolve(`${name}/package.json`), 'utf8')).version
}

// --- shell hash ------------------------------------------------------------
const hash = createHash('sha256')
// Everything in app.asar except the renderer: the compiled main process and
// preload, plus the runtime resources (tray/window icons) they load.
const shellFiles = [
  ...['main', 'preload']
    .flatMap((dir) => listFiles(join(out, dir)))
    .map((f) => [relative(out, f), f]),
  ...listFiles(join(root, 'resources')).map((f) => [relative(root, f), f]),
]
for (const [name, file] of shellFiles) {
  hash.update(name.split(sep).join('/'))
  hash.update('\0')
  hash.update(readFileSync(file))
  hash.update('\0')
}
hash.update(`electron@${versionOf('electron')}\0`)
for (const dep of Object.keys(pkg.dependencies ?? {}).sort()) {
  hash.update(`${dep}@${versionOf(dep)}\0`)
}
const shellHash = hash.digest('hex')
writeFileSync(join(out, 'shell.json'), JSON.stringify({ version: pkg.version, shellHash }, null, 2))

// --- renderer archive + manifest -------------------------------------------
const hotDir = join(root, 'release-hot')
rmSync(hotDir, { recursive: true, force: true })
mkdirSync(hotDir, { recursive: true })

const file = `renderer-${pkg.version}.asar`
const archive = join(hotDir, file)
await createPackage(join(out, 'renderer'), archive)

const data = readFileSync(archive)
const manifest = {
  version: pkg.version,
  shellHash,
  file,
  sha512: createHash('sha512').update(data).digest('base64'),
  size: statSync(archive).size,
}
writeFileSync(join(hotDir, 'hot.json'), JSON.stringify(manifest, null, 2))

console.log(
  `[hot-bundle] shell ${shellHash.slice(0, 12)} · ${file} (${Math.round(manifest.size / 1024)} KB)`,
)
