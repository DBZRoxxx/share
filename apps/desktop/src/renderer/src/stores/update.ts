import type { ResumeState, UpdateStatus } from '@shared/ipc'
import { toast } from 'sonner'
import { create } from 'zustand'

type ResumeProvider = () => Promise<ResumeState>

interface UpdateState {
  status: UpdateStatus
  /** "Quando eu sair da sala": apply as soon as the user leaves the room. */
  scheduled: boolean
  /** A room screen is mounted (updates offer to bring the user back to it). */
  inRoom: boolean
  setScheduled: (scheduled: boolean) => void
}

export const useUpdate = create<UpdateState>()((set) => ({
  status: { state: 'idle' },
  scheduled: false,
  inRoom: false,
  setScheduled: (scheduled) => set({ scheduled }),
}))

// While in a room, the room screen registers how to capture "where the user is"
// so an update can put them back afterwards.
let resumeProvider: ResumeProvider | null = null

export function setResumeProvider(provider: ResumeProvider): () => void {
  resumeProvider = provider
  useUpdate.setState({ inRoom: true })
  return () => {
    if (resumeProvider !== provider) return
    resumeProvider = null
    useUpdate.setState({ inRoom: false })
  }
}

/** Applies the ready update now, returning to the current room afterwards. */
export async function applyUpdate(opts: { resume: boolean } = { resume: true }): Promise<void> {
  const { status } = useUpdate.getState()
  if (status.state !== 'ready') return
  let resume: ResumeState | null = null
  if (opts.resume && resumeProvider) {
    try {
      resume = await resumeProvider()
    } catch (error) {
      console.error('[update] could not capture the room state', error)
    }
  }
  await window.share.updater.apply(resume)
}

/** Called when the user leaves a room: runs an update they postponed. */
export function runScheduledUpdate(): void {
  const { scheduled, status } = useUpdate.getState()
  if (!scheduled || status.state !== 'ready') return
  useUpdate.setState({ scheduled: false })
  void applyUpdate({ resume: false })
}

/** Mirrors the main process updater state. Call once at startup. */
export function initUpdates(): () => void {
  let announced: string | null = null
  const onStatus = (status: UpdateStatus) => {
    useUpdate.setState({ status })
    if (status.state === 'ready' && announced !== status.version) {
      announced = status.version
      if (useUpdate.getState().inRoom) {
        toast(`Versão ${status.version} disponível`, {
          description:
            status.kind === 'hot'
              ? 'Atualização rápida: você volta para a sala em segundos.'
              : 'O app reinicia e volta sozinho para a sala.',
          duration: 10_000,
          action: { label: 'Atualizar', onClick: () => void applyUpdate() },
        })
      }
    }
  }
  void window.share.updater.getStatus().then(onStatus)
  return window.share.updater.onStatus(onStatus)
}
