import { youtubeThumb, type MusicMode, type MusicResolveResponse } from '@share/shared/music'
import { Headphones, ListMusic, MonitorPlay } from 'lucide-react'
import type { ReactNode } from 'react'
import { Dialog, DialogContent } from '@/components/ui/primitives'
import { formatTime } from './music-logic'
import { useCurrentItem } from './music-store'

export interface PendingMedia {
  res: MusicResolveResponse
  startS?: number
}

function ModeOption({
  icon,
  title,
  description,
  onClick,
  autoFocus,
}: {
  icon: ReactNode
  title: string
  description: string
  onClick: () => void
  autoFocus?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      autoFocus={autoFocus}
      className="border-border bg-surface-2 hover:border-accent hover:bg-accent/10 focus-visible:border-accent focus-visible:ring-accent/30 flex flex-1 flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-colors outline-none focus-visible:ring-2"
    >
      <span className="bg-accent/15 text-accent flex size-10 items-center justify-center rounded-xl [&_svg]:size-5">
        {icon}
      </span>
      <span className="font-medium">{title}</span>
      <span className="text-muted text-xs leading-relaxed">{description}</span>
    </button>
  )
}

/** Asks how the room should play a link: audio only, or a watch party with the video. */
export function AddMediaDialog({
  pending,
  onChoose,
  onCancel,
}: {
  pending: PendingMedia | null
  onChoose: (mode: MusicMode) => void
  onCancel: () => void
}) {
  const playingNow = useCurrentItem()
  const res = pending?.res
  const first = res?.items[0]
  const total = res?.items.reduce((sum, v) => sum + v.durationS, 0) ?? 0

  return (
    <Dialog open={!!pending} onOpenChange={(open) => !open && onCancel()}>
      {res && first && (
        <DialogContent
          title="Como tocar?"
          description={
            playingNow
              ? 'Toca para todos na sala, depois do que está tocando agora.'
              : 'Toca para todos na sala.'
          }
          className="w-[min(520px,calc(100vw-2rem))]"
        >
          <div className="flex flex-col gap-4 px-6 pb-6">
            <div className="bg-surface-2 flex items-center gap-3 rounded-2xl p-3">
              <img
                src={youtubeThumb(first.videoId)}
                alt=""
                className="aspect-video w-28 shrink-0 rounded-lg object-cover"
              />
              <div className="min-w-0">
                {res.playlistTitle ? (
                  <>
                    <p className="flex items-center gap-1.5 truncate font-medium">
                      <ListMusic className="size-4 shrink-0" />
                      <span className="truncate">{res.playlistTitle}</span>
                    </p>
                    <p className="text-muted text-sm">
                      {res.items.length} {res.items.length === 1 ? 'vídeo' : 'vídeos'}
                      {total > 0 && ` · ${formatTime(total)}`}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="line-clamp-2 font-medium">{first.title}</p>
                    <p className="text-muted truncate text-sm">
                      {first.channel}
                      {first.durationS > 0 ? ` · ${formatTime(first.durationS)}` : ' · ao vivo'}
                    </p>
                  </>
                )}
                {res.skipped > 0 && (
                  <p className="text-warning mt-0.5 text-xs">
                    {res.skipped === 1
                      ? '1 vídeo ficou de fora (privado ou bloqueado fora do YouTube).'
                      : `${res.skipped} vídeos ficaram de fora (privados ou bloqueados fora do YouTube).`}
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <ModeOption
                autoFocus
                icon={<Headphones />}
                title="Só áudio"
                description="Um player pequeno aparece no canto da tela de todos."
                onClick={() => onChoose('audio')}
              />
              <ModeOption
                icon={<MonitorPlay />}
                title="Áudio e vídeo"
                description="Abre uma watch party no palco, como uma tela compartilhada."
                onClick={() => onChoose('video')}
              />
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  )
}
