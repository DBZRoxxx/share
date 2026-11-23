import {
  isChatAction,
  isImageMime,
  messageSnippet,
  type ChatEnvelope,
  type ChatMessage,
  type ChatPayload,
} from '@share/shared/chat'
import type { NotificationPrefs } from '@/stores/prefs'

/**
 * Which chat events deserve a notification, and what it says. Pure, so the
 * rules can be tested without a window, a room or a sound card.
 */

export type ChatNoticeKind = 'message' | 'reply' | 'reaction'

export interface ChatNotice {
  kind: ChatNoticeKind
  title: string
  body: string
  /** Message to show when the notification is clicked. */
  messageId: string
}

/** One-line description of a message (notifications, toasts). */
export function preview(payload: ChatPayload): string {
  if (payload.kind === 'file') {
    const image = isImageMime(payload.file.mime)
    const label = image ? '📷 Foto' : `📎 ${payload.file.name}`
    return payload.text ? `${label} · ${payload.text}` : label
  }
  return messageSnippet(payload).snippet
}

const quote = (s: string) => `“${s.length > 80 ? `${s.slice(0, 79)}…` : s}”`

/**
 * The notice for an event received live, or null when the user doesn't want
 * one. `messages` is the chat after the event was applied.
 */
export function chatNotice(
  { from, fromName, event }: ChatEnvelope,
  ctx: { me: string; prefs: NotificationPrefs; messages: ChatMessage[] },
): ChatNotice | null {
  if (from === ctx.me) return null
  const { prefs } = ctx

  if (!isChatAction(event)) {
    if (event.replyTo?.from === ctx.me && prefs.replies) {
      return {
        kind: 'reply',
        title: `${fromName} respondeu você`,
        body: preview(event),
        messageId: event.id,
      }
    }
    if (!prefs.messages) return null
    return { kind: 'message', title: fromName, body: preview(event), messageId: event.id }
  }

  if (event.kind !== 'react' || !event.emoji || prefs.reactions === 'off') return null
  const target = ctx.messages.find((m) => m.payload.id === event.target)
  if (!target || target.deleted) return null
  const mine = target.from === ctx.me
  if (prefs.reactions === 'mine' && !mine) return null
  const whose = mine ? 'à sua mensagem' : `à mensagem de ${target.fromName}`
  return {
    kind: 'reaction',
    title: `${fromName} reagiu ${event.emoji}`,
    body: `${whose}: ${quote(preview(target.payload))}`,
    messageId: target.payload.id,
  }
}
