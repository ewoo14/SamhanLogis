/**
 * arologis-desktop preload contextBridge 타입 선언.
 *
 * `src/preload/index.ts` 가 `window.arologisAuth` 에 노출한 API 를 TS 가 인식하도록 한다.
 */

export interface AuthSnapshot {
  accessToken: string
  refreshToken: string
  userId: string
  role: string
  loginId: string
  fullName: string
  expiresAt: string
}

export interface ArologisAuthBridge {
  getToken: () => Promise<AuthSnapshot | null>
  setToken: (payload: AuthSnapshot) => Promise<void>
  clearToken: () => Promise<void>
}

export interface DesktopUpdateStatus {
  kind: 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'
  version?: string
  percent?: number
  message?: string
}

export interface ArologisUpdaterBridge {
  check: () => Promise<void>
  install: () => Promise<void>
  quit: () => Promise<void>
  onStatus: (listener: (status: DesktopUpdateStatus) => void) => () => void
}

declare global {
  interface Window {
    arologisAuth: ArologisAuthBridge
    arologisUpdater?: ArologisUpdaterBridge
  }
}

export {}
