import type { GateMode } from './gate-logic'

/** Messages between the microphone chain (main thread) and its AudioWorklet. */

export const MIC_PROCESSOR = 'share-mic'

export interface MicParams {
  /** Linear gain, 0–2. */
  gain: number
  /** Run DeepFilterNet3 (once it is loaded). */
  ai: boolean
  mode: GateMode
  thresholdDb: number
  autoThreshold: boolean
  releaseMs: number
}

export type MicInMessage =
  | { type: 'params'; params: MicParams }
  | { type: 'ptt'; pressed: boolean }
  | { type: 'dfn'; module: WebAssembly.Module; model: ArrayBuffer }

export interface MicLevel {
  /** Level of what is sent (after suppression and gain, before the gate), dBFS. */
  db: number
  /** The gate is open: the mic is transmitting. */
  open: boolean
  /** Threshold in effect (the automatic one, when automatic), dBFS. */
  thresholdDb: number
}

export type MicOutMessage =
  ({ type: 'level' } & MicLevel) | { type: 'dfn-ready' } | { type: 'dfn-error'; message: string }
