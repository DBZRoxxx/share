import { isImageMime, type Attachment } from '@share/shared/chat'
import {
  AlertTriangle,
  Download,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileText,
  FileVideo,
  Loader2,
  RotateCw,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import {
  AUTO_DOWNLOAD_MAX,
  canRetryUpload,
  downloadAttachment,
  formatBytes,
  isExecutable,
  retryUpload,
  saveAttachment,
  useAttachments,
  type FileState,
} from './attachments'
import { chatActions } from './use-chat'

const MAX_W = 260
const MAX_H = 260

export function useFileState(file: Attachment): FileState | undefined {
  return useAttachments((s) => s.files[file.id])
}

/** Starts the automatic download of small images once they are uploaded. */
function useAutoDownload(file: Attachment, uploaded: boolean, state: FileState | undefined) {
  useEffect(() => {
    const roomId = chatActions.roomId()
    if (!roomId || state || !uploaded) return
    if (isImageMime(file.mime) && file.size <= AUTO_DOWNLOAD_MAX) {
      void downloadAttachment(roomId, file)
    }
  }, [file, uploaded, state])
}

async function save(file: Attachment) {
  const roomId = chatActions.roomId()
  if (!roomId) return
  const ok = await saveAttachment(roomId, file)
  if (!ok) toast.error('Não foi possível baixar o arquivo.')
}

function download(file: Attachment) {
  const roomId = chatActions.roomId()
  if (roomId) void downloadAttachment(roomId, file)
}

/** Status line shared by images and files. */
function TransferStatus({
  state,
  uploaded,
  own,
  file,
}: {
  state: FileState | undefined
  uploaded: boolean
  own: boolean
  file: Attachment
}) {
  if (state?.status === 'uploading') return <>Enviando {Math.round(state.progress)}%</>
  if (state?.status === 'downloading') {
    return <>Baixando{state.progress !== null ? ` ${state.progress}%` : '…'}</>
  }
  if (state?.status === 'failed') return <>{state.error}</>
  if (state?.status === 'unavailable') return <>{state.error}</>
  if (!uploaded) {
    return own && !canRetryUpload(file.id) ? <>Envio interrompido</> : <>Enviando…</>
  }
  return <>{formatBytes(file.size)}</>
}

function progressOf(state: FileState | undefined): number | null {
  if (state?.status === 'uploading') return state.progress
  if (state?.status === 'downloading') return state.progress
  return null
}

export function ImageAttachment({
  file,
  uploaded,
  own,
  onOpen,
}: {
  file: Attachment
  uploaded: boolean
  own: boolean
  onOpen: (file: Attachment, url: string) => void
}) {
  const state = useFileState(file)
  useAutoDownload(file, uploaded, state)
  const w0 = file.width ?? 240
  const h0 = file.height ?? 180
  const scale = Math.min(1, MAX_W / w0, MAX_H / h0)
  const width = Math.max(80, Math.round(w0 * scale))
  const height = Math.max(60, Math.round(h0 * scale))
  const url = state?.status === 'ready' ? state.url : null
  const src = url ?? file.thumb
  const progress = progressOf(state)
  const needsClick = uploaded && !state && file.size > AUTO_DOWNLOAD_MAX

  return (
    <div
      className="bg-surface-3 relative mt-1 overflow-hidden rounded-xl"
      style={{ width, height, maxWidth: '100%' }}
    >
      {src && (
        <img
          src={src}
          alt={file.name}
          draggable={false}
          className={cn('size-full object-cover', !url && 'scale-105 blur-[2px]')}
        />
      )}
      {url ? (
        <button
          type="button"
          className="absolute inset-0 cursor-zoom-in"
          aria-label={`Abrir ${file.name}`}
          onClick={() => onOpen(file, url)}
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-black/35 p-2 text-center text-xs text-white">
          {needsClick || state?.status === 'unavailable' ? (
            <button
              type="button"
              onClick={() => download(file)}
              className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 font-medium hover:bg-black/75"
            >
              {state?.status === 'unavailable' ? (
                <RotateCw className="size-3.5" />
              ) : (
                <Download className="size-3.5" />
              )}
              {state?.status === 'unavailable' ? state.error : `Baixar · ${formatBytes(file.size)}`}
            </button>
          ) : state?.status === 'failed' ? (
            <RetryButton fileId={file.id} label={state.error} />
          ) : (
            <span className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5">
              <Loader2 className="size-3.5 animate-spin" />
              <TransferStatus state={state} uploaded={uploaded} own={own} file={file} />
            </span>
          )}
        </div>
      )}
      {progress !== null && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-black/40">
          <div className="bg-accent h-full transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  )
}

function RetryButton({ fileId, label }: { fileId: string; label: string }) {
  if (!canRetryUpload(fileId)) return <span>{label}</span>
  return (
    <button
      type="button"
      onClick={() => retryUpload(fileId)}
      className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 font-medium hover:bg-black/75"
    >
      <RotateCw className="size-3.5" /> {label} · Tentar de novo
    </button>
  )
}

function FileTypeIcon({ file }: { file: Attachment }) {
  const { mime, name } = file
  const cls = 'size-5'
  if (mime.startsWith('video/')) return <FileVideo className={cls} />
  if (mime.startsWith('audio/')) return <FileAudio className={cls} />
  if (/zip|rar|7z|tar|gzip/.test(mime) || /\.(zip|rar|7z|tar|gz)$/i.test(name)) {
    return <FileArchive className={cls} />
  }
  if (mime.startsWith('text/') || /pdf|document|sheet|presentation/.test(mime)) {
    return <FileText className={cls} />
  }
  return <FileIcon className={cls} />
}

export function FileAttachment({
  file,
  uploaded,
  own,
}: {
  file: Attachment
  uploaded: boolean
  own: boolean
}) {
  const state = useFileState(file)
  const progress = progressOf(state)
  const busy = state?.status === 'uploading' || state?.status === 'downloading'
  const ready = state?.status === 'ready'

  return (
    <div className="border-border bg-surface-2 mt-1 w-full max-w-[300px] overflow-hidden rounded-xl border">
      <div className="flex items-center gap-3 p-2.5">
        <div className="bg-surface-3 text-muted flex size-10 shrink-0 items-center justify-center rounded-lg">
          <FileTypeIcon file={file} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium" title={file.name}>
            {file.name}
          </p>
          <p className="text-muted text-xs">
            <TransferStatus state={state} uploaded={uploaded} own={own} file={file} />
          </p>
        </div>
        {state?.status === 'failed' && canRetryUpload(file.id) ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Tentar de novo"
            onClick={() => retryUpload(file.id)}
          >
            <RotateCw />
          </Button>
        ) : (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={ready ? 'Salvar' : 'Baixar'}
            title={ready ? 'Salvar' : 'Baixar'}
            disabled={!uploaded || busy}
            onClick={() => void save(file)}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Download />}
          </Button>
        )}
      </div>
      {progress !== null && (
        <div className="bg-surface-3 h-1">
          <div className="bg-accent h-full transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      )}
      {isExecutable(file.name) && (
        <p className="text-warning bg-warning/10 flex items-center gap-1.5 px-2.5 py-1.5 text-xs">
          <AlertTriangle className="size-3.5 shrink-0" /> Abra só se confiar em quem enviou.
        </p>
      )}
    </div>
  )
}

/** Full-size image viewer. */
export function ImageViewer({
  image,
  onClose,
}: {
  image: { file: Attachment; url: string } | null
  onClose: () => void
}) {
  const [saving, setSaving] = useState(false)
  return (
    <Dialog open={!!image} onOpenChange={(open) => !open && onClose()}>
      {image && (
        <DialogContent
          title={image.file.name}
          description={formatBytes(image.file.size)}
          className="w-[min(1200px,calc(100vw-2rem))]"
        >
          <div className="flex min-h-0 flex-1 items-center justify-center px-6">
            <img
              src={image.url}
              alt={image.file.name}
              className="max-h-[calc(100vh-14rem)] max-w-full rounded-lg object-contain"
            />
          </div>
          <div className="flex justify-end gap-2 px-6 py-4">
            <Button
              variant="primary"
              disabled={saving}
              onClick={() => {
                setSaving(true)
                void save(image.file).finally(() => setSaving(false))
              }}
            >
              <Download /> Salvar
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  )
}
