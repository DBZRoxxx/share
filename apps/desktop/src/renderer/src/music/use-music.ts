import {
  currentItem,
  type MusicCommand,
  type MusicMode,
  type MusicResolveResponse,
  type QueueItem,
} from '@share/shared/music'
import type { Room } from 'livekit-client'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { musicApi } from '@/lib/chat-api'
import { WEB_URL } from '@/lib/config'
import { displayName } from '@/room/media-tile'
import { MusicSync } from './music-sync'
import {
  localPosition,
  parseMusicSnapshot,
  takeMusicSnapshot,
  useMusic,
  type MusicSnapshot,
} from './music-store'

let sync: MusicSync | null = null
let current: { room: Room; roomId: string } | null = null

/** The embedded player page lives on the web app (YouTube won't embed into file://). */
export const PLAYER_URL = WEB_URL ? `${WEB_URL}/player.html` : ''
export const PLAYER_ORIGIN = WEB_URL ? new URL(WEB_URL).origin : ''

/** Time to hear back from a host before picking the music up from our own snapshot. */
const RESTORE_WAIT_MS = 2000

/**
 * Keeps the room's music in step while mounted. `seed` is the music this
 * app had before (an update's resume state, or the last connection to this
 * room); it plays on if nobody else in the room has the music, so someone
 * alone in the room doesn't lose it. `onCarry` receives what was playing
 * when this connection ends, for the next one.
 */
export function useMusicTransport(
  room: Room,
  roomId: string,
  seed: unknown,
  onCarry?: (snapshot: MusicSnapshot | null) => void,
) {
  useEffect(() => {
    useMusic.getState().reset()
    const s = new MusicSync(room)
    sync = s
    current = { room, roomId }
    s.start()
    const snapshot = parseMusicSnapshot(seed)
    // Alone: nobody to ask. Otherwise give the host a moment to answer the hello.
    const restore = snapshot
      ? setTimeout(() => s.restore(snapshot), room.remoteParticipants.size ? RESTORE_WAIT_MS : 0)
      : null
    return () => {
      if (restore) clearTimeout(restore)
      onCarry?.(takeMusicSnapshot())
      s.dispose()
      if (sync === s) {
        sync = null
        current = null
      }
      useMusic.getState().reset()
    }
    // The seed and the callback are only read on mount / unmount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, roomId])
}

function command(cmd: MusicCommand) {
  if (!sync) {
    toast.error('A música não está conectada.')
    return
  }
  sync.command(cmd)
}

function playingItem(): QueueItem | undefined {
  const s = useMusic.getState().room
  return s ? currentItem(s) : undefined
}

const PLAYER_ERRORS: Record<number, string> = {
  2: 'Link do vídeo inválido',
  5: 'O player não conseguiu tocar esse vídeo',
  100: 'Vídeo removido ou privado',
  101: 'Esse vídeo não pode ser tocado fora do YouTube',
  150: 'Esse vídeo não pode ser tocado fora do YouTube',
}

export const musicActions = {
  available: () => !!PLAYER_URL,

  /** Titles and durations for what a link would add. */
  resolve(url: string): Promise<MusicResolveResponse> {
    if (!current) return Promise.reject(new Error('Fora da sala'))
    return musicApi.resolve(current.roomId, url)
  },

  add(videos: MusicResolveResponse['items'], mode: MusicMode, startS?: number) {
    if (!current || !videos.length) return
    const me = current.room.localParticipant
    const items: QueueItem[] = videos.map((v, i) => ({
      ...v,
      id: crypto.randomUUID(),
      mode,
      ...(i === 0 && startS ? { startS } : {}),
      addedBy: me.identity,
      addedByName: displayName(me).slice(0, 64),
    }))
    command({ op: 'add', items })
  },

  togglePlay() {
    const s = useMusic.getState().room
    if (!s || !currentItem(s)) return
    command(
      s.playing
        ? { op: 'pause', positionS: localPosition() }
        : { op: 'play', positionS: localPosition() },
    )
  },

  seek: (positionS: number) => command({ op: 'seek', positionS }),

  next() {
    const item = playingItem()
    if (item) command({ op: 'next', from: item.id })
  },

  prev() {
    const s = useMusic.getState().room
    if (!s) return
    const item = currentItem(s)
    if (item) command({ op: 'prev', from: item.id, positionS: localPosition() })
    // After the last song: "previous" plays it again.
    else if (s.queue.length) command({ op: 'jump', itemId: s.queue[s.queue.length - 1]!.id })
  },

  jump: (itemId: string) => command({ op: 'jump', itemId }),
  remove: (itemId: string) => command({ op: 'remove', itemId }),
  clear: () => command({ op: 'clear' }),

  /** Reports from the local player. */
  ended: (videoId: string) => sync?.ended(videoId),
  failed: (videoId: string | null, code: number) =>
    sync?.failed(videoId, PLAYER_ERRORS[code] ?? 'Não foi possível tocar esse vídeo'),
}
