import { beforeAll, describe, expect, it } from 'vitest'
import {
  checkOwnerKey,
  checkRoomKey,
  hashPassword,
  ownerKeyFor,
  roomKeyFor,
  verifyPassword,
} from './room-access'

beforeAll(() => {
  process.env.LIVEKIT_API_SECRET = 'test-secret'
})

describe('room passwords', () => {
  it('verifies the right password only', async () => {
    const { salt, hash } = await hashPassword('sextou123')
    const auth = { salt, hash, v: 1 }
    expect(await verifyPassword('sextou123', auth)).toBe(true)
    expect(await verifyPassword('sextou12', auth)).toBe(false)
    expect(await verifyPassword('SEXTOU123', auth)).toBe(false)
  })

  it('never stores the password itself', async () => {
    const a = await hashPassword('mesma')
    const b = await hashPassword('mesma')
    expect(a.hash).not.toBe(b.hash)
    expect(a.hash).not.toContain('mesma')
  })
})

describe('room keys', () => {
  const auth = { salt: '', hash: '', v: 3 }

  it('accept the key for the current password version only', () => {
    expect(checkRoomKey('k7mq2xp9tn', auth, roomKeyFor('k7mq2xp9tn', 3))).toBe(true)
    // Password changed (version bumped): old keys stop working.
    expect(checkRoomKey('k7mq2xp9tn', auth, roomKeyFor('k7mq2xp9tn', 2))).toBe(false)
    expect(checkRoomKey('k7mq2xp9tn', auth, roomKeyFor('abcdefghjk', 3))).toBe(false)
    expect(checkRoomKey('k7mq2xp9tn', auth, undefined)).toBe(false)
  })

  it('tie owner keys to the room and the identity', () => {
    const key = ownerKeyFor('k7mq2xp9tn', 'ana-identity')
    expect(checkOwnerKey('k7mq2xp9tn', 'ana-identity', key)).toBe(true)
    expect(checkOwnerKey('k7mq2xp9tn', 'bia-identity', key)).toBe(false)
    expect(checkOwnerKey('abcdefghjk', 'ana-identity', key)).toBe(false)
  })
})
