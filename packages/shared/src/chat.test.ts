import { describe, expect, it } from 'vitest'
import {
  isEmojiOnly,
  isGifMediaUrl,
  mergeChatMessages,
  parseChatHistory,
  parseChatPayload,
  type ChatMessage,
} from './chat'

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
