import { type ErrorResponse } from '@share/shared'
import { ATTACHMENT_MAX, CHAT_RETENTION_DAYS, eventIdSchema } from '@share/shared/chat'
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { uploadPrefix } from '@/lib/chat-plan'
import { corsHeaders, jsonResponse, rateLimited } from '@/lib/http'
import { createRateLimiter } from '@/lib/rate-limit'
import { verifyRoomToken } from '@/lib/room-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS = corsHeaders('POST')
const rateLimit = createRateLimiter({ limit: 60, windowMs: 60_000 })

type Params = { params: Promise<{ room: string }> }

const json = <T>(body: T, status = 200) => jsonResponse(body, { status, cors: CORS })

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

/**
 * Hands the app a short-lived token to upload one attachment straight to the
 * private Blob store (files never pass through this function). The upload must
 * land in rooms/<room>/<fileId>/ and expires with the chat retention.
 */
export async function POST(request: Request, { params }: Params) {
  const limited = rateLimited(request, rateLimit, CORS)
  if (limited) return limited
  const caller = await verifyRoomToken(request, (await params).room, CORS)
  if (caller instanceof Response) return caller

  let body: HandleUploadBody
  try {
    body = (await request.json()) as HandleUploadBody
  } catch {
    return json<ErrorResponse>({ error: 'JSON inválido' }, 400)
  }
  if (body.type !== 'blob.generate-client-token') {
    return json<ErrorResponse>({ error: 'Requisição inválida' }, 400)
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const [, room, fileId, name, extra] = pathname.split('/')
        if (
          room !== caller.roomId ||
          !eventIdSchema.safeParse(fileId).success ||
          !name ||
          extra !== undefined ||
          !pathname.startsWith(uploadPrefix(caller.roomId, fileId!))
        ) {
          throw new Error('Caminho de upload inválido')
        }
        return {
          maximumSizeInBytes: ATTACHMENT_MAX,
          addRandomSuffix: true,
          ttlDays: CHAT_RETENTION_DAYS,
          validUntil: Date.now() + 60 * 60_000,
          tokenPayload: caller.identity,
        }
      },
    })
    return json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha no upload'
    return json<ErrorResponse>({ error: message }, 400)
  }
}
