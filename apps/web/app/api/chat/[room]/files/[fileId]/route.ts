import { type ErrorResponse } from '@share/shared'
import { eventIdSchema, type ChatFileUrlResponse } from '@share/shared/chat'
import { issueSignedToken, presignUrl } from '@vercel/blob'
import { getMeta, getRedis } from '@/lib/chat-db'
import { metaKey } from '@/lib/chat-plan'
import { corsHeaders, jsonResponse, rateLimited } from '@/lib/http'
import { createRateLimiter } from '@/lib/rate-limit'
import { verifyRoomToken } from '@/lib/room-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS = corsHeaders('POST')
const rateLimit = createRateLimiter({ limit: 600, windowMs: 60_000 })
const URL_TTL_MS = 15 * 60_000

type Params = { params: Promise<{ room: string; fileId: string }> }

const json = <T>(body: T, status = 200) => jsonResponse(body, { status, cors: CORS })

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

/** Short-lived download URL for an attachment of this room (the store is private). */
export async function POST(request: Request, { params }: Params) {
  const limited = rateLimited(request, rateLimit, CORS)
  if (limited) return limited
  const { room, fileId } = await params
  const caller = await verifyRoomToken(request, room, CORS)
  if (caller instanceof Response) return caller
  if (!eventIdSchema.safeParse(fileId).success) {
    return json<ErrorResponse>({ error: 'Arquivo inválido' }, 400)
  }
  const redis = getRedis()
  if (!redis) return json<ErrorResponse>({ error: 'Chat não configurado' }, 503)

  const pathname = (await getMeta(redis, caller.roomId, [metaKey.path(fileId)])).get(
    metaKey.path(fileId),
  )
  if (!pathname) return json<ErrorResponse>({ error: 'Arquivo não encontrado' }, 404)

  const expiresAt = Date.now() + URL_TTL_MS
  const signed = await issueSignedToken({ pathname, operations: ['get'], validUntil: expiresAt })
  const { presignedUrl } = await presignUrl(signed, {
    operation: 'get',
    pathname,
    access: 'private',
  })
  return json<ChatFileUrlResponse>({ url: presignedUrl, expiresAt })
}
