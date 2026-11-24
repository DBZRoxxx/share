import type {
  ErrorResponse,
  RoomInfoResponse,
  RoomPasswordResponse,
  RoomPresenceResponse,
  RoomSummary,
  RoomUnlockResponse,
} from '@share/shared'
import type {
  ChatEvent,
  ChatEventsResponse,
  ChatFileUrlResponse,
  ChatPostResponse,
} from '@share/shared/chat'
import type { MusicResolveResponse } from '@share/shared/music'
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
      res = await fetch(`${WEB_URL}${path}`, {
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
    request<ChatEventsResponse>(roomId, `/api/chat/${roomId}/events?after=${after}`),

  post: (roomId: string, events: ChatEvent[]) =>
    request<ChatPostResponse>(roomId, `/api/chat/${roomId}/events`, {
      method: 'POST',
      body: JSON.stringify({ events }),
    }),

  fileUrl: (roomId: string, fileId: string) =>
    request<ChatFileUrlResponse>(roomId, `/api/chat/${roomId}/files/${fileId}`, {
      method: 'POST',
    }),

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

/** Music: what a YouTube link adds to the queue (same room token as the chat). */
export const musicApi = {
  resolve: (roomId: string, url: string) =>
    request<MusicResolveResponse>(
      roomId,
      `/api/music/${roomId}/resolve?url=${encodeURIComponent(url)}`,
    ),
}

export class RoomApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function publicJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!WEB_URL) throw new RoomApiError('Servidor não configurado', 503)
  let res: Response
  try {
    res = await fetch(`${WEB_URL}${path}`, {
      ...init,
      headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new RoomApiError('Sem conexão com o servidor', 0)
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ErrorResponse | null
    throw new RoomApiError(body?.error ?? `Erro ${res.status}`, res.status)
  }
  return (await res.json()) as T
}

export const roomApi = {
  /** Public: name and privacy shown before joining. Null when unreachable. */
  async info(roomId: string): Promise<RoomInfoResponse | null> {
    try {
      return await publicJson<RoomInfoResponse>(`/api/rooms/${roomId}`)
    } catch {
      return null
    }
  },

  /** People in each room right now (for the rooms list). Null when unreachable. */
  async presence(roomIds: string[]): Promise<Record<string, RoomSummary> | null> {
    if (!roomIds.length) return {}
    try {
      const res = await publicJson<RoomPresenceResponse>(
        `/api/rooms/presence?ids=${roomIds.slice(0, 50).join(',')}`,
      )
      return res.rooms
    } catch {
      return null
    }
  },

  /** Checks a private room's password; returns the key to enter it. */
  unlock: (roomId: string, password: string) =>
    publicJson<RoomUnlockResponse>(`/api/rooms/${roomId}/unlock`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  /** Owner only: sets, changes or (with null) removes the password. */
  setPassword: (roomId: string, ownerKey: string, password: string | null) =>
    request<RoomPasswordResponse>(roomId, `/api/rooms/${roomId}/password`, {
      method: 'PUT',
      body: JSON.stringify({ ownerKey, password }),
    }),

  rename: (roomId: string, name: string | null) =>
    request<RoomInfoResponse>(roomId, `/api/rooms/${roomId}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    }),
}
