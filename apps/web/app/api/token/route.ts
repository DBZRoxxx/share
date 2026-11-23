import { tokenRequestSchema, type ErrorResponse, type TokenResponse } from '@share/shared'
import { AccessToken } from 'livekit-server-sdk'
import { getRedis } from '@/lib/chat-db'
import { corsHeaders, jsonResponse, rateLimited } from '@/lib/http'
import { createRateLimiter } from '@/lib/rate-limit'
import { claimRoomName } from '@/lib/room-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TOKEN_TTL = '6h'
const rateLimit = createRateLimiter({ limit: 30, windowMs: 60_000 })

const CORS = corsHeaders('POST')
const json = <T>(body: T, status = 200) => jsonResponse(body, { status, cors: CORS })

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function POST(request: Request) {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    console.error('LiveKit env vars are missing')
    return json<ErrorResponse>({ error: 'Servidor não configurado' }, 500)
  }

  const limited = rateLimited(request, rateLimit, CORS)
  if (limited) return limited

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

  const { roomId, name, identity, roomName } = parsed.data
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

  // The room name is a nicety: never fail a join because storage is down.
  const redis = getRedis()
  const storedName = redis
    ? await claimRoomName(redis, roomId, roomName || undefined).catch((error: unknown) => {
        console.error('room name unavailable', error)
        return null
      })
    : null

  return json<TokenResponse>({ token: await at.toJwt(), url: LIVEKIT_URL, roomName: storedName })
}
