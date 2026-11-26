import { useEffect, useRef, useState } from 'react'
import { describeMediaError } from '@/lib/devices'
import { micConstraints } from '@/lib/media'
import { usePrefs } from '@/stores/prefs'
import { createMicChain } from './mic-chain'
import { useMic } from './mic-state'

/**
 * "Testar microfone": captures the mic on its own (the room's mic is left
 * alone), runs it through the same chain as the call and plays it back on the
 * chosen output, so you hear exactly what the others would.
 */
export function useMicTest() {
  const [running, setRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A new capture is needed when any of these change.
  const micId = usePrefs((s) => s.micId)
  const echo = usePrefs((s) => s.audio.echoCancellation)
  const agc = usePrefs((s) => s.audio.autoGainControl)
  const noise = usePrefs((s) => s.audio.noiseSuppression)
  const dfnFailed = useMic((s) => s.dfn === 'error')
  const speakerId = usePrefs((s) => s.speakerId)
  const outputVolume = usePrefs((s) => s.audio.outputVolume)
  const playerRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (!running) return
    const player = (playerRef.current ??= new Audio())
    player.volume = Math.min(1, usePrefs.getState().audio.outputVolume)
    void player.setSinkId(usePrefs.getState().speakerId ?? '').catch(() => undefined)
    let cancelled = false
    let stream: MediaStream | null = null
    let dispose = () => {}
    useMic.setState({ testing: true, level: null })
    const constraints = micConstraints()
    navigator.mediaDevices
      .getUserMedia({
        audio: {
          ...constraints,
          deviceId: constraints.deviceId ? { exact: constraints.deviceId } : undefined,
        } as MediaTrackConstraints,
      })
      .then(async (s) => {
        stream = s
        const track = s.getAudioTracks()[0]
        if (cancelled || !track) return
        const chain = await createMicChain(track, { test: true })
        if (cancelled) return chain.dispose()
        dispose = () => chain.dispose()
        player.srcObject = new MediaStream([chain.output])
        await player.play()
        setError(null)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(describeMediaError(e, 'microfone'))
        setRunning(false)
      })
    return () => {
      cancelled = true
      dispose()
      player.pause()
      player.srcObject = null
      stream?.getTracks().forEach((t) => t.stop())
      useMic.setState({ testing: false, level: null })
    }
  }, [running, micId, echo, agc, noise, dfnFailed])

  useEffect(() => {
    if (playerRef.current) playerRef.current.volume = Math.min(1, outputVolume)
  }, [outputVolume])

  useEffect(() => {
    void playerRef.current?.setSinkId(speakerId ?? '').catch(() => undefined)
  }, [speakerId])

  return { running, error, toggle: () => setRunning((r) => !r) }
}
