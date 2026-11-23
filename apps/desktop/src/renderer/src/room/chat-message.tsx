import {
  isEmojiOnly,
  isImageMime,
  type Attachment,
  type ChatMessage,
  type Gif,
  type ReplyTo,
} from '@share/shared/chat'
import {
  Ban,
  Check,
  Clock3,
  Copy,
  Download,
  Image as ImageIcon,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Plus,
  Reply,
  SmilePlus,
  Trash2,
} from 'lucide-react'
import { Fragment, memo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
} from '@/components/ui/primitives'
import { cn, hueFor } from '@/lib/utils'
import { saveAttachment, useAttachments } from './attachments'
import { FileAttachment, ImageAttachment } from './chat-attachment'
import { useChat } from './chat-store'
import { EmojiPicker } from './emoji-picker'
import { NameAvatar } from './media-tile'
import { chatActions, replyQuote } from './use-chat'

export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/gi
const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const fullFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full', timeStyle: 'short' })

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

const authorColor = (seed: string) => `hsl(${hueFor(seed)} 70% 68%)`

export interface MessageRowProps {
  message: ChatMessage
  own: boolean
  grouped: boolean
  localIdentity: string
  highlighted: boolean
  unsynced: boolean
  onDelete: (m: ChatMessage) => void
  onOpenImage: (file: Attachment, url: string) => void
  /** Display names of people in the room, for reaction tooltips. */
  nameOf: (identity: string) => string
}

