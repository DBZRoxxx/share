import type { AppAudioTarget, CaptureSourceKind, ShareAudioMode } from '@shared/ipc'
import { RoomEvent, Track, type LocalTrackPublication, type Room } from 'livekit-client'
import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { startAppAudio, type AppAudioHandle } from '@/audio/app-audio'
import { SCREEN_AUDIO_PUBLISH, SCREEN_PRESETS } from '@/lib/media'
import type { PreferredCodec, ScreenQuality } from '@/stores/prefs'

export interface ScreenShareRequest {
  sourceId: string
  sourceKind: CaptureSourceKind
  sourceName: string
  quality: ScreenQuality
  audio: ShareAudioMode
  codec: PreferredCodec
}

export type ScreenShareState =
  | { status: 'idle' }
  | { status: 'starting' }
  | {
      status: 'live'
      sourceName: string
      sourceKind: CaptureSourceKind
      quality: ScreenQuality
      audio: ShareAudioMode
      audioTarget: AppAudioTarget | null
    }

const IDLE: ScreenShareState = { status: 'idle' }

/**
 * Owns the local screen share: capture via our own picker + getDisplayMedia,
 * publishing the video and (optionally) the app/system audio, and cleanup.
 */
export class ScreenShareController {
  private state: ScreenShareState = IDLE
  private listeners = new Set<() => void>()
  private videoPub: LocalTrackPublication | null = null
  private audioPub: LocalTrackPublication | null = null
  private appAudio: AppAudioHandle | null = null
  private extraTracks: MediaStreamTrack[] = []

  constructor(private readonly room: Room) {
    // LiveKit unpublishes the screen track by itself when capture ends (e.g. the
    // shared window was closed). Mirror that in our state.
    room.on(RoomEvent.LocalTrackUnpublished, this.onLocalUnpublished)
  }

  dispose() {
    this.room.off(RoomEvent.LocalTrackUnpublished, this.onLocalUnpublished)
    void this.stop()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getState = () => this.state

  private setState(next: ScreenShareState) {
    this.state = next
    for (const l of this.listeners) l()
  }

  private onLocalUnpublished = (pub: LocalTrackPublication) => {
    if (pub === this.videoPub && this.state.status === 'live') void this.stop()
  }

  async start(req: ScreenShareRequest): Promise<void> {
    if (this.state.status === 'starting') return
    if (this.state.status === 'live') await this.stop()
    this.setState({ status: 'starting' })

    const preset = SCREEN_PRESETS[req.quality]
    const useChromiumAudio = req.audio === 'system'

    try {
      await window.share.capture.select(req.sourceId, useChromiumAudio)
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { max: 1920 },
          height: { max: 1080 },
          frameRate: { ideal: preset.frameRate, max: preset.frameRate },
        },
        audio: useChromiumAudio
          ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
          : false,
      })
      this.extraTracks = stream.getTracks()

      const video = stream.getVideoTracks()[0]
      if (!video) throw new Error('Nenhum vídeo capturado.')
      video.contentHint = preset.contentHint

      this.videoPub = await this.room.localParticipant.publishTrack(video, {
        source: Track.Source.ScreenShare,
        name: 'screen',
        videoCodec: req.codec,
        simulcast: true,
        ...preset.publish,
      })

      let audioTrack: MediaStreamTrack | undefined
      let audioTarget: AppAudioTarget | null = null
      if (req.audio === 'app') {
        try {
          this.appAudio = await startAppAudio(req.sourceId)
          audioTrack = this.appAudio.track
          audioTarget = this.appAudio.target
        } catch (error) {
          console.error('[screen-share] app audio failed', error)
          toast.warning('Não foi possível capturar o áudio', {
            description: 'A tela está sendo compartilhada sem som.',
          })
        }
      } else if (useChromiumAudio) {
        audioTrack = stream.getAudioTracks()[0]
      }

      if (audioTrack) {
        this.audioPub = await this.room.localParticipant.publishTrack(audioTrack, {
          source: Track.Source.ScreenShareAudio,
          name: 'screen-audio',
          ...SCREEN_AUDIO_PUBLISH,
        })
      }

      this.setState({
        status: 'live',
        sourceName: req.sourceName,
        sourceKind: req.sourceKind,
        quality: req.quality,
        audio: audioTrack ? req.audio : 'none',
        audioTarget,
      })
    } catch (error) {
      await this.cleanup()
      this.setState(IDLE)
      throw error
    }
  }

  async stop(): Promise<void> {
    if (this.state.status === 'idle') return
    await this.cleanup()
    this.setState(IDLE)
  }

  private async cleanup() {
    const { videoPub, audioPub, appAudio, extraTracks } = this
    this.videoPub = null
    this.audioPub = null
    this.appAudio = null
    this.extraTracks = []

    const lp = this.room.localParticipant
    for (const pub of [audioPub, videoPub]) {
      if (pub?.track && lp.getTrackPublication(pub.source) === pub) {
        await lp.unpublishTrack(pub.track, true).catch(() => {})
      }
    }
    appAudio?.stop()
    for (const t of extraTracks) t.stop()
  }
}

export function useScreenShareState(controller: ScreenShareController): ScreenShareState {
  return useSyncExternalStore(controller.subscribe, controller.getState)
}
