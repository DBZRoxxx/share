import {
  isRoomId,
  roomUnlockSchema,
  type ErrorResponse,
  type RoomUnlockResponse,
} from '@share/shared'
import { getRedis } from '@/lib/chat-db'
import { corsHeaders, jsonResponse, rateLimited } from '@/lib/http'
import { createRateLimiter } from '@/lib/rate-limit'
import { getRoomAccess, roomKeyFor, verifyPassword } from '@/lib/room-access'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS = corsHeaders('POST')
// Few tries per minute: passwords are short.
const rateLimit = createRateLimiter({ limit: 10, windowMs: 60_000 })

type Params = { params: Promise<{ room: string }> }

const json = <T>(body: T, status = 200) => jsonResponse(body, { status, cors: CORS })

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

/** Checks a private room's password and returns the key to enter it. */
export async function POST(request: Request, { params }: Params) {
  const limited = rateLimited(request, rateLimit, CORS)
  if (limited) return limited
  const { room } = await params
  if (!isRoomId(room)) return json<ErrorResponse>({ error: 'Sala inválida' }, 400)
  const redis = getRedis()
  if (!redis) return json<ErrorResponse>({ error: 'Servidor não configurado' }, 503)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json<ErrorResponse>({ error: 'JSON inválido' }, 400)
  }
  const parsed = roomUnlockSchema.safeParse(body)
  if (!parsed.success) return json<ErrorResponse>({ error: 'Digite a senha' }, 400)

  const { auth } = await getRoomAccess(redis, room)
  if (!auth) return json<ErrorResponse>({ error: 'Esta sala não tem senha.' }, 409)
  if (!(await verifyPassword(parsed.data.password, auth))) {
    return json<ErrorResponse>(
      { error: 'Senha incorreta. Confira com quem te mandou o convite.', code: 'password_invalid' },
      401,
    )
  }
  return json<RoomUnlockResponse>({ roomKey: roomKeyFor(room, auth.v) })
}
