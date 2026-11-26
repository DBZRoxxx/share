import type { Room } from 'livekit-client'
import { AlertTriangle, Keyboard, Mic, Square, Volume2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { MIN_DB } from '@/audio/gate-logic'
import { useMic } from '@/audio/mic-state'
import { useMicTest } from '@/audio/use-mic-test'
import { Button } from '@/components/ui/button'
import { Field, Kbd, Select, Slider, Switch } from '@/components/ui/primitives'
import { useDevices } from '@/lib/devices'
import { cn } from '@/lib/utils'
import { usePrefs, type InputMode, type NoiseSuppression } from '@/stores/prefs'

const NOISE_OPTIONS: { value: NoiseSuppression; label: string }[] = [
  { value: 'ai', label: 'IA (DeepFilterNet) — recomendado' },
  { value: 'basic', label: 'Básica (do Chromium)' },
  { value: 'off', label: 'Desligada' },
]

/** Microphone, speakers and voice settings. Work outside a room too (only saved, then). */
export function AudioSection({ room }: { room: Room | null }) {
  const prefs = usePrefs()
  const audio = prefs.audio
  const setAudio = prefs.setAudio
  const test = useMicTest()
  // Device names only show once the mic was opened; refresh then.
  const mics = useDevices('audioinput', test.running)
  const speakers = useDevices('audiooutput', test.running)

  const switchDevice = async (kind: 'audioinput' | 'audiooutput', id: string) => {
    prefs.set(kind === 'audioinput' ? { micId: id } : { speakerId: id })
    if (!room) return
    try {
      await room.switchActiveDevice(kind, id)
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível trocar o dispositivo.')
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Microfone">
          <Select
            aria-label="Microfone"
            value={prefs.micId ?? mics[0]?.value}
            options={mics}
            placeholder="Microfone padrão"
            onValueChange={(id) => void switchDevice('audioinput', id)}
          />
        </Field>
        <Field label="Saída de áudio">
          <Select
            aria-label="Saída de áudio"
            value={prefs.speakerId ?? speakers[0]?.value}
            options={speakers}
            placeholder="Padrão do sistema"
            onValueChange={(id) => void switchDevice('audiooutput', id)}
          />
        </Field>
        <VolumeField
          label="Volume de entrada"
          value={audio.inputVolume}
          max={2}
          onChange={(v) => setAudio({ inputVolume: v })}
        />
        <VolumeField
          label="Volume de saída"
          hint="Vozes e áudio das telas compartilhadas."
          value={audio.outputVolume}
          max={1}
          onChange={(v) => setAudio({ outputVolume: v })}
        />
      </div>

      <div className="bg-surface-2/60 flex flex-col gap-3 rounded-xl p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Testar microfone</p>
            <p className="text-muted text-xs">
              {test.running
                ? 'Você está se ouvindo como os outros vão ouvir. Use fone para não dar microfonia.'
                : 'Ouça sua voz com a supressão de ruído e o volume atuais.'}
            </p>
          </div>
          <Button
            size="sm"
            variant={test.running ? 'danger' : 'secondary'}
            onClick={test.toggle}
            className="shrink-0"
          >
            {test.running ? <Square /> : <Mic />} {test.running ? 'Parar' : 'Testar'}
          </Button>
        </div>
        {test.error && <p className="text-danger text-xs">{test.error}</p>}
        <LevelMeter />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Modo de entrada</span>
        <Segmented<InputMode>
          label="Modo de entrada"
          value={audio.inputMode}
          options={[
            { value: 'voice', label: 'Detecção de voz', icon: <Mic /> },
            { value: 'ptt', label: 'Apertar para falar', icon: <Keyboard /> },
          ]}
          onChange={(inputMode) => setAudio({ inputMode })}
        />
      </div>

      {audio.inputMode === 'voice' ? <SensitivityControls /> : <PushToTalkControls />}

      <Field label="Supressão de ruído">
        <Select
          aria-label="Supressão de ruído"
          value={audio.noiseSuppression}
          options={NOISE_OPTIONS}
          onValueChange={(v) => setAudio({ noiseSuppression: v as NoiseSuppression })}
        />
      </Field>
      <NoiseStatus />
      {audio.noiseSuppression === 'ai' && <NoiseStrength />}
      <ToggleRow
        label="Cancelamento de eco"
        hint="Evita que sua voz volte para os outros pelos seus alto-falantes. Com fone de ouvido, pode desligar."
        checked={audio.echoCancellation}
        onChange={(v) => setAudio({ echoCancellation: v })}
      />
      <ToggleRow
        label="Controle automático de ganho"
        hint="Ajusta o volume do microfone sozinho. Se sua voz estoura ao falar alto, desligue e baixe o volume do microfone no Windows."
        checked={audio.autoGainControl}
        onChange={(v) => setAudio({ autoGainControl: v })}
      />
    </section>
  )
}

function VolumeField({
  label,
  hint,
  value,
  max,
  onChange,
}: {
  label: string
  hint?: string
  value: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted tabular-nums">{Math.round(value * 100)}%</span>
      </div>
      <div className="flex h-10 items-center gap-3">
        <Volume2 className="text-muted size-4 shrink-0" aria-hidden="true" />
        <Slider
          aria-label={label}
          thumbLabel={label}
          min={0}
          max={max}
          step={0.01}
          value={[value]}
          onValueChange={([v]) => onChange(v ?? 0)}
        />
      </div>
      {hint && <span className="text-muted -mt-1 text-xs">{hint}</span>}
    </div>
  )
}

/** dBFS → 0..100% across the meter. */
function dbToPercent(db: number): number {
  return Math.max(0, Math.min(100, ((db - MIN_DB) / -MIN_DB) * 100))
}

/** Live level of the microphone (room mic or test), with the threshold marked. */
function LevelMeter() {
  const level = useMic((s) => s.level)
  const ptt = usePrefs((s) => s.audio.inputMode === 'ptt')
  if (!level) {
    return (
      <p className="text-muted text-xs">
        O nível aparece aqui durante o teste ou com o microfone ligado numa sala.
      </p>
    )
  }
  return (
    <div className="flex items-center gap-3">
      <div
        className="relative h-2 flex-1 overflow-hidden rounded-full bg-white/10"
        role="meter"
        aria-label="Nível do microfone"
        aria-valuemin={MIN_DB}
        aria-valuemax={0}
        aria-valuenow={Math.round(level.db)}
      >
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full transition-[width] duration-75',
            level.open ? 'bg-success' : 'bg-white/30',
          )}
          style={{ width: `${dbToPercent(level.db)}%` }}
        />
        {!ptt && (
          <div
            className="bg-fg absolute inset-y-0 w-0.5"
            style={{ left: `${dbToPercent(level.thresholdDb)}%` }}
          />
        )}
      </div>
      <span
        className={cn(
          'w-24 shrink-0 text-right text-xs font-medium',
          level.open ? 'text-success' : 'text-muted',
        )}
      >
        {level.open ? 'Transmitindo' : 'Em silêncio'}
      </span>
    </div>
  )
}

