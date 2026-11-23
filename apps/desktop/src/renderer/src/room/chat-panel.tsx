import { useRoomContext } from '@livekit/components-react'
import { CHAT_TEXT_MAX, isEmojiOnly, type ChatMessage, type Gif } from '@share/shared'
import { ArrowDown, ImagePlay, MessageCircle, SendHorizontal, Smile } from 'lucide-react'
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger, Tooltip } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { useChat } from './chat-store'
import { EmojiPicker } from './emoji-picker'
import { GifPicker } from './gif-picker'
import { NameAvatar } from './media-tile'
import { useSendChat } from './use-chat'

/** Consecutive messages from the same person within this window are grouped. */
const GROUP_WINDOW_MS = 5 * 60_000
const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/gi

const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

function linkify(text: string): ReactNode[] {
  return text.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noreferrer"
        className="text-accent break-all underline-offset-2 hover:underline"
      >
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  )
}

export function ChatPanel() {
  const messages = useChat((s) => s.messages)
  const markRead = useChat((s) => s.markRead)
  const room = useRoomContext()
  const localIdentity = room.localParticipant.identity
  const listRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const [showJump, setShowJump] = useState(false)
  const lastCount = useRef(0)

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
    if (atBottomRef.current || mine) {
      el.scrollTop = el.scrollHeight
    } else if (added) {
      setShowJump(true)
    }
  }, [messages, localIdentity])

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

  return (
    <>
      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          onScroll={onScroll}
          className="h-full overflow-y-auto px-3 py-2 select-text"
          role="log"
          aria-live="polite"
          aria-label="Mensagens do chat"
        >
          {messages.length === 0 ? (
            <div className="text-muted flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm">
              <MessageCircle className="size-8 opacity-60" aria-hidden="true" />
              <p>Nenhuma mensagem ainda.</p>
              <p className="text-xs">Mande um oi, um emoji ou um GIF para a sala.</p>
            </div>
          ) : (
            messages.map((m, i) => (
              <MessageRow
                key={m.payload.id}
                message={m}
                own={m.from === localIdentity}
                grouped={isGrouped(messages[i - 1], m)}
              />
            ))
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
    </>
  )
}

function isGrouped(prev: ChatMessage | undefined, m: ChatMessage): boolean {
  return !!prev && prev.from === m.from && m.payload.ts - prev.payload.ts < GROUP_WINDOW_MS
}

function MessageRow({
  message,
  own,
  grouped,
}: {
  message: ChatMessage
  own: boolean
  grouped: boolean
}) {
  const { payload } = message
  const time = timeFormat.format(payload.ts)
  return (
    <div className={cn('group flex gap-2.5', grouped ? 'mt-0.5' : 'mt-3 first:mt-1')}>
      <div className="w-7 shrink-0">
        {!grouped && <NameAvatar seed={message.from} name={message.fromName} size="xs" />}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped && (
          <p className="flex items-baseline gap-2 text-xs">
            <span className="text-fg truncate font-semibold">
              {message.fromName}
              {own && <span className="text-muted font-normal"> (você)</span>}
            </span>
            <time className="text-muted shrink-0" dateTime={new Date(payload.ts).toISOString()}>
              {time}
            </time>
          </p>
        )}
        {payload.kind === 'text' ? (
          <p
            title={grouped ? time : undefined}
            className={cn(
              'text-fg/95 break-words whitespace-pre-wrap',
              isEmojiOnly(payload.text) ? 'text-3xl leading-tight' : 'text-sm leading-relaxed',
            )}
          >
            {linkify(payload.text)}
          </p>
        ) : (
          <GifMessage gif={payload.gif} />
        )}
      </div>
    </div>
  )
}

function GifMessage({ gif }: { gif: Gif }) {
  const maxW = 220
  const width = Math.min(maxW, gif.width)
  return (
    <img
      src={gif.url}
      alt={gif.title || 'GIF'}
      title={gif.title}
      loading="lazy"
      decoding="async"
      draggable={false}
      width={width}
      height={Math.round((width * gif.height) / gif.width)}
      className="bg-surface-2 mt-1 max-w-full rounded-lg"
    />
  )
}

function Composer() {
  const room = useRoomContext()
  const send = useSendChat(room)
  const draft = useChat((s) => s.draft)
  const setDraft = useChat((s) => s.setDraft)
  const ref = useRef<HTMLTextAreaElement>(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [gifOpen, setGifOpen] = useState(false)

  // Auto-grow up to ~6 lines.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [draft])

  useEffect(() => {
    ref.current?.focus()
  }, [])

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    setDraft('')
    void send({ kind: 'text', text }).then((ok) => {
      if (!ok) setDraft(text)
    })
  }

  const insertEmoji = (emoji: string) => {
    const el = ref.current
    const start = el?.selectionStart ?? draft.length
    const end = el?.selectionEnd ?? draft.length
    const next = (draft.slice(0, start) + emoji + draft.slice(end)).slice(0, CHAT_TEXT_MAX)
    setDraft(next)
    requestAnimationFrame(() => {
      el?.focus()
      const caret = start + emoji.length
      el?.setSelectionRange(caret, caret)
    })
  }

  const pickGif = (gif: Gif, query: string) => {
    setGifOpen(false)
    void send({ kind: 'gif', gif, query })
    ref.current?.focus()
  }

  const remaining = CHAT_TEXT_MAX - draft.length

  return (
    <div className="border-border border-t p-3">
      <div className="border-border bg-surface-2 focus-within:border-accent flex items-end gap-1 rounded-2xl border p-1.5 transition-colors">
        <textarea
          ref={ref}
          rows={1}
          value={draft}
          maxLength={CHAT_TEXT_MAX}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder="Mensagem para a sala"
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
        <Popover open={gifOpen} onOpenChange={setGifOpen}>
          <ComposerButton label="GIFs" as={PopoverTrigger}>
            <ImagePlay />
          </ComposerButton>
          <PopoverContent side="top" align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
            <GifPicker onPick={pickGif} />
          </PopoverContent>
        </Popover>
        <ComposerButton label="Enviar (Enter)" onClick={submit} disabled={!draft.trim()} primary>
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
