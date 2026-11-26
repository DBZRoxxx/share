import {
  AudioPresets,
  LocalAudioTrack,
  ScreenSharePresets,
  VideoPreset,
  VideoPresets,
  type AudioCaptureOptions,
  type LocalParticipant,
  type RoomOptions,
  type TrackPublishOptions,
  type VideoCaptureOptions,
} from 'livekit-client'
import { toast } from 'sonner'
import {
  effectiveAutoGainControl,
  effectiveNoiseSuppression,
  micAudioContext,
} from '@/audio/mic-chain'
import { MicTrackProcessor } from '@/audio/mic-processor'
import { usePrefs, type PreferredCodec, type ScreenQuality } from '@/stores/prefs'

export interface ScreenPreset {
  label: string
  description: string
  frameRate: number
  contentHint: 'motion' | 'detail'
  publish: Pick<
    TrackPublishOptions,
    'screenShareEncoding' | 'screenShareSimulcastLayers' | 'degradationPreference'
  >
}

/**
 * Screen-share presets. Both capture at up to 1920×1080; lower simulcast layers
 * let the SFU send small versions to people watching in a small tile.
 */
export const SCREEN_PRESETS: Record<ScreenQuality, ScreenPreset> = {
  motion: {
    label: 'Movimento',
    description: '1080p · 60 fps — jogos e vídeos',
    frameRate: 60,
    contentHint: 'motion',
    publish: {
      screenShareEncoding: { maxBitrate: 8_000_000, maxFramerate: 60, priority: 'high' },
      screenShareSimulcastLayers: [
        new VideoPreset(640, 360, 500_000, 30),
        new VideoPreset(1280, 720, 2_500_000, 60),
      ],
      degradationPreference: 'maintain-framerate',
    },
  },
  detail: {
    label: 'Nitidez',
    description: '1080p · 30 fps — texto, código e slides',
    frameRate: 30,
    contentHint: 'detail',
    publish: {
      screenShareEncoding: { maxBitrate: 4_500_000, maxFramerate: 30, priority: 'high' },
      screenShareSimulcastLayers: [ScreenSharePresets.h360fps15, ScreenSharePresets.h720fps15],
      degradationPreference: 'maintain-resolution',
    },
  },
}

export const CODEC_LABELS: Record<PreferredCodec, string> = {
  h264: 'H.264 (recomendado, mais leve)',
  vp9: 'VP9 (melhor qualidade por banda)',
  vp8: 'VP8 (máxima compatibilidade)',
  av1: 'AV1 (mais eficiente, mais CPU)',
}

export const CAMERA_CAPTURE: VideoCaptureOptions = {
  resolution: { width: 1920, height: 1080, frameRate: 30 },
}

export function cameraPublishOptions(codec: PreferredCodec): TrackPublishOptions {
  return {
    videoCodec: codec,
    videoEncoding: { maxBitrate: 3_500_000, maxFramerate: 30 },
    videoSimulcastLayers: [VideoPresets.h360, VideoPresets.h720],
  }
}

/**
 * What getUserMedia should do for the microphone, from the audio settings.
 * Chromium's own noise suppression only runs in `basic` mode: with `ai` the
 * mic chain (DeepFilterNet3) does it, and doing both muffles the voice. Gain
 * control is off with `ai` too. Voice isolation (the platform's suppressor,
 * which overrides `noiseSuppression` where supported) is never used.
 */
export function micConstraints(): AudioCaptureOptions {
  const { micId, audio } = usePrefs.getState()
  return {
    deviceId: micId ?? undefined,
    echoCancellation: audio.echoCancellation,
    noiseSuppression: effectiveNoiseSuppression(audio) === 'basic',
    autoGainControl: effectiveAutoGainControl(audio),
    voiceIsolation: false,
  }
}

/**
 * Turns the room microphone on or off, with the mic chain on it.
 *
 * The processor can't go in the capture options: livekit-client applies it
 * while creating the track, before the track gets the room's AudioContext, and
 * `setProcessor` refuses to run without one. So it is set once the track is
 * published. If the chain fails, the mic still goes out, unprocessed.
 */
export async function setMicEnabled(participant: LocalParticipant, enabled: boolean) {
  const publication = await participant.setMicrophoneEnabled(enabled, micConstraints())
  const track = publication?.track
  if (!enabled || !(track instanceof LocalAudioTrack) || track.getProcessor()) return
  try {
    await track.setProcessor(new MicTrackProcessor()).catch(async () => {
      // The room had no AudioContext (it couldn't create one): lend it ours.
      // The chain runs on its own context either way.
      await track.setAudioContext(micAudioContext())
      await track.setProcessor(new MicTrackProcessor())
    })
  } catch (error) {
    console.error('[mic] could not start the mic chain', error)
    toast.error('O processamento do microfone falhou; ele segue sem supressão de ruído.')
  }
}

export const SCREEN_AUDIO_PUBLISH: TrackPublishOptions = {
  audioPreset: AudioPresets.musicHighQualityStereo,
  forceStereo: true,
  dtx: false,
  red: false,
}

export const ROOM_OPTIONS: RoomOptions = {
  // Each viewer only receives the resolution their tile needs; layers nobody
  // watches are paused at the sender.
  adaptiveStream: { pixelDensity: 'screen', pauseVideoInBackground: false },
  dynacast: true,
  disconnectOnPageLeave: true,
  videoCaptureDefaults: CAMERA_CAPTURE,
  // Overrides livekit-client's own defaults, which turn every Chromium
  // processor on (voice isolation included); micConstraints() sets the rest.
  audioCaptureDefaults: {
    echoCancellation: true,
    noiseSuppression: false,
    autoGainControl: false,
    voiceIsolation: false,
  },
  publishDefaults: {
    videoCodec: 'h264',
    screenShareEncoding: SCREEN_PRESETS.motion.publish.screenShareEncoding,
  },
}
