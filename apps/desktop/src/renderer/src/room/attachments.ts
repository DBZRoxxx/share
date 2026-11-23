import { isImageMime, sanitizeFileName, type Attachment } from '@share/shared/chat'
import { create } from 'zustand'
import { ChatApiError, chatApi } from '@/lib/chat-api'
import { fileDelete, fileGet, filePut } from './chat-cache'

/** Images up to this size download by themselves when they appear. */
export const AUTO_DOWNLOAD_MAX = 25 * 1024 * 1024
/** Only images this small are kept in the local cache. */
const CACHE_MAX = 25 * 1024 * 1024

export type FileState =
  | { status: 'uploading'; progress: number }
  | { status: 'failed'; error: string }
  | { status: 'downloading'; progress: number | null }
  | { status: 'ready'; url: string }
  | { status: 'unavailable'; error: string }

interface AttachmentsState {
  files: Record<string, FileState>
}

export const useAttachments = create<AttachmentsState>()(() => ({ files: {} }))

const setFile = (fileId: string, state: FileState) =>
  useAttachments.setState((s) => ({ files: { ...s.files, [fileId]: state } }))

/** Bytes kept in memory per attachment (own files are disk-backed File objects). */
const blobs = new Map<string, Blob>()
const urls = new Map<string, string>()
/** Own files still needed for a retry. */
const pendingUploads = new Map<string, { roomId: string; file: File; onDone: () => void }>()
const inflight = new Map<string, Promise<Blob | null>>()
const controllers = new Set<AbortController>()

function urlFor(fileId: string, blob: Blob): string {
  let url = urls.get(fileId)
  if (!url) {
    url = URL.createObjectURL(blob)
    urls.set(fileId, url)
  }
  return url
}

function makeReady(fileId: string, blob: Blob) {
  blobs.set(fileId, blob)
  setFile(fileId, { status: 'ready', url: urlFor(fileId, blob) })
}

/** Uploads one of our own attachments; `onDone` announces it to the room. */
export function uploadAttachment(roomId: string, fileId: string, file: File, onDone: () => void) {
  pendingUploads.set(fileId, { roomId, file, onDone })
  blobs.set(fileId, file)
  urlFor(fileId, file)
  setFile(fileId, { status: 'uploading', progress: 0 })
  if (isImageMime(file.type) && file.size <= CACHE_MAX) void filePut(fileId, file)

  const controller = new AbortController()
  controllers.add(controller)
  chatApi
    .upload(
      roomId,
      fileId,
      file,
      (progress) => setFile(fileId, { status: 'uploading', progress }),
      controller.signal,
    )
    .then(() => {
      pendingUploads.delete(fileId)
      makeReady(fileId, file)
      onDone()
    })
    .catch((error: unknown) => {
      if (controller.signal.aborted) return
      console.error('[attachments] upload failed', error)
      setFile(fileId, { status: 'failed', error: 'Falha no envio' })
    })
    .finally(() => controllers.delete(controller))
}

export function canRetryUpload(fileId: string) {
  return pendingUploads.has(fileId)
}

export function retryUpload(fileId: string) {
  const pending = pendingUploads.get(fileId)
  if (pending) uploadAttachment(pending.roomId, fileId, pending.file, pending.onDone)
}

/**
 * Gets the bytes of an attachment: memory, then the local cache, then the
 * server (with progress). Concurrent calls share one download.
 */
export function downloadAttachment(roomId: string, file: Attachment): Promise<Blob | null> {
  const known = blobs.get(file.id)
  if (known) {
    makeReady(file.id, known)
    return Promise.resolve(known)
  }
  let job = inflight.get(file.id)
  if (!job) {
    job = fetchAttachment(roomId, file).finally(() => inflight.delete(file.id))
    inflight.set(file.id, job)
  }
  return job
}

/**
 * "Upload finished" reaches the room over LiveKit before the sender's outbox
 * has stored it on the server, so a 404 right after it is expected: retry a
 * few times before calling the file missing.
 */
