import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { format } from 'node:util'
import { app } from 'electron'

/**
 * Update log at %APPDATA%\Share\logs\updater.log, so a failed update on
 * someone else's PC leaves a trace they can send. Also goes to the console.
 * Matches electron-updater's `Logger` interface (info/warn/error/debug).
 */

const MAX_BYTES = 1024 * 1024

let file: string | null | undefined

function logFile(): string | null {
  if (file !== undefined) return file
  try {
    const dir = app.getPath('logs')
    mkdirSync(dir, { recursive: true })
    file = join(dir, 'updater.log')
  } catch {
    file = null
  }
  return file
}

function write(level: string, args: unknown[]) {
  const target = logFile()
  if (!target) return
  try {
    try {
      if (statSync(target).size > MAX_BYTES) renameSync(target, `${target}.old`)
    } catch {
      // No log yet.
    }
    appendFileSync(target, `${new Date().toISOString()} ${level} ${format(...args)}\n`)
  } catch {
    // Logging must never break updates.
  }
}

export const updaterLog = {
  info: (...args: unknown[]) => {
    console.log('[updater]', ...args)
    write('INFO ', args)
  },
  warn: (...args: unknown[]) => {
    console.warn('[updater]', ...args)
    write('WARN ', args)
  },
  error: (...args: unknown[]) => {
    console.error('[updater]', ...args)
    write('ERROR', args)
  },
  debug: (...args: unknown[]) => write('DEBUG', args),
}
