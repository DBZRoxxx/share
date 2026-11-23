import {
  ATTACHMENT_MAX,
  CHAT_SYNC_MAX,
  isChatAction,
  isImageMime,
  messageSnippet,
  parseChatEvent,
  type Attachment,
  type ChatEnvelope,
  type ChatHistory,
  type ChatMessage,
  type Gif,
  type ReplyTo,
} from '@share/shared/chat'
import { RoomEvent, type Participant, type Room } from 'livekit-client'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { shareGif } from '@/lib/gifs'
import { describeImage, forgetAttachment, resetAttachments, uploadAttachment } from './attachments'
import { useChat, type StagedFile } from './chat-store'
import { ChatSync, TOPIC_CHAT } from './chat-sync'
import { stageFiles } from './stage-files'
import { displayName } from './media-tile'
import { deliverChatNotice } from './notify'
import { chatNotice } from './notify-rules'
import { useRoomUi } from './room-ui'
import { usePrefs } from '@/stores/prefs'

/** v0.2 peers ask the oldest participant for the history over RPC. */
const RPC_HISTORY = 'share.chat.history'
const TOPIC_HISTORY = 'share.chat.history'
/** Live messages whose clock is further off than this get the local time. */
const MAX_CLOCK_SKEW_MS = 30_000

let sync: ChatSync | null = null

/** True when the user can't see the chat right now (other tab, hidden, unfocused). */
function chatHidden(): boolean {
  return useRoomUi.getState().panel !== 'chat' || document.hidden || !document.hasFocus()
}

/** Wires the chat to the room (live) and the server (history) while mounted. */
export function useChatTransport(room: Room, roomId: string, seed: ChatEnvelope[]) {
  useEffect(() => {
    const s = new ChatSync(room, roomId)
    sync = s
    const nameOf = (identity: string) => {
      const p = room.getParticipantByIdentity(identity)
      return p ? displayName(p) : identity.slice(0, 8)
    }

    room.registerTextStreamHandler(TOPIC_CHAT, (reader, { identity }) => {
      void reader.readAll().then((raw) => {
        const event = parseChatEvent(raw)
        if (!event) return
        const now = Date.now()
        if (Math.abs(event.ts - now) > MAX_CLOCK_SKEW_MS) event.ts = now
        const fromName = nameOf(identity)
        const isMessage = !isChatAction(event)
        const changed = s.receiveLive(
          { from: identity, fromName, event },
          isMessage && chatHidden(),
        )
        if (changed) {
          const envelope = { from: identity, fromName, event }
          const chat = useChat.getState()
          const notice = chatNotice(envelope, {
            me: room.localParticipant.identity,
            prefs: usePrefs.getState().notifications,
            messages: chat.messages,
          })
          if (notice) deliverChatNotice(notice)
        }
        if (changed && event.kind === 'delete') forgetDeleted(event.target)
      })
    })

    // Still answer v0.2 peers, in the format they understand.
    room.registerRpcMethod(RPC_HISTORY, async ({ callerIdentity }) => {
      const messages: ChatHistory['messages'] = []
      for (const { payload, from, fromName, deleted } of useChat.getState().messages) {
        if (deleted || payload.kind === 'file') continue
        // v0.2 has no replies: send the plain message.
        const { replyTo: _replyTo, ...plain } = payload
        messages.push({ payload: plain, from, fromName })
      }
      messages.splice(0, Math.max(0, messages.length - CHAT_SYNC_MAX))
      if (messages.length) {
        const history: ChatHistory = { v: 1, messages }
        await room.localParticipant.sendText(JSON.stringify(history), {
          topic: TOPIC_HISTORY,
          destinationIdentities: [callerIdentity],
        })
      }
      return String(messages.length)
    })

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

    // Files dropped anywhere in the room go to the chat (and never navigate the window).
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.files.length) return
      e.preventDefault()
      useRoomUi.getState().setPanel('chat')
      stageFiles([...e.dataTransfer.files])
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)

    void s.start(seed)

    return () => {
      s.dispose()
      if (sync === s) sync = null
      room.unregisterTextStreamHandler(TOPIC_CHAT)
      room.unregisterRpcMethod(RPC_HISTORY)
      room.off(RoomEvent.ParticipantNameChanged, onName)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
      resetAttachments()
    }
    // The seed is only read on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, roomId])
}

function forgetDeleted(messageId: string) {
  const m = useChat.getState().messages.find((x) => x.payload.id === messageId)
  if (m?.payload.kind === 'file') forgetAttachment(m.payload.file.id)
}

const newId = () => crypto.randomUUID()
const base = () => ({ v: 1 as const, id: newId(), ts: Date.now() })

function active(): ChatSync | null {
  if (!sync) toast.error('O chat não está conectado.')
  return sync
}

/** Quote for a reply to `m`. */
export function replyQuote(m: ChatMessage): ReplyTo {
  return { id: m.payload.id, from: m.from, fromName: m.fromName, ...messageSnippet(m.payload) }
}

export const chatActions = {
  sendText(text: string, replyTo: ReplyTo | null) {
    active()?.send({ ...base(), kind: 'text', text: text.trim(), replyTo: replyTo ?? undefined })
  },

  sendGif(gif: Gif, query: string, replyTo: ReplyTo | null) {
    const s = active()
    if (!s) return
    s.send({ ...base(), kind: 'gif', gif, replyTo: replyTo ?? undefined })
    void shareGif(gif.id, query)
  },

  /** Each file becomes its own message; the caption goes with the first. */
  async sendFiles(staged: StagedFile[], caption: string, replyTo: ReplyTo | null) {
    const s = active()
    if (!s) return
    for (const [i, { file }] of staged.entries()) {
      if (file.size > ATTACHMENT_MAX) {
        toast.error(`“${file.name}” passa de 100 MB.`)
        continue
      }
      const fileId = newId()
      const attachment: Attachment = {
        id: fileId,
        name: file.name.trim().slice(0, 200) || 'arquivo',
        size: file.size,
        mime: (file.type || 'application/octet-stream').slice(0, 127),
        ...(isImageMime(file.type) ? await describeImage(file) : {}),
      }
      const event = {
        ...base(),
        kind: 'file' as const,
        file: attachment,
        text: i === 0 && caption.trim() ? caption.trim() : undefined,
        replyTo: i === 0 ? (replyTo ?? undefined) : undefined,
      }
      s.send(event)
      uploadAttachment(s.roomId, fileId, file, () =>
        sync?.send({ ...base(), kind: 'file-ready', target: event.id }),
      )
    }
  },

  react(target: ChatMessage, emoji: string | null, myIdentity: string) {
    const current = target.reactions?.[myIdentity] ?? null
    const next = current === emoji ? null : emoji
    active()?.send({ ...base(), kind: 'react', target: target.payload.id, emoji: next })
  },

  edit(target: ChatMessage, text: string) {
    const trimmed = text.trim()
    if (target.payload.kind === 'text' && !trimmed) return
    active()?.send({ ...base(), kind: 'edit', target: target.payload.id, text: trimmed })
  },

  remove(target: ChatMessage) {
    const s = active()
    if (!s) return
    s.send({ ...base(), kind: 'delete', target: target.payload.id })
    if (target.payload.kind === 'file') forgetAttachment(target.payload.file.id)
  },

  roomId: () => sync?.roomId ?? null,
}
