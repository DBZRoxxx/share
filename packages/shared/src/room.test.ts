import { describe, expect, it } from 'vitest'
import {
  createRoomId,
  deepLinkUrl,
  formatRoomId,
  inviteUrl,
  isRoomId,
  normalizeRoomId,
  parseRoomInput,
} from './room'
import { tokenRequestSchema } from './token'

describe('createRoomId', () => {
  it('creates valid, distinct ids', () => {
    const ids = new Set(Array.from({ length: 500 }, () => createRoomId()))
    expect(ids.size).toBe(500)
    for (const id of ids) expect(isRoomId(id)).toBe(true)
  })

  it('rejects biased bytes', () => {
    // 255 is above the rejection limit and must be skipped.
    let call = 0
    const id = createRoomId((n) => {
      call++
      return new Uint8Array(n).fill(call === 1 ? 255 : 0)
    })
    expect(id).toBe('2222222222')
  })
})

describe('normalize / format', () => {
  it('round-trips the display format', () => {
    const id = 'k7mq2xp9tn'
    expect(formatRoomId(id)).toBe('k7m-q2xp-9tn')
    expect(normalizeRoomId(' K7M-Q2XP-9TN ')).toBe(id)
  })

  it('rejects ambiguous characters', () => {
    expect(normalizeRoomId('o7mq2xp9tn')).toBeNull()
    expect(normalizeRoomId('k7mq2xp9t')).toBeNull()
  })
})

describe('parseRoomInput', () => {
  const id = 'k7mq2xp9tn'
  it.each([
    [id],
    ['k7m-q2xp-9tn'],
    [`https://share.example.com/r/${id}`],
    [`https://share.example.com/r/${id}/`],
    [`http://localhost:3000/r/k7m-q2xp-9tn`],
    [deepLinkUrl(id)],
    [`share://join/${id}/`],
    [inviteUrl('https://share.example.com/', id)],
  ])('parses %s', (input) => {
    expect(parseRoomInput(input)).toBe(id)
  })

  it.each([
    [''],
    ['hello'],
    ['https://example.com/x/k7mq2xp9tn'],
    ['share://open/k7mq2xp9tn'],
    ['ftp://x/r/k7mq2xp9tn'],
  ])('rejects %s', (input) => {
    expect(parseRoomInput(input)).toBeNull()
  })
})

describe('tokenRequestSchema', () => {
  it('accepts a valid request and trims the name', () => {
    const parsed = tokenRequestSchema.parse({
      roomId: 'k7mq2xp9tn',
      name: '  Zé  ',
      identity: 'abcd1234efgh',
    })
    expect(parsed.name).toBe('Zé')
  })

  it('rejects invalid input', () => {
    expect(
      tokenRequestSchema.safeParse({ roomId: 'nope', name: 'a', identity: 'abcd1234' }).success,
    ).toBe(false)
    expect(
      tokenRequestSchema.safeParse({ roomId: 'k7mq2xp9tn', name: '   ', identity: 'abcd1234' })
        .success,
    ).toBe(false)
    expect(
      tokenRequestSchema.safeParse({ roomId: 'k7mq2xp9tn', name: 'a', identity: 'a b' }).success,
    ).toBe(false)
  })
})
