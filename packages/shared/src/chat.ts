import { z } from 'zod'

export const CHAT_TEXT_MAX = 2000
/** Messages kept in memory per room. */
export const CHAT_HISTORY_MAX = 300
/** Messages sent to someone who joins late. */
export const CHAT_SYNC_MAX = 200

/**
 * GIF media may only come from the provider's CDN. Messages arrive from other
 * participants, so this keeps a peer from making everyone load arbitrary URLs
 * (tracking pixels, IP logging).
 */
export function isGifMediaUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'klipy.com' || url.hostname.endsWith('.klipy.com'))
    )
  } catch {
    return false
  }
}

const gifUrl = z.string().max(2048).refine(isGifMediaUrl, 'URL de GIF não permitida')

export const gifSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().max(200),
  /** Medium size, shown in the chat. */
  url: gifUrl,
  /** Small size, shown in the picker grid. */
  preview: gifUrl,
  width: z.number().int().positive().max(4096),
  height: z.number().int().positive().max(4096),
})

export type Gif = z.infer<typeof gifSchema>

export interface GifPage {
  gifs: Gif[]
  /** Next page number, or null when there is nothing more. */
  next: number | null
}

export const gifQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  page: z.coerce.number().int().min(1).max(50).default(1),
})

const base = {
  v: z.literal(1),
  id: z.string().min(1).max(64),
  ts: z.number().int().positive(),
}

/** Payload of a chat message on the wire (the author comes from the transport). */
export const chatPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('text'), text: z.string().trim().min(1).max(CHAT_TEXT_MAX) }),
  z.object({ ...base, kind: z.literal('gif'), gif: gifSchema }),
])

export type ChatPayload = z.infer<typeof chatPayloadSchema>

export interface ChatMessage {
  payload: ChatPayload
  /** LiveKit identity of the author. */
  from: string
  /** Display name at the time the message was sent (for authors who already left). */
  fromName: string
}

/** History handed to a late joiner. Authors are claimed by the sender here. */
export const chatHistorySchema = z.object({
  v: z.literal(1),
  messages: z
    .array(
      z.object({
        payload: chatPayloadSchema,
        from: z.string().max(64),
        fromName: z.string().max(64),
      }),
    )
    .max(CHAT_SYNC_MAX),
})

export type ChatHistory = z.infer<typeof chatHistorySchema>

export function parseChatPayload(raw: string): ChatPayload | null {
  try {
    const result = chatPayloadSchema.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

export function parseChatHistory(raw: string): ChatHistory | null {
  try {
    const result = chatHistorySchema.safeParse(JSON.parse(raw))
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

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\p{Emoji_Modifier}|\s)+$/u

/** True for short messages made only of emoji (rendered bigger). */
export function isEmojiOnly(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed || !EMOJI_ONLY.test(trimmed) || /^[\d#*\s]+$/.test(trimmed)) return false
  const count = [
    ...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed),
  ].filter((s) => s.segment.trim()).length
  return count <= 6
}
