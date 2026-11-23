import { gifQuerySchema, type ErrorResponse, type GifPage } from '@share/shared'
import { corsHeaders, jsonResponse, rateLimited } from '@/lib/http'
import { customerId, klipyListUrl, normalizeKlipy } from '@/lib/klipy'
import { createRateLimiter } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS = corsHeaders('GET')
const rateLimit = createRateLimiter({ limit: 120, windowMs: 60_000 })

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function GET(request: Request) {
  const key = process.env.KLIPY_API_KEY
  if (!key) {
    console.error('KLIPY_API_KEY is missing')
    return jsonResponse<ErrorResponse>(
      { error: 'GIFs não configurados' },
      { status: 503, cors: CORS },
    )
  }

  const limited = rateLimited(request, rateLimit, CORS)
  if (limited) return limited

  const params = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = gifQuerySchema.safeParse(params)
  if (!parsed.success) {
    return jsonResponse<ErrorResponse>({ error: 'Busca inválida' }, { status: 400, cors: CORS })
  }

  const upstream = await fetch(
    klipyListUrl(key, { ...parsed.data, customerId: customerId(request) }),
    {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    },
  ).catch((error: unknown) => {
    console.error('[gifs] upstream failed', error)
    return null
  })
  if (!upstream?.ok) {
    if (upstream) console.error('[gifs] upstream status', upstream.status)
    return jsonResponse<ErrorResponse>(
      { error: 'Não foi possível buscar GIFs agora' },
      { status: 502, cors: CORS },
    )
  }

  return jsonResponse<GifPage>(normalizeKlipy(await upstream.json()), {
    cors: CORS,
    // Results don't depend on who asks; let the CDN absorb repeated searches.
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  })
}
