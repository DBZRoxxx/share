import { usePrefs } from '@/stores/prefs'

/**
 * Short notification sounds, synthesized with WebAudio (no audio files to
 * ship). They play on the output device chosen in the settings.
 */

export type SoundKind = 'message' | 'reply' | 'reaction' | 'join' | 'leave'

interface Note {
  /** Hz */
  freq: number
  /** Seconds after the sound starts. */
  at: number
  /** Seconds. */
  dur: number
  type?: OscillatorType
  /** Relative loudness, 0–1. */
  gain?: number
}

const SOUNDS: Record<SoundKind, Note[]> = {
  // Soft two-note "ding" going up.
  message: [
    { freq: 880, at: 0, dur: 0.16 },
    { freq: 1318.5, at: 0.09, dur: 0.22 },
  ],
  // Three notes: someone talked to you.
  reply: [
    { freq: 784, at: 0, dur: 0.14 },
    { freq: 1046.5, at: 0.08, dur: 0.14 },
    { freq: 1568, at: 0.16, dur: 0.24 },
  ],
  // A short, light "pop".
  reaction: [{ freq: 1174.7, at: 0, dur: 0.12, type: 'triangle', gain: 0.8 }],
  // Rising and falling chimes.
  join: [
    { freq: 523.3, at: 0, dur: 0.18 },
    { freq: 659.3, at: 0.1, dur: 0.18 },
    { freq: 784, at: 0.2, dur: 0.3 },
  ],
  leave: [
    { freq: 784, at: 0, dur: 0.18 },
    { freq: 659.3, at: 0.1, dur: 0.18 },
    { freq: 523.3, at: 0.2, dur: 0.3 },
  ],
}

/** The same sound doesn't play again within this window (bursts of messages). */
const DEBOUNCE_MS = 350

let ctx: AudioContext | null = null
let sinkId: string | null = null
const lastPlayed = new Map<SoundKind, number>()

/** Test hook: the e2e driver reads what would have played. */
declare global {
  interface Window {
    __sounds?: SoundKind[]
  }
}

async function context(): Promise<AudioContext> {
  ctx ??= new AudioContext({ latencyHint: 'interactive' })
  if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined)
  const wanted = usePrefs.getState().speakerId ?? ''
  if (wanted !== (sinkId ?? '') && 'setSinkId' in ctx) {
    try {
      await (ctx as AudioContext & { setSinkId(id: string): Promise<void> }).setSinkId(wanted)
      sinkId = wanted
    } catch {
      // Device gone: keep the current output.
    }
  }
  return ctx
}

async function play(kind: SoundKind, volume: number) {
  window.__sounds?.push(kind)
  if (volume <= 0) return
  const ac = await context()
  const start = ac.currentTime + 0.01
  const master = ac.createGain()
  master.gain.value = Math.min(1, volume) * 0.22
  master.connect(ac.destination)
  let end = start
  for (const note of SOUNDS[kind]) {
    const osc = ac.createOscillator()
    const env = ac.createGain()
    const t0 = start + note.at
    const t1 = t0 + note.dur
    osc.type = note.type ?? 'sine'
    osc.frequency.value = note.freq
    env.gain.setValueAtTime(0.0001, t0)
    env.gain.exponentialRampToValueAtTime(note.gain ?? 1, t0 + 0.008)
    env.gain.exponentialRampToValueAtTime(0.0001, t1)
    osc.connect(env).connect(master)
    osc.start(t0)
    osc.stop(t1 + 0.02)
    end = Math.max(end, t1)
  }
  setTimeout(() => master.disconnect(), (end - ac.currentTime + 0.2) * 1000)
}

/** Plays a notification sound, if the user has sounds on. */
export function playSound(kind: SoundKind) {
  const { sounds, volume } = usePrefs.getState().notifications
  if (!sounds) return
  const now = Date.now()
  if (now - (lastPlayed.get(kind) ?? 0) < DEBOUNCE_MS) return
  lastPlayed.set(kind, now)
  void play(kind, volume).catch((error: unknown) => console.warn('[sounds]', error))
}

/** "Testar som": plays regardless of the on/off switch. */
export function previewSound(kind: SoundKind = 'message') {
  void play(kind, usePrefs.getState().notifications.volume).catch(() => undefined)
}
