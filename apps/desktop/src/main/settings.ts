import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { MainSettings } from '../shared/ipc'

/** Settings the main process needs before/without the renderer (kept in userData). */
const DEFAULTS: MainSettings = { closeToTray: true, trayHintShown: false }

let cache: MainSettings | null = null
const file = () => join(app.getPath('userData'), 'settings.json')

export function getSettings(): MainSettings {
  if (cache) return cache
  try {
    const raw = JSON.parse(readFileSync(file(), 'utf8')) as Partial<MainSettings>
    cache = {
      closeToTray: typeof raw.closeToTray === 'boolean' ? raw.closeToTray : DEFAULTS.closeToTray,
      trayHintShown: raw.trayHintShown === true,
    }
  } catch {
    cache = { ...DEFAULTS }
  }
  return cache
}

export function updateSettings(partial: Partial<MainSettings>): MainSettings {
  const next = { ...getSettings() }
  if (typeof partial.closeToTray === 'boolean') next.closeToTray = partial.closeToTray
  if (typeof partial.trayHintShown === 'boolean') next.trayHintShown = partial.trayHintShown
  cache = next
  try {
    writeFileSync(file(), JSON.stringify(next, null, 2))
  } catch (error) {
    console.error('[settings] save failed', error)
  }
  return next
}
