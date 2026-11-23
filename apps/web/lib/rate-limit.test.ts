import { describe, expect, it } from 'vitest'
import { createRateLimiter } from './rate-limit'

describe('createRateLimiter', () => {
  it('blocks after the limit and resets after the window', () => {
    const check = createRateLimiter({ limit: 2, windowMs: 1000 })
    expect(check('a', 0).ok).toBe(true)
    expect(check('a', 10).ok).toBe(true)
    const blocked = check('a', 20)
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfterS).toBe(1)
    expect(check('b', 20).ok).toBe(true)
    expect(check('a', 1000).ok).toBe(true)
  })
})
