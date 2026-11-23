import workletUrl from './pcm-player.worklet.ts?worker&url'
import { AUDIO_PORT_MESSAGE, type AppAudioTarget } from '@shared/ipc'

export interface AppAudioHandle {
  track: MediaStreamTrack
  target: AppAudioTarget
  stop: () => void
}

function waitForAudioPort(timeoutMs = 5000): { promise: Promise<MessagePort>; cancel: () => void } {
  let cleanup = () => {}
  const promise = new Promise<MessagePort>((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window) return
      if ((event.data as { type?: string } | null)?.type !== AUDIO_PORT_MESSAGE) return
      const port = event.ports[0]
      if (!port) return
      cleanup()
      resolve(port)
    }
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error('Tempo esgotado aguardando o áudio do app.'))
    }, timeoutMs)
    cleanup = () => {
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
    }
    window.addEventListener('message', onMessage)
  })
  return { promise, cancel: () => cleanup() }
}

/**
 * Starts native per-app audio capture for the given capture source and returns
 * a MediaStreamTrack ready to publish.
 */
export async function startAppAudio(sourceId: string): Promise<AppAudioHandle> {
  // Listen before invoking: the main process posts the port before resolving.
  const portWait = waitForAudioPort()
  const result = await window.share.capture.startAppAudio(sourceId)
  if (!result.ok) {
    portWait.cancel()
    throw new Error(result.error)
  }

  let context: AudioContext | null = null
  try {
    const port = await portWait.promise
    context = new AudioContext({ sampleRate: result.sampleRate, latencyHint: 'interactive' })
    await context.audioWorklet.addModule(workletUrl)
    const node = new AudioWorkletNode(context, 'pcm-player', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [result.channels],
    })
    node.port.postMessage({ type: 'port', port }, [port])

    const destination = context.createMediaStreamDestination()
    destination.channelCount = result.channels
    node.connect(destination)
    const track = destination.stream.getAudioTracks()[0]
    if (!track) throw new Error('Falha ao criar a trilha de áudio.')

    const ctx = context
    return {
      track,
      target: result.target,
      stop: () => {
        node.disconnect()
        track.stop()
        void ctx.close()
        void window.share.capture.stopAppAudio()
      },
    }
  } catch (error) {
    void context?.close()
    void window.share.capture.stopAppAudio()
    throw error
  }
}
