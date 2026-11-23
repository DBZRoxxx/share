/**
 * AudioWorklet that plays interleaved s16le stereo PCM pushed from the main
 * process (native app-audio capture) through a jitter buffer.
 *
 * The node's output feeds a MediaStreamAudioDestinationNode, whose track is
 * published to the room as the screen-share audio.
 */

declare const sampleRate: number
declare function registerProcessor(name: string, ctor: unknown): void
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}

const CHANNELS = 2
const CAPACITY = sampleRate // 1 s of frames
const TARGET = Math.round(sampleRate * 0.06) // prebuffer 60 ms
const MAX_BUFFERED = Math.round(sampleRate * 0.25) // drift guard: never lag > 250 ms

class PcmPlayer extends AudioWorkletProcessor {
  private left = new Float32Array(CAPACITY)
  private right = new Float32Array(CAPACITY)
  private readIndex = 0
  private writeIndex = 0
  private buffered = 0
  private primed = false

  constructor() {
    super()
    this.port.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; port?: MessagePort } | undefined
      if (data?.type === 'port' && data.port) {
        data.port.onmessage = (e: MessageEvent<ArrayBuffer>) => this.push(e.data)
      }
    }
  }

  private push(buffer: ArrayBuffer) {
    if (!(buffer instanceof ArrayBuffer)) return
    const samples = new Int16Array(buffer, 0, Math.floor(buffer.byteLength / 2))
    const frames = Math.floor(samples.length / CHANNELS)
    for (let i = 0; i < frames; i++) {
      this.left[this.writeIndex] = (samples[i * 2] ?? 0) / 32768
      this.right[this.writeIndex] = (samples[i * 2 + 1] ?? 0) / 32768
      this.writeIndex = (this.writeIndex + 1) % CAPACITY
    }
    this.buffered += frames
    if (this.buffered > MAX_BUFFERED) {
      // We fell behind (clock drift or a stall): drop the oldest audio down to
      // the target latency instead of letting delay grow forever.
      const drop = this.buffered - TARGET
      this.readIndex = (this.readIndex + drop) % CAPACITY
      this.buffered = TARGET
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0]
    const outL = out?.[0]
    if (!out || !outL) return true
    const outR = out[1] ?? outL
    const n = outL.length

    if (!this.primed) {
      if (this.buffered < TARGET) {
        outL.fill(0)
        outR.fill(0)
        return true
      }
      this.primed = true
    }

    const available = Math.min(n, this.buffered)
    for (let i = 0; i < available; i++) {
      outL[i] = this.left[this.readIndex] ?? 0
      outR[i] = this.right[this.readIndex] ?? 0
      this.readIndex = (this.readIndex + 1) % CAPACITY
    }
    if (available < n) {
      // Underrun (e.g. silence — the capture skips silent buffers): pad and
      // re-prime so playback resumes smoothly.
      outL.fill(0, available)
      outR.fill(0, available)
      this.primed = false
    }
    this.buffered -= available
    return true
  }
}

registerProcessor('pcm-player', PcmPlayer)
