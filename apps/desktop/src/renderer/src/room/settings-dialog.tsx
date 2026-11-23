import { RoomContext, useLocalParticipant, useRoomContext } from '@livekit/components-react'
import { DISPLAY_NAME_MAX } from '@share/shared'
import type { MainSettings } from '@shared/ipc'
import { Play, RefreshCw, Volume2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  Field,
  Input,
  Select,
  Slider,
  Switch,
} from '@/components/ui/primitives'
import { useDevices } from '@/lib/devices'
import { CODEC_LABELS } from '@/lib/media'
import { previewSound } from '@/lib/sounds'
import { cn } from '@/lib/utils'
import { usePrefs, type PreferredCodec } from '@/stores/prefs'
import { useSettingsUi } from '@/stores/settings-ui'
import { checkForUpdates, useUpdate } from '@/stores/update'

export function SettingsDialog() {
  const open = useSettingsUi((s) => s.open)
  const setOpen = useSettingsUi((s) => s.setOpen)
  const room = useSettingsUi((s) => s.room)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        title="Configurações"
        description={
          room
            ? 'Dispositivos, vídeo, notificações e app.'
            : 'Notificações e app. Valem para todas as salas.'
        }
      >
        {open && (
          <div className="flex flex-col gap-5 overflow-y-auto px-6 pb-6">
            {room && (
              <RoomContext.Provider value={room}>
                <RoomSections />
              </RoomContext.Provider>
            )}
            <NotificationsSection />
            <AppSection />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Settings that act on the room the user is in (devices switch live). */
function RoomSections() {
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
    <>
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
    </>
  )
}

/** Per user: applies to every room, now and later. */
function NotificationsSection() {
  const n = usePrefs((s) => s.notifications)
  const setN = usePrefs((s) => s.setNotifications)
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-muted text-xs font-semibold tracking-wide uppercase">Notificações</h3>
      <ToggleRow
        label="Mensagens novas"
        hint="Avisa cada mensagem no chat da sala."
        checked={n.messages}
        onChange={(v) => setN({ messages: v })}
      />
      <ToggleRow
        label="Respostas às suas mensagens"
        hint="Aviso e som próprios quando alguém responde você."
        checked={n.replies}
        onChange={(v) => setN({ replies: v })}
      />
      <ToggleRow
        label="Reações às suas mensagens"
        hint="Quando alguém reage a uma mensagem sua. Reações entre outras pessoas não avisam."
        checked={n.reactions}
        onChange={(v) => setN({ reactions: v })}
      />
      <ToggleRow
        label="Entrada e saída de pessoas"
        hint="Som (e aviso) quando alguém entra ou sai da sala."
        checked={n.joinLeave}
        onChange={(v) => setN({ joinLeave: v })}
      />
      <ToggleRow
        label="Notificações do Windows"
        hint="Quando o Share está minimizado, na bandeja ou atrás de outras janelas."
        checked={n.desktop}
        onChange={(v) => setN({ desktop: v })}
      />
      <ToggleRow
        label="Sons"
        hint="Um som curto para cada notificação."
        checked={n.sounds}
        onChange={(v) => setN({ sounds: v })}
      />
      <div className={cn('flex items-center gap-3', !n.sounds && 'pointer-events-none opacity-50')}>
        <Volume2 className="text-muted size-4 shrink-0" aria-hidden="true" />
        <Slider
          aria-label="Volume das notificações"
          min={0}
          max={1}
          step={0.05}
          value={[n.volume]}
          onValueChange={([v]) => setN({ volume: v ?? 0 })}
          onValueCommit={() => previewSound('message')}
        />
        <Button size="sm" variant="secondary" onClick={() => previewSound('message')}>
          <Play /> Testar som
        </Button>
      </div>
    </section>
  )
}

/** Settings stored by the main process (they apply even before the window loads). */
function AppSection() {
  const [settings, setSettings] = useState<MainSettings | null>(null)
  const [version, setVersion] = useState<string | null>(null)
  const checking = useUpdate((u) => u.checking)

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
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted text-xs">{version ? `Share versão ${version}` : ''}</p>
        <Button
          size="sm"
          variant="secondary"
          disabled={checking}
          onClick={() => void checkForUpdates()}
        >
          <RefreshCw className={checking ? 'animate-spin' : ''} /> Verificar atualizações
        </Button>
      </div>
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
