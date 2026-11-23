import { DISPLAY_NAME_MAX, formatRoomId } from '@share/shared'
import { createLocalVideoTrack, type LocalVideoTrack } from 'livekit-client'
import { ArrowLeft, Camera, CameraOff, Copy, LogIn, Mic, MicOff } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { TitleBar } from '@/components/title-bar'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Tooltip } from '@/components/ui/primitives'
import { describeMediaError, useDevices } from '@/lib/devices'
import { copyInvite, roomInviteText } from '@/lib/invite'
import { CAMERA_CAPTURE, MIC_CAPTURE } from '@/lib/media'
import { cn, hueFor, initials } from '@/lib/utils'
import { roomApi } from '@/lib/chat-api'
import { useNav } from '@/stores/nav'
import { usePrefs } from '@/stores/prefs'
import { VideoView } from '@/room/video-view'

function useCameraPreview(enabled: boolean, deviceId: string | null) {
  // Results are tagged with the request they belong to, so a stale track or
  // error never shows after toggling the camera or switching devices.
  const request = `${enabled}:${deviceId}`
  const [result, setResult] = useState<{
    request: string
    track: LocalVideoTrack | null
    error: string | null
  } | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    let created: LocalVideoTrack | null = null
    createLocalVideoTrack({ ...CAMERA_CAPTURE, deviceId: deviceId ?? undefined })
      .then((t) => {
        if (cancelled) return t.stop()
        created = t
        setResult({ request, track: t, error: null })
      })
      .catch((e) => {
        if (!cancelled) setResult({ request, track: null, error: describeMediaError(e, 'câmera') })
      })
    return () => {
      cancelled = true
      created?.stop()
    }
  }, [enabled, deviceId, request])

  const current = enabled && result?.request === request ? result : null
  return { track: current?.track ?? null, error: current?.error ?? null }
}

/** 0..1 input level of the selected microphone, for the preview meter. */
function useMicLevel(enabled: boolean, deviceId: string | null) {
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let raf = 0
    let stream: MediaStream | null = null
    let ctx: AudioContext | null = null
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({
        audio: {
          ...MIC_CAPTURE,
          deviceId: deviceId ? { exact: deviceId } : undefined,
        } as MediaTrackConstraints,
      })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop())
        stream = s
        ctx = new AudioContext()
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        ctx.createMediaStreamSource(s).connect(analyser)
        const data = new Uint8Array(analyser.fftSize)
        const loop = () => {
          analyser.getByteTimeDomainData(data)
          let peak = 0
          for (const v of data) peak = Math.max(peak, Math.abs(v - 128) / 128)
          setLevel((prev) => Math.max(peak, prev * 0.85))
          raf = requestAnimationFrame(loop)
        }
        loop()
        setError(null)
      })
      .catch((e) => !cancelled && setError(describeMediaError(e, 'microfone')))
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      void ctx?.close()
      setLevel(0)
      setError(null)
    }
  }, [enabled, deviceId])

  return { level: enabled ? level : 0, error: enabled ? error : null }
}

/** Name to show before joining: the one being created, then what we know, then the server's. */
function useRoomName(roomId: string, creating: string | undefined) {
  const known = usePrefs((s) => s.recentRooms.find((r) => r.id === roomId)?.name ?? null)
  const [fetched, setFetched] = useState<{ roomId: string; name: string | null } | null>(null)
  useEffect(() => {
    if (creating) return
    let alive = true
    void roomApi.name(roomId).then((name) => alive && setFetched({ roomId, name }))
    return () => {
      alive = false
    }
  }, [roomId, creating])
  if (creating) return creating
  return fetched?.roomId === roomId ? fetched.name : known
}

