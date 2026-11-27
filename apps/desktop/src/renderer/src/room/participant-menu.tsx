import type { Participant } from 'livekit-client'
import type { ReactNode } from 'react'
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
  Slider,
} from '@/components/ui/primitives'
import { PEER_VOLUME_MAX, peerAudioOf } from '@/stores/peer-audio'
import { usePrefs } from '@/stores/prefs'

/**
 * Right-click menu on a person (people list, camera/avatar tile): their volume
 * up to 200% and a mute, both for this computer only and remembered. Your own
 * entries get no menu.
 */
export function ParticipantMenu({
  participant,
  name,
  children,
}: {
  participant: Participant
  name: string
  /** The element to right-click; it must accept a ref and props (asChild). */
  children: ReactNode
}) {
  if (participant.isLocal) return children
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuLabel className="truncate">{name}</ContextMenuLabel>
        <PeerVolume identity={participant.identity} />
        <ContextMenuSeparator />
        <PeerMute identity={participant.identity} />
      </ContextMenuContent>
    </ContextMenu>
  )
}

function PeerVolume({ identity }: { identity: string }) {
  const { volume, muted } = usePrefs((s) => peerAudioOf(s.peerAudio, identity))
  const setPeerAudio = usePrefs((s) => s.setPeerAudio)
  return (
    // The menu takes arrow keys for moving between items: keep them on the slider.
    <div className="flex flex-col gap-2 px-3 pt-1 pb-3" onKeyDown={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between text-sm">
        <span>Volume do usuário</span>
        <span className="text-muted tabular-nums">{Math.round(volume * 100)}%</span>
      </div>
      <Slider
        aria-label="Volume do usuário"
        thumbLabel="Volume do usuário"
        min={0}
        max={PEER_VOLUME_MAX}
        step={0.01}
        value={[volume]}
        className={muted ? 'opacity-50' : undefined}
        // Moving the volume also undoes a mute, as in Discord.
        onValueChange={([v]) => setPeerAudio(identity, { volume: v ?? 1, muted: false })}
      />
    </div>
  )
}

function PeerMute({ identity }: { identity: string }) {
  const muted = usePrefs((s) => peerAudioOf(s.peerAudio, identity).muted)
  const setPeerAudio = usePrefs((s) => s.setPeerAudio)
  return (
    <ContextMenuCheckboxItem
      checked={muted}
      onCheckedChange={(checked) => setPeerAudio(identity, { muted: checked })}
      // Keep the menu open, so the volume can be adjusted right after.
      onSelect={(e) => e.preventDefault()}
    >
      <span className="flex flex-col">
        <span>Silenciar</span>
        <span className="text-muted text-xs">Só para você</span>
      </span>
    </ContextMenuCheckboxItem>
  )
}
