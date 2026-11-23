import { describe, expect, it } from 'vitest'
import {
  isEmojiOnly,
  isGifMediaUrl,
  mergeChatMessages,
  parseChatHistory,
  parseChatPayload,
  type ChatMessage,
  applyChatEvent,
  ATTACHMENT_MAX,
  dayLabel,
  messageSnippet,
  parseChatEvent,
  sameDay,
  sanitizeFileName,
} from './chat-protocol'

const gif = {
  id: 'g1',
  title: 'gato',
  url: 'https://static.klipy.com/a/md.gif',
  preview: 'https://static.klipy.com/a/sm.webp',
  width: 320,
  height: 240,
}

function msg(id: string, ts: number): ChatMessage {
  return { payload: { v: 1, id, ts, kind: 'text', text: id }, from: 'u', fromName: 'U' }
}

describe('parseChatPayload', () => {
  it('accepts text and gif messages', () => {
    expect(
      parseChatPayload(JSON.stringify({ v: 1, id: 'a', ts: 1, kind: 'text', text: 'oi' })),
    ).toMatchObject({ kind: 'text', text: 'oi' })
    expect(
      parseChatPayload(JSON.stringify({ v: 1, id: 'b', ts: 1, kind: 'gif', gif })),
    ).toMatchObject({ kind: 'gif' })
  })

  it('rejects junk, empty and oversized text', () => {
    expect(parseChatPayload('not json')).toBeNull()
    expect(
      parseChatPayload(JSON.stringify({ v: 1, id: 'a', ts: 1, kind: 'text', text: '  ' })),
    ).toBeNull()
    const long = 'x'.repeat(2001)
    expect(
      parseChatPayload(JSON.stringify({ v: 1, id: 'a', ts: 1, kind: 'text', text: long })),
    ).toBeNull()
  })

  it('rejects gifs from other hosts', () => {
    const evil = { ...gif, url: 'https://evil.example/track.gif' }
    expect(
      parseChatPayload(JSON.stringify({ v: 1, id: 'b', ts: 1, kind: 'gif', gif: evil })),
    ).toBeNull()
  })
})

describe('isGifMediaUrl', () => {
  it('only allows https on the provider CDN', () => {
    expect(isGifMediaUrl('https://static.klipy.com/x.gif')).toBe(true)
    expect(isGifMediaUrl('http://static.klipy.com/x.gif')).toBe(false)
    expect(isGifMediaUrl('https://klipy.com.evil.io/x.gif')).toBe(false)
    expect(isGifMediaUrl('javascript:alert(1)')).toBe(false)
  })
})

describe('parseChatHistory', () => {
  it('validates every message', () => {
    const ok = { v: 1, messages: [msg('a', 1)] }
    expect(parseChatHistory(JSON.stringify(ok))?.messages).toHaveLength(1)
    const bad = { v: 1, messages: [{ ...msg('a', 1), payload: { v: 1, id: 'a' } }] }
    expect(parseChatHistory(JSON.stringify(bad))).toBeNull()
  })
})

describe('mergeChatMessages', () => {
  it('dedupes by id and sorts by timestamp', () => {
    const merged = mergeChatMessages([msg('b', 2)], [msg('a', 1), msg('b', 2), msg('c', 3)])
    expect(merged.map((m) => m.payload.id)).toEqual(['a', 'b', 'c'])
  })

  it('returns the same array when nothing is new', () => {
    const current = [msg('a', 1)]
    expect(mergeChatMessages(current, [msg('a', 1)])).toBe(current)
  })

  it('keeps only the newest messages', () => {
    const merged = mergeChatMessages([], [msg('a', 1), msg('b', 2), msg('c', 3)], 2)
    expect(merged.map((m) => m.payload.id)).toEqual(['b', 'c'])
  })
})

