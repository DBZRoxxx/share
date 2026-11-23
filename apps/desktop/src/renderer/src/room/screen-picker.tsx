import type { AudioSupport, CaptureSource, ShareAudioMode } from '@shared/ipc'
import { AppWindow, Gamepad2, Loader2, Monitor, RefreshCw, Type, Volume2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/primitives'
import { SCREEN_PRESETS } from '@/lib/media'
import { cn } from '@/lib/utils'
import { usePrefs, type ScreenQuality } from '@/stores/prefs'
import { useRoomUi } from './room-ui'
import type { ScreenShareController } from './screen-share'

function audioHint(kind: CaptureSource['kind'] | undefined, support: AudioSupport | null): string {
  if (!support) return ''
  if (!support.appAudio) {
    return 'Envia todo o som do PC. Neste Windows não dá para separar por app, então quem estiver falando na chamada pode ouvir o próprio eco.'
  }
  return kind === 'window'
    ? 'Envia só o som deste app — sem eco da chamada.'
    : 'Envia todo o som do PC, exceto o do Share. Dica: para não vazar a voz do Discord, compartilhe a janela do jogo/app.'
}

export function ScreenPicker({ controller }: { controller: ScreenShareController }) {
  const open = useRoomUi((s) => s.pickerOpen)
  const setOpen = useRoomUi((s) => s.setPickerOpen)
  const { screenQuality, shareAudio, videoCodec, set } = usePrefs()

  const [sources, setSources] = useState<CaptureSource[] | null>(null)
  const [support, setSupport] = useState<AudioSupport | null>(null)
  const [tab, setTab] = useState<'screen' | 'window'>('screen')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState(false)

  const load = useCallback(
    () =>
      window.share.capture
        .getSources()
        .then((list) => {
          setSources(list)
          setSelectedId((current) =>
            current && list.some((s) => s.id === current) ? current : null,
          )
        })
        .catch((error) => {
          console.error(error)
          toast.error('Não foi possível listar as telas.')
        }),
    [],
  )

  const refresh = async () => {
    setLoading(true)
    await load()
    setLoading(false)
  }

  useEffect(() => {
    if (!open) return
    void load()
    void window.share.capture.audioSupport().then(setSupport)
  }, [open, load])

  const visible = sources?.filter((s) => s.kind === tab) ?? []
  const selected = sources?.find((s) => s.id === selectedId)

  const start = async (source: CaptureSource | undefined = selected) => {
    if (!source) return
    const audio: ShareAudioMode = !shareAudio ? 'none' : support?.appAudio ? 'app' : 'system'
    setStarting(true)
    try {
      await controller.start({
        sourceId: source.id,
        sourceKind: source.kind,
        sourceName: source.name,
        quality: screenQuality,
        audio,
        codec: videoCodec,
      })
      setOpen(false)
    } catch (error) {
      console.error('[screen-share] start failed', error)
      toast.error('Não foi possível compartilhar a tela', {
        description: error instanceof Error ? error.message : undefined,
      })
    } finally {
      setStarting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        title="Compartilhar tela"
        description="Escolha uma tela inteira ou a janela de um app."
        className="w-[min(920px,calc(100vw-2rem))]"
      >
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as 'screen' | 'window')}
          className="flex min-h-0 flex-col"
        >
          <div className="flex items-center justify-between gap-3 px-6">
            <TabsList>
              <TabsTrigger value="screen">
                <span className="flex items-center gap-2">
                  <Monitor className="size-4" /> Telas
                </span>
              </TabsTrigger>
              <TabsTrigger value="window">
                <span className="flex items-center gap-2">
                  <AppWindow className="size-4" /> Janelas
                </span>
              </TabsTrigger>
            </TabsList>
            <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={cn(loading && 'animate-spin')} /> Atualizar
            </Button>
          </div>

          {(['screen', 'window'] as const).map((kind) => (
            <TabsContent key={kind} value={kind} className="min-h-0 outline-none">
              <div className="grid max-h-[46vh] min-h-48 grid-cols-2 gap-3 overflow-y-auto px-6 py-4 md:grid-cols-3">
                {sources === null ? (
                  <div className="text-muted col-span-full flex items-center justify-center py-16">
                    <Loader2 className="size-6 animate-spin" />
                  </div>
                ) : visible.length === 0 ? (
                  <p className="text-muted col-span-full py-16 text-center text-sm">
                    Nenhuma {kind === 'screen' ? 'tela' : 'janela'} encontrada.
                  </p>
                ) : (
                  visible.map((source) => (
                    <SourceCard
                      key={source.id}
                      source={source}
                      selected={source.id === selectedId}
                      onSelect={() => setSelectedId(source.id)}
                      onConfirm={() => void start(source)}
                    />
                  ))
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <div className="border-border grid gap-4 border-t px-6 py-4 md:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium">Qualidade</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Qualidade">
              {(Object.keys(SCREEN_PRESETS) as ScreenQuality[]).map((q) => {
                const preset = SCREEN_PRESETS[q]
                const Icon = q === 'motion' ? Gamepad2 : Type
                return (
                  <button
                    key={q}
                    type="button"
                    role="radio"
                    aria-checked={screenQuality === q}
                    onClick={() => set({ screenQuality: q })}
                    className={cn(
                      'flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors',
                      screenQuality === q
                        ? 'border-accent bg-accent/10'
                        : 'border-border bg-surface-2 hover:bg-surface-3',
                    )}
                  >
                    <Icon className="text-accent mt-0.5 size-4 shrink-0" />
                    <span>
                      <span className="block text-sm font-medium">{preset.label}</span>
                      <span className="text-muted block text-xs">{preset.description}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="share-audio" className="flex items-center gap-2 text-sm font-medium">
                <Volume2 className="text-accent size-4" /> Compartilhar áudio
              </label>
              <Switch
                id="share-audio"
                checked={shareAudio}
                onCheckedChange={(v) => set({ shareAudio: v })}
              />
            </div>
            <p className={cn('text-muted text-xs', !shareAudio && 'opacity-50')}>
              {shareAudio ? audioHint(selected?.kind ?? tab, support) : 'Só a imagem será enviada.'}
            </p>
          </div>
        </div>

        <div className="border-border flex items-center justify-end gap-2 border-t px-6 py-4">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!selected || starting} onClick={() => void start()}>
            {starting ? <Loader2 className="animate-spin" /> : <Monitor />}
            Compartilhar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SourceCard({
  source,
  selected,
  onSelect,
  onConfirm,
}: {
  source: CaptureSource
  selected: boolean
  onSelect: () => void
  onConfirm: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onConfirm}
      aria-pressed={selected}
      className={cn(
        'group flex flex-col gap-2 rounded-xl border-2 p-2 text-left transition-colors',
        selected ? 'border-accent bg-accent/10' : 'hover:bg-surface-2 border-transparent',
      )}
    >
      <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-lg bg-black">
        {source.thumbnail ? (
          <img
            src={source.thumbnail}
            alt=""
            className="size-full object-contain"
            draggable={false}
          />
        ) : (
          <AppWindow className="text-muted size-8" />
        )}
      </div>
      <div className="flex min-w-0 items-center gap-2 px-1">
        {source.appIcon ? (
          <img src={source.appIcon} alt="" className="size-4 shrink-0" draggable={false} />
        ) : source.kind === 'screen' ? (
          <Monitor className="text-muted size-4 shrink-0" />
        ) : null}
        <span className="truncate text-sm">{source.name}</span>
      </div>
    </button>
  )
}
