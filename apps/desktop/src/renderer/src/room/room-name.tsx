import {
  cleanRoomName,
  ROOM_NAME_MAX,
  ROOM_PASSWORD_MAX,
  ROOM_PASSWORD_MIN,
  roomAccessMessageSchema,
  roomNameMessageSchema,
  type RoomAccessMessage,
  type RoomNameMessage,
} from '@share/shared'
import type { Room } from 'livekit-client'
import { Check, Lock, LockOpen, Pencil, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { create } from 'zustand'
import { Button } from '@/components/ui/button'
import { Input, Popover, PopoverContent, PopoverTrigger, Tooltip } from '@/components/ui/primitives'
import { roomApi } from '@/lib/chat-api'
import { cn } from '@/lib/utils'
import { usePrefs } from '@/stores/prefs'
import { displayName } from './media-tile'

/** Topic for room-level announcements (rename). */
const TOPIC_ROOM = 'share.room'

interface RoomInfoState {
  name: string | null
  /** Needs a password to enter. */
  private: boolean
  /** The user created the room (can manage its password). */
  owner: boolean
  /** This session's access key (kept across an in-room update). */
  roomKey: string | null
}

export const useRoomInfo = create<RoomInfoState>()(() => ({
  name: null,
  private: false,
  owner: false,
  roomKey: null,
}))

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
        let data: unknown
        try {
          data = JSON.parse(raw)
        } catch {
          return
        }
        const p = room.getParticipantByIdentity(identity)
        const who = p ? displayName(p) : 'Alguém'
        const access = roomAccessMessageSchema.safeParse(data)
        if (access.success) {
          if (access.data.private === useRoomInfo.getState().private) return
          useRoomInfo.setState({ private: access.data.private })
          usePrefs.getState().updateRecentRoom(roomId, { private: access.data.private })
          toast(
            access.data.private ? `${who} colocou senha na sala` : `${who} tirou a senha da sala`,
          )
          return
        }
        const parsed = roomNameMessageSchema.safeParse(data)
        if (!parsed.success) return
        const message: RoomNameMessage = parsed.data
        const name = message.name || null
        if (name === useRoomInfo.getState().name) return
        applyRoomName(roomId, name)
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

/**
 * Lock next to the room name: shows that the room is private, and lets its
 * creator set, change or remove the password.
 */
export function RoomAccess({ room, roomId }: { room: Room; roomId: string }) {
  const isPrivate = useRoomInfo((s) => s.private)
  const owner = useRoomInfo((s) => s.owner)
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  if (!owner) {
    if (!isPrivate) return null
    return (
      <Tooltip content="Sala privada: só entra quem souber a senha" side="bottom">
        <span className="no-drag bg-accent/20 text-accent-hover flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold">
          <Lock className="size-3.5" aria-hidden="true" /> Privada
        </span>
      </Tooltip>
    )
  }

  const save = async (next: string | null) => {
    const ownerKey = usePrefs.getState().recentRooms.find((r) => r.id === roomId)?.ownerKey
    if (!ownerKey) {
      toast.error('Só quem criou a sala, neste computador, pode mudar a senha.')
      return
    }
    setBusy(true)
    try {
      const res = await roomApi.setPassword(roomId, ownerKey, next)
      useRoomInfo.setState({ private: res.private, roomKey: res.roomKey })
      usePrefs.getState().updateRecentRoom(roomId, { private: res.private })
      const message: RoomAccessMessage = { v: 1, kind: 'room-access', private: res.private }
      void room.localParticipant
        .sendText(JSON.stringify(message), { topic: TOPIC_ROOM })
        .catch(() => undefined)
      toast.success(
        res.private
          ? 'Senha salva. Quem entrar a partir de agora vai precisar dela.'
          : 'A sala agora está aberta, sem senha.',
      )
      setPassword('')
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível mudar a senha.')
    } finally {
      setBusy(false)
    }
  }

  const tooShort = password.length < ROOM_PASSWORD_MIN

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={isPrivate ? 'Senha da sala' : 'Colocar senha na sala'}
          className={cn(
            'no-drag flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors',
            isPrivate
              ? 'bg-accent/20 text-accent-hover hover:bg-accent/30'
              : 'text-muted hover:bg-surface-2 hover:text-fg',
          )}
        >
          {isPrivate ? <Lock className="size-3.5" /> : <LockOpen className="size-3.5" />}
          {isPrivate ? 'Privada' : 'Aberta'}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[360px] p-5">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (!tooShort) void save(password)
          }}
        >
          <div className="flex items-start gap-3">
            <span className="bg-accent/20 text-accent-hover flex size-9 shrink-0 items-center justify-center rounded-lg">
              <Lock className="size-4" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-semibold">Senha da sala</p>
              <p className="text-muted mt-1 text-xs leading-relaxed">
                Só você, que criou a sala, pode {isPrivate ? 'trocar ou tirar' : 'colocar'} a senha.
                Quem já está dentro continua na sala.
              </p>
            </div>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">{isPrivate ? 'Nova senha' : 'Senha'}</span>
            <Input
              type="password"
              value={password}
              maxLength={ROOM_PASSWORD_MAX}
              placeholder={`Mínimo de ${ROOM_PASSWORD_MIN} caracteres`}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </label>
          <Button type="submit" variant="primary" disabled={busy || tooShort}>
            {isPrivate ? 'Salvar nova senha' : 'Tornar a sala privada'}
          </Button>
          {isPrivate && (
            <Button
              type="button"
              variant="outline"
              className="text-danger"
              disabled={busy}
              onClick={() => void save(null)}
            >
              <LockOpen /> Tirar a senha (sala aberta)
            </Button>
          )}
        </form>
      </PopoverContent>
    </Popover>
  )
}
