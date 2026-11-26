/**
 * AudioWorklet for the microphone, in this order:
 *   1. DeepFilterNet3 noise suppression (WASM, when enabled and loaded)
 *   2. input volume
 *   3. peak limiter (loud speech is turned down, not clipped)
 *   4. level meter + gate (voice activity or push-to-talk)
 *
 * DeepFilterNet works on 10 ms frames (480 samples at 48 kHz) while the audio
 * graph renders 128-sample blocks, so frames go through small FIFOs; that adds
 * ~20 ms of latency, only while noise suppression is on.
 */
import './worklet-shims'
import {
  df_create,
  df_get_frame_length,
  df_process_frame,
  df_set_atten_lim,
  initSync,
} from './dfn3/df'
import { Gate, Limiter, rms, type GateParams } from './gate-logic'
import {
  MIC_PROCESSOR,
  type MicInMessage,
  type MicOutMessage,
  type MicParams,
} from './mic-protocol'

declare const sampleRate: number
declare function registerProcessor(name: string, ctor: unknown): void
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}

/** Meter updates, in render blocks (~30 per second). */
const REPORT_EVERY = Math.max(1, Math.round(sampleRate / 128 / 30))

class Denoiser {
  private readonly frame: Float32Array
  private filled = 0
  private readonly queue: Float32Array
  private read = 0
  private write = 0
  private queued = 0
  private primed = false

  constructor(
    private readonly state: number,
    private readonly frameLength: number,
  ) {
    this.frame = new Float32Array(frameLength)
    this.queue = new Float32Array(frameLength * 4)
  }

  /**
   * Maximum attenuation of the noise, dB (100 = remove it entirely). Lower
   * values keep a trace of the original sound, which masks the model's
   * metallic artifacts on loud or saturated speech.
   */
  setAttenLimit(db: number) {
    df_set_atten_lim(this.state, db)
  }

  reset() {
    this.filled = this.read = this.write = this.queued = 0
    this.primed = false
  }

  /** Writes the denoised version of `input` into `out` (same length). */
  process(input: Float32Array, out: Float32Array) {
    for (let i = 0; i < input.length; i++) {
      this.frame[this.filled++] = input[i] ?? 0
      if (this.filled === this.frameLength) {
        this.filled = 0
        const clean = df_process_frame(this.state, this.frame)
        for (let j = 0; j < clean.length; j++) {
          this.queue[this.write] = clean[j] ?? 0
          this.write = (this.write + 1) % this.queue.length
        }
        this.queued = Math.min(this.queue.length, this.queued + clean.length)
      }
    }
    // Start playing once a frame plus a block are buffered, so the output
    // never runs dry between frames.
    if (!this.primed && this.queued >= this.frameLength + out.length) this.primed = true
    if (!this.primed || this.queued < out.length) {
      this.primed = false
      out.fill(0)
      return
    }
    for (let i = 0; i < out.length; i++) {
      out[i] = this.queue[this.read] ?? 0
      this.read = (this.read + 1) % this.queue.length
    }
    this.queued -= out.length
  }
}

class MicProcessor extends AudioWorkletProcessor {
  private params: MicParams = {
    gain: 1,
    ai: false,
    attenLimitDb: 30,
    mode: 'voice',
    thresholdDb: -50,
    autoThreshold: true,
    releaseMs: 200,
  }
  private pttPressed = false
  private readonly gate = new Gate(sampleRate)
  private readonly limiter = new Limiter(sampleRate)
  private denoiser: Denoiser | null = null
  private dfnFailed = false
  private work = new Float32Array(128)
  private clean = new Float32Array(128)
  private blocks = 0

  constructor() {
    super()
    this.port.onmessage = (event: MessageEvent<MicInMessage>) => this.onMessage(event.data)
  }

  private post(message: MicOutMessage) {
    this.port.postMessage(message)
  }

  private onMessage(data: MicInMessage) {
    switch (data.type) {
      case 'params': {
        const previous = this.params
        this.params = data.params
        if (this.params.ai !== previous.ai) this.denoiser?.reset()
        if (this.params.attenLimitDb !== previous.attenLimitDb)
          this.denoiser?.setAttenLimit(this.params.attenLimitDb)
        break
      }
      case 'ptt':
        this.pttPressed = data.pressed
        break
      case 'dfn':
        if (this.denoiser || this.dfnFailed) return
        try {
          initSync(data.module)
          const state = df_create(new Uint8Array(data.model), this.params.attenLimitDb)
          this.denoiser = new Denoiser(state, df_get_frame_length(state))
          this.post({ type: 'dfn-ready' })
        } catch (error) {
          this.dfnFailed = true
          this.post({ type: 'dfn-error', message: String(error) })
        }
        break
    }
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs[0]
    const first = output?.[0]
    if (!output || !first) return true
    const size = first.length
    if (this.work.length !== size) {
      this.work = new Float32Array(size)
      this.clean = new Float32Array(size)
    }
    const input = inputs[0]?.[0]
    if (input) this.work.set(input)
    else this.work.fill(0)

    // 1. Noise suppression.
    let signal = this.work
    if (this.params.ai && this.denoiser) {
      try {
        this.denoiser.process(this.work, this.clean)
        signal = this.clean
      } catch (error) {
        this.denoiser = null
        this.dfnFailed = true
        this.post({ type: 'dfn-error', message: String(error) })
      }
    }

    // 2. Input volume.
    const gain = this.params.gain
    if (gain !== 1) for (let i = 0; i < size; i++) signal[i] = (signal[i] ?? 0) * gain

    // 3. Limiter.
    this.limiter.process(signal)

    // 4. Meter and gate (ramped across the block to avoid clicks); the clamp
    // is only a safety net, the limiter already stays below it.
    const gateParams: GateParams = {
      mode: this.params.mode,
      thresholdDb: this.params.thresholdDb,
      autoThreshold: this.params.autoThreshold,
      pttPressed: this.pttPressed,
      releaseMs: this.params.releaseMs,
    }
    const from = this.gate.gain
    const to = this.gate.process(rms(signal), size, gateParams)
    for (let i = 0; i < size; i++) {
      const g = from + ((to - from) * (i + 1)) / size
      first[i] = Math.max(-1, Math.min(1, (signal[i] ?? 0) * g))
    }
    for (let c = 1; c < output.length; c++) output[c]?.set(first)

    if (++this.blocks >= REPORT_EVERY) {
      this.blocks = 0
      this.post({
        type: 'level',
        db: this.gate.levelDb,
        open: this.gate.open,
        thresholdDb: this.gate.threshold(gateParams),
      })
    }
    return true
  }
}

registerProcessor(MIC_PROCESSOR, MicProcessor)
