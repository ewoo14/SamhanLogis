/**
 * arologis-desktop 인증 토큰 IPC 핸들러 등록.
 *
 * 채널 정의 (모두 `ipcRenderer.invoke` 패턴):
 * - `auth:get-token`   → AuthSnapshot | null
 * - `auth:set-token`   → void (payload: AuthSnapshot)
 * - `auth:clear-token` → void
 *
 * 렌더러는 preload 가 노출한 `window.arologisAuth` API 를 통해서만 호출하며,
 * 본 모듈은 메인 프로세스 부팅 시 1회만 등록된다.
 */
import { ipcMain } from 'electron'
import {
  saveToken,
  loadToken,
  clearToken,
  type AuthSnapshot,
} from '../store/auth-store.js'

/**
 * `auth:*` IPC 핸들러를 한꺼번에 등록한다.
 *
 * `app.whenReady()` 직후 1회 호출되어야 하며, 중복 등록 시 Electron 이
 * 런타임 예외를 던진다.
 */
export function registerAuthIpcHandlers(): void {
  ipcMain.handle('auth:get-token', (): AuthSnapshot | null => loadToken())

  ipcMain.handle(
    'auth:set-token',
    (_event, payload: AuthSnapshot): void => {
      saveToken(payload)
    },
  )

  ipcMain.handle('auth:clear-token', (): void => {
    clearToken()
  })
}
