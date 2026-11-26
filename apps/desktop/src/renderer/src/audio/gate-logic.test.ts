import { describe, expect, it } from 'vitest'
import {
  AUTO_MAX_DB,
  AUTO_MIN_DB,
  Gate,
  MIN_DB,
  VOICE_HOLD_MS,
  autoThresholdFor,
  fromDb,
  rms,
  toDb,
  type GateParams,
} from './gate-logic'

const RATE = 48_000
const BLOCK = 128
const BLOCK_MS = (BLOCK / RATE) * 1000

const voice = (over: Partial<GateParams> = {}): GateParams => ({
  mode: 'voice',
  thresholdDb: -40,
  autoThreshold: false,
  pttPressed: false,
  releaseMs: 200,
  ...over,
})

/** Feeds `ms` of a steady level (dBFS) and returns the gate. */
function feed(gate: Gate, db: number, ms: number, params: GateParams) {
  const blocks = Math.ceil(ms / BLOCK_MS)
  for (let i = 0; i < blocks; i++) gate.process(fromDb(db), BLOCK, params)
  return gate
}

describe('dB helpers', () => {
  it('converts amplitude and dB both ways', () => {
    expect(toDb(1)).toBe(0)
    expect(toDb(0.1)).toBeCloseTo(-20)
    expect(toDb(0)).toBe(MIN_DB)
    expect(fromDb(-20)).toBeCloseTo(0.1)
    expect(fromDb(MIN_DB)).toBe(0)
  })

  it('measures RMS', () => {
    expect(rms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5)
    expect(rms(new Float32Array(0))).toBe(0)
  })

  it('keeps the automatic threshold within limits', () => {
    expect(autoThresholdFor(-60)).toBe(-48)
    expect(autoThresholdFor(-100)).toBe(AUTO_MIN_DB)
    expect(autoThresholdFor(-10)).toBe(AUTO_MAX_DB)
  })
})

describe('voice activity', () => {
  it('opens above the threshold and stays shut below it', () => {
    const gate = new Gate(RATE)
    feed(gate, -60, 200, voice())
    expect(gate.open).toBe(false)
    expect(gate.gain).toBe(0)
    feed(gate, -20, 50, voice())
    expect(gate.open).toBe(true)
    expect(gate.gain).toBe(1)
  })

  it('holds after the voice stops, then closes', () => {
    const gate = feed(new Gate(RATE), -20, 100, voice())
    // Quiet for less than the hold (the smoothed level needs a moment to drop too).
    feed(gate, MIN_DB, VOICE_HOLD_MS / 2, voice())
    expect(gate.open).toBe(true)
    feed(gate, MIN_DB, VOICE_HOLD_MS + 200, voice())
    expect(gate.open).toBe(false)
    expect(gate.gain).toBe(0)
  })

  it('learns the background noise for the automatic threshold', () => {
    const gate = new Gate(RATE)
    const auto = voice({ autoThreshold: true })
    feed(gate, -55, 3000, auto)
    expect(gate.noiseFloorDb).toBeCloseTo(-55, 0)
    // Steady background noise alone doesn't open it…
    expect(gate.open).toBe(false)
    // …a voice well above it does.
    feed(gate, -25, 60, auto)
    expect(gate.open).toBe(true)
  })

  it('drops the noise floor at once when the room gets quiet', () => {
    const gate = feed(new Gate(RATE), -40, 2000, voice({ autoThreshold: true }))
    feed(gate, -70, BLOCK_MS, voice({ autoThreshold: true }))
    expect(gate.noiseFloorDb).toBeCloseTo(-70)
  })
})

describe('push-to-talk', () => {
  const ptt = (pressed: boolean, releaseMs = 200): GateParams =>
    voice({ mode: 'ptt', pttPressed: pressed, releaseMs })

  it('ignores the voice while the key is up', () => {
    const gate = feed(new Gate(RATE), -10, 300, ptt(false))
    expect(gate.open).toBe(false)
  })

  it('transmits while held, silence included', () => {
    const gate = feed(new Gate(RATE), MIN_DB, 100, ptt(true))
    expect(gate.open).toBe(true)
    expect(gate.gain).toBe(1)
  })

  it('stays open for the release delay after letting go', () => {
    const gate = feed(new Gate(RATE), -20, 100, ptt(true, 300))
    feed(gate, -20, 200, ptt(false, 300))
    expect(gate.open).toBe(true)
    feed(gate, -20, 150, ptt(false, 300))
    expect(gate.open).toBe(false)
  })

  it('closes right away with no release delay', () => {
    const gate = feed(new Gate(RATE), -20, 100, ptt(true, 0))
    gate.process(fromDb(-20), BLOCK, ptt(false, 0))
    expect(gate.open).toBe(false)
  })
})

it('always transmits in open mode', () => {
  const gate = feed(new Gate(RATE), MIN_DB, 50, voice({ mode: 'open' }))
  expect(gate.open).toBe(true)
})