describe('isEmojiOnly', () => {
  it('detects short emoji-only messages', () => {
    expect(isEmojiOnly('😂')).toBe(true)
    expect(isEmojiOnly('👍🏽 🔥')).toBe(true)
    expect(isEmojiOnly('👨‍👩‍👧')).toBe(true)
    expect(isEmojiOnly('oi 😂')).toBe(false)
    expect(isEmojiOnly('123')).toBe(false)
    expect(isEmojiOnly('😂😂😂😂😂😂😂')).toBe(false)
  })
})

describe('chat events', () => {
  const text = (id: string, ts = 1000, from = 'ana') => ({
    from,
    fromName: from,
    event: { v: 1 as const, id, ts, kind: 'text' as const, text: `msg ${id}` },
  })
  const action = (event: Record<string, unknown>, from = 'ana') => ({
    from,
    fromName: from,
    event: { v: 1, ts: 2000, ...event } as never,
  })
  const apply = (messages: ChatMessage[], e: Parameters<typeof applyChatEvent>[1]) => {
    const r = applyChatEvent(messages, e)
    if (r.status !== 'applied') throw new Error(r.status)
    return r.messages
  }

  it('parses messages and actions, rejecting bad ids', () => {
    expect(
      parseChatEvent(
        JSON.stringify({ v: 1, id: 'a', ts: 1, kind: 'react', target: 'm', emoji: '👍' }),
      ),
    ).toMatchObject({ kind: 'react' })
    expect(
      parseChatEvent(JSON.stringify({ v: 1, id: 'a b', ts: 1, kind: 'text', text: 'x' })),
    ).toBeNull()
    expect(
      parseChatEvent(
        JSON.stringify({
          v: 1,
          id: 'f',
          ts: 1,
          kind: 'file',
          text: 'olha',
          file: {
            id: 'x1',
            name: 'a.png',
            size: 10,
            mime: 'image/png',
            thumb: 'data:image/jpeg;base64,AAAA',
          },
        }),
      ),
    ).toMatchObject({ kind: 'file' })
    expect(
      parseChatEvent(
        JSON.stringify({
          v: 1,
          id: 'f',
          ts: 1,
          kind: 'file',
          file: { id: 'x1', name: 'a', size: ATTACHMENT_MAX + 1, mime: 'x' },
        }),
      ),
    ).toBeNull()
    expect(
      parseChatEvent(
        JSON.stringify({
          v: 1,
          id: 'f',
          ts: 1,
          kind: 'file',
          file: { id: 'x1', name: 'a', size: 1, mime: 'x', thumb: 'https://evil/x.png' },
        }),
      ),
    ).toBeNull()
  })

  it('v0.2 clients still read replies as plain text', () => {
    const raw = JSON.stringify({
      v: 1,
      id: 'r',
      ts: 1,
      kind: 'text',
      text: 'oi',
      replyTo: { id: 'm', from: 'a', fromName: 'A', kind: 'text', snippet: 'x' },
    })
    expect(parseChatPayload(raw)).toMatchObject({ kind: 'text', text: 'oi' })
  })

  it('adds messages once', () => {
    const m = apply([], text('a'))
    expect(applyChatEvent(m, text('a')).status).toBe('duplicate')
  })

  it('keeps one reaction per person', () => {
    let m = apply([], text('a'))
    m = apply(m, action({ id: 'r1', kind: 'react', target: 'a', emoji: '👍' }, 'bia'))
    m = apply(m, action({ id: 'r2', kind: 'react', target: 'a', emoji: '❤️' }, 'bia'))
    m = apply(m, action({ id: 'r3', kind: 'react', target: 'a', emoji: '👍' }, 'caio'))
    expect(m[0]!.reactions).toEqual({ bia: '❤️', caio: '👍' })
    m = apply(m, action({ id: 'r4', kind: 'react', target: 'a', emoji: null }, 'bia'))
    expect(m[0]!.reactions).toEqual({ caio: '👍' })
    expect(
      applyChatEvent(m, action({ id: 'r5', kind: 'react', target: 'a', emoji: null }, 'bia'))
        .status,
    ).toBe('duplicate')
  })

  it('only lets the author edit and delete', () => {
    let m = apply([], text('a'))
    expect(
      applyChatEvent(m, action({ id: 'e1', kind: 'edit', target: 'a', text: 'hack' }, 'bia'))
        .status,
    ).toBe('rejected')
    m = apply(m, action({ id: 'e2', kind: 'edit', target: 'a', text: 'corrigido' }))
    expect(m[0]).toMatchObject({ payload: { text: 'corrigido' }, editedAt: 2000 })
    expect(
      applyChatEvent(m, action({ id: 'e3', kind: 'edit', target: 'a', text: '' })).status,
    ).toBe('rejected')
    expect(applyChatEvent(m, action({ id: 'd1', kind: 'delete', target: 'a' }, 'bia')).status).toBe(
      'rejected',
    )
    m = apply(m, action({ id: 'd2', kind: 'delete', target: 'a' }))
    expect(m[0]!.deleted).toBe(true)
    expect(
      applyChatEvent(m, action({ id: 'r', kind: 'react', target: 'a', emoji: '👍' }, 'bia')).status,
    ).toBe('duplicate')
  })

  it('reports actions whose message is not known yet', () => {
    expect(
      applyChatEvent([], action({ id: 'r', kind: 'react', target: 'zz', emoji: '👍' })).status,
    ).toBe('pending')
  })

  it('marks attachments as uploaded and edits captions', () => {
    const file = {
      from: 'ana',
      fromName: 'Ana',
      event: {
        v: 1 as const,
        id: 'f',
        ts: 1,
        kind: 'file' as const,
        file: { id: 'x', name: 'a.pdf', size: 1, mime: 'application/pdf' },
      },
    }
    let m = apply([], file)
    expect(
      applyChatEvent(m, action({ id: 'u', kind: 'file-ready', target: 'f' }, 'bia')).status,
    ).toBe('rejected')
    m = apply(m, action({ id: 'u2', kind: 'file-ready', target: 'f' }))
    expect(m[0]!.uploaded).toBe(true)
    m = apply(m, action({ id: 'c', kind: 'edit', target: 'f', text: 'legenda' }))
    expect(m[0]!.payload).toMatchObject({ text: 'legenda' })
  })
})

