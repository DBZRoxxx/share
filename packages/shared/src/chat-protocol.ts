import { z } from 'zod'
import { CHAT_TEXT_MAX, gifSchema } from './chat'

/**
 * Chat protocol since v0.3: messages (text, GIF, file) and actions on them
 * (react, edit, delete, file-ready), stored on the server and replayed by
 * clients with `applyChatEvent`.
 *
 * Import it as `@share/shared/chat`. It is kept out of the package index on
 * purpose: the desktop main process bundles that index, and any change to it
 * changes the app's shell hash and turns an interface-only release into a
 * full update. `./chat` (the v0.2 wire format) must stay as it is for the
 * same reason.
 */

export {
  CHAT_SYNC_MAX,
  CHAT_TEXT_MAX,
  chatHistorySchema,
  gifQuerySchema,
  gifSchema,
  isEmojiOnly,
  isGifMediaUrl,
  parseChatHistory,
  type ChatHistory,
  type Gif,
  type GifPage,
} from './chat'

/** Messages kept in memory per room. */
export const CHAT_HISTORY_MAX = 500
/** Largest file that can be attached to a message. */
export const ATTACHMENT_MAX = 100 * 1024 * 1024
/** Chat and attachments are kept this long after a room's last message. */
export const CHAT_RETENTION_DAYS = 7
/** Events (messages and actions) kept per room on the server. */
export const CHAT_EVENTS_MAX = 5000
/** Events per request when syncing with the server. */
export const CHAT_BATCH_MAX = 50
export const REPLY_SNIPPET_MAX = 140

export const eventIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/)

const base = {
  v: z.literal(1),
  id: eventIdSchema,
  ts: z.number().int().positive(),
}

/** Quote of the message being replied to, embedded so it survives the original. */
export const replyToSchema = z.object({
  id: eventIdSchema,
  from: z.string().max(64),
  fromName: z.string().max(64),
  kind: z.enum(['text', 'gif', 'image', 'file']),
  snippet: z.string().max(REPLY_SNIPPET_MAX),
})

export type ReplyTo = z.infer<typeof replyToSchema>

const THUMB_RE = /^data:image\/(?:jpeg|webp|png);base64,[A-Za-z0-9+/]+={0,2}$/

export const attachmentSchema = z.object({
  id: eventIdSchema,
  name: z.string().trim().min(1).max(200),
  size: z.number().int().min(0).max(ATTACHMENT_MAX),
  mime: z.string().max(127),
  width: z.number().int().positive().max(20_000).optional(),
  height: z.number().int().positive().max(20_000).optional(),
  /** Small JPEG preview for images, shown until the full file is downloaded. */
  thumb: z
    .string()
    .max(64 * 1024)
    .regex(THUMB_RE)
    .optional(),
})

export type Attachment = z.infer<typeof attachmentSchema>

const messageBase = { ...base, replyTo: replyToSchema.optional() }

/** Payload of a chat message on the wire (the author comes from the transport). */
export const chatPayloadSchema = z.discriminatedUnion('kind', [
  z.object({
    ...messageBase,
    kind: z.literal('text'),
    text: z.string().trim().min(1).max(CHAT_TEXT_MAX),
  }),
  z.object({ ...messageBase, kind: z.literal('gif'), gif: gifSchema }),
  z.object({
    ...messageBase,
    kind: z.literal('file'),
    text: z.string().trim().max(CHAT_TEXT_MAX).optional(),
    file: attachmentSchema,
  }),
])

export type ChatPayload = z.infer<typeof chatPayloadSchema>

const actionBase = { ...base, target: eventIdSchema }

/** Changes to an existing message. */
export const chatActionSchema = z.discriminatedUnion('kind', [
  /** One reaction per person (like WhatsApp); null removes it. */
  z.object({
    ...actionBase,
    kind: z.literal('react'),
    emoji: z.string().min(1).max(16).nullable(),
  }),
  z.object({ ...actionBase, kind: z.literal('edit'), text: z.string().trim().max(CHAT_TEXT_MAX) }),
  z.object({ ...actionBase, kind: z.literal('delete') }),
  /** The attachment finished uploading and can be downloaded. */
  z.object({ ...actionBase, kind: z.literal('file-ready') }),
])

export type ChatAction = z.infer<typeof chatActionSchema>

export const chatEventSchema = z.union([chatPayloadSchema, chatActionSchema])

export type ChatEvent = ChatPayload | ChatAction

export const isChatAction = (event: ChatEvent): event is ChatAction =>
  event.kind === 'react' ||
  event.kind === 'edit' ||
  event.kind === 'delete' ||
  event.kind === 'file-ready'

/** An event with its author, as stored on the server and replayed by clients. */
export interface ChatEnvelope {
  /** Server order; absent for events received live before the server saw them. */
  seq?: number
  from: string
  fromName: string
  event: ChatEvent
}

export interface ChatEventsResponse {
  events: (ChatEnvelope & { seq: number })[]
  /** Seq of the last event returned (pass back as `after`). */
  cursor: number
  /** More events after `cursor`: ask again. */
  more: boolean
}

export const chatPostSchema = z.object({
  events: z.array(z.unknown()).min(1).max(CHAT_BATCH_MAX),
})

export interface ChatPostResponse {
  /** Ids the server stored now or already had. */
  accepted: string[]
  /** Ids refused for good (invalid, not the author…); do not retry them. */
  rejected: { id: string; reason: string }[]
}

export interface ChatFileUrlResponse {
  url: string
  /** ms since epoch */
  expiresAt: number
}

export interface ChatMessage {
  payload: ChatPayload
  /** LiveKit identity of the author. */
  from: string
  /** Display name at the time the message was sent (for authors who already left). */
  fromName: string
  /** identity → emoji */
  reactions?: Record<string, string>
  editedAt?: number
  deleted?: boolean
  /** For attachments: the upload finished. */
  uploaded?: boolean
}

