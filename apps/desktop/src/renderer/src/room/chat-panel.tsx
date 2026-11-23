import { useRoomContext } from '@livekit/components-react'
import {
  CHAT_TEXT_MAX,
  dayLabel,
  sameDay,
  type Attachment,
  type ChatMessage,
  type Gif,
} from '@share/shared/chat'
import {
  ArrowDown,
  File as FileIcon,
  ImagePlay,
  MessageCircle,
  Paperclip,
  Pencil,
  SendHorizontal,
  Smile,
  UploadCloud,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { formatBytes } from './attachments'
import { ImageViewer } from './chat-attachment'
import { MessageRow, Quote } from './chat-message'
import { useChat, type StagedFile } from './chat-store'
import { stageFiles } from './stage-files'
import { EmojiPicker } from './emoji-picker'
import { GifPicker } from './gif-picker'
import { displayName } from './media-tile'
import { chatActions } from './use-chat'

/** Consecutive messages from the same person within this window are grouped. */
const GROUP_WINDOW_MS = 5 * 60_000

function isGrouped(prev: ChatMessage | undefined, m: ChatMessage): boolean {
  return (
    !!prev &&
    prev.from === m.from &&
    m.payload.ts - prev.payload.ts < GROUP_WINDOW_MS &&
    sameDay(prev.payload.ts, m.payload.ts)
  )
}

export function ChatPanel() {
  const messages = useChat((s) => s.messages)
  const unsynced = useChat((s) => s.unsynced)
  const highlight = useChat((s) => s.highlight)
  const markRead = useChat((s) => s.markRead)
  const room = useRoomContext()
  const localIdentity = room.localParticipant.identity
  const listRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const [showJump, setShowJump] = useState(false)
  const lastCount = useRef(0)
  const [toDelete, setToDelete] = useState<ChatMessage | null>(null)
  const [viewing, setViewing] = useState<{ file: Attachment; url: string } | null>(null)
  const [dragging, setDragging] = useState(false)

  const nameOf = useCallback(
    (identity: string) => {
      const p = room.getParticipantByIdentity(identity)
      if (p) return displayName(p)
      return messages.find((m) => m.from === identity)?.fromName ?? 'Alguém'
    },
    [room, messages],
  )
  const openImage = useCallback((file: Attachment, url: string) => setViewing({ file, url }), [])

  // Reading the panel clears the badge (also when new messages arrive while open).
  useEffect(() => {
    if (!document.hidden) markRead()
  }, [messages, markRead])

  // Stick to the bottom unless the user scrolled up to read older messages.
  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    const added = messages.length > lastCount.current
    const mine = messages.at(-1)?.from === localIdentity
    lastCount.current = messages.length
    if (atBottomRef.current || (added && mine)) {
      el.scrollTop = el.scrollHeight
    } else if (added) {
      setShowJump(true)
    }
  }, [messages, localIdentity])

  // Images grow when they load: keep the bottom in view.
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      if (atBottomRef.current) el.scrollTop = el.scrollHeight
    })
    for (const child of el.children) observer.observe(child)
    return () => observer.disconnect()
  }, [messages])

  // Reply quote clicked: bring the original into view and flash it.
  useEffect(() => {
    if (!highlight) return
    listRef.current
      ?.querySelector(`[data-msg="${CSS.escape(highlight)}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    const t = setTimeout(() => useChat.getState().setHighlight(null), 1600)
    return () => clearTimeout(t)
  }, [highlight])

  const onScroll = () => {
    const el = listRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    if (atBottomRef.current) setShowJump(false)
  }

  const jump = () => {
    const el = listRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setShowJump(false)
  }

  const rows: ReactNode[] = []
  messages.forEach((m, i) => {
    const prev = messages[i - 1]
    if (!prev || !sameDay(prev.payload.ts, m.payload.ts)) {
      rows.push(<DaySeparator key={`day-${m.payload.id}`} ts={m.payload.ts} />)
    }
    rows.push(
      <MessageRow
        key={m.payload.id}
        message={m}
        own={m.from === localIdentity}
        grouped={isGrouped(prev, m)}
        localIdentity={localIdentity}
        highlighted={highlight === m.payload.id}
        unsynced={unsynced.has(m.payload.id)}
        onDelete={setToDelete}
        onOpenImage={openImage}
        nameOf={nameOf}
      />,
    )
  })

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('Files')) setDragging(true)
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(e) => {
        setDragging(false)
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        e.stopPropagation()
        stageFiles([...e.dataTransfer.files])
      }}
    >
      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={onScroll}
          className="h-full overflow-y-auto px-3 pt-3 pb-2 select-text"
          role="log"
          aria-live="polite"
          aria-label="Mensagens do chat"
        >
          {messages.length === 0 ? (
            <div className="text-muted flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm">
              <MessageCircle className="size-8 opacity-60" aria-hidden="true" />
              <p>Nenhuma mensagem ainda.</p>
              <p className="text-xs">
                Mande um oi, um emoji ou um GIF. Para enviar um print, cole com Ctrl+V.
              </p>
            </div>
          ) : (
            rows
          )}
        </div>
        {showJump && (
          <button
            type="button"
            onClick={jump}
            className="bg-accent hover:bg-accent-hover animate-fade-in absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-white shadow-lg"
          >
            <ArrowDown className="size-3.5" /> Novas mensagens
          </button>
        )}
      </div>
      <Composer />

      {dragging && (
        <div className="border-accent bg-bg/85 animate-fade-in pointer-events-none absolute inset-2 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed text-sm">
          <UploadCloud className="text-accent size-8" />
          Solte para anexar (até 100 MB)
        </div>
      )}

      <DeleteDialog message={toDelete} onClose={() => setToDelete(null)} />
      <ImageViewer image={viewing} onClose={() => setViewing(null)} />
    </div>
  )
}

function DaySeparator({ ts }: { ts: number }) {
  return (
    <div className="my-3 flex items-center gap-3 first:mt-0" role="separator">
      <span className="bg-border h-px flex-1" />
      <span className="bg-surface-2 text-muted rounded-full px-2.5 py-0.5 text-[11px] font-medium">
        {dayLabel(ts)}
      </span>
      <span className="bg-border h-px flex-1" />
    </div>
  )
}

function DeleteDialog({ message, onClose }: { message: ChatMessage | null; onClose: () => void }) {
  return (
    <Dialog open={!!message} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        title="Apagar mensagem?"
        description="Ela será apagada para todos na sala. Não dá para desfazer."
        className="w-[min(420px,calc(100vw-2rem))]"
      >
        <div className="flex justify-end gap-2 px-6 pb-5">
          <DialogClose asChild>
            <Button variant="ghost" autoFocus>
              Cancelar
            </Button>
          </DialogClose>
          <Button
            variant="danger"
            onClick={() => {
              if (message) chatActions.remove(message)
              onClose()
            }}
          >
            Apagar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Composer() {
  const room = useRoomContext()
  const draft = useChat((s) => s.draft)
  const editing = useChat((s) => s.editing)
  const replyTo = useChat((s) => s.replyTo)
  const staged = useChat((s) => s.staged)
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [gifOpen, setGifOpen] = useState(false)
  const value = editing ? editing.text : draft

  const setValue = (text: string) => {
    const chat = useChat.getState()
    if (chat.editing) chat.setEditing({ ...chat.editing, text })
    else chat.setDraft(text)
  }

  // Auto-grow up to ~6 lines.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [value])

  // Focus when the panel opens, and when starting a reply or an edit.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    if (editing) el.setSelectionRange(el.value.length, el.value.length)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing?.id, replyTo?.id])

  const submit = () => {
    const chat = useChat.getState()
    const text = value.trim()
    if (chat.editing) {
      const target = chat.messages.find((m) => m.payload.id === chat.editing!.id)
      if (target && (text || target.payload.kind === 'file')) chatActions.edit(target, text)
      chat.setEditing(null)
      return
    }
    if (chat.staged.length) {
      const files = chat.staged
      useChat.setState({ staged: [] })
      chat.setDraft('')
      chat.setReplyTo(null)
      void chatActions.sendFiles(files, text, chat.replyTo).finally(() => {
        for (const f of files) if (f.preview) URL.revokeObjectURL(f.preview)
      })
      return
    }
    if (!text) return
    chatActions.sendText(text, chat.replyTo)
    chat.setDraft('')
    chat.setReplyTo(null)
  }

  const editLast = () => {
    const chat = useChat.getState()
    const me = room.localParticipant.identity
    const last = [...chat.messages]
      .reverse()
      .find(
        (m) =>
          m.from === me && !m.deleted && (m.payload.kind === 'text' || m.payload.kind === 'file'),
      )
    if (!last) return false
    const text = last.payload.kind === 'gif' ? '' : (last.payload.text ?? '')
    chat.setEditing({ id: last.payload.id, text })
    return true
  }

  const insertEmoji = (emoji: string) => {
    const el = ref.current
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    setValue((value.slice(0, start) + emoji + value.slice(end)).slice(0, CHAT_TEXT_MAX))
    requestAnimationFrame(() => {
      el?.focus()
      const caret = start + emoji.length
      el?.setSelectionRange(caret, caret)
    })
  }

  const pickGif = (gif: Gif, query: string) => {
    setGifOpen(false)
    chatActions.sendGif(gif, query, useChat.getState().replyTo)
    useChat.getState().setReplyTo(null)
    ref.current?.focus()
  }

  const remaining = CHAT_TEXT_MAX - value.length
  const canSend = !!value.trim() || staged.length > 0 || (!!editing && editingFile(editing.id))

  return (
    <div className="border-border border-t p-3">
      {editing && (
        <ComposerBar
          onClose={() => useChat.getState().setEditing(null)}
          closeLabel="Cancelar edição (Esc)"
        >
          <span className="text-accent flex items-center gap-1.5 text-xs font-semibold">
            <Pencil className="size-3.5" /> Editando mensagem
          </span>
        </ComposerBar>
      )}
      {replyTo && !editing && (
        <ComposerBar
          onClose={() => useChat.getState().setReplyTo(null)}
          closeLabel="Cancelar resposta"
        >
          <Quote replyTo={replyTo} compact />
        </ComposerBar>
      )}
      {staged.length > 0 && !editing && <StagedTray staged={staged} />}

      <div className="border-border bg-surface-2 focus-within:border-accent flex items-end gap-1 rounded-2xl border p-1.5 transition-colors">
        {!editing && (
          <ComposerButton
            label="Anexar arquivo (até 100 MB)"
            onClick={() => fileInput.current?.click()}
          >
            <Paperclip />
          </ComposerButton>
        )}
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            stageFiles([...(e.target.files ?? [])])
            e.target.value = ''
            ref.current?.focus()
          }}
        />
        <textarea
          ref={ref}
          rows={1}
          value={value}
          maxLength={CHAT_TEXT_MAX}
          onChange={(e) => setValue(e.target.value)}
          onPaste={(e) => {
            const files = [...e.clipboardData.files]
            if (!files.length || editing) return
            e.preventDefault()
            stageFiles(files)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            } else if (e.key === 'Escape') {
              const chat = useChat.getState()
              if (chat.editing) chat.setEditing(null)
              else if (chat.replyTo) chat.setReplyTo(null)
              else if (chat.staged.length) chat.unstage()
              else return
              e.preventDefault()
              e.stopPropagation()
            } else if (e.key === 'ArrowUp' && !value && !staged.length && !editing) {
              if (editLast()) e.preventDefault()
            }
          }}
          placeholder={
            editing ? 'Editar mensagem' : staged.length ? 'Legenda (opcional)' : 'Mensagem'
          }
          aria-label="Mensagem para a sala"
          className="placeholder:text-muted max-h-[140px] min-h-8 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-5 outline-none"
        />
        <Popover open={emojiOpen} onOpenChange={setEmojiOpen}>
          <ComposerButton label="Emojis" as={PopoverTrigger}>
            <Smile />
          </ComposerButton>
          <PopoverContent side="top" align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
            <EmojiPicker onPick={insertEmoji} />
          </PopoverContent>
        </Popover>
        {!editing && !staged.length && (
          <Popover open={gifOpen} onOpenChange={setGifOpen}>
            <ComposerButton label="GIFs" as={PopoverTrigger}>
              <ImagePlay />
            </ComposerButton>
            <PopoverContent side="top" align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
              <GifPicker onPick={pickGif} />
            </PopoverContent>
          </Popover>
        )}
        <ComposerButton
          label={editing ? 'Salvar (Enter)' : 'Enviar (Enter)'}
          onClick={submit}
          disabled={!canSend}
          primary
        >
          <SendHorizontal />
        </ComposerButton>
      </div>
      {remaining < 200 && (
        <p
          className={cn('mt-1 text-right text-xs', remaining < 20 ? 'text-warning' : 'text-muted')}
        >
          {remaining}
        </p>
      )}
    </div>
  )
}

function editingFile(id: string): boolean {
  return useChat.getState().messages.find((m) => m.payload.id === id)?.payload.kind === 'file'
}

function ComposerBar({
  children,
  onClose,
  closeLabel,
}: {
  children: ReactNode
  onClose: () => void
  closeLabel: string
}) {
  return (
    <div className="animate-fade-in mb-2 flex items-center gap-2">
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        aria-label={closeLabel}
        title={closeLabel}
        onClick={onClose}
        className="text-muted hover:bg-surface-2 hover:text-fg rounded-lg p-1"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

function StagedTray({ staged }: { staged: StagedFile[] }) {
  const unstage = useChat((s) => s.unstage)
  return (
    <div className="animate-fade-in mb-2 flex gap-2 overflow-x-auto pb-1">
      {staged.map((s) => (
        <div
          key={s.key}
          className="border-border bg-surface-2 relative shrink-0 overflow-hidden rounded-xl border"
        >
          {s.preview ? (
            <img src={s.preview} alt={s.file.name} className="h-24 max-w-40 object-cover" />
          ) : (
            <div className="flex h-24 w-40 flex-col justify-center gap-1 p-3">
              <FileIcon className="text-muted size-6" />
              <p className="truncate text-xs font-medium" title={s.file.name}>
                {s.file.name}
              </p>
              <p className="text-muted text-[11px]">{formatBytes(s.file.size)}</p>
            </div>
          )}
          <button
            type="button"
            aria-label={`Remover ${s.file.name}`}
            onClick={() => unstage(s.key)}
            className="absolute top-1 right-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}

function ComposerButton({
  label,
  children,
  onClick,
  disabled,
  primary,
  as: Wrapper,
}: {
  label: string
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  primary?: boolean
  as?: typeof PopoverTrigger
}) {
  const button = (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-xl transition-colors disabled:opacity-40 [&_svg]:size-[18px]',
        primary
          ? 'bg-accent hover:bg-accent-hover disabled:text-muted text-white disabled:bg-transparent'
          : 'text-muted hover:bg-surface-3 hover:text-fg data-[state=open]:bg-surface-3 data-[state=open]:text-fg',
      )}
    >
      {children}
    </button>
  )
  const trigger = Wrapper ? <Wrapper asChild>{button}</Wrapper> : button
  return <Tooltip content={label}>{trigger}</Tooltip>
}
