/**
 * Tiny fixed-window rate limiter kept in memory.
 *
 * On Vercel each function instance has its own memory, so this is best-effort
 * protection against a single client hammering the endpoint — good enough for
 * a friends-only app. Swap for Upstash/Vercel KV if it ever needs to be strict.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, { count: number; resetAt: number }>()

  return function check(key: string, now = Date.now()): { ok: boolean; retryAfterS: number } {
    if (hits.size > 10_000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k)
    }
    const entry = hits.get(key)
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs })
      return { ok: true, retryAfterS: 0 }
    }
    entry.count++
    if (entry.count > limit) {
      return { ok: false, retryAfterS: Math.ceil((entry.resetAt - now) / 1000) }
    }
    return { ok: true, retryAfterS: 0 }
  }
}
