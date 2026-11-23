import { isRoomId, type ErrorResponse } from '@share/shared'
import { TokenVerifier } from 'livekit-server-sdk'
import { jsonResponse } from './http'

export interface RoomCaller {
  roomId: string
  identity: string
  name: string
}

/**
 * The app has no accounts: being in a room means holding a LiveKit token for
 * it, issued by /api/token. The chat API accepts the same token, so the room
 * and the author of every event come from a signature, not from the client.
 */
export async function verifyRoomToken(
  request: Request,
  roomId: string,
  cors: Record<string, string>,
  verifier = defaultVerifier(),
): Promise<RoomCaller | Response> {
  const fail = (error: string, status: number) =>
    jsonResponse<ErrorResponse>({ error }, { status, cors })

  if (!isRoomId(roomId)) return fail('Sala inválida', 400)
  if (!verifier) return fail('Servidor não configurado', 500)

  const header = request.headers.get('authorization') ?? ''
  const token = /^Bearer\s+(\S+)$/i.exec(header)?.[1]
  if (!token) return fail('Token ausente', 401)

  try {
    const claims = await verifier.verify(token, 30)
    if (claims.video?.room !== roomId || !claims.video.roomJoin || !claims.sub) {
      return fail('Token de outra sala', 403)
    }
    return { roomId, identity: claims.sub, name: claims.name || claims.sub.slice(0, 8) }
  } catch {
    // Expired or forged; the app fetches a fresh token and retries.
    return fail('Token inválido ou expirado', 401)
  }
}

function defaultVerifier(): TokenVerifier | null {
  const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env
  return LIVEKIT_API_KEY && LIVEKIT_API_SECRET
    ? new TokenVerifier(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    : null
}
