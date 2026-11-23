import {
  AudioPresets,
  ScreenSharePresets,
  VideoPreset,
  VideoPresets,
  type AudioCaptureOptions,
  type RoomOptions,
  type TrackPublishOptions,
  type VideoCaptureOptions,
} from 'livekit-client'
import type { PreferredCodec, ScreenQuality } from '@/stores/prefs'

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

export const MIC_CAPTURE: AudioCaptureOptions = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
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
  audioCaptureDefaults: MIC_CAPTURE,
  publishDefaults: {
    videoCodec: 'h264',
    screenShareEncoding: SCREEN_PRESETS.motion.publish.screenShareEncoding,
  },
}
