import { useParticipants } from '@livekit/components-react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCurrentItem } from '@/music/music-store'
import { MusicPanel } from '@/music/music-panel'
import { ChatPanel } from './chat-panel'
import { useChat } from './chat-store'
import { ParticipantsPanel } from './participants-panel'
import { useRoomUi, type SidePanel as Tab } from './room-ui'

/** Right-hand panel with the chat, the people list and the music as tabs. */
export function SidePanel({ onInvite }: { onInvite: () => void }) {
  const panel = useRoomUi((s) => s.panel)
  const setPanel = useRoomUi((s) => s.setPanel)
  const participants = useParticipants()
  const unread = useChat((s) => s.unread)
  const playing = !!useCurrentItem()
  if (!panel) return null

  const tabs: { id: Tab; label: string; count?: number; badge?: number; live?: boolean }[] = [
    { id: 'chat', label: 'Chat', badge: unread },
    { id: 'people', label: 'Pessoas', count: participants.length },
    { id: 'music', label: 'Música', live: playing },
  ]

  return (
    <aside className="animate-fade-in border-border bg-surface flex w-80 shrink-0 flex-col border-l">
      <div className="flex items-center gap-1 px-3 pt-3 pb-2">
        <div
          role="tablist"
          aria-label="Painel lateral"
          className="bg-surface-2 flex flex-1 rounded-xl p-1"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={panel === t.id}
              onClick={() => setPanel(t.id)}
              className={cn(
                'flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-sm font-medium transition-colors',
                panel === t.id ? 'bg-surface-3 text-fg' : 'text-muted hover:text-fg',
              )}
            >
              {t.label}
              {t.count !== undefined && <span className="text-muted text-xs">{t.count}</span>}
              {t.live && <span className="bg-accent size-1.5 rounded-full" aria-label="Tocando" />}
              {!!t.badge && panel !== t.id && (
                <span className="bg-accent flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white">
                  {t.badge > 99 ? '99+' : t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Fechar painel"
          onClick={() => setPanel(null)}
          className="text-muted hover:bg-surface-2 hover:text-fg rounded-lg p-1.5"
        >
          <X className="size-4" />
        </button>
      </div>
      {panel === 'chat' ? (
        <ChatPanel />
      ) : panel === 'music' ? (
        <MusicPanel />
      ) : (
        <ParticipantsPanel onInvite={onInvite} />
      )}
    </aside>
  )
}
