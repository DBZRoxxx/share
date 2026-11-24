import { parseYoutubeLink, youtubeThumb, type QueueItem } from '@share/shared/music'
import { Loader2, Music, Play, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input, Tooltip } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { AddMediaDialog, type PendingMedia } from './add-media-dialog'
import { ModeIcon, ProgressBar, TransportButtons, VolumeControl } from './music-controls'
import { formatTime } from './music-logic'
import { useCurrentItem, useMusic } from './music-store'
import { musicActions } from './use-music'

const NO_ITEMS: QueueItem[] = []

/** "Música" tab of the side panel: add links, see what's playing and the queue. */
export function MusicPanel() {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState<PendingMedia | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const queue = useMusic((s) => s.room?.queue ?? NO_ITEMS)
  const index = useMusic((s) => s.room?.index ?? 0)
  const item = useCurrentItem()
  const available = musicActions.available()

  useEffect(() => inputRef.current?.focus(), [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const text = url.trim()
    if (!text || loading) return
    const link = parseYoutubeLink(text)
    if (!link) {
      toast.error('Cole um link do YouTube (vídeo ou playlist).')
      return
    }
    setLoading(true)
    try {
      const res = await musicActions.resolve(text)
      setPending({ res, startS: link.startS })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível ler esse link.')
    } finally {
      setLoading(false)
    }
  }

  const upcoming = queue.length - Math.min(index + 1, queue.length)

  return (
    <>
      <form onSubmit={(e) => void submit(e)} className="flex gap-2 px-3 pt-1 pb-3">
        <Input
          ref={inputRef}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Cole um link do YouTube"
          aria-label="Link do YouTube"
          disabled={!available}
          spellCheck={false}
        />
        <Button type="submit" variant="primary" disabled={!available || !url.trim() || loading}>
          {loading ? <Loader2 className="animate-spin" /> : <Play />}
          Tocar
        </Button>
      </form>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {!available ? (
          <p className="text-muted px-2 py-6 text-center text-sm">
            A música precisa do servidor do Share configurado.
          </p>
        ) : !queue.length ? (
          <div className="text-muted flex flex-col items-center gap-3 px-4 py-10 text-center text-sm">
            <span className="bg-surface-2 flex size-12 items-center justify-center rounded-2xl">
              <Music className="size-6" />
            </span>
            <p>Cole o link de um vídeo ou de uma playlist do YouTube para tocar para todos.</p>
            <p className="text-xs">
              Só áudio mostra um player no canto da tela; com vídeo, abre uma watch party no palco.
            </p>
          </div>
        ) : (
          <>
            {item && <NowPlaying item={item} />}
            <div className="mt-4 mb-1 flex items-center justify-between px-1">
              <h3 className="text-muted text-xs font-semibold tracking-wide uppercase">
                Fila {upcoming > 0 && <span className="font-normal">· {upcoming} a seguir</span>}
              </h3>
              <Tooltip content="Para a música para todos e esvazia a fila">
                <button
                  type="button"
                  onClick={musicActions.clear}
                  className="text-muted hover:text-danger text-xs"
                >
                  Limpar
                </button>
              </Tooltip>
            </div>
            <ul aria-label="Fila de músicas" className="flex flex-col">
              {queue.map((q, i) => (
                <QueueRow
                  key={q.id}
                  item={q}
                  state={i < index ? 'played' : i === index ? 'current' : 'next'}
                />
              ))}
            </ul>
          </>
        )}
      </div>

      <AddMediaDialog
        pending={pending}
        onCancel={() => setPending(null)}
        onChoose={(mode) => {
          if (pending) musicActions.add(pending.res.items, mode, pending.startS)
          setPending(null)
          setUrl('')
        }}
      />
    </>
  )
}

function NowPlaying({ item }: { item: QueueItem }) {
  return (
    <section aria-label="Tocando agora" className="bg-surface-2 rounded-2xl p-3">
      <img
        src={youtubeThumb(item.videoId)}
        alt=""
        className="mb-3 aspect-video w-full rounded-xl object-cover"
      />
      <p className="line-clamp-2 text-sm font-medium">{item.title}</p>
      <p className="text-muted mt-0.5 flex items-center gap-1 text-xs">
        <ModeIcon mode={item.mode} className="size-3" />
        <span className="truncate">
          {item.mode === 'video' ? 'Watch party' : 'Só áudio'} · {item.channel} · por{' '}
          {item.addedByName}
        </span>
      </p>
      <div className="mt-2">
        <ProgressBar />
      </div>
      <div className="mt-1 flex items-center justify-between">
        <VolumeControl />
        <TransportButtons />
      </div>
    </section>
  )
}

function QueueRow({ item, state }: { item: QueueItem; state: 'played' | 'current' | 'next' }) {
  return (
    <li
      className={cn(
        'group hover:bg-surface-2 flex items-center gap-2.5 rounded-xl px-1.5 py-1.5',
        state === 'current' && 'bg-accent/10 hover:bg-accent/15',
        state === 'played' && 'opacity-50 hover:opacity-100',
      )}
    >
      <img
        src={youtubeThumb(item.videoId)}
        alt=""
        loading="lazy"
        className="aspect-video w-16 shrink-0 rounded-md object-cover"
      />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm', state === 'current' && 'text-accent font-medium')}>
          {item.title}
        </p>
        <p className="text-muted flex items-center gap-1 truncate text-xs">
          <ModeIcon mode={item.mode} className="size-3" />
          <span className="truncate">
            {item.durationS > 0 ? formatTime(item.durationS) : 'ao vivo'} · {item.addedByName}
          </span>
        </p>
      </div>
      <div className="flex opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        {state !== 'current' && (
          <Tooltip content="Tocar agora">
            <button
              type="button"
              aria-label={`Tocar agora: ${item.title}`}
              onClick={() => musicActions.jump(item.id)}
              className="text-muted hover:bg-surface-3 hover:text-fg rounded-lg p-1.5 [&_svg]:size-4"
            >
              <Play />
            </button>
          </Tooltip>
        )}
        <Tooltip content="Tirar da fila">
          <button
            type="button"
            aria-label={`Tirar da fila: ${item.title}`}
            onClick={() => musicActions.remove(item.id)}
            className="text-muted hover:bg-surface-3 hover:text-danger rounded-lg p-1.5 [&_svg]:size-4"
          >
            <Trash2 />
          </button>
        </Tooltip>
      </div>
    </li>
  )
}
