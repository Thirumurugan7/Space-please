import type { SaApi } from '../shared/api'

declare global {
  interface Window {
    sa: SaApi
  }
}

export {}
