import { useTracks } from '@livekit/components-react'
import { Track, type RemoteAudioTrack } from 'livekit-client'
import { useEffect, useRef } from 'react'
import { peerGain } from '@/stores/peer-audio'
import { usePrefs } from '@/stores/prefs'
import { tileKey, useRoomUi } from './room-ui'

/**
 * Plays every remote microphone and screen-share audio track. A microphone
 * plays at that person's volume (their right-click menu, up to 200%), a
 * shared screen's audio at its tile's volume; both times the output volume.
 */
export function AudioRenderer() {
  const refs = useTracks([Track.Source.Microphone, Track.Source.ScreenShareAudio], {
    onlySubscribed: true,
  }).filter((ref) => !ref.participant.isLocal)
  const screenVolumes = useRoomUi((s) => s.volumes)
  const peerAudio = usePrefs((s) => s.peerAudio)
  const output = usePrefs((s) => s.audio.outputVolume)

  return (
    <div hidden>
      {refs.map((ref) => {
        const key = tileKey(ref.participant, ref.source)
        const track = ref.publication.track as RemoteAudioTrack | undefined
        const gain =
          ref.source === Track.Source.Microphone
            ? peerGain(peerAudio[ref.participant.identity])
            : (screenVolumes[key] ?? 1)
        return track ? <RemoteAudio key={key} track={track} volume={gain * output} /> : null
      })}
    </div>
  )
}

function RemoteAudio({ track, volume }: { track: RemoteAudioTrack; volume: number }) {
  const ref = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    track.attach(el)
    return () => {
      track.detach(el)
    }
  }, [track])

  useEffect(() => {
    track.setVolume(volume)
  }, [track, volume])

  return <audio ref={ref} autoPlay />
}