export const MessageRow = memo(function MessageRow({
  message,
  own,
  grouped,
  localIdentity,
  highlighted,
  unsynced,
  onDelete,
  onOpenImage,
  nameOf,
}: MessageRowProps) {
  const { payload } = message
  const [menuOpen, setMenuOpen] = useState(false)
  const [reactOpen, setReactOpen] = useState(false)
  const toolbarVisible = menuOpen || reactOpen
  const deleted = !!message.deleted

  const meta = (
    <MessageMeta
      ts={payload.ts}
      edited={!!message.editedAt && !deleted}
      own={own}
      unsynced={unsynced}
    />
  )

  let body: ReactNode
  if (deleted) {
    body = (
      <p className="text-muted flex flex-wrap items-center gap-1.5 text-sm italic">
        <Ban className="size-3.5" /> {own ? 'Você apagou esta mensagem' : 'Mensagem apagada'}
        {meta}
      </p>
    )
  } else if (payload.kind === 'text') {
    const big = isEmojiOnly(payload.text)
    body = (
      <p
        className={cn(
          'text-fg/95 break-words whitespace-pre-wrap',
          big ? 'text-3xl leading-tight' : 'text-sm leading-relaxed',
        )}
      >
        {linkify(payload.text)}
        {big ? <span className="block">{meta}</span> : meta}
      </p>
    )
  } else if (payload.kind === 'gif') {
    body = (
      <>
        <GifMessage gif={payload.gif} />
        <div>{meta}</div>
      </>
    )
  } else {
    const uploaded = !!message.uploaded
    body = (
      <>
        {isImageMime(payload.file.mime) ? (
          <ImageAttachment file={payload.file} uploaded={uploaded} own={own} onOpen={onOpenImage} />
        ) : (
          <FileAttachment file={payload.file} uploaded={uploaded} own={own} />
        )}
        {payload.text ? (
          <p className="text-fg/95 mt-1 text-sm leading-relaxed break-words whitespace-pre-wrap">
            {linkify(payload.text)}
            {meta}
          </p>
        ) : (
          <div>{meta}</div>
        )}
      </>
    )
  }

  return (
    <div
      data-msg={payload.id}
      className={cn(
        'group/msg relative -mx-1.5 flex gap-2.5 rounded-lg px-1.5 transition-colors duration-700',
        grouped ? 'mt-0.5' : 'mt-3 first:mt-1',
        highlighted ? 'bg-accent/20 duration-150' : 'hover:bg-surface-2/50',
      )}
    >
      <div className="w-7 shrink-0 pt-0.5">
        {!grouped && <NameAvatar seed={message.from} name={message.fromName} size="xs" />}
      </div>
      <div className="min-w-0 flex-1 py-0.5">
        {!grouped && (
          <p
            className="truncate text-xs font-semibold"
            style={{ color: authorColor(message.from) }}
          >
            {message.fromName}
            {own && <span className="text-muted font-normal"> (você)</span>}
          </p>
        )}
        {!deleted && payload.replyTo && <Quote replyTo={payload.replyTo} />}
        {body}
        {!deleted && <Reactions message={message} localIdentity={localIdentity} nameOf={nameOf} />}
      </div>

      {!deleted && (
        <div
          className={cn(
            'border-border bg-surface absolute -top-3 right-1 z-10 flex items-center rounded-lg border p-0.5 shadow-lg transition-opacity',
            toolbarVisible
              ? 'opacity-100'
              : 'pointer-events-none opacity-0 group-focus-within/msg:pointer-events-auto group-focus-within/msg:opacity-100 group-hover/msg:pointer-events-auto group-hover/msg:opacity-100',
          )}
        >
          <Popover open={reactOpen} onOpenChange={setReactOpen}>
            <ToolbarButton label="Reagir" as={PopoverTrigger}>
              <SmilePlus />
            </ToolbarButton>
            <PopoverContent side="top" align="end" onCloseAutoFocus={(e) => e.preventDefault()}>
              <ReactionPicker
                onPick={(emoji) => {
                  setReactOpen(false)
                  chatActions.react(message, emoji, localIdentity)
                }}
                current={message.reactions?.[localIdentity]}
              />
            </PopoverContent>
          </Popover>
          <ToolbarButton
            label="Responder"
            onClick={() => useChat.getState().setReplyTo(replyQuote(message))}
          >
            <Reply />
          </ToolbarButton>
          <Menu open={menuOpen} onOpenChange={setMenuOpen}>
            <ToolbarButton label="Mais ações" as={MenuTrigger}>
              <MoreHorizontal />
            </ToolbarButton>
            <MenuContent
              align="end"
              className="min-w-44"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <MenuItem onSelect={() => useChat.getState().setReplyTo(replyQuote(message))}>
                <Reply /> Responder
              </MenuItem>
              {textOf(message) && (
                <MenuItem
                  onSelect={() =>
                    void navigator.clipboard
                      .writeText(textOf(message)!)
                      .then(() => toast.success('Texto copiado'))
                  }
                >
                  <Copy /> Copiar texto
                </MenuItem>
              )}
              {payload.kind === 'file' && message.uploaded && (
                <MenuItem
                  onSelect={() => {
                    const roomId = chatActions.roomId()
                    if (roomId) void saveAttachment(roomId, payload.file)
                  }}
                >
                  <Download /> Salvar arquivo
                </MenuItem>
              )}
              {own && (payload.kind === 'text' || payload.kind === 'file') && (
                <MenuItem
                  onSelect={() =>
                    useChat.getState().setEditing({ id: payload.id, text: textOf(message) ?? '' })
                  }
                >
                  <Pencil /> Editar
                </MenuItem>
              )}
              {own && (
                <>
                  <MenuSeparator />
                  <MenuItem
                    className="text-danger [&_svg]:text-danger"
                    onSelect={() => onDelete(message)}
                  >
                    <Trash2 /> Apagar
                  </MenuItem>
                </>
              )}
            </MenuContent>
          </Menu>
        </div>
      )}
    </div>
  )
})

function textOf(m: ChatMessage): string | null {
  if (m.payload.kind === 'text') return m.payload.text
  if (m.payload.kind === 'file') return m.payload.text ?? null
  return null
}

function MessageMeta({
  ts,
  edited,
  own,
  unsynced,
}: {
  ts: number
  edited: boolean
  own: boolean
  unsynced: boolean
}) {
  return (
    <span
      className="text-muted ml-2 inline-flex translate-y-px items-center gap-1 align-baseline text-[11px] leading-none whitespace-nowrap not-italic"
      title={fullFormat.format(ts)}
    >
      {edited && <span>editada ·</span>}
      <time dateTime={new Date(ts).toISOString()}>{timeFormat.format(ts)}</time>
      {own &&
        (unsynced ? (
          <Clock3 className="size-3" aria-label="Enviando" />
        ) : (
          <Check className="size-3" aria-label="Enviada" />
        ))}
    </span>
  )
}