async function signedUrl(roomId: string, fileId: string, signal: AbortSignal): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      return (await chatApi.fileUrl(roomId, fileId)).url
    } catch (error) {
      const notYet = error instanceof ChatApiError && (error.status === 404 || error.transient)
      if (!notYet || attempt >= 5 || signal.aborted) throw error
      await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)))
    }
  }
}

async function fetchAttachment(roomId: string, file: Attachment): Promise<Blob | null> {
  const cached = await fileGet(file.id)
  if (cached) {
    makeReady(file.id, cached)
    return cached
  }
  setFile(file.id, { status: 'downloading', progress: null })
  const controller = new AbortController()
  controllers.add(controller)
  try {
    const url = await signedUrl(roomId, file.id, controller.signal)
    const res = await fetch(url, { signal: controller.signal })
    if (res.status === 404 || res.status === 410) {
      setFile(file.id, { status: 'unavailable', error: 'Arquivo expirou' })
      return null
    }
    if (!res.ok || !res.body) throw new Error(`download failed (${res.status})`)
    const reader = res.body.getReader()
    const chunks: Uint8Array<ArrayBuffer>[] = []
    let received = 0
    let lastShown = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      received += value.byteLength
      const percent = file.size ? Math.min(100, Math.round((received / file.size) * 100)) : null
      if (percent !== null && percent - lastShown >= 2) {
        lastShown = percent
        setFile(file.id, { status: 'downloading', progress: percent })
      }
    }
    const blob = new Blob(chunks, { type: file.mime || 'application/octet-stream' })
    if (isImageMime(file.mime) && blob.size <= CACHE_MAX) void filePut(file.id, blob)
    makeReady(file.id, blob)
    return blob
  } catch (error) {
    if (controller.signal.aborted) return null
    console.error('[attachments] download failed', error)
    const gone = error instanceof ChatApiError && error.status === 404
    setFile(file.id, {
      status: 'unavailable',
      error: gone ? 'Arquivo não está mais disponível' : 'Falha ao baixar — tente de novo',
    })
    return null
  } finally {
    controllers.delete(controller)
  }
}

/** Saves an attachment to disk (Electron shows the "Save as" dialog). */
export async function saveAttachment(roomId: string, file: Attachment) {
  const blob = await downloadAttachment(roomId, file)
  if (!blob) return false
  const a = document.createElement('a')
  a.href = urlFor(file.id, blob)
  a.download = sanitizeFileName(file.name)
  document.body.append(a)
  a.click()
  a.remove()
  return true
}

/** The message was deleted: free its bytes everywhere. */
export function forgetAttachment(fileId: string) {
  const url = urls.get(fileId)
  if (url) URL.revokeObjectURL(url)
  urls.delete(fileId)
  blobs.delete(fileId)
  pendingUploads.delete(fileId)
  void fileDelete(fileId)
  useAttachments.setState((s) => {
    const files = { ...s.files }
    delete files[fileId]
    return { files }
  })
}

/** Leaving the room: stop transfers and release memory. */
export function resetAttachments() {
  for (const c of controllers) c.abort()
  controllers.clear()
  for (const url of urls.values()) URL.revokeObjectURL(url)
  urls.clear()
  blobs.clear()
  pendingUploads.clear()
  inflight.clear()
  useAttachments.setState({ files: {} })
}

const EXECUTABLE = /\.(exe|msi|bat|cmd|com|scr|ps1|vbs|js|jar|lnk|reg|hta|cpl|msix|appx)$/i
export const isExecutable = (name: string) => EXECUTABLE.test(name)

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: value < 10 ? 1 : 0 })} ${units[unit]}`
}

/** Width, height and a small JPEG preview for an image about to be sent. */
export async function describeImage(
  file: File,
): Promise<Pick<Attachment, 'width' | 'height' | 'thumb'>> {
  try {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    let thumb: string | undefined
    for (const [max, quality] of [
      [320, 0.72],
      [200, 0.6],
      [120, 0.5],
    ] as const) {
      const scale = Math.min(1, max / Math.max(width, height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) break
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const data = canvas.toDataURL('image/jpeg', quality)
      if (data.length <= 60 * 1024) {
        thumb = data
        break
      }
    }
    bitmap.close()
    return { width, height, thumb }
  } catch {
    return {}
  }
}