function SensitivityControls() {
  const audio = usePrefs((s) => s.audio)
  const setAudio = usePrefs((s) => s.setAudio)
  const level = useMic((s) => s.level)
  return (
    <div className="flex flex-col gap-3">
      <ToggleRow
        label="Ajustar sensibilidade automaticamente"
        hint="Acompanha o barulho do ambiente e só transmite quando você fala."
        checked={audio.autoSensitivity}
        onChange={(v) => setAudio({ autoSensitivity: v })}
      />
      {!audio.autoSensitivity && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Sensibilidade do microfone</span>
            <span className="text-muted tabular-nums">{Math.round(audio.sensitivityDb)} dB</span>
          </div>
          {/* The live level runs behind the slider: set the mark just above the background noise. */}
          <div className="relative flex h-5 items-center">
            <div className="absolute inset-x-0 h-1.5 overflow-hidden rounded-full">
              <div
                className={cn(
                  'h-full transition-[width] duration-75',
                  level?.open ? 'bg-success/70' : 'bg-warning/50',
                )}
                style={{ width: `${level ? dbToPercent(level.db) : 0}%` }}
              />
            </div>
            <Slider
              aria-label="Sensibilidade do microfone"
              thumbLabel="Sensibilidade do microfone"
              min={MIN_DB}
              max={0}
              step={1}
              value={[audio.sensitivityDb]}
              onValueChange={([v]) => setAudio({ sensitivityDb: v ?? -50 })}
            />
          </div>
          <span className="text-muted text-xs">
            Acima da marca o microfone transmite. Arraste para a direita se o barulho de fundo
            estiver passando.
          </span>
        </div>
      )}
    </div>
  )
}

