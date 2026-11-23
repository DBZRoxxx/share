import { mergeChatMessages, type ChatMessage } from '@share/shared'
import { create } from 'zustand'

interface ChatState {
  messages: ChatMessage[]
  /** Messages from others received while the chat tab was closed. */
  unread: number
  draft: string
  add: (messages: ChatMessage[], opts?: { unread?: boolean }) => void
  remove: (id: string) => void
  markRead: () => void
  setDraft: (draft: string) => void
  reset: (messages?: ChatMessage[]) => void
}

export const useChat = create<ChatState>()((set) => ({
  messages: [],
  unread: 0,
  draft: '',
  add: (incoming, opts) =>
    set((s) => {
      const messages = mergeChatMessages(s.messages, incoming)
      if (messages === s.messages) return s
      const added = messages.length - s.messages.length
      return { messages, unread: opts?.unread ? s.unread + Math.max(1, added) : s.unread }
    }),
  remove: (id) => set((s) => ({ messages: s.messages.filter((m) => m.payload.id !== id) })),
  markRead: () => set((s) => (s.unread ? { unread: 0 } : s)),
  setDraft: (draft) => set({ draft }),
  reset: (messages = []) => set({ messages, unread: 0, draft: '' }),
}))
