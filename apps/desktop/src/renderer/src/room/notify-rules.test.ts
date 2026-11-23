import type { ChatEnvelope, ChatMessage } from '@share/shared/chat'
import { describe, expect, it } from 'vitest'
import type { NotificationPrefs } from '@/stores/prefs'
import { chatNotice } from './notify-rules'

const prefs: NotificationPrefs = {
  messages: true,
  replies: true,
  reactions: 'all',
  joinLeave: true,
  desktop: true,
  sounds: true,
  volume: 0.6,
}

const mine: ChatMessage = {
  payload: { v: 1, id: 'm1', ts: 1, kind: 'text', text: 'minha mensagem' },
  from: 'me',
  fromName: 'Eu',
}
const bruno: ChatMessage = {
  payload: { v: 1, id: 'm2', ts: 2, kind: 'text', text: 'do bruno' },
  from: 'bruno',
  fromName: 'Bruno',
}
const messages = [mine, bruno]

const text = (from: string, extra: Record<string, unknown> = {}): ChatEnvelope => ({
  from,
  fromName: from === 'ana' ? 'Ana' : from,
  event: { v: 1, id: 'n1', ts: 3, kind: 'text', text: 'oi gente', ...extra } as never,
})
const react = (target: string, emoji: string | null, from = 'ana'): ChatEnvelope => ({
  from,
  fromName: 'Ana',
  event: { v: 1, id: 'r1', ts: 3, kind: 'react', target, emoji },
})

const ctx = (p: Partial<NotificationPrefs> = {}) => ({
  me: 'me',
  prefs: { ...prefs, ...p },
  messages,
})

describe('chatNotice', () => {
  it('announces messages from others, never my own', () => {
    expect(chatNotice(text('ana'), ctx())).toMatchObject({
      kind: 'message',
      title: 'Ana',
      body: 'oi gente',
    })
    expect(chatNotice(text('me'), ctx())).toBeNull()
    expect(chatNotice(text('ana'), ctx({ messages: false }))).toBeNull()
  })

  it('calls out replies to me, falling back to a plain message when replies are off', () => {
    const reply = text('ana', {
      replyTo: { id: 'm1', from: 'me', fromName: 'Eu', kind: 'text', snippet: 'minha' },
    })
    expect(chatNotice(reply, ctx())).toMatchObject({ kind: 'reply', title: 'Ana respondeu você' })
    expect(chatNotice(reply, ctx({ replies: false }))).toMatchObject({ kind: 'message' })
    const toBruno = text('ana', {
      replyTo: { id: 'm2', from: 'bruno', fromName: 'Bruno', kind: 'text', snippet: 'do' },
    })
    expect(chatNotice(toBruno, ctx())).toMatchObject({ kind: 'message' })
  })

  it('announces reactions according to the setting', () => {
    expect(chatNotice(react('m1', '👍'), ctx())).toMatchObject({
      kind: 'reaction',
      title: 'Ana reagiu 👍',
      body: 'à sua mensagem: “minha mensagem”',
      messageId: 'm1',
    })
    expect(chatNotice(react('m2', '❤️'), ctx())?.body).toBe('à mensagem de Bruno: “do bruno”')
    expect(chatNotice(react('m2', '❤️'), ctx({ reactions: 'mine' }))).toBeNull()
    expect(chatNotice(react('m1', '❤️'), ctx({ reactions: 'mine' }))).not.toBeNull()
    expect(chatNotice(react('m1', '👍'), ctx({ reactions: 'off' }))).toBeNull()
  })

  it('ignores removed reactions, unknown targets and my own reactions', () => {
    expect(chatNotice(react('m1', null), ctx())).toBeNull()
    expect(chatNotice(react('zz', '👍'), ctx())).toBeNull()
    expect(chatNotice(react('m2', '👍', 'me'), ctx())).toBeNull()
  })
})
