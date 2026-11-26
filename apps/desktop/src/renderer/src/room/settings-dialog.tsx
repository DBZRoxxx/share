import { RoomContext, useLocalParticipant, useRoomContext } from '@livekit/components-react'
import { DISPLAY_NAME_MAX } from '@share/shared'
import type { MainSettings } from '@shared/ipc'
import {
  Bell,
  Mic,
  Play,
  RefreshCw,
  Settings2,
  UserRound,
  Video,
  Volume2,
  type LucideIcon,
} from 'lucide-react'
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/primitives'
import { useDevices } from '@/lib/devices'
import { CODEC_LABELS } from '@/lib/media'
import { previewSound } from '@/lib/sounds'
import { cn, versionLabel } from '@/lib/utils'
import { usePrefs, type PreferredCodec } from '@/stores/prefs'
import { useSettingsUi, type SettingsTab } from '@/stores/settings-ui'
import { AudioSection, ToggleRow } from './audio-settings'
import { checkForUpdates, useUpdate } from '@/stores/update'

interface TabDef {
  value: SettingsTab
  label: string
  icon: LucideIcon
  /** Only shown while in a room. */
  roomOnly?: boolean
}

const TABS: TabDef[] = [
  { value: 'profile', label: 'Você', icon: UserRound, roomOnly: true },
  { value: 'audio', label: 'Voz e áudio', icon: Mic },
  { value: 'video', label: 'Vídeo', icon: Video, roomOnly: true },
  { value: 'notifications', label: 'Notificações', icon: Bell },
  { value: 'app', label: 'App', icon: Settings2 },
]

export function SettingsDialog() {
  const open = useSettingsUi((s) => s.open)
  const setOpen = useSettingsUi((s) => s.setOpen)
  const room = useSettingsUi((s) => s.room)
  const savedTab = useSettingsUi((s) => s.tab)
  const setTab = useSettingsUi((s) => s.setTab)
  const tabs = TABS.filter((t) => room || !t.roomOnly)
  // A room-only tab picked last time falls back to audio outside a room.
  const tab = tabs.some((t) => t.value === savedTab) ? savedTab : 'audio'

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        title="Configurações"
        description={room ? undefined : 'Valem para todas as salas.'}
        className="h-[min(680px,calc(100vh-4rem))]"
      >
        {open && (
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as SettingsTab)}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="px-6 pb-4">
              <TabsList className="flex w-full">
                {tabs.map(({ value, label, icon: Icon }) => (
                  <TabsTrigger
                    key={value}
                    value={value}
                    className="flex-auto px-2.5 whitespace-nowrap"
                  >
                    <span className="flex items-center justify-center gap-1.5">
                      <Icon className="size-4 shrink-0" aria-hidden="true" /> {label}
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            <div className="border-border min-h-0 flex-1 overflow-y-auto border-t px-6 pt-5 pb-6">
              {room && (
                <RoomContext.Provider value={room}>
                  <TabsContent value="profile" className="outline-none">
                    <ProfileSection />
                  </TabsContent>
                  <TabsContent value="video" className="outline-none">
                    <VideoSection />
                  </TabsContent>
                </RoomContext.Provider>
              )}
              <TabsContent value="audio" className="outline-none">
                <AudioSection room={room} />
              </TabsContent>
              <TabsContent value="notifications" className="outline-none">
                <NotificationsSection />
              </TabsContent>
              <TabsContent value="app" className="outline-none">
                <AppSection />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** The user's name in the room. */
function ProfileSection() {
  const { localParticipant } = useLocalParticipant()
  const prefs = usePrefs()
  const [name, setName] = useState(prefs.name)

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
    <section className="flex flex-col gap-3">
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
  )
}

/** Camera and video settings of the room the user is in (the camera switches live). */
function VideoSection() {
  const room = useRoomContext()
  const prefs = usePrefs()
  const cameras = useDevices('videoinput')

  const switchCamera = async (id: string) => {
    prefs.set({ cameraId: id })
    try {
      await room.switchActiveDevice('videoinput', id)
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível trocar a câmera.')
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <Field label="Câmera">
        <Select
          aria-label="Câmera"
          value={prefs.cameraId ?? cameras[0]?.value}
          options={cameras}
          placeholder="Nenhuma câmera encontrada"
          onValueChange={(id) => void switchCamera(id)}
        />
      </Field>
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
  )
}

/** Per user: applies to every room, now and later. */
function NotificationsSection() {
  const n = usePrefs((s) => s.notifications)
  const setN = usePrefs((s) => s.setNotifications)
  return (
    <section className="flex flex-col gap-3">
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
    void window.share.app.info().then((i) => alive && setVersion(versionLabel(i)))
    return () => {
      alive = false
    }
  }, [])

  return (
    <section className="flex flex-col gap-3">
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
