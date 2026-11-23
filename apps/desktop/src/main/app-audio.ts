import { execFile } from 'node:child_process'
import { release } from 'node:os'
import { MessageChannelMain, type MessagePortMain, type WebContents } from 'electron'
import {
  IPC,
  type AppAudioTarget,
  type AudioSupport,
  type StartAppAudioResult,
} from '../shared/ipc'

/**
 * Native per-process audio capture (WASAPI process loopback) via the
 * `loopback-capture` addon. This is what makes screen-share audio echo-free:
 *  - sharing a window → capture only that app's process tree;
 *  - sharing a screen → capture the whole PC *except* Share itself, so the
 *    voices/screens of the other people in the call aren't sent back to them.
 *
 * PCM (s16le, stereo, 48 kHz) is streamed to the renderer over a MessagePort,
 * where an AudioWorklet turns it into a MediaStreamTrack for publishing.
 */

const SAMPLE_RATE = 48_000
const CHANNELS = 2
/** WASAPI process loopback requires Windows 10 build 20348+ (i.e. Windows 11). */
const MIN_WINDOWS_BUILD = 20348

interface LoopbackCapture {
  start(processId: number, callback: (chunk: Buffer) => void): void
  startSystemAudio(callback: (chunk: Buffer) => void, excludeProcessId?: number): void
  stop(): void
}
type LoopbackModule = { LoopbackCapture: new () => LoopbackCapture }

let addon: LoopbackModule | null | undefined
function loadAddon(): LoopbackModule | null {
  if (addon !== undefined) return addon
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('loopback-capture')
    addon = (mod.default ?? mod) as LoopbackModule
  } catch (error) {
    console.error('[app-audio] failed to load loopback-capture', error)
    addon = null
  }
  return addon
}

function windowsBuild(): number {
  return Number(release().split('.')[2] ?? 0)
}

export function getAudioSupport(): AudioSupport {
  const appAudio =
    process.platform === 'win32' && windowsBuild() >= MIN_WINDOWS_BUILD && loadAddon() !== null
  return { appAudio }
}

/** `window:<HWND>:0` → owning process id (via the window's main handle). */
async function processForWindow(sourceId: string): Promise<{ pid: number; name: string } | null> {
  const match = /^window:(\d+):/.exec(sourceId)
  if (!match) return null
  const hwnd = match[1] // digits only — safe to interpolate
  const script = `$p = Get-Process | Where-Object { $_.MainWindowHandle -eq ${hwnd} } | Select-Object -First 1; if ($p) { "$($p.Id)|$($p.ProcessName)" }`
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { timeout: 8000, windowsHide: true },
      (error, stdout) => {
        if (error) return resolve(null)
        const [pid, name] = stdout.trim().split('|')
        const n = Number(pid)
        resolve(Number.isInteger(n) && n > 0 ? { pid: n, name: name ?? '' } : null)
      },
    )
  })
}

let active: { capture: LoopbackCapture; port: MessagePortMain } | null = null

export function stopAppAudio(): void {
  if (!active) return
  const { capture, port } = active
  active = null
  try {
    capture.stop()
  } catch (error) {
    console.error('[app-audio] stop failed', error)
  }
  port.close()
}

export async function startAppAudio(
  webContents: WebContents,
  sourceId: string,
): Promise<StartAppAudioResult> {
  stopAppAudio()
  const mod = getAudioSupport().appAudio ? loadAddon() : null
  if (!mod) return { ok: false, error: 'Captura de áudio por app indisponível neste Windows.' }

  let target: AppAudioTarget = { kind: 'system-except-self' }
  if (sourceId.startsWith('window:')) {
    const proc = await processForWindow(sourceId)
    // A window we can't map to a process (child/tool windows) falls back to
    // "everything except Share", which is still echo-free.
    if (proc && proc.pid !== process.pid) {
      target = { kind: 'process', pid: proc.pid, appName: proc.name || null }
    }
  }

  const { port1, port2 } = new MessageChannelMain()
  const capture = new mod.LoopbackCapture()
  const onChunk = (chunk: Buffer) => {
    // Copy into a standalone ArrayBuffer (the Buffer may view a shared pool).
    port1.postMessage(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength))
  }

  try {
    if (target.kind === 'process') capture.start(target.pid, onChunk)
    else capture.startSystemAudio(onChunk, process.pid)
  } catch (error) {
    port1.close()
    port2.close()
    const message = error instanceof Error ? error.message : String(error)
    console.error('[app-audio] start failed', message)
    return { ok: false, error: message }
  }

  port1.start()
  active = { capture, port: port1 }
  webContents.postMessage(IPC.appAudioPort, null, [port2])
  return { ok: true, target, sampleRate: SAMPLE_RATE, channels: CHANNELS }
}
