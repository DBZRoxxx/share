import {
  roomPasswordUpdateSchema,
  type ErrorResponse,
  type RoomPasswordResponse,
} from '@share/shared'
import { getRedis } from '@/lib/chat-db'
import { corsHeaders, jsonResponse, rateLimited } from '@/lib/http'
import { createRateLimiter } from '@/lib/rate-limit'
import { checkOwnerKey, getRoomAccess, roomKeyFor, setRoomPassword } from '@/lib/room-access'
import { verifyRoomToken } from '@/lib/room-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS = corsHeaders('PUT')
const rateLimit = createRateLimiter({ limit: 20, windowMs: 60_000 })

type Params = { params: Promise<{ room: string }> }

const json = <T>(body: T, status = 200) => jsonResponse(body, { status, cors: CORS })

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

/** Sets, changes or removes the password. Only the room's creator can. */
export async function PUT(request: Request, { params }: Params) {
  const limited = rateLimited(request, rateLimit, CORS)
  if (limited) return limited
  const caller = await verifyRoomToken(request, (await params).room, CORS)
  if (caller instanceof Response) return caller
  const redis = getRedis()
  if (!redis) return json<ErrorResponse>({ error: 'Servidor não configurado' }, 503)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json<ErrorResponse>({ error: 'JSON inválido' }, 400)
  }
  const parsed = roomPasswordUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return json<ErrorResponse>({ error: parsed.error.issues[0]?.message ?? 'Senha inválida' }, 400)
  }

  const { owner } = await getRoomAccess(redis, caller.roomId)
  if (
    owner !== caller.identity ||
    !checkOwnerKey(caller.roomId, caller.identity, parsed.data.ownerKey)
  ) {
    return json<ErrorResponse>(
      { error: 'Só quem criou a sala pode mudar a senha.', code: 'not_owner' },
      403,
    )
  }
  const v = await setRoomPassword(redis, caller.roomId, parsed.data.password)
  return json<RoomPasswordResponse>({
    private: v !== null,
    roomKey: v === null ? null : roomKeyFor(caller.roomId, v),
  })
}
