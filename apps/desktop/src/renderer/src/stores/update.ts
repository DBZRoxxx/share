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
  /** A check the user started is running. */
  checking: boolean
  setScheduled: (scheduled: boolean) => void
}

export const useUpdate = create<UpdateState>()((set) => ({
  status: { state: 'idle' },
  scheduled: false,
  inRoom: false,
  checking: false,
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

/**
 * "Verificar atualizações": asks the main process to check right now and
 * reports the outcome. Downloads and the "Atualizar" button follow through
 * the usual status updates.
 */
export async function checkForUpdates(): Promise<void> {
  if (useUpdate.getState().checking) return
  // Apps installed before v0.4 have no manual check in their preload.
  const check = window.share.updater.check as
    (() => ReturnType<typeof window.share.updater.check>) | undefined
  if (!check) {
    toast('Reinicie o app para procurar atualizações.')
    return
  }
  useUpdate.setState({ checking: true })
  try {
    const result = await check()
    switch (result.outcome) {
      case 'up-to-date':
        toast.success('Você já está na versão mais recente', {
          description: `Share ${result.version}`,
        })
        break
      case 'available':
        // The title bar shows the download and then "Atualizar".
        toast(`Versão ${result.version} encontrada`, {
          description: 'Baixando… o botão Atualizar aparece no topo quando estiver pronta.',
        })
        break
      case 'unsupported':
        toast('Atualizações só funcionam no app instalado.')
        break
      case 'error':
        toast.error('Não foi possível procurar atualizações', {
          description: 'Verifique sua internet e tente de novo.',
        })
        break
    }
  } catch (error) {
    console.error('[update] manual check failed', error)
    toast.error('Não foi possível procurar atualizações')
  } finally {
    useUpdate.setState({ checking: false })
  }
}
