import type { ShareApi } from '../shared/ipc'

declare global {
  interface Window {
    share: ShareApi
  }
}

export {}
