/**
 * arologis-desktop preload — 렌더러에 안전한 IPC API 만 노출한다.
 *
 * `contextIsolation: true` 환경에서 contextBridge 만이 렌더러 ←→ 메인
 * 통신의 유일한 게이트웨이가 된다. Node API 직접 노출은 절대 금지.
 *
 * 노출 객체: `window.arologisAuth` (타입 선언은
 * `src/renderer/types/electron.d.ts` 참고).
 *
 * Samhan Public desktop 의 `window.samhanAuth` 와는 다른 namespace 로 분리 —
 * 같은 OS 사용자가 두 앱을 모두 설치해도 토큰이 섞이지 않는다.
 */
import { contextBridge, ipcRenderer } from 'electron'

/**
 * 메인 프로세스가 보관/반환하는 인증 스냅샷 형태.
 * `src/main/store/auth-store.ts#AuthSnapshot` 와 1:1 일치해야 한다.
 */
interface AuthSnapshot {
  accessToken: string
  refreshToken: string
  userId: string
  role: string
  loginId: string
  fullName: string
  expiresAt: string
}

/**
 * 렌더러에 노출되는 인증 API.
 *
 * 모든 메서드는 비동기 (`ipcRenderer.invoke`) 이며 Promise 를 반환한다.
 * 렌더러의 axios 요청 인터셉터가 매 요청마다 `getToken()` 을 호출하므로
 * 메인 프로세스 토큰 read 비용은 가능한 한 낮게 유지된다 (electron-store
 * 는 in-memory 캐시 사용).
 */
const arologisAuth = {
  /** 저장된 토큰을 조회. 미저장이면 null. */
  getToken: (): Promise<AuthSnapshot | null> =>
    ipcRenderer.invoke('auth:get-token'),
  /** 로그인 성공 후 토큰을 저장. */
  setToken: (payload: AuthSnapshot): Promise<void> =>
    ipcRenderer.invoke('auth:set-token', payload),
  /** 로그아웃 또는 401 응답 시 토큰을 삭제. */
  clearToken: (): Promise<void> => ipcRenderer.invoke('auth:clear-token'),
}

contextBridge.exposeInMainWorld('arologisAuth', arologisAuth)

/** 메인 프로세스의 electron-updater 상태를 구독하는 최소 브리지. */
const arologisUpdater = {
  check: (): Promise<void> => ipcRenderer.invoke('updater:check'),
  install: (): Promise<void> => ipcRenderer.invoke('updater:install'),
  quit: (): Promise<void> => ipcRenderer.invoke('updater:quit'),
  onStatus: (listener: (status: unknown) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: unknown) => listener(status)
    ipcRenderer.on('updater:status', handler)
    return () => ipcRenderer.removeListener('updater:status', handler)
  },
}

contextBridge.exposeInMainWorld('arologisUpdater', arologisUpdater)
