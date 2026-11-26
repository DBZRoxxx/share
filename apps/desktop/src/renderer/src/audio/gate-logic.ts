/**
 * Microphone gate: decides, block by block, whether the mic is transmitting.
 * Pure (no Web Audio) so it runs inside the AudioWorklet and in tests.
 *
 * - `voice`: opens while the level is above the threshold, and stays open for
 *   a short hold after the voice stops so word endings aren't cut.
 * - `ptt`: opens while the push-to-talk binding is held, plus `releaseMs`.
 * - `open`: always transmits (used by the mic test in push-to-talk mode).
 */

export type GateMode = 'voice' | 'ptt' | 'open'

export interface GateParams {
  mode: GateMode
  /** Manual voice threshold, dBFS. */
  thresholdDb: number
  autoThreshold: boolean
  pttPressed: boolean
  releaseMs: number
}

export const MIN_DB = -100
/** Voice keeps the gate open this long after dropping below the threshold. */
export const VOICE_HOLD_MS = 300
/** Automatic threshold = background noise + margin, within these limits. */
export const AUTO_MARGIN_DB = 12
export const AUTO_MIN_DB = -70
export const AUTO_MAX_DB = -30
/** Fade times of the gate itself, to avoid clicks. */
const ATTACK_MS = 5
const RELEASE_MS = 60
/** How fast the noise-floor estimate climbs when the room gets louder. */
const FLOOR_RISE_DB_PER_S = 3

export function toDb(amplitude: number): number {
  if (!(amplitude > 0)) return MIN_DB
  return Math.max(MIN_DB, 20 * Math.log10(amplitude))
}

export function fromDb(db: number): number {
  return db <= MIN_DB ? 0 : 10 ** (db / 20)
}

export function rms(samples: Float32Array): number {
  let sum = 0
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] ?? 0
    sum += v * v
  }
  return samples.length ? Math.sqrt(sum / samples.length) : 0
}

export function autoThresholdFor(noiseFloorDb: number): number {
  return Math.min(AUTO_MAX_DB, Math.max(AUTO_MIN_DB, noiseFloorDb + AUTO_MARGIN_DB))
}

export class Gate {
  /** Smoothed level of the signal, dBFS (what the meter shows). */
  levelDb = MIN_DB
  /** Estimate of the background noise, dBFS. */
  noiseFloorDb = -60
  /** Whether the gate is (logically) open. */
  open = false
  /** Current gain applied by the gate, 0..1 (ramps towards open/closed). */
  gain = 0
  private holdSamples = 0

  constructor(private readonly sampleRate: number) {}

  /** Threshold in effect right now, dBFS. */
  threshold(params: GateParams): number {
    return params.autoThreshold ? autoThresholdFor(this.noiseFloorDb) : params.thresholdDb
  }

  /**
   * Feeds one block (its RMS amplitude and length). Returns the gain to apply
   * at the end of the block; use `rampFrom` → returned value across it.
   */
  process(blockRms: number, blockSize: number, params: GateParams): number {
    const seconds = blockSize / this.sampleRate
    const db = toDb(blockRms)
    // Fast attack, slower decay: the meter (and the decision) follow speech
    // without flickering between syllables.
    const smoothing = db > this.levelDb ? 0.5 : 0.15
    this.levelDb += (db - this.levelDb) * smoothing

    // Noise floor: drops at once to quieter levels, rises slowly when louder.
    if (db < this.noiseFloorDb) this.noiseFloorDb = db
    else this.noiseFloorDb = Math.min(db, this.noiseFloorDb + FLOOR_RISE_DB_PER_S * seconds)

    let wantOpen: boolean
    if (params.mode === 'open') {
      wantOpen = true
    } else if (params.mode === 'ptt') {
      if (params.pttPressed) this.holdSamples = (params.releaseMs / 1000) * this.sampleRate
      else this.holdSamples = Math.max(0, this.holdSamples - blockSize)
      wantOpen = params.pttPressed || this.holdSamples > 0
    } else {
      if (this.levelDb >= this.threshold(params))
        this.holdSamples = (VOICE_HOLD_MS / 1000) * this.sampleRate
      else this.holdSamples = Math.max(0, this.holdSamples - blockSize)
      wantOpen = this.holdSamples > 0
    }
    this.open = wantOpen

    const rampMs = wantOpen ? ATTACK_MS : RELEASE_MS
    const step = (seconds * 1000) / rampMs
    this.gain = wantOpen ? Math.min(1, this.gain + step) : Math.max(0, this.gain - step)
    return this.gain
  }
}
