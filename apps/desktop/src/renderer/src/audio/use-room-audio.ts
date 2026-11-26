import { Track, type LocalAudioTrack, type Room } from 'livekit-client'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { micConstraints } from '@/lib/media'
import { usePrefs } from '@/stores/prefs'
import { useMic } from './mic-state'

/**
 * Echo cancellation, gain control and Chromium's noise suppression are capture
 * settings: re-open the mic.
 */
function useCaptureSettings(room: Room) {
  const echo = usePrefs((s) => s.audio.echoCancellation)
  const agc = usePrefs((s) => s.audio.autoGainControl)
  const noise = usePrefs((s) => s.audio.noiseSuppression)
  // A failed DeepFilterNet falls back to Chromium's suppression.
  const dfnFailed = useMic((s) => s.dfn === 'error')

  useEffect(() => {
    const track = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track as
      LocalAudioTrack | undefined
    if (!track) return
    const wanted = micConstraints()
    // The capture's own settings (mediaStreamTrack is the processed output).
    const current = track.getSourceTrackSettings()
    if (
      current.echoCancellation === wanted.echoCancellation &&
      current.noiseSuppression === wanted.noiseSuppression &&
      current.autoGainControl === wanted.autoGainControl
    )
      return
    track.restartTrack(wanted).catch((error: unknown) => {
      console.error('[mic] could not apply the new settings', error)
      toast.error('Não foi possível aplicar a configuração ao microfone.')
    })
  }, [room, echo, agc, noise, dfnFailed])
}

/** Listens for the push-to-talk binding (globally, through the main process) while in the room. */
function usePushToTalk() {
  const mode = usePrefs((s) => s.audio.inputMode)
  const binding = usePrefs((s) => s.audio.pttBinding)

  useEffect(() => {
    const off = window.share.ptt.onState((pressed) => useMic.setState({ pttPressed: pressed }))
    return () => {
      off()
      useMic.setState({ pttPressed: false })
    }
  }, [])

  useEffect(() => {
    const active = mode === 'ptt' && !!binding
    void window.share.ptt.configure({ active, binding })
    return () => void window.share.ptt.configure({ active: false, binding: null })
  }, [mode, binding])
}

export function useRoomAudio(room: Room) {
  useCaptureSettings(room)
  usePushToTalk()
}
