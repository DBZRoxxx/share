import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { ResumeState } from '../shared/ipc'

/** Long enough for a silent reinstall + relaunch, short enough not to surprise anyone. */
const MAX_AGE_MS = 3 * 60_000
const MAX_BYTES = 2 * 1024 * 1024

const file = () => join(app.getPath('userData'), 'resume.json')

/** Saves where the user was right before an update reloads/restarts the app. */
export function saveResume(state: unknown): void {
  if (!state || typeof state !== 'object' || typeof (state as ResumeState).roomId !== 'string') {
    return
  }
  const json = JSON.stringify({ savedAt: Date.now(), state })
  if (json.length > MAX_BYTES) return
  writeFileSync(file(), json)
}

export function consumeResume(): ResumeState | null {
  let raw: string
  try {
    raw = readFileSync(file(), 'utf8')
  } catch {
    return null
  }
  rmSync(file(), { force: true })
  try {
    const { savedAt, state } = JSON.parse(raw) as { savedAt: number; state: ResumeState }
    return Date.now() - savedAt < MAX_AGE_MS ? state : null
  } catch {
    return null
  }
}
