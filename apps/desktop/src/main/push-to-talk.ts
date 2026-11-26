import type { WebContents } from 'electron'
import { IPC, type PttBinding, type PttConfig } from '../shared/ipc'

/**
 * Global push-to-talk. Electron's globalShortcut only reports presses, never
 * releases, so a low-level input hook (uiohook-napi) watches the keyboard and
 * mouse instead, even while a game or another app has focus.
 *
 * Privacy: the hook only runs while push-to-talk is on and the user is in a
 * room (or while recording a new binding), and the renderer only ever learns
 * "pressed / released" for the chosen binding. Other keys never leave here,
 * except the single key pressed while the user is recording a binding.
 */

interface KeyEvent {
  keycode: number
}
interface MouseEvent {
  button: unknown
}
interface Hook {
  on(event: 'keydown' | 'keyup', listener: (e: KeyEvent) => void): this
  on(event: 'mousedown' | 'mouseup', listener: (e: MouseEvent) => void): this
  start(): void
  stop(): void
}
type HookModule = { uIOhook: Hook; UiohookKey: Record<string, number> }

let mod: HookModule | null | undefined
function loadHook(): HookModule | null {
  if (mod !== undefined) return mod
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('uiohook-napi') as HookModule
  } catch (error) {
    console.error('[ptt] uiohook-napi unavailable', error)
    mod = null
  }
  return mod
}

/** Mouse buttons allowed as a binding: middle and the two side buttons. */
const MOUSE_BUTTONS = new Set([3, 4, 5])
const RECORD_TIMEOUT_MS = 10_000
const ESCAPE = 1

const KEY_LABELS: Record<string, string> = {
  Space: 'Espaço',
  Ctrl: 'Ctrl',
  CtrlRight: 'Ctrl direito',
  Alt: 'Alt',
  AltRight: 'Alt Gr',
  Shift: 'Shift',
  ShiftRight: 'Shift direito',
  Meta: 'Windows',
  MetaRight: 'Windows direito',
  CapsLock: 'Caps Lock',
  Backquote: "'",
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
}

let keyNames: Map<number, string> | null = null
function keyLabel(hook: HookModule, code: number): string {
  if (!keyNames) {
    keyNames = new Map()
    for (const [name, value] of Object.entries(hook.UiohookKey)) {
      if (!keyNames.has(value)) keyNames.set(value, name)
    }
  }
  const name = keyNames.get(code)
  if (!name) return `Tecla ${code}`
  return KEY_LABELS[name] ?? name.replace(/^Numpad(?=.)/, 'Num ')
}

function mouseLabel(button: number): string {
  return button === 3 ? 'Botão do meio' : `Mouse ${button}`
}

let target: WebContents | null = null
let config: PttConfig = { active: false, binding: null }
let pressed = false
let running = false
let listening = false
let recording: {
  resolve: (binding: PttBinding | null) => void
  timer: ReturnType<typeof setTimeout>
} | null = null

function send(value: boolean) {
  if (pressed === value) return
  pressed = value
  if (target && !target.isDestroyed()) target.send(IPC.pttState, value)
}

function matches(kind: PttBinding['kind'], code: number): boolean {
  const b = config.binding
  return !!b && config.active && b.kind === kind && b.code === code
}

function finishRecording(binding: PttBinding | null) {
  if (!recording) return
  clearTimeout(recording.timer)
  recording.resolve(binding)
  recording = null
  sync()
}

function onKeyDown(e: KeyEvent) {
  const hook = loadHook()
  if (recording && hook) {
    finishRecording(
      e.keycode === ESCAPE
        ? null
        : { kind: 'key', code: e.keycode, label: keyLabel(hook, e.keycode) },
    )
    return
  }
  // Held keys repeat keydown; send() only reports changes.
  if (matches('key', e.keycode)) send(true)
}

function onKeyUp(e: KeyEvent) {
  if (matches('key', e.keycode)) send(false)
}

function onMouseDown(e: MouseEvent) {
  const button = Number(e.button)
  if (recording) {
    // Left/right clicks stay usable (e.g. to click "Cancelar").
    if (MOUSE_BUTTONS.has(button))
      finishRecording({ kind: 'mouse', code: button, label: mouseLabel(button) })
    return
  }
  if (matches('mouse', button)) send(true)
}

function onMouseUp(e: MouseEvent) {
  if (matches('mouse', Number(e.button))) send(false)
}

/** Runs the hook only while something needs it. */
function sync() {
  const hook = loadHook()
  if (!hook) return
  const needed = (config.active && !!config.binding) || !!recording
  if (needed === running) return
  try {
    if (needed) {
      if (!listening) {
        hook.uIOhook
          .on('keydown', onKeyDown)
          .on('keyup', onKeyUp)
          .on('mousedown', onMouseDown)
          .on('mouseup', onMouseUp)
        listening = true
      }
      hook.uIOhook.start()
    } else {
      hook.uIOhook.stop()
    }
    running = needed
  } catch (error) {
    console.error('[ptt] could not start/stop the input hook', error)
  }
}

function parseBinding(value: unknown): PttBinding | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Partial<PttBinding>
  if (v.kind !== 'key' && v.kind !== 'mouse') return null
  if (typeof v.code !== 'number' || !Number.isInteger(v.code) || v.code < 0) return null
  if (v.kind === 'mouse' && !MOUSE_BUTTONS.has(v.code)) return null
  const label = typeof v.label === 'string' ? v.label.slice(0, 32) : String(v.code)
  return { kind: v.kind, code: v.code, label }
}

export function configurePtt(sender: WebContents, value: unknown) {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<PttConfig>
  target = sender
  const next: PttConfig = { active: v.active === true, binding: parseBinding(v.binding) }
  const changed =
    next.active !== config.active ||
    next.binding?.kind !== config.binding?.kind ||
    next.binding?.code !== config.binding?.code
  config = next
  if (changed) send(false)
  sync()
}

export function recordPttBinding(sender: WebContents): Promise<PttBinding | null> {
  if (!loadHook()) return Promise.resolve(null)
  target = sender
  finishRecording(null)
  send(false)
  return new Promise((resolve) => {
    recording = { resolve, timer: setTimeout(() => finishRecording(null), RECORD_TIMEOUT_MS) }
    sync()
  })
}

export function cancelPttRecording() {
  finishRecording(null)
}

export function stopPtt() {
  finishRecording(null)
  config = { active: false, binding: null }
  pressed = false
  sync()
}
