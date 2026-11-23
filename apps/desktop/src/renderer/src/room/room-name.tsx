import {
  cleanRoomName,
  formatRoomId,
  ROOM_NAME_MAX,
  roomNameMessageSchema,
  type RoomNameMessage,
} from '@share/shared'
import type { Room } from 'livekit-client'
import { Check, Pencil, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { create } from 'zustand'
import { Tooltip } from '@/components/ui/primitives'
import { roomApi } from '@/lib/chat-api'
import { cn } from '@/lib/utils'
import { usePrefs } from '@/stores/prefs'
import { displayName } from './media-tile'

/** Topic for room-level announcements (rename). */
const TOPIC_ROOM = 'share.room'

interface RoomInfoState {
  name: string | null
}

export const useRoomInfo = create<RoomInfoState>()(() => ({ name: null }))

/** The room's name changed (here or elsewhere): update everything that shows it. */
export function applyRoomName(roomId: string, name: string | null) {
  useRoomInfo.setState({ name })
  usePrefs.getState().nameRecentRoom(roomId, name)
  void window.share.app.setRoom(roomId, name)
}

const chars = (s: string) => [...s].length

/** Listens for renames by others while in the room. */
export function useRoomNameSync(room: Room, roomId: string) {
  useEffect(() => {
    room.registerTextStreamHandler(TOPIC_ROOM, (reader, { identity }) => {
      void reader.readAll().then((raw) => {
        let message: RoomNameMessage
        try {
          const parsed = roomNameMessageSchema.safeParse(JSON.parse(raw))
          if (!parsed.success) return
          message = parsed.data
        } catch {
          return
        }
        const name = message.name || null
        if (name === useRoomInfo.getState().name) return
        applyRoomName(roomId, name)
        const p = room.getParticipantByIdentity(identity)
        const who = p ? displayName(p) : 'Alguém'
        toast(name ? `${who} renomeou a sala para “${name}”` : `${who} removeu o nome da sala`)
      })
    })
    return () => room.unregisterTextStreamHandler(TOPIC_ROOM)
  }, [room, roomId])
}

async function rename(room: Room, roomId: string, next: string | null) {
  const previous = useRoomInfo.getState().name
  if (next === previous) return
  applyRoomName(roomId, next)
  try {
    const { name } = await roomApi.rename(roomId, next)
    const message: RoomNameMessage = { v: 1, kind: 'room-name', name }
    await room.localParticipant
      .sendText(JSON.stringify(message), { topic: TOPIC_ROOM })
      .catch(() => undefined)
  } catch (error) {
    console.error('[room] rename failed', error)
    applyRoomName(roomId, previous)
    toast.error('Não foi possível renomear a sala.', {
      description: error instanceof Error ? error.message : undefined,
    })
  }
}

/** Room name in the title bar; click to rename (anyone in the room can). */
export function RoomTitle({ room, roomId }: { room: Room; roomId: string }) {
  const name = useRoomInfo((s) => s.name)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const start = () => {
    setDraft(name ?? '')
    setEditing(true)
  }
  const save = () => {
    setEditing(false)
    void rename(room, roomId, cleanRoomName(draft) || null)
  }

  if (editing) {
    const left = ROOM_NAME_MAX - chars(cleanRoomName(draft))
    return (
      <form
        className="no-drag flex min-w-0 items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            const value = e.target.value
            if (chars(cleanRoomName(value)) <= ROOM_NAME_MAX) setDraft(value)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setEditing(false)
            }
          }}
          onBlur={save}
          placeholder="Nome da sala"
          aria-label="Nome da sala"
          className="border-accent bg-surface-2 h-7 w-64 min-w-0 rounded-md border px-2 text-sm outline-none"
        />
        <span
          className={cn('w-6 text-right text-[11px]', left < 6 ? 'text-warning' : 'text-muted')}
        >
          {left}
        </span>
        <button
          type="submit"
          aria-label="Salvar nome"
          onMouseDown={(e) => e.preventDefault()}
          className="text-success hover:bg-surface-2 rounded-md p-1"
        >
          <Check className="size-4" />
        </button>
        <button
          type="button"
          aria-label="Cancelar"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setEditing(false)}
          className="text-muted hover:bg-surface-2 hover:text-fg rounded-md p-1"
        >
          <X className="size-4" />
        </button>
      </form>
    )
  }

  return (
    <Tooltip content="Renomear a sala" side="bottom">
      <button
        type="button"
        onClick={start}
        className="no-drag group hover:bg-surface-2 flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1"
        aria-label={name ? `Sala ${name}. Renomear` : 'Dar um nome para a sala'}
      >
        <span className={cn('truncate text-sm font-medium', !name && 'text-muted')}>
          {name ?? 'Sala sem nome'}
        </span>
        <Pencil className="text-muted size-3.5 shrink-0 opacity-60 group-hover:opacity-100" />
      </button>
    </Tooltip>
  )
}

/** "Noite do CS" or the room code, for places that need one label. */
export function roomLabel(roomId: string, name: string | null | undefined): string {
  return name || formatRoomId(roomId)
}
