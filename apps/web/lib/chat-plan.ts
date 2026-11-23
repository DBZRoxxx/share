import { chatEventSchema, isChatAction, type ChatEvent } from '@share/shared/chat'
import type { RoomCaller } from './room-auth'

/** Client clocks further off than this get the server time. */
export const MAX_CLOCK_SKEW_MS = 30_000

/**
 * Per-room metadata hash fields:
 *   m:<msgId>   author identity
 *   mf:<msgId>  attachment id of that message
 *   f:<fileId>  message that owns the attachment
 *   p:<fileId>  blob pathname once uploaded
 */
export const metaKey = {
  author: (msgId: string) => `m:${msgId}`,
  fileOf: (msgId: string) => `mf:${msgId}`,
  owner: (fileId: string) => `f:${fileId}`,
  path: (fileId: string) => `p:${fileId}`,
}

export interface PlannedEvent {
  id: string
  /** Stored log member: the envelope without its seq. */
  member: string
  meta: [string, string][]
  /** Attachment whose blob must be deleted after this event is stored. */
  deleteFileId?: string
}

export interface Plan {
  planned: PlannedEvent[]
  rejected: { id: string; reason: string }[]
}

/**
 * Validates a batch of events from one caller against the room's metadata
 * and prepares them for storage. Authorship rules mirror `applyChatEvent`, so
 * the log never holds an edit or delete a client would refuse.
 */
export async function planEvents({
  caller,
  raw,
  getMeta,
  findUpload,
  now = Date.now(),
}: {
  caller: RoomCaller
  raw: unknown[]
  getMeta: (fields: string[]) => Promise<Map<string, string>>
  /** Pathname of the uploaded blob for an attachment, or null if missing. */
  findUpload: (fileId: string) => Promise<string | null>
  now?: number
}): Promise<Plan> {
  const rejected: Plan['rejected'] = []
  const events: ChatEvent[] = []
  for (const item of raw) {
    const parsed = chatEventSchema.safeParse(item)
    if (parsed.success) events.push(parsed.data)
    else rejected.push({ id: idOf(item), reason: 'invalid' })
  }

  const fields = new Set<string>()
  for (const e of events) {
    if (isChatAction(e)) {
      fields.add(metaKey.author(e.target))
      fields.add(metaKey.fileOf(e.target))
    } else {
      fields.add(metaKey.author(e.id))
      if (e.kind === 'file') fields.add(metaKey.owner(e.file.id))
    }
  }
  const meta = await getMeta([...fields])

  const planned: PlannedEvent[] = []
  for (const event of events) {
    if (Math.abs(event.ts - now) > MAX_CLOCK_SKEW_MS) event.ts = now
    const writes: [string, string][] = []
    let deleteFileId: string | undefined
    const reject = (reason: string) => rejected.push({ id: event.id, reason })

    if (!isChatAction(event)) {
      const author = meta.get(metaKey.author(event.id))
      if (author && author !== caller.identity) {
        reject('id in use')
        continue
      }
      writes.push([metaKey.author(event.id), caller.identity])
      if (event.kind === 'file') {
        const owner = meta.get(metaKey.owner(event.file.id))
        if (owner && owner !== event.id) {
          reject('file in use')
          continue
        }
        writes.push(
          [metaKey.fileOf(event.id), event.file.id],
          [metaKey.owner(event.file.id), event.id],
        )
      }
    } else {
      const author = meta.get(metaKey.author(event.target))
      // Reactions to a message that has not reached the server yet are fine
      // (clients ignore orphans); changing a message needs to know its author.
      if (event.kind !== 'react') {
        if (!author) {
          reject('unknown message')
          continue
        }
        if (author !== caller.identity) {
          reject('not the author')
          continue
        }
      }
      const fileId = meta.get(metaKey.fileOf(event.target))
      if (event.kind === 'file-ready') {
        if (!fileId) {
          reject('not a file')
          continue
        }
        const path = await findUpload(fileId)
        if (!path) {
          reject('upload not found')
          continue
        }
        writes.push([metaKey.path(fileId), path])
      }
      if (event.kind === 'delete' && fileId) deleteFileId = fileId
    }

    for (const [k, v] of writes) meta.set(k, v)
    planned.push({
      id: event.id,
      member: JSON.stringify({ from: caller.identity, fromName: caller.name, event }),
      meta: writes,
      deleteFileId,
    })
  }
  return { planned, rejected }
}

function idOf(item: unknown): string {
  const id = (item as { id?: unknown } | null)?.id
  return typeof id === 'string' ? id.slice(0, 64) : '?'
}

/** Blob pathname prefix for an attachment; uploads must stay inside it. */
export const uploadPrefix = (roomId: string, fileId: string) => `rooms/${roomId}/${fileId}/`
