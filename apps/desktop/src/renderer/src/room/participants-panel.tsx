import { useIsSpeaking, useParticipants } from '@livekit/components-react'
import { Track, type Participant } from 'livekit-client'
import { Camera, Link2, Mic, MicOff, MonitorUp, Volume2, VolumeX, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider, Tooltip } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { Avatar, displayName } from './media-tile'
import { micKey, useRoomUi } from './room-ui'

export function ParticipantsPanel({ onInvite }: { onInvite: () => void }) {
  const participants = useParticipants()
  const setPanelOpen = useRoomUi((s) => s.setPanelOpen)

  const sorted = [...participants].sort((a, b) => {
    if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1
    return displayName(a).localeCompare(displayName(b), 'pt-BR')
  })

  return (
    <aside
      aria-label="Pessoas na sala"
      className="animate-fade-in border-border bg-surface flex w-72 shrink-0 flex-col border-l"
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-sm font-semibold">
          Na sala <span className="text-muted">· {participants.length}</span>
        </h2>
        <button
          type="button"
          aria-label="Fechar painel"
          onClick={() => setPanelOpen(false)}
          className="text-muted hover:bg-surface-2 hover:text-fg rounded-lg p-1"
        >
          <X className="size-4" />
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto px-2">
        {sorted.map((p) => (
          <ParticipantRow key={p.identity} participant={p} />
        ))}
      </ul>
      <div className="border-border border-t p-3">
        <Button variant="secondary" className="w-full" onClick={onInvite}>
          <Link2 /> Copiar link de convite
        </Button>
      </div>
    </aside>
  )
}

function ParticipantRow({ participant }: { participant: Participant }) {
  const speaking = useIsSpeaking(participant)
  const key = micKey(participant.identity)
  const volume = useRoomUi((s) => s.volumes[key] ?? 1)
  const setVolume = useRoomUi((s) => s.setVolume)
  const toggleMute = useRoomUi((s) => s.toggleMute)

  const screen = participant.getTrackPublication(Track.Source.ScreenShare)
  const camera = participant.getTrackPublication(Track.Source.Camera)
  const mic = participant.getTrackPublication(Track.Source.Microphone)
  const micOn = !!mic && !mic.isMuted

  return (
    <li className="group hover:bg-surface-2 rounded-xl px-2 py-2">
      <div className="flex items-center gap-3">
        <Avatar participant={participant} size="sm" speaking={speaking} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {displayName(participant)}
            {participant.isLocal && <span className="text-muted font-normal"> (você)</span>}
          </p>
          {screen && <p className="text-accent text-xs">Compartilhando a tela</p>}
        </div>
        <div className="text-muted flex items-center gap-1.5 [&_svg]:size-4">
          {screen && (
            <Tooltip content="Compartilhando tela">
              <MonitorUp className="text-accent" aria-label="Compartilhando tela" />
            </Tooltip>
          )}
          {camera && !camera.isMuted && (
            <Tooltip content="Câmera ligada">
              <Camera aria-label="Câmera ligada" />
            </Tooltip>
          )}
          {mic &&
            (micOn ? (
              <Mic className={cn(speaking && 'text-success')} aria-label="Microfone ligado" />
            ) : (
              <MicOff className="text-danger" aria-label="Microfone desligado" />
            ))}
        </div>
      </div>
      {!participant.isLocal && micOn && (
        <div className="mt-1 hidden items-center gap-2 pl-11 group-hover:flex">
          <button
            type="button"
            aria-label={volume > 0 ? 'Silenciar para mim' : 'Ativar som'}
            onClick={() => toggleMute(key)}
            className="text-muted hover:text-fg"
          >
            {volume > 0 ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
          </button>
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[volume]}
            onValueChange={([v]) => setVolume(key, v ?? 0)}
          />
        </div>
      )}
    </li>
  )
}
