/**
 * Runs vitest with the drive letter of the working directory in uppercase.
 *
 * On Windows, starting from `d:\…` instead of `D:\…` (as VS Code's terminal and
 * Git Bash often do) makes the test workers load `vitest` twice, once per
 * spelling of the path, and every suite fails before running with "Cannot read
 * properties of undefined (reading 'config')". Normalizing the directory, and
 * the path vitest itself is loaded from, keeps a single copy.
 */
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const upperDrive = (path) => path.replace(/^[a-z]:/, (drive) => drive.toUpperCase())

process.chdir(upperDrive(process.cwd()))
const vitestDir = upperDrive(dirname(createRequire(import.meta.url).resolve('vitest/package.json')))
await import(pathToFileURL(join(vitestDir, 'vitest.mjs')).href)