function PushToTalkControls() {
  const binding = usePrefs((s) => s.audio.pttBinding)
  const releaseMs = usePrefs((s) => s.audio.pttReleaseMs)
  const setAudio = usePrefs((s) => s.setAudio)
  const [recording, setRecording] = useState(false)

  // Leaving the settings (or this mode) mid-recording cancels it.
  useEffect(() => {
    if (!recording) return
    return () => void window.share.ptt.cancelRecord()
  }, [recording])

  const record = async () => {
    setRecording(true)
    try {
      const next = await window.share.ptt.record()
      if (next) setAudio({ pttBinding: next })
    } finally {
      setRecording(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Tecla de atalho</p>
          <p className="text-muted text-xs">
            Funciona mesmo com outro app ou jogo em foco. Vale tecla ou botão lateral do mouse.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {binding && !recording && <Kbd>{binding.label}</Kbd>}
          <Button
            size="sm"
            variant={recording ? 'primary' : 'secondary'}
            onClick={() => (recording ? void window.share.ptt.cancelRecord() : void record())}
          >
            {recording
              ? 'Pressione uma tecla… (Esc cancela)'
              : binding
                ? 'Trocar'
                : 'Escolher tecla'}
          </Button>
        </div>
      </div>
      {!binding && (
        <p className="text-warning flex items-center gap-1.5 text-xs">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
          Sem tecla escolhida, a detecção de voz continua valendo.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Atraso ao soltar</span>
          <span className="text-muted tabular-nums">{releaseMs} ms</span>
        </div>
        <Slider
          aria-label="Atraso ao soltar"
          thumbLabel="Atraso ao soltar"
          min={0}
          max={1000}
          step={10}
          value={[releaseMs]}
          onValueChange={([v]) => setAudio({ pttReleaseMs: v ?? 200 })}
        />
        <span className="text-muted text-xs">
          Quanto tempo o microfone fica aberto depois de soltar, para não cortar o fim da frase.
        </span>
      </div>
    </div>
  )
}

function NoiseStatus() {
  const mode = usePrefs((s) => s.audio.noiseSuppression)
  const dfn = useMic((s) => s.dfn)
  if (mode !== 'ai') return null
  if (dfn === 'error')
    return (
      <p className="text-warning -mt-1 flex items-center gap-1.5 text-xs">
        <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />A IA não carregou neste
        computador. Usando a supressão básica.
      </p>
    )
  return (
    <p className="text-muted -mt-1 text-xs">
      {dfn === 'loading'
        ? 'Carregando o modelo de IA…'
        : 'Remove teclado, ventilador e barulho de fundo, mantendo só a sua voz.'}
    </p>
  )
}

/** How much DeepFilterNet may remove: lower sounds more natural on loud speech. */
function NoiseStrength() {
  const strength = usePrefs((s) => s.audio.noiseStrengthDb)
  const setAudio = usePrefs((s) => s.setAudio)
  const dfnFailed = useMic((s) => s.dfn === 'error')
  if (dfnFailed) return null
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Intensidade da supressão</span>
        <span className="text-muted tabular-nums">
          {strength >= 100 ? 'Máxima' : `${Math.round(strength)} dB`}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-muted text-xs">Suave</span>
        <Slider
          aria-label="Intensidade da supressão"
          thumbLabel="Intensidade da supressão"
          min={10}
          max={100}
          step={1}
          value={[strength]}
          onValueChange={([v]) => setAudio({ noiseStrengthDb: v ?? 30 })}
        />
        <span className="text-muted text-xs">Máxima</span>
      </div>
      <span className="text-muted text-xs">
        Se a voz ficar metálica ou robótica ao falar alto, diminua.
      </span>
    </div>
  )
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string; icon?: ReactNode }[]
  onChange: (value: T) => void
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="bg-surface-2 grid grid-cols-2 gap-1 rounded-xl p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'flex h-8 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors [&_svg]:size-4',
            value === o.value
              ? 'bg-accent text-white'
              : 'text-muted hover:bg-surface-3 hover:text-fg',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-muted text-xs">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  )
}