function GifMessage({ gif }: { gif: Gif }) {
  const width = Math.min(220, gif.width)
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

/** Thumbnail of the quoted message when it is an image we have. */
function useQuotedThumb(id: string): string | null {
  const original = useChat((s) => s.messages.find((m) => m.payload.id === id))
  const file = original?.payload.kind === 'file' ? original.payload.file : null
  const state = useAttachments((s) => (file ? s.files[file.id] : undefined))
  if (!file || !isImageMime(file.mime)) return null
  return state?.status === 'ready' ? state.url : (file.thumb ?? null)
}

export function Quote({
  replyTo,
  compact,
}: {
  replyTo: ReplyTo
  /** In the composer (not clickable). */
  compact?: boolean
}) {
  const thumb = useQuotedThumb(replyTo.id)
  const exists = useChat((s) => s.messages.some((m) => m.payload.id === replyTo.id && !m.deleted))
  const color = authorColor(replyTo.from)
  const Icon = replyTo.kind === 'image' ? ImageIcon : replyTo.kind === 'file' ? Paperclip : null
  const content = (
    <>
      <span className="w-1 shrink-0 self-stretch rounded-full" style={{ background: color }} />
      <span className="min-w-0 flex-1 py-1">
        <span className="block truncate text-xs font-semibold" style={{ color }}>
          {replyTo.fromName}
        </span>
        <span className="text-muted flex items-center gap-1 text-xs">
          {Icon && <Icon className="size-3 shrink-0" />}
          <span className="line-clamp-2 break-words">{replyTo.snippet}</span>
        </span>
      </span>
      {thumb && <img src={thumb} alt="" className="size-10 shrink-0 rounded-md object-cover" />}
    </>
  )
  const cls =
    'bg-surface-3/70 flex w-full max-w-[320px] items-center gap-2 overflow-hidden rounded-lg pr-1 text-left'
  if (compact || !exists) return <div className={cn(cls, !compact && 'mt-1')}>{content}</div>
  return (
    <button
      type="button"
      className={cn(cls, 'hover:bg-surface-3 mt-1 transition-colors')}
      onClick={() => useChat.getState().setHighlight(replyTo.id)}
      title="Ir para a mensagem"
    >
      {content}
    </button>
  )
}

function Reactions({
  message,
  localIdentity,
  nameOf,
}: {
  message: ChatMessage
  localIdentity: string
  nameOf: (identity: string) => string
}) {
  const entries = Object.entries(message.reactions ?? {})
  if (!entries.length) return null
  const groups = new Map<string, string[]>()
  for (const [identity, emoji] of entries)
    groups.set(emoji, [...(groups.get(emoji) ?? []), identity])
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {[...groups].map(([emoji, people]) => {
        const mine = people.includes(localIdentity)
        const names = people.map((p) => (p === localIdentity ? 'Você' : nameOf(p)))
        return (
          <Tooltip key={emoji} content={`${names.join(', ')} reagiu com ${emoji}`}>
            <button
              type="button"
              onClick={() => chatActions.react(message, emoji, localIdentity)}
              className={cn(
                'flex h-6 items-center gap-1 rounded-full border px-2 text-xs transition-colors',
                mine
                  ? 'border-accent/60 bg-accent/20 text-fg'
                  : 'border-border bg-surface-2 text-muted hover:border-muted',
              )}
              aria-pressed={mine}
            >
              <span className="text-sm leading-none">{emoji}</span>
              {people.length}
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}

function ReactionPicker({
  onPick,
  current,
}: {
  onPick: (emoji: string) => void
  current?: string
}) {
  const [full, setFull] = useState(false)
  if (full) return <EmojiPicker onPick={onPick} />
  return (
    <div className="flex items-center gap-0.5 p-1.5">
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => onPick(emoji)}
          aria-label={`Reagir com ${emoji}`}
          className={cn(
            'hover:bg-surface-3 flex size-9 items-center justify-center rounded-full text-xl transition-transform hover:scale-110',
            current === emoji && 'bg-accent/25',
          )}
        >
          {emoji}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setFull(true)}
        aria-label="Mais emojis"
        className="text-muted hover:bg-surface-3 hover:text-fg flex size-9 items-center justify-center rounded-full"
      >
        <Plus className="size-5" />
      </button>
    </div>
  )
}

function ToolbarButton({
  label,
  children,
  onClick,
  as: Wrapper,
}: {
  label: string
  children: ReactNode
  onClick?: () => void
  as?: typeof PopoverTrigger | typeof MenuTrigger
}) {
  const button = (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="text-muted hover:bg-surface-3 hover:text-fg data-[state=open]:bg-surface-3 data-[state=open]:text-fg flex size-7 items-center justify-center rounded-md [&_svg]:size-4"
    >
      {children}
    </button>
  )
  const trigger = Wrapper ? <Wrapper asChild>{button}</Wrapper> : button
  return <Tooltip content={label}>{trigger}</Tooltip>
}
