import { z } from 'zod'
import { corsHeaders, rateLimited } from '@/lib/http'
import { customerId, klipyShareUrl } from '@/lib/klipy'
import { createRateLimiter } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS = corsHeaders('POST')
const rateLimit = createRateLimiter({ limit: 30, windowMs: 60_000 })
const bodySchema = z.object({ id: z.string().min(1).max(128), q: z.string().max(100).default('') })

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

/** Share trigger: tells KLIPY a GIF was sent (improves ranking, required by their terms). */
export async function POST(request: Request) {
  const key = process.env.KLIPY_API_KEY
  if (!key) return new Response(null, { status: 204, headers: CORS })

  const limited = rateLimited(request, rateLimit, CORS)
  if (limited) return limited

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return new Response(null, { status: 400, headers: CORS })

  await fetch(klipyShareUrl(key, parsed.data.id), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_id: customerId(request), q: parsed.data.q }),
    signal: AbortSignal.timeout(5000),
  }).catch((error: unknown) => console.error('[gifs] share trigger failed', error))

  return new Response(null, { status: 204, headers: CORS })
}