export function PreJoinScreen({ roomId, roomName }: { roomId: string; roomName?: string }) {
  const prefs = usePrefs()
  const { goHome, enterRoom } = useNav()
  const shownName = useRoomName(roomId, roomName)
  const [name, setName] = useState(prefs.name)
  const camera = useCameraPreview(prefs.joinWithCamera, prefs.cameraId)
  const mic = useMicLevel(prefs.joinWithMic, prefs.micId)
  // Device labels only appear after permission is granted; refresh then.
  const cameras = useDevices('videoinput', camera.track)
  const mics = useDevices('audioinput', mic.error ?? prefs.joinWithMic)
  const nameRef = useRef<HTMLInputElement>(null)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      nameRef.current?.focus()
      return
    }
    prefs.set({ name: trimmed })
    enterRoom(roomId, { roomName })
  }

  const hue = hueFor(prefs.identity)

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <main className="flex flex-1 items-center justify-center overflow-y-auto p-8">
        <div className="animate-fade-in grid w-full max-w-5xl items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div className="flex flex-col gap-4">
            <div className="border-border bg-surface relative aspect-video overflow-hidden rounded-2xl border">
              {camera.track ? (
                <VideoView track={camera.track} fit="cover" mirror />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-3">
                  <span
                    className="flex size-24 items-center justify-center rounded-full text-3xl font-semibold text-white"
                    style={{
                      background: `linear-gradient(135deg, hsl(${hue} 70% 58%), hsl(${(hue + 40) % 360} 65% 45%))`,
                    }}
                  >
                    {initials(name || '?')}
                  </span>
                  <p className="text-muted text-sm">{camera.error ?? 'Câmera desligada'}</p>
                </div>
              )}
              <div className="absolute inset-x-0 bottom-4 flex justify-center gap-2">
                <Tooltip
                  content={
                    prefs.joinWithMic
                      ? 'Entrar com microfone desligado'
                      : 'Entrar com microfone ligado'
                  }
                >
                  <button
                    type="button"
                    onClick={() => prefs.set({ joinWithMic: !prefs.joinWithMic })}
                    aria-pressed={prefs.joinWithMic}
                    aria-label="Microfone"
                    className={cn(
                      'relative flex size-12 items-center justify-center overflow-hidden rounded-full backdrop-blur transition-colors [&_svg]:size-5',
                      prefs.joinWithMic
                        ? 'bg-white/15 text-white hover:bg-white/25'
                        : 'bg-danger hover:bg-danger-hover text-white',
                    )}
                  >
                    {prefs.joinWithMic && (
                      <span
                        className="bg-success/50 absolute inset-x-0 bottom-0 transition-[height] duration-75"
                        style={{ height: `${Math.min(100, mic.level * 160)}%` }}
                      />
                    )}
                    <span className="relative">{prefs.joinWithMic ? <Mic /> : <MicOff />}</span>
                  </button>
                </Tooltip>
                <Tooltip
                  content={
                    prefs.joinWithCamera
                      ? 'Entrar com câmera desligada'
                      : 'Entrar com câmera ligada'
                  }
                >
                  <button
                    type="button"
                    onClick={() => prefs.set({ joinWithCamera: !prefs.joinWithCamera })}
                    aria-pressed={prefs.joinWithCamera}
                    aria-label="Câmera"
                    className={cn(
                      'flex size-12 items-center justify-center rounded-full backdrop-blur transition-colors [&_svg]:size-5',
                      prefs.joinWithCamera
                        ? 'bg-white/15 text-white hover:bg-white/25'
                        : 'bg-danger hover:bg-danger-hover text-white',
                    )}
                  >
                    {prefs.joinWithCamera ? <Camera /> : <CameraOff />}
                  </button>
                </Tooltip>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                aria-label="Câmera"
                value={prefs.cameraId ?? cameras[0]?.value}
                options={cameras}
                placeholder="Câmera padrão"
                onValueChange={(id) => prefs.set({ cameraId: id })}
              />
              <Select
                aria-label="Microfone"
                value={prefs.micId ?? mics[0]?.value}
                options={mics}
                placeholder="Microfone padrão"
                onValueChange={(id) => prefs.set({ micId: id })}
              />
            </div>
            {mic.error && <p className="text-danger text-xs">{mic.error}</p>}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-5">
            <div>
              <p className="text-muted text-sm">Sala</p>
              {shownName ? (
                <>
                  <h1 className="text-3xl font-semibold tracking-tight break-words">{shownName}</h1>
                  <p className="text-muted mt-1 font-mono text-sm">{formatRoomId(roomId)}</p>
                </>
              ) : (
                <h1 className="font-mono text-3xl font-semibold tracking-tight">
                  {formatRoomId(roomId)}
                </h1>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Convide a galera</span>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={roomInviteText(roomId)}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Link de convite"
                  className="font-mono text-xs"
                />
                <Button type="button" onClick={() => void copyInvite(roomId)}>
                  <Copy /> Copiar
                </Button>
              </div>
            </div>

            <Field label="Seu apelido">
              <Input
                ref={nameRef}
                value={name}
                maxLength={DISPLAY_NAME_MAX}
                onChange={(e) => setName(e.target.value)}
                placeholder="Como te chamam?"
              />
            </Field>

            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="lg" onClick={goHome}>
                <ArrowLeft /> Voltar
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="flex-1"
                disabled={!name.trim()}
              >
                <LogIn /> Entrar na sala
              </Button>
            </div>
            <p className="text-muted text-xs">
              Microfone e câmera são opcionais — dá para ligar depois. A voz pode continuar no
              Discord.
            </p>
          </form>
        </div>
      </main>
    </div>
  )
}