describe('chat helpers', () => {
  it('labels days like a chat app', () => {
    const now = new Date(2026, 10, 23, 15, 0).getTime()
    expect(dayLabel(new Date(2026, 10, 23, 0, 5).getTime(), now)).toBe('Hoje')
    expect(dayLabel(new Date(2026, 10, 22, 23, 59).getTime(), now)).toBe('Ontem')
    expect(dayLabel(new Date(2026, 10, 19, 12).getTime(), now)).toBe('Quinta-feira')
    expect(dayLabel(new Date(2026, 9, 12, 12).getTime(), now)).toBe('12 de outubro')
    expect(dayLabel(new Date(2025, 9, 12, 12).getTime(), now)).toBe('12 de outubro de 2025')
    expect(sameDay(new Date(2026, 1, 1, 0, 1).getTime(), new Date(2026, 1, 1, 23).getTime())).toBe(
      true,
    )
  })

  it('describes messages for quotes', () => {
    expect(messageSnippet({ v: 1, id: 'a', ts: 1, kind: 'gif', gif })).toEqual({
      kind: 'gif',
      snippet: 'GIF',
    })
    expect(
      messageSnippet({
        v: 1,
        id: 'a',
        ts: 1,
        kind: 'file',
        file: { id: 'x', name: 'print.png', size: 1, mime: 'image/png' },
      }),
    ).toEqual({ kind: 'image', snippet: 'Foto' })
    expect(
      messageSnippet({ v: 1, id: 'a', ts: 1, kind: 'text', text: 'x'.repeat(300) }).snippet,
    ).toHaveLength(140)
  })

  it('sanitizes file names', () => {
    expect(sanitizeFileName('a<b>:c?.txt')).toBe('a_b_c_.txt')
    expect(sanitizeFileName('CON.txt')).toBe('_CON.txt')
    expect(sanitizeFileName('...')).toBe('arquivo')
  })
})
