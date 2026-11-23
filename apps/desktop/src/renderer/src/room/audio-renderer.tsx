import { useTracks } from '@livekit/components-react'
import { Track, type RemoteAudioTrack } from 'livekit-client'
import { useEffect, useRef } from 'react'
import { tileKey, useRoomUi } from './room-ui'

/** Plays every remote microphone and screen-share audio track, with per-track volume. */
export function AudioRenderer() {
  const refs = useTracks([Track.Source.Microphone, Track.Source.ScreenShareAudio], {
    onlySubscribed: true,
  }).filter((ref) => !ref.participant.isLocal)
  const volumes = useRoomUi((s) => s.volumes)

  return (
    <div hidden>
      {refs.map((ref) => {
        const key = tileKey(ref.participant, ref.source)
        const track = ref.publication.track as RemoteAudioTrack | undefined
        return track ? <RemoteAudio key={key} track={track} volume={volumes[key] ?? 1} /> : null
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
