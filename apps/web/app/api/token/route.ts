import { tokenRequestSchema, type ErrorResponse, type TokenResponse } from '@share/shared'
import { AccessToken } from 'livekit-server-sdk'
import { createRateLimiter } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TOKEN_TTL = '6h'
const rateLimit = createRateLimiter({ limit: 30, windowMs: 60_000 })

// The desktop app loads from file:// (Origin: null), so CORS must be open.
// That is fine: the token only grants access to the room the caller already
// knows the unguessable id of, and no cookies/credentials are involved.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

function json<T>(body: T, status = 200, headers: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store', ...headers },
  })
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(request: Request) {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    console.error('LiveKit env vars are missing')
    return json<ErrorResponse>({ error: 'Servidor não configurado' }, 500)
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const limited = rateLimit(ip)
  if (!limited.ok) {
    return json<ErrorResponse>({ error: 'Muitas tentativas, aguarde um pouco' }, 429, {
      'Retry-After': String(limited.retryAfterS),
    })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json<ErrorResponse>({ error: 'JSON inválido' }, 400)
  }

  const parsed = tokenRequestSchema.safeParse(body)
  if (!parsed.success) {
    return json<ErrorResponse>(
      { error: parsed.error.issues[0]?.message ?? 'Requisição inválida' },
      400,
    )
  }

  const { roomId, name, identity } = parsed.data
  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    name,
    ttl: TOKEN_TTL,
  })
  at.addGrant({
    room: roomId,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
  })

  return json<TokenResponse>({ token: await at.toJwt(), url: LIVEKIT_URL })
}
