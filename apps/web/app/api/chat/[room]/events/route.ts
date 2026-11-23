import { type ErrorResponse } from '@share/shared'
import { chatPostSchema, type ChatEventsResponse, type ChatPostResponse } from '@share/shared/chat'
import { del, list } from '@vercel/blob'
import { appendEvents, getMeta, getRedis, listEvents } from '@/lib/chat-db'
import { metaKey, planEvents, uploadPrefix } from '@/lib/chat-plan'
import { corsHeaders, jsonResponse, rateLimited } from '@/lib/http'
import { createRateLimiter } from '@/lib/rate-limit'
import { verifyRoomToken } from '@/lib/room-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS = corsHeaders('GET, POST')
const readLimit = createRateLimiter({ limit: 240, windowMs: 60_000 })
const writeLimit = createRateLimiter({ limit: 240, windowMs: 60_000 })

type Params = { params: Promise<{ room: string }> }

const json = <T>(body: T, status = 200) => jsonResponse(body, { status, cors: CORS })

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

export async function GET(request: Request, { params }: Params) {
  const limited = rateLimited(request, readLimit, CORS)
  if (limited) return limited
  const caller = await verifyRoomToken(request, (await params).room, CORS)
  if (caller instanceof Response) return caller
  const redis = getRedis()
  if (!redis) return json<ErrorResponse>({ error: 'Chat não configurado' }, 503)

  const after = Number(new URL(request.url).searchParams.get('after') ?? 0)
  if (!Number.isSafeInteger(after) || after < 0) {
    return json<ErrorResponse>({ error: 'Cursor inválido' }, 400)
  }
  return json<ChatEventsResponse>(await listEvents(redis, caller.roomId, after))
}

export async function POST(request: Request, { params }: Params) {
  const limited = rateLimited(request, writeLimit, CORS)
  if (limited) return limited
  const caller = await verifyRoomToken(request, (await params).room, CORS)
  if (caller instanceof Response) return caller
  const redis = getRedis()
  if (!redis) return json<ErrorResponse>({ error: 'Chat não configurado' }, 503)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json<ErrorResponse>({ error: 'JSON inválido' }, 400)
  }
  const parsed = chatPostSchema.safeParse(body)
  if (!parsed.success) return json<ErrorResponse>({ error: 'Requisição inválida' }, 400)

  const room = caller.roomId
  const { planned, rejected } = await planEvents({
    caller,
    raw: parsed.data.events,
    getMeta: (fields) => getMeta(redis, room, fields),
    findUpload: async (fileId) => {
      const { blobs } = await list({ prefix: uploadPrefix(room, fileId), limit: 1 })
      return blobs[0]?.pathname ?? null
    },
  })
  await appendEvents(redis, room, planned)

  // Deleting a message also deletes its attachment.
  const toDelete = planned.flatMap((e) => (e.deleteFileId ? [e.deleteFileId] : []))
  if (toDelete.length) {
    const paths = await getMeta(redis, room, toDelete.map(metaKey.path))
    const blobs = [...paths.values()]
    if (blobs.length) await del(blobs).catch((error) => console.warn('blob delete failed', error))
  }

  return json<ChatPostResponse>({ accepted: planned.map((e) => e.id), rejected })
}
