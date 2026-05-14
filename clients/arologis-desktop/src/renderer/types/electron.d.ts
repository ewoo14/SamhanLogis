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

declare global {
  interface Window {
    arologisAuth: ArologisAuthBridge
  }
}

export {}
