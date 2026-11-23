import {
  isRoomId,
  roomNameUpdateSchema,
  type ErrorResponse,
  type RoomInfoResponse,
} from '@share/shared'
import { getRedis } from '@/lib/chat-db'
import { corsHeaders, jsonResponse, rateLimited } from '@/lib/http'
import { createRateLimiter } from '@/lib/rate-limit'
import { verifyRoomToken } from '@/lib/room-auth'
import { getRoomAccess } from '@/lib/room-access'
import { getRoomName, setRoomName } from '@/lib/room-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS = corsHeaders('GET, PUT')
const readLimit = createRateLimiter({ limit: 120, windowMs: 60_000 })
const writeLimit = createRateLimiter({ limit: 20, windowMs: 60_000 })

type Params = { params: Promise<{ room: string }> }

const json = <T>(body: T, status = 200) => jsonResponse(body, { status, cors: CORS })

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

/** Room name. Public: the room code is what grants access to a room anyway. */
export async function GET(request: Request, { params }: Params) {
  const limited = rateLimited(request, readLimit, CORS)
  if (limited) return limited
  const { room } = await params
  if (!isRoomId(room)) return json<ErrorResponse>({ error: 'Sala inválida' }, 400)
  const redis = getRedis()
  if (!redis) return json<RoomInfoResponse>({ name: null, private: false })
  const [name, { auth }] = await Promise.all([getRoomName(redis, room), getRoomAccess(redis, room)])
  return json<RoomInfoResponse>({ name, private: !!auth })
}

/** Renames the room (anyone in it can). An empty name removes it. */
export async function PUT(request: Request, { params }: Params) {
  const limited = rateLimited(request, writeLimit, CORS)
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
  const parsed = roomNameUpdateSchema.safeParse(body)
  if (!parsed.success) {
    return json<ErrorResponse>({ error: parsed.error.issues[0]?.message ?? 'Nome inválido' }, 400)
  }
  const name = parsed.data.name || null
  await setRoomName(redis, caller.roomId, name)
  const { auth } = await getRoomAccess(redis, caller.roomId)
  return json<RoomInfoResponse>({ name, private: !!auth })
}