export function parseChatPayload(raw: string): ChatPayload | null {
  try {
    const result = chatPayloadSchema.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function parseChatEvent(raw: string): ChatEvent | null {
  try {
    const result = chatEventSchema.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

/** Merges messages by id, sorted by timestamp, keeping the newest `max`. */
export function mergeChatMessages(
  current: ChatMessage[],
  incoming: ChatMessage[],
  max = CHAT_HISTORY_MAX,
): ChatMessage[] {
  const byId = new Map(current.map((m) => [m.payload.id, m]))
  let changed = false
  for (const m of incoming) {
    if (byId.has(m.payload.id)) continue
    byId.set(m.payload.id, m)
    changed = true
  }
  if (!changed) return current
  const merged = [...byId.values()].sort(
    (a, b) => a.payload.ts - b.payload.ts || a.payload.id.localeCompare(b.payload.id),
  )
  return merged.length > max ? merged.slice(merged.length - max) : merged
}

export type ApplyResult =
  | { status: 'applied'; messages: ChatMessage[] }
  /** Already known; nothing changed. */
  | { status: 'duplicate' }
  /** The target message is not known (yet). */
  | { status: 'pending' }
  | { status: 'rejected'; reason: string }

/**
 * Folds one event into the message list. Pure and idempotent, used both for
 * live events and when replaying the server log. Edits, deletes and upload
 * confirmations are only accepted from the message's author.
 */
export function applyChatEvent(
  messages: ChatMessage[],
  { from, fromName, event }: ChatEnvelope,
  max = CHAT_HISTORY_MAX,
): ApplyResult {
  if (!isChatAction(event)) {
    if (messages.some((m) => m.payload.id === event.id)) return { status: 'duplicate' }
    return {
      status: 'applied',
      messages: mergeChatMessages(messages, [{ payload: event, from, fromName }], max),
    }
  }

  const index = messages.findIndex((m) => m.payload.id === event.target)
  if (index === -1) return { status: 'pending' }
  const target = messages[index]!
  if (target.deleted) return { status: 'duplicate' }

  let next: ChatMessage
  switch (event.kind) {
    case 'react': {
      if ((target.reactions?.[from] ?? null) === event.emoji) return { status: 'duplicate' }
      const reactions = { ...target.reactions }
      if (event.emoji) reactions[from] = event.emoji
      else delete reactions[from]
      next = { ...target, reactions }
      break
    }
    case 'edit': {
      if (target.from !== from) return { status: 'rejected', reason: 'not the author' }
      const { payload } = target
      if (payload.kind === 'text') {
        if (!event.text) return { status: 'rejected', reason: 'empty text' }
        if (payload.text === event.text) return { status: 'duplicate' }
        next = { ...target, payload: { ...payload, text: event.text }, editedAt: event.ts }
      } else if (payload.kind === 'file') {
        const text = event.text || undefined
        if (payload.text === text) return { status: 'duplicate' }
        next = { ...target, payload: { ...payload, text }, editedAt: event.ts }
      } else {
        return { status: 'rejected', reason: 'not editable' }
      }
      break
    }
    case 'delete':
      if (target.from !== from) return { status: 'rejected', reason: 'not the author' }
      next = { ...target, deleted: true, reactions: {} }
      break
    case 'file-ready':
      if (target.from !== from) return { status: 'rejected', reason: 'not the author' }
      if (target.payload.kind !== 'file') return { status: 'rejected', reason: 'not a file' }
      if (target.uploaded) return { status: 'duplicate' }
      next = { ...target, uploaded: true }
      break
  }
  const copy = messages.slice()
  copy[index] = next
  return { status: 'applied', messages: copy }
}

export const isImageMime = (mime: string) => /^image\/(?:png|jpeg|gif|webp|bmp|avif)$/.test(mime)

const clip = (s: string, max = REPLY_SNIPPET_MAX) =>
  s.length > max ? `${s.slice(0, max - 1)}…` : s

/** Short text describing a message (notifications, reply quotes). */
export function messageSnippet(payload: ChatPayload): { kind: ReplyTo['kind']; snippet: string } {
  switch (payload.kind) {
    case 'text':
      return { kind: 'text', snippet: clip(payload.text) }
    case 'gif':
      return { kind: 'gif', snippet: 'GIF' }
    case 'file': {
      const image = isImageMime(payload.file.mime)
      return {
        kind: image ? 'image' : 'file',
        snippet: clip(payload.text || (image ? 'Foto' : payload.file.name)),
      }
    }
  }
}

/** Removes characters Windows does not allow in file names. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_')
    .replace(/[. ]+$/, '')
    .trim()
  const safe = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i.test(cleaned) ? `_${cleaned}` : cleaned
  return (safe || 'arquivo').slice(0, 200)
}

const DAY_MS = 86_400_000

function startOfDay(ts: number): number {
  const d = new Date(ts)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

export function sameDay(a: number, b: number): boolean {
  return startOfDay(a) === startOfDay(b)
}

const weekday = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' })
const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' })
const dayMonthYear = new Intl.DateTimeFormat('pt-BR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

/** "Hoje", "Ontem", the weekday within the last week, then the date. */
export function dayLabel(ts: number, now = Date.now()): string {
  const days = Math.round((startOfDay(now) - startOfDay(ts)) / DAY_MS)
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  if (days > 1 && days < 7) {
    const name = weekday.format(ts)
    return name.charAt(0).toUpperCase() + name.slice(1)
  }
  return new Date(ts).getFullYear() === new Date(now).getFullYear()
    ? dayMonth.format(ts)
    : dayMonthYear.format(ts)
}
