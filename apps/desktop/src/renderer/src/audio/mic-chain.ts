import { toast } from 'sonner'
import { usePrefs, type AudioPrefs, type NoiseSuppression } from '@/stores/prefs'
import modelUrl from './dfn3/DeepFilterNet3_onnx.tar.gz?url'
import wasmUrl from './dfn3/df_bg.wasm?url'
import workletUrl from './mic.worklet.ts?worker&url'
import {
  MIC_PROCESSOR,
  type MicInMessage,
  type MicOutMessage,
  type MicParams,
} from './mic-protocol'
import { useMic } from './mic-state'

/**
 * The microphone's Web Audio chain: capture → AudioWorklet (DeepFilterNet3,
 * input volume, gate) → a MediaStreamTrack to publish or to listen to. It
 * follows the audio preferences live.
 */

/** DeepFilterNet3 runs at 48 kHz only, whatever the device's own rate. */
const SAMPLE_RATE = 48_000

let context: AudioContext | null = null
const withWorklet = new WeakSet<BaseAudioContext>()

/** One context for every mic chain; it lives as long as the app. */
export function micAudioContext(): AudioContext {
  if (!context || context.state === 'closed') {
    context = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' })
  }
  return context
}

interface DfnAssets {
  module: WebAssembly.Module
  model: ArrayBuffer
}

let assets: Promise<DfnAssets> | null = null

/** Fetches and compiles the model once; the worklets get copies. */
function loadDfnAssets(): Promise<DfnAssets> {
  assets ??= (async () => {
    const [wasm, model] = await Promise.all([fetch(wasmUrl), fetch(modelUrl)])
    if (!wasm.ok || !model.ok) throw new Error('Arquivos da supressão de ruído não encontrados.')
    const module = await WebAssembly.compile(await wasm.arrayBuffer())
    return { module, model: await model.arrayBuffer() }
  })()
  assets.catch(() => (assets = null))
  return assets
}

function failDfn(error: unknown) {
  console.error('[mic] DeepFilterNet3 unavailable', error)
  if (useMic.getState().dfn === 'error') return
  useMic.setState({ dfn: 'error' })
  toast.error('A supressão de ruído por IA não carregou.', {
    description: 'Usando a supressão básica do Chromium.',
  })
}

/** What the capture should do itself (`ai` falls back to `basic` if it failed). */
export function effectiveNoiseSuppression(audio: AudioPrefs): NoiseSuppression {
  return audio.noiseSuppression === 'ai' && useMic.getState().dfn === 'error'
    ? 'basic'
    : audio.noiseSuppression
}

/** Push-to-talk needs a binding; until one is chosen, voice activity applies. */
export function usesPushToTalk(audio: AudioPrefs): boolean {
  return audio.inputMode === 'ptt' && !!audio.pttBinding
}

function paramsFor(audio: AudioPrefs, test: boolean): MicParams {
  return {
    gain: audio.inputVolume,
    ai: audio.noiseSuppression === 'ai',
    // The mic test lets you hear yourself without holding the key.
    mode: usesPushToTalk(audio) ? (test ? 'open' : 'ptt') : 'voice',
    thresholdDb: audio.sensitivityDb,
    autoThreshold: audio.autoSensitivity,
    releaseMs: audio.pttReleaseMs,
  }
}

export interface MicChain {
  /** The processed microphone. */
  output: MediaStreamTrack
  /** Points the chain at a new capture track (device switch, new constraints). */
  setInput(track: MediaStreamTrack): void
  dispose(): void
}

export async function createMicChain(
  input: MediaStreamTrack,
  { test = false }: { test?: boolean } = {},
): Promise<MicChain> {
  const ctx = micAudioContext()
  if (!withWorklet.has(ctx)) {
    await ctx.audioWorklet.addModule(workletUrl)
    withWorklet.add(ctx)
  }
  if (ctx.state !== 'running') await ctx.resume().catch(() => undefined)

  const node = new AudioWorkletNode(ctx, MIC_PROCESSOR, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
    channelCountMode: 'explicit',
    outputChannelCount: [1],
  })
  const destination = ctx.createMediaStreamDestination()
  destination.channelCount = 1
  node.connect(destination)

  const connect = (track: MediaStreamTrack) => {
    const source = ctx.createMediaStreamSource(new MediaStream([track]))
    source.connect(node)
    return source
  }
  let source = connect(input)
  let disposed = false
  let dfnRequested = false

  const post = (message: MicInMessage) => node.port.postMessage(message)

  const requestDfn = () => {
    if (dfnRequested || useMic.getState().dfn === 'error') return
    dfnRequested = true
    if (useMic.getState().dfn === 'idle') useMic.setState({ dfn: 'loading' })
    loadDfnAssets().then(
      ({ module, model }) => !disposed && post({ type: 'dfn', module, model }),
      failDfn,
    )
  }

  const apply = (audio: AudioPrefs) => {
    post({ type: 'params', params: paramsFor(audio, test) })
    if (audio.noiseSuppression === 'ai') requestDfn()
  }

  const reportsLevel = () => test || !useMic.getState().testing
  node.port.onmessage = (event: MessageEvent<MicOutMessage>) => {
    const data = event.data
    if (data.type === 'level') {
      if (reportsLevel())
        useMic.setState({ level: { db: data.db, open: data.open, thresholdDb: data.thresholdDb } })
    } else if (data.type === 'dfn-ready') {
      useMic.setState({ dfn: 'ready' })
    } else {
      failDfn(data.message)
    }
  }

  const offPrefs = usePrefs.subscribe((s, prev) => {
    if (s.audio !== prev.audio) apply(s.audio)
  })
  const offPtt = useMic.subscribe((s, prev) => {
    if (s.pttPressed !== prev.pttPressed) post({ type: 'ptt', pressed: s.pttPressed })
  })
  apply(usePrefs.getState().audio)
  post({ type: 'ptt', pressed: useMic.getState().pttPressed })

  const output = destination.stream.getAudioTracks()[0]
  if (!output) throw new Error('Não foi possível processar o microfone.')

  return {
    output,
    setInput(track) {
      source.disconnect()
      source = connect(track)
    },
    dispose() {
      if (disposed) return
      disposed = true
      offPrefs()
      offPtt()
      if (reportsLevel()) useMic.setState({ level: null })
      node.port.onmessage = null
      source.disconnect()
      node.disconnect()
      output.stop()
    },
  }
}
