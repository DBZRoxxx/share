import { describe, expect, it } from 'vitest'
import { cleanRoomName, roomNameSchema, ROOM_NAME_MAX } from './room-name'

describe('room names', () => {
  it('cleans whitespace and control characters', () => {
    expect(cleanRoomName('  Noite\tdo   CS \n')).toBe('Noite do CS')
  })

  it('limits the length in characters, not UTF-16 units', () => {
    expect(roomNameSchema.safeParse('a'.repeat(ROOM_NAME_MAX)).success).toBe(true)
    expect(roomNameSchema.safeParse('a'.repeat(ROOM_NAME_MAX + 1)).success).toBe(false)
    expect(roomNameSchema.safeParse('🎮'.repeat(ROOM_NAME_MAX)).success).toBe(true)
  })

  it('turns blank names into empty strings', () => {
    expect(roomNameSchema.parse('   ')).toBe('')
  })
})
