import { DISPLAY_NAME_MAX, ROOM_PASSWORD_MAX, type RoomSummary } from '@share/shared'
import { createLocalVideoTrack, type LocalVideoTrack } from 'livekit-client'
import {
  ArrowLeft,
  Camera,
  CameraOff,
  Copy,
  Eye,
  EyeOff,
  Lock,
  LogIn,
  Mic,
  MicOff,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { TitleBar } from '@/components/title-bar'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Tooltip } from '@/components/ui/primitives'
import { describeMediaError, useDevices } from '@/lib/devices'
import { copyInvite } from '@/lib/invite'
import { CAMERA_CAPTURE, MIC_CAPTURE } from '@/lib/media'
import { cn, hueFor, initials } from '@/lib/utils'
import { roomApi } from '@/lib/chat-api'
import { useNav, type JoinOptions } from '@/stores/nav'
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

/** Name, privacy and people in the room, before joining (null until known). */
function useRoomSummary(roomId: string, creating: boolean) {
  const [summary, setSummary] = useState<{ roomId: string; value: RoomSummary } | null>(null)
  useEffect(() => {
    if (creating) return
    let alive = true
    void roomApi.presence([roomId]).then((rooms) => {
      const value = rooms?.[roomId]
      if (alive && value) setSummary({ roomId, value })
    })
    return () => {
      alive = false
    }
  }, [roomId, creating])
  return summary?.roomId === roomId ? summary.value : null
}

export function PreJoinScreen({
  roomId,
  create,
  roomKey,
  error,
}: { roomId: string } & Pick<JoinOptions, 'create' | 'roomKey' | 'error'>) {
  const prefs = usePrefs()
  const { goHome, enterRoom } = useNav()
  const known = prefs.recentRooms.find((r) => r.id === roomId)
  const summary = useRoomSummary(roomId, !!create)
  const shownName = create ? (create.name ?? null) : (summary?.name ?? known?.name ?? null)
  const isPrivate = create ? !!create.password : (summary?.private ?? known?.private ?? false)
  // Asks for the password unless this computer already has access.
  const needsPassword = !create && isPrivate && !roomKey && !known?.roomKey && !known?.ownerKey
  const [name, setName] = useState(prefs.name)
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [passwordError, setPasswordError] = useState<string | null>(error ?? null)
  const [busy, setBusy] = useState(false)
  const camera = useCameraPreview(prefs.joinWithCamera, prefs.cameraId)
  const mic = useMicLevel(prefs.joinWithMic, prefs.micId)
  // Device labels only appear after permission is granted; refresh then.
  const cameras = useDevices('videoinput', camera.track)
  const mics = useDevices('audioinput', mic.error ?? prefs.joinWithMic)
  const nameRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      nameRef.current?.focus()
      return
    }
    prefs.set({ name: trimmed })
    if (!needsPassword) {
      enterRoom(roomId, { create, roomKey })
      return
    }
    if (!password) {
      passwordRef.current?.focus()
      return
    }
    setBusy(true)
    try {
      const { roomKey: key } = await roomApi.unlock(roomId, password)
      if (remember) prefs.addRecentRoom(roomId, { roomKey: key, private: true })
      enterRoom(roomId, { roomKey: key })
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Não foi possível verificar a senha.')
      passwordRef.current?.select()
    } finally {
      setBusy(false)
    }
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

          <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <p className="text-muted text-sm">Sala</p>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1
                  className={cn(
                    'text-3xl font-semibold tracking-tight break-words',
                    !shownName && 'text-muted',
                  )}
                >
                  {shownName ?? 'Sala sem nome'}
                </h1>
                {isPrivate && (
                  <span className="bg-accent/20 text-accent-hover flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold">
                    <Lock className="size-3.5" aria-hidden="true" /> Privada
                  </span>
                )}
              </div>
              {summary && (
                <p className="text-muted flex items-center gap-1.5 text-sm">
                  {summary.participants > 0 && (
                    <span className="bg-success size-2 rounded-full" aria-hidden="true" />
                  )}
                  {summary.participants === 0
                    ? 'Ninguém na sala agora'
                    : summary.participants === 1
                      ? '1 pessoa na sala'
                      : `${summary.participants} pessoas na sala`}
                </p>
              )}
            </div>

            <Button
              type="button"
              variant="secondary"
              className="self-start"
              onClick={() => void copyInvite(roomId)}
            >
              <Copy /> Copiar link de convite
            </Button>

            <Field label="Seu apelido">
              <Input
                ref={nameRef}
                value={name}
                maxLength={DISPLAY_NAME_MAX}
                onChange={(e) => setName(e.target.value)}
                placeholder="Como te chamam?"
              />
            </Field>

            {needsPassword && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="room-password" className="text-sm font-medium">
                  Senha da sala
                </label>
                <div
                  className={cn(
                    'bg-surface-2 focus-within:border-accent flex h-10 items-center rounded-xl border pr-1 pl-3',
                    passwordError ? 'border-danger' : 'border-border',
                  )}
                >
                  <Lock className="text-muted size-4 shrink-0" aria-hidden="true" />
                  <input
                    id="room-password"
                    ref={passwordRef}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    maxLength={ROOM_PASSWORD_MAX}
                    autoFocus
                    aria-invalid={!!passwordError}
                    aria-describedby={passwordError ? 'room-password-error' : undefined}
                    onChange={(e) => {
                      setPassword(e.target.value)
                      setPasswordError(null)
                    }}
                    className="placeholder:text-muted min-w-0 flex-1 bg-transparent px-2.5 text-sm outline-none"
                    placeholder="Peça para quem te convidou"
                  />
                  <button
                    type="button"
                    aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                    onClick={() => setShowPassword((v) => !v)}
                    className="text-muted hover:bg-surface-3 hover:text-fg flex size-8 items-center justify-center rounded-lg"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {passwordError && (
                  <span id="room-password-error" className="text-danger text-xs">
                    {passwordError}
                  </span>
                )}
                <label className="mt-1 flex items-center gap-2.5 text-sm">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="accent-accent size-4"
                  />
                  Lembrar neste computador
                </label>
              </div>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="lg" onClick={goHome}>
                <ArrowLeft /> Voltar
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="flex-1"
                disabled={!name.trim() || busy || (needsPassword && !password)}
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
