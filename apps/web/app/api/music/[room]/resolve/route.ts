import { type ErrorResponse } from '@share/shared'
import { parseYoutubeLink, type MusicResolveResponse } from '@share/shared/music'
import { corsHeaders, jsonResponse, rateLimited } from '@/lib/http'
import { createRateLimiter } from '@/lib/rate-limit'
import { verifyRoomToken } from '@/lib/room-auth'
import { resolveLink } from '@/lib/youtube'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS = corsHeaders('GET')
// Each call spends YouTube quota: keep a single client from burning it.
const rateLimit = createRateLimiter({ limit: 30, windowMs: 60_000 })

type Params = { params: Promise<{ room: string }> }

const json = <T>(body: T, status = 200) => jsonResponse(body, { status, cors: CORS })

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

/** Titles and durations for what a YouTube link adds to the room's queue. */
export async function GET(request: Request, { params }: Params) {
  const key = process.env.YOUTUBE_API_KEY
  if (!key) {
    console.error('YOUTUBE_API_KEY is missing')
    return json<ErrorResponse>({ error: 'Música não configurada no servidor' }, 503)
  }
  const limited = rateLimited(request, rateLimit, CORS)
  if (limited) return limited
  const caller = await verifyRoomToken(request, (await params).room, CORS)
  if (caller instanceof Response) return caller

  const link = parseYoutubeLink(new URL(request.url).searchParams.get('url') ?? '')
  if (!link) return json<ErrorResponse>({ error: 'Isso não parece um link do YouTube' }, 400)

  try {
    const res = await resolveLink(key, link)
    if (!res.items.length) {
      return json<ErrorResponse>(
        {
          error: res.skipped
            ? 'Esse vídeo não pode ser tocado fora do YouTube'
            : 'Vídeo ou playlist não encontrado',
        },
        404,
      )
    }
    return json<MusicResolveResponse>(res)
  } catch (error) {
    console.error('[music] resolve failed', error)
    return json<ErrorResponse>({ error: 'Não foi possível consultar o YouTube agora' }, 502)
  }
}
