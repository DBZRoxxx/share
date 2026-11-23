import { useLocalParticipant, useRoomContext } from '@livekit/components-react'
import { DISPLAY_NAME_MAX } from '@share/shared'
import type { MainSettings } from '@shared/ipc'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, Field, Input, Select, Switch } from '@/components/ui/primitives'
import { useDevices } from '@/lib/devices'
import { CODEC_LABELS } from '@/lib/media'
import { usePrefs, type PreferredCodec } from '@/stores/prefs'
import { useRoomUi } from './room-ui'

export function SettingsDialog() {
  const open = useRoomUi((s) => s.settingsOpen)
  const setOpen = useRoomUi((s) => s.setSettingsOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent title="Configurações" description="Dispositivos, qualidade e exibição.">
        {open && <SettingsBody />}
      </DialogContent>
    </Dialog>
  )
}

function SettingsBody() {
  const room = useRoomContext()
  const { localParticipant } = useLocalParticipant()
  const prefs = usePrefs()
  const cameras = useDevices('videoinput')
  const mics = useDevices('audioinput')
  const speakers = useDevices('audiooutput')
  const [name, setName] = useState(prefs.name)

  const switchDevice = async (kind: MediaDeviceKind, id: string) => {
    const key = kind === 'videoinput' ? 'cameraId' : kind === 'audioinput' ? 'micId' : 'speakerId'
    prefs.set({ [key]: id })
    try {
      await room.switchActiveDevice(kind, id)
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível trocar o dispositivo.')
    }
  }

  const saveName = async () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === localParticipant.name) return
    prefs.set({ name: trimmed })
    try {
      await localParticipant.setName(trimmed)
      toast.success('Apelido atualizado')
    } catch {
      toast.error('Não foi possível atualizar o apelido.')
    }
  }

  return (
    <div className="flex flex-col gap-5 overflow-y-auto px-6 pb-6">
      <section className="flex flex-col gap-3">
        <h3 className="text-muted text-xs font-semibold tracking-wide uppercase">Você</h3>
        <Field label="Apelido">
          <div className="flex gap-2">
            <Input
              value={name}
              maxLength={DISPLAY_NAME_MAX}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void saveName()}
            />
            <Button
              onClick={() => void saveName()}
              disabled={!name.trim() || name.trim() === localParticipant.name}
            >
              Salvar
            </Button>
          </div>
        </Field>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-muted text-xs font-semibold tracking-wide uppercase">Dispositivos</h3>
        <Field label="Câmera">
          <Select
            aria-label="Câmera"
            value={prefs.cameraId ?? cameras[0]?.value}
            options={cameras}
            placeholder="Nenhuma câmera encontrada"
            onValueChange={(id) => void switchDevice('videoinput', id)}
          />
        </Field>
        <Field label="Microfone">
          <Select
            aria-label="Microfone"
            value={prefs.micId ?? mics[0]?.value}
            options={mics}
            placeholder="Nenhum microfone encontrado"
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
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-muted text-xs font-semibold tracking-wide uppercase">Vídeo</h3>
        <Field
          label="Codec de vídeo"
          hint="Vale para o próximo compartilhamento ou câmera que você abrir."
        >
          <Select
            aria-label="Codec de vídeo"
            value={prefs.videoCodec}
            options={(Object.keys(CODEC_LABELS) as PreferredCodec[]).map((c) => ({
              value: c,
              label: CODEC_LABELS[c],
            }))}
            onValueChange={(v) => prefs.set({ videoCodec: v as PreferredCodec })}
          />
        </Field>
        <ToggleRow
          label="Mostrar minha própria tela"
          hint="Exibe sua tela compartilhada no palco junto com as outras."
          checked={prefs.showOwnScreen}
          onChange={(v) => prefs.set({ showOwnScreen: v })}
        />
        <ToggleRow
          label="Mostrar estatísticas nos vídeos"
          hint="Resolução, fps e taxa de bits de cada vídeo."
          checked={prefs.showStats}
          onChange={(v) => prefs.set({ showStats: v })}
        />
      </section>

      <AppSection />
    </div>
  )
}

/** Settings stored by the main process (they apply even before the window loads). */
function AppSection() {
  const [settings, setSettings] = useState<MainSettings | null>(null)
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    void window.share.settings.get().then((s) => alive && setSettings(s))
    void window.share.app.info().then((i) => alive && setVersion(i.version))
    return () => {
      alive = false
    }
  }, [])

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-muted text-xs font-semibold tracking-wide uppercase">App</h3>
      <ToggleRow
        label="Ao fechar, continuar rodando na bandeja"
        hint="Fechar a janela não tira você da sala. Para sair de vez, use o ícone do Share perto do relógio."
        checked={settings?.closeToTray ?? true}
        onChange={(v) => void window.share.settings.set({ closeToTray: v }).then(setSettings)}
      />
      {version && <p className="text-muted text-xs">Share versão {version}</p>}
    </section>
  )
}

function ToggleRow({
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
