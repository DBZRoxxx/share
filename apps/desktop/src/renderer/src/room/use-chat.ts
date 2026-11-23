import {
  CHAT_SYNC_MAX,
  parseChatHistory,
  parseChatPayload,
  type ChatHistory,
  type ChatMessage,
  type ChatPayload,
  type Gif,
} from '@share/shared'
import { RoomEvent, type Participant, type Room } from 'livekit-client'
import { useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { shareGif } from '@/lib/gifs'
import { useChat } from './chat-store'
import { displayName } from './media-tile'
import { useRoomUi } from './room-ui'

const TOPIC_CHAT = 'share.chat'
const TOPIC_HISTORY = 'share.chat.history'
const RPC_HISTORY = 'share.chat.history'
/** Live messages whose clock is further off than this get the local time. */
const MAX_CLOCK_SKEW_MS = 30_000

function preview(payload: ChatPayload): string {
  return payload.kind === 'gif' ? 'enviou um GIF' : payload.text
}

/** True when the user can't see the chat right now (other tab, hidden, unfocused). */
function chatHidden(): boolean {
  return useRoomUi.getState().panel !== 'chat' || document.hidden || !document.hasFocus()
}

function notify(author: string, payload: ChatPayload) {
  const body = preview(payload)
  if (document.hidden || !document.hasFocus()) {
    // Window is in the tray or behind other apps: use a Windows notification.
    try {
      const n = new Notification(author, { body: body.slice(0, 200), tag: 'share-chat' })
      n.onclick = () => {
        void window.share.app.show()
        useRoomUi.getState().setPanel('chat')
      }
    } catch {
      // Notifications unavailable; the unread badge still shows.
    }
    return
  }
  if (useRoomUi.getState().panel === 'chat') return
  toast(author, {
    id: 'chat-message',
    description: body.length > 120 ? `${body.slice(0, 120)}…` : body,
    action: { label: 'Abrir chat', onClick: () => useRoomUi.getState().setPanel('chat') },
  })
}

/** Oldest remote participant: the most likely to have the full history. */
function historySource(room: Room): Participant | null {
  let best: Participant | null = null
  for (const p of room.remoteParticipants.values()) {
    if (!best || (p.joinedAt?.getTime() ?? Infinity) < (best.joinedAt?.getTime() ?? Infinity)) {
      best = p
    }
  }
  return best
}

/** Wires the chat to the room's data channel for as long as the room is mounted. */
export function useChatTransport(room: Room) {
  useEffect(() => {
    const nameOf = (identity: string) => {
      const p = room.getParticipantByIdentity(identity)
      return p ? displayName(p) : identity.slice(0, 8)
    }

    room.registerTextStreamHandler(TOPIC_CHAT, (reader, { identity }) => {
      void reader.readAll().then((raw) => {
        const payload = parseChatPayload(raw)
        if (!payload) return
        const now = Date.now()
        if (Math.abs(payload.ts - now) > MAX_CLOCK_SKEW_MS) payload.ts = now
        const fromName = nameOf(identity)
        useChat.getState().add([{ payload, from: identity, fromName }], { unread: chatHidden() })
        notify(fromName, payload)
      })
    })

    room.registerTextStreamHandler(TOPIC_HISTORY, (reader) => {
      void reader.readAll().then((raw) => {
        const history = parseChatHistory(raw)
        if (history) useChat.getState().add(history.messages)
      })
    })

    room.registerRpcMethod(RPC_HISTORY, async ({ callerIdentity }) => {
      const messages = useChat.getState().messages.slice(-CHAT_SYNC_MAX)
      if (messages.length) {
        const history: ChatHistory = { v: 1, messages }
        await room.localParticipant.sendText(JSON.stringify(history), {
          topic: TOPIC_HISTORY,
          destinationIdentities: [callerIdentity],
        })
      }
      return String(messages.length)
    })

    const requestHistory = () => {
      const source = historySource(room)
      if (!source) return
      room.localParticipant
        .performRpc({ destinationIdentity: source.identity, method: RPC_HISTORY, payload: '' })
        .catch((error: unknown) => console.warn('[chat] history request failed', error))
    }
    requestHistory()

    // Keep author names current when someone renames.
    const onName = (name: string | undefined, p: Participant) => {
      if (!name) return
      const { messages } = useChat.getState()
      if (!messages.some((m) => m.from === p.identity && m.fromName !== name)) return
      useChat.setState({
        messages: messages.map((m) => (m.from === p.identity ? { ...m, fromName: name } : m)),
      })
    }
    room.on(RoomEvent.ParticipantNameChanged, onName)

    return () => {
      room.unregisterTextStreamHandler(TOPIC_CHAT)
      room.unregisterTextStreamHandler(TOPIC_HISTORY)
      room.unregisterRpcMethod(RPC_HISTORY)
      room.off(RoomEvent.ParticipantNameChanged, onName)
    }
  }, [room])
}

type Outgoing = { kind: 'text'; text: string } | { kind: 'gif'; gif: Gif; query: string }

export function useSendChat(room: Room) {
  return useCallback(
    async (message: Outgoing): Promise<boolean> => {
      const base = { v: 1 as const, id: crypto.randomUUID(), ts: Date.now() }
      const payload: ChatPayload =
        message.kind === 'text'
          ? { ...base, kind: 'text', text: message.text.trim() }
          : { ...base, kind: 'gif', gif: message.gif }
      const local = room.localParticipant
      const entry: ChatMessage = { payload, from: local.identity, fromName: displayName(local) }
      const chat = useChat.getState()
      chat.add([entry])
      try {
        await local.sendText(JSON.stringify(payload), { topic: TOPIC_CHAT })
        if (message.kind === 'gif') void shareGif(message.gif.id, message.query)
        return true
      } catch (error) {
        console.error('[chat] send failed', error)
        chat.remove(payload.id)
        toast.error('Não foi possível enviar a mensagem.')
        return false
      }
    },
    [room],
  )
}
