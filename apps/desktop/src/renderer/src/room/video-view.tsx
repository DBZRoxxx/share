import { RemoteVideoTrack, type VideoTrack } from 'livekit-client'
import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

type ElementInfo = Parameters<RemoteVideoTrack['observeElementInfo']>[0]

export function VideoView({
  track,
  fit,
  mirror,
  className,
}: {
  track: VideoTrack
  fit: 'contain' | 'cover'
  mirror?: boolean
  className?: string
}) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    track.attach(el)
    return () => {
      track.detach(el)
    }
  }, [track])

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={cn('size-full bg-black', className)}
      style={{ objectFit: fit, transform: mirror ? 'scaleX(-1)' : undefined }}
    />
  )
}

/**
 * Adaptive-stream bookkeeping for a <video> that lives in another window
 * (pop-out). LiveKit's built-in observers belong to the main document, so we
 * report the pop-out element's size ourselves to keep receiving full quality.
 */
class ForeignWindowElementInfo implements ElementInfo {
  visible = true
  pictureInPicture = false
  visibilityChangedAt: number | undefined = undefined
  handleResize?: () => void
  handleVisibilityChanged?: () => void
  private observer: ResizeObserver | null = null

  constructor(
    readonly element: HTMLVideoElement,
    private readonly win: Window & typeof globalThis,
  ) {}

  width() {
    return this.element.clientWidth
  }
  height() {
    return this.element.clientHeight
  }
  observe() {
    const RO = this.win.ResizeObserver ?? ResizeObserver
    this.observer = new RO(() => this.handleResize?.())
    this.observer.observe(this.element)
  }
  stopObserving() {
    this.observer?.disconnect()
    this.observer = null
  }
}

/** Video for a pop-out window: plain srcObject + manual adaptive-stream info. */
export function ForeignVideoView({ track, mirror }: { track: VideoTrack; mirror?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const el = ref.current
    const win = el?.ownerDocument.defaultView as (Window & typeof globalThis) | null
    if (!el || !win) return
    el.srcObject = new MediaStream([track.mediaStreamTrack])
    void el.play().catch(() => {})

    let info: ForeignWindowElementInfo | null = null
    if (track instanceof RemoteVideoTrack && track.isAdaptiveStream) {
      info = new ForeignWindowElementInfo(el, win)
      track.observeElementInfo(info)
    }
    return () => {
      if (info && track instanceof RemoteVideoTrack) track.stopObservingElementInfo(info)
      el.srcObject = null
    }
  }, [track])

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        background: '#000',
        transform: mirror ? 'scaleX(-1)' : undefined,
      }}
    />
  )
}
