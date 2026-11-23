import type { ErrorResponse } from '@share/shared'
import type {
  ChatEvent,
  ChatEventsResponse,
  ChatFileUrlResponse,
  ChatPostResponse,
} from '@share/shared/chat'
import { upload } from '@vercel/blob/client'
import { WEB_URL } from './config'

/**
 * Client for the chat API on Vercel. Requests are authorized with the
 * LiveKit token of the current room; when it expires (6 h) a new one is
 * fetched and the request retried.
 */

interface ChatAuth {
  roomId: string
  token: string
  refresh: () => Promise<string>
}

let auth: ChatAuth | null = null

export function setChatAuth(next: ChatAuth | null) {
  auth = next
}

export class ChatApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
  /** Worth retrying later (network, server, rate limit). */
  get transient() {
    return this.status === 0 || this.status === 429 || this.status >= 500
  }
}

function current(roomId: string): ChatAuth {
  if (!WEB_URL) throw new ChatApiError('Servidor não configurado', 503)
  if (!auth || auth.roomId !== roomId) throw new ChatApiError('Fora da sala', 0)
  return auth
}

async function request<T>(roomId: string, path: string, init: RequestInit = {}): Promise<T> {
  let a = current(roomId)
  for (let attempt = 0; ; attempt++) {
    let res: Response
    try {
      res = await fetch(`${WEB_URL}/api/chat/${roomId}${path}`, {
        ...init,
        headers: {
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          Authorization: `Bearer ${a.token}`,
        },
        signal: AbortSignal.timeout(20_000),
      })
    } catch {
      throw new ChatApiError('Sem conexão com o servidor', 0)
    }
    if (res.status === 401 && attempt === 0) {
      a = { ...a, token: await a.refresh() }
      if (auth?.roomId === roomId) auth = a
      continue
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as ErrorResponse | null
      throw new ChatApiError(body?.error ?? `Erro ${res.status}`, res.status)
    }
    return (await res.json()) as T
  }
}

export const chatApi = {
  events: (roomId: string, after: number) =>
    request<ChatEventsResponse>(roomId, `/events?after=${after}`),

  post: (roomId: string, events: ChatEvent[]) =>
    request<ChatPostResponse>(roomId, '/events', {
      method: 'POST',
      body: JSON.stringify({ events }),
    }),

  fileUrl: (roomId: string, fileId: string) =>
    request<ChatFileUrlResponse>(roomId, `/files/${fileId}`, { method: 'POST' }),

  /** Uploads straight to the private Blob store; the API only signs the upload. */
  async upload(
    roomId: string,
    fileId: string,
    file: File,
    onProgress: (percent: number) => void,
    signal?: AbortSignal,
  ): Promise<{ pathname: string }> {
    const a = current(roomId)
    // Blob pathnames are URL-like; keep the name readable but safe.
    const name = file.name.replace(/[^\w.\- ()[\]]+/g, '_').slice(-120) || 'arquivo'
    const run = (token: string) =>
      upload(`rooms/${roomId}/${fileId}/${name}`, file, {
        access: 'private',
        handleUploadUrl: `${WEB_URL}/api/chat/${roomId}/upload`,
        headers: { Authorization: `Bearer ${token}` },
        contentType: file.type || 'application/octet-stream',
        multipart: file.size > 8 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => onProgress(percentage),
        abortSignal: signal,
      })
    try {
      return { pathname: (await run(a.token)).pathname }
    } catch (error) {
      if (signal?.aborted) throw error
      // Most likely an expired token; one retry with a fresh one.
      const token = await a.refresh()
      if (auth?.roomId === roomId) auth = { ...a, token }
      return { pathname: (await run(token)).pathname }
    }
  },
}
