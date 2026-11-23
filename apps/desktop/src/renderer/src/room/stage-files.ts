import { ATTACHMENT_MAX, isImageMime } from '@share/shared/chat'
import { toast } from 'sonner'
import { useChat, type StagedFile } from './chat-store'

const stamp = new Intl.DateTimeFormat('pt-BR', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Pasted screenshots arrive as "image.png"; give them a useful name. */
function nameFor(file: File): File {
  if (!/^image\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name)) return file
  const ext = file.name.split('.').pop()
  const when = stamp.format(new Date()).replace(/\//g, '-').replace(', ', ' ').replace(/:/g, '.')
  return new File([file], `Captura de tela ${when}.${ext}`, { type: file.type })
}

/** Puts files in the composer tray (paste, drop or the clip button). */
export function stageFiles(files: File[]) {
  const ok: StagedFile[] = []
  for (const raw of files) {
    if (raw.size > ATTACHMENT_MAX) {
      toast.error(`“${raw.name}” passa de 100 MB e não pode ser enviado.`)
      continue
    }
    const file = nameFor(raw)
    ok.push({
      key: crypto.randomUUID(),
      file,
      preview: isImageMime(file.type) ? URL.createObjectURL(file) : undefined,
    })
  }
  if (ok.length) useChat.getState().stage(ok)
}
