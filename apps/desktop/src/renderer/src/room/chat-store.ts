import {
  applyChatEvent,
  isChatAction,
  type ChatEnvelope,
  type ChatMessage,
  type ReplyTo,
} from '@share/shared/chat'
import { create } from 'zustand'

/** Actions whose message has not arrived yet are retried for this long. */
const ORPHAN_TTL_MS = 15_000

export interface StagedFile {
  key: string
  file: File
  /** Object URL for image previews. */
  preview?: string
}

interface ChatState {
  messages: ChatMessage[]
  /** Own event ids the server has not confirmed yet. */
  unsynced: Set<string>
  /** Messages from others received while the chat tab was closed. */
  unread: number
  draft: string
  replyTo: ReplyTo | null
  editing: { id: string; text: string } | null
  staged: StagedFile[]
  /** Message to scroll to and highlight (reply quote clicked). */
  highlight: string | null
  /**
   * Folds events into the messages. Returns the envelopes that changed
   * something (callers use it for notifications and caching).
   */
  apply: (envelopes: ChatEnvelope[], opts?: { unread?: boolean }) => ChatEnvelope[]
  setUnsynced: (ids: string[], unsynced: boolean) => void
  markRead: () => void
  setDraft: (draft: string) => void
  setReplyTo: (replyTo: ReplyTo | null) => void
  setEditing: (editing: { id: string; text: string } | null) => void
  stage: (files: StagedFile[]) => void
  unstage: (key?: string) => void
  setHighlight: (id: string | null) => void
  reset: () => void
}

let orphans: { envelope: ChatEnvelope; at: number }[] = []

export const useChat = create<ChatState>()((set, get) => ({
  messages: [],
  unsynced: new Set(),
  unread: 0,
  draft: '',
  replyTo: null,
  editing: null,
  staged: [],
  highlight: null,

  apply: (envelopes, opts) => {
    let { messages } = get()
    const changed: ChatEnvelope[] = []
    let newMessages = 0
    const run = (envelope: ChatEnvelope): boolean => {
      const result = applyChatEvent(messages, envelope)
      if (result.status === 'applied') {
        messages = result.messages
        changed.push(envelope)
        if (!isChatAction(envelope.event)) newMessages++
        return true
      }
      if (result.status === 'pending') orphans.push({ envelope, at: Date.now() })
      return false
    }
    for (const e of envelopes) run(e)
    // Retry actions that were waiting for their message.
    if (orphans.length && changed.length) {
      const now = Date.now()
      const waiting = orphans.filter((o) => now - o.at < ORPHAN_TTL_MS)
      orphans = []
      for (const o of waiting) {
        const result = applyChatEvent(messages, o.envelope)
        if (result.status === 'applied') {
          messages = result.messages
          changed.push(o.envelope)
        } else if (result.status === 'pending') {
          orphans.push(o)
        }
      }
    }
    if (changed.length) {
      set((s) => ({
        messages,
        unread: opts?.unread && newMessages ? s.unread + newMessages : s.unread,
      }))
    }
    return changed
  },

  setUnsynced: (ids, unsynced) =>
    set((s) => {
      const next = new Set(s.unsynced)
      for (const id of ids) {
        if (unsynced) next.add(id)
        else next.delete(id)
      }
      return { unsynced: next }
    }),
  markRead: () => set((s) => (s.unread ? { unread: 0 } : s)),
  setDraft: (draft) => set({ draft }),
  setReplyTo: (replyTo) => set({ replyTo, editing: null }),
  setEditing: (editing) => set({ editing, replyTo: null }),
  stage: (files) => set((s) => ({ staged: [...s.staged, ...files].slice(0, 10) })),
  unstage: (key) =>
    set((s) => {
      const removed = key ? s.staged.filter((f) => f.key === key) : s.staged
      for (const f of removed) if (f.preview) URL.revokeObjectURL(f.preview)
      return { staged: key ? s.staged.filter((f) => f.key !== key) : [] }
    }),
  setHighlight: (highlight) => set({ highlight }),
  reset: () => {
    orphans = []
    get().unstage()
    set({
      messages: [],
      unsynced: new Set(),
      unread: 0,
      draft: '',
      replyTo: null,
      editing: null,
      staged: [],
      highlight: null,
    })
  },
}))
