import { create } from 'zustand'
import type { MicLevel } from './mic-protocol'

export type DfnStatus = 'idle' | 'loading' | 'ready' | 'error'

interface MicState {
  /** Live level of the mic being measured (room mic or the mic test). */
  level: MicLevel | null
  /** Push-to-talk binding held right now. */
  pttPressed: boolean
  /** DeepFilterNet3: `error` falls back to Chromium's noise suppression. */
  dfn: DfnStatus
  /** "Testar microfone" is running (its level wins over the room mic's). */
  testing: boolean
}

export const useMic = create<MicState>()(() => ({
  level: null,
  pttPressed: false,
  dfn: 'idle',
  testing: false,
}))
