import { LocalVideoTrack, RemoteVideoTrack, type VideoTrack } from 'livekit-client'
import { useEffect, useState } from 'react'

export interface VideoStats {
  width: number
  height: number
  fps: number
  /** Bits per second. */
  bitrate: number
  codec: string | null
}

/** Polls WebRTC stats for a video track once per second while `enabled`. */
export function useVideoStats(track: VideoTrack | undefined, enabled: boolean): VideoStats | null {
  const [stats, setStats] = useState<VideoStats | null>(null)

  useEffect(() => {
    if (!enabled || !track) return
    let prev: { bytes: number; frames: number; ts: number } | null = null
    let cancelled = false

    const tick = async () => {
      let width = 0
      let height = 0
      let bytes = 0
      let frames = 0
      let fps: number | null = null
      let codec: string | null = null

      if (track instanceof RemoteVideoTrack) {
        const s = await track.getReceiverStats()
        if (!s) return
        width = s.frameWidth ?? 0
        height = s.frameHeight ?? 0
        bytes = s.bytesReceived ?? 0
        frames = s.framesDecoded
        codec = s.mimeType?.split('/')[1] ?? null
      } else if (track instanceof LocalVideoTrack) {
        const layers = await track.getSenderStats()
        const top = layers.reduce<(typeof layers)[number] | undefined>(
          (best, l) => (!best || l.frameWidth > best.frameWidth ? l : best),
          undefined,
        )
        if (!top) return
        width = top.frameWidth
        height = top.frameHeight
        fps = top.framesPerSecond
        bytes = layers.reduce((sum, l) => sum + (l.bytesSent ?? 0), 0)
        frames = top.framesSent
        codec = track.codec ?? null
      }

      const now = performance.now()
      if (prev && !cancelled) {
        const dt = (now - prev.ts) / 1000
        setStats({
          width,
          height,
          fps: Math.round(fps ?? (frames - prev.frames) / dt),
          bitrate: Math.max(0, ((bytes - prev.bytes) * 8) / dt),
          codec,
        })
      }
      prev = { bytes, frames, ts: now }
    }

    void tick()
    const timer = setInterval(() => void tick().catch(() => {}), 1000)
    return () => {
      cancelled = true
      clearInterval(timer)
      setStats(null)
    }
  }, [track, enabled])

  return enabled && track ? stats : null
}

export function formatStats(s: VideoStats): string {
  const mbps = s.bitrate / 1_000_000
  const rate = mbps >= 1 ? `${mbps.toFixed(1)} Mbps` : `${Math.round(s.bitrate / 1000)} kbps`
  return [`${s.width}×${s.height}`, `${s.fps} fps`, rate, s.codec?.toUpperCase()]
    .filter(Boolean)
    .join(' · ')
}
