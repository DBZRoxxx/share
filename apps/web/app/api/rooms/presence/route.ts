import {
  isRoomId,
  ROOM_PRESENCE_MAX,
  type ErrorResponse,
  type RoomPresenceResponse,
  type RoomSummary,
} from '@share/shared'
import { RoomServiceClient } from 'livekit-server-sdk'
import { getRedis } from '@/lib/chat-db'
import { corsHeaders, jsonResponse, rateLimited } from '@/lib/http'
import { createRateLimiter } from '@/lib/rate-limit'
import { privateRooms } from '@/lib/room-access'
import { getRoomNames } from '@/lib/room-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS = corsHeaders('GET')
const rateLimit = createRateLimiter({ limit: 120, windowMs: 60_000 })

const json = <T>(body: T, status = 200) => jsonResponse(body, { status, cors: CORS })

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

let service: RoomServiceClient | null = null
function roomService(): RoomServiceClient | null {
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return null
  service ??= new RoomServiceClient(
    LIVEKIT_URL.replace(/^ws/, 'http'),
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET,
  )
  return service
}

/**
 * How many people are in each of these rooms right now, plus name and
 * privacy, for the app's rooms list. Public: a room code is what grants
 * access to a room anyway.
 */
export async function GET(request: Request) {
  const limited = rateLimited(request, rateLimit, CORS)
  if (limited) return limited
  const ids = [
    ...new Set(
      (new URL(request.url).searchParams.get('ids') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(isRoomId),
    ),
  ].slice(0, ROOM_PRESENCE_MAX)
  if (!ids.length) return json<RoomPresenceResponse>({ rooms: {} })

  const svc = roomService()
  if (!svc) return json<ErrorResponse>({ error: 'Servidor não configurado' }, 500)
  const redis = getRedis()

  const [live, names, locked] = await Promise.all([
    svc.listRooms(ids).catch((error: unknown) => {
      console.error('listRooms failed', error)
      return []
    }),
    redis
      ? getRoomNames(redis, ids).catch(() => new Map<string, string>())
      : new Map<string, string>(),
    redis ? privateRooms(redis, ids).catch(() => new Set<string>()) : new Set<string>(),
  ])
  const counts = new Map(live.map((r) => [r.name, r.numParticipants]))
  const rooms: Record<string, RoomSummary> = {}
  for (const id of ids) {
    rooms[id] = {
      name: names.get(id) ?? null,
      private: locked.has(id),
      participants: counts.get(id) ?? 0,
    }
  }
  return json<RoomPresenceResponse>({ rooms })
}
