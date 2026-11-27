import { useIsSpeaking, useParticipants } from '@livekit/components-react'
import { Track, type Participant } from 'livekit-client'
import { Camera, Link2, Mic, MicOff, MonitorUp, VolumeX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/primitives'
import { cn } from '@/lib/utils'
import { usePrefs } from '@/stores/prefs'
import { Avatar, displayName, useMicMuted } from './media-tile'
import { ParticipantMenu } from './participant-menu'

/** People tab of the side panel. */
export function ParticipantsPanel({ onInvite }: { onInvite: () => void }) {
  const participants = useParticipants()

  const sorted = [...participants].sort((a, b) => {
    if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1
    return displayName(a).localeCompare(displayName(b), 'pt-BR')
  })

  return (
    <>
      <ul className="flex-1 overflow-y-auto px-2 pt-1" aria-label="Pessoas na sala">
        {sorted.map((p) => (
          <ParticipantRow key={p.identity} participant={p} />
        ))}
      </ul>
      <div className="border-border border-t p-3">
        <Button variant="secondary" className="w-full" onClick={onInvite}>
          <Link2 /> Copiar link de convite
        </Button>
      </div>
    </>
  )
}

function ParticipantRow({ participant }: { participant: Participant }) {
  const speaking = useIsSpeaking(participant)
  const silencedForMe = usePrefs((s) => !!s.peerAudio[participant.identity]?.muted)
  const name = displayName(participant)

  const screen = participant.getTrackPublication(Track.Source.ScreenShare)
  const camera = participant.getTrackPublication(Track.Source.Camera)
  const micOn = !useMicMuted(participant)

  return (
    <ParticipantMenu participant={participant} name={name}>
      <li className="hover:bg-surface-2 data-[state=open]:bg-surface-2 rounded-xl px-2 py-2">
        <div className="flex items-center gap-3">
          <Avatar participant={participant} size="sm" speaking={speaking} />
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
              <span className="truncate">
                {name}
                {participant.isLocal && <span className="text-muted font-normal"> (você)</span>}
              </span>
              {!micOn && (
                <Tooltip content="Microfone desligado">
                  <MicOff
                    className="text-danger size-3.5 shrink-0"
                    aria-label="Microfone desligado"
                  />
                </Tooltip>
              )}
            </p>
            {screen && <p className="text-accent text-xs">Compartilhando a tela</p>}
          </div>
          <div className="text-muted flex items-center gap-1.5 [&_svg]:size-4">
            {silencedForMe && (
              <Tooltip content="Áudio silenciado para você">
                <VolumeX className="text-danger" aria-label="Áudio silenciado para você" />
              </Tooltip>
            )}
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
            {micOn && (
              <Mic className={cn(speaking && 'text-success')} aria-label="Microfone ligado" />
            )}
          </div>
        </div>
      </li>
    </ParticipantMenu>
  )
}
