/**
 * Electron preload 스크립트 — 렌더러에 안전한 IPC API 만 노출한다.
 *
 * `contextIsolation: true` 환경에서 contextBridge 만이 렌더러 ←→ 메인
 * 통신의 유일한 게이트웨이가 된다. Node API 직접 노출은 절대 금지.
 *
 * 노출 객체: `window.samhanAuth` (타입 선언은
 * `src/renderer/types/electron.d.ts` 참고).
 */
import { contextBridge, ipcRenderer } from 'electron'

/** 권한 그룹 항목 — IPC 직렬화 경유형. */
interface AuthGroupItem {
  id: string
  name: string
  builtin: boolean
}

/**
 * 메인 프로세스가 보관/반환하는 인증 스냅샷 형태.
 * `src/main/store/auth-store.ts#AuthSnapshot` 와 1:1 일치해야 한다.
 */
interface AuthSnapshot {
  token: string
  userId: string
  role: string
  fullName: string
  partnerCode?: string
  /** Phase C5-3: 권한 그룹 목록. optional — 기존 저장소 호환. */
  groups?: AuthGroupItem[]
}

/**
 * 렌더러에 노출되는 인증 API.
 *
 * 모든 메서드는 비동기 (`ipcRenderer.invoke`) 이며 Promise 를 반환한다.
 * 렌더러의 axios 요청 인터셉터가 매 요청마다 `getToken()` 을 호출하므로
 * 메인 프로세스 토큰 read 비용은 가능한 한 낮게 유지된다 (electron-store
 * 는 in-memory 캐시 사용).
 */
const samhanAuth = {
  /** 저장된 토큰을 조회. 미저장이면 null. */
  getToken: (): Promise<AuthSnapshot | null> =>
    ipcRenderer.invoke('auth:get-token'),
  /** 로그인 성공 후 토큰을 저장. */
  setToken: (payload: AuthSnapshot): Promise<void> =>
    ipcRenderer.invoke('auth:set-token', payload),
  /** 로그아웃 또는 401 응답 시 토큰을 삭제. */
  clearToken: (): Promise<void> => ipcRenderer.invoke('auth:clear-token'),
}

contextBridge.exposeInMainWorld('samhanAuth', samhanAuth)

/**
 * [Phase 6 v4] legacy estimate webview 자산 URL 조회 — main 프로세스의
 * `legacy:get-estimate-url` IPC 와 1:1.
 *
 * <p>renderer 의 EstimateLegacyWebviewPage 가 mount 시 호출 → webview src 에 주입.
 * dev / packaged 환경 모두 main 프로세스가 file:// 경로를 결정 (resolveLegacyAssetUrl).</p>
 */
const samhanLegacy = {
  /** legacy estimate index.built.html 의 file:// URL. (보존 — 미사용) */
  getEstimateUrl: (): Promise<string> =>
    ipcRenderer.invoke('legacy:get-estimate-url'),
  /**
   * [Phase 6 v4 정정 #22] 종합견적서 외부 link 진입.
   * shell.openExternal 로 default browser 에서 estimate-app web 열기.
   */
  openExternal: (url: string): Promise<void> =>
    ipcRenderer.invoke('legacy:open-external', url),
}

contextBridge.exposeInMainWorld('samhanLegacy', samhanLegacy)

/** 메인 프로세스의 electron-updater 상태를 구독하는 최소 브리지. */
const samhanUpdater = {
  check: (): Promise<void> => ipcRenderer.invoke('updater:check'),
  install: (): Promise<void> => ipcRenderer.invoke('updater:install'),
  quit: (): Promise<void> => ipcRenderer.invoke('updater:quit'),
  onStatus: (listener: (status: unknown) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: unknown) => listener(status)
    ipcRenderer.on('updater:status', handler)
    return () => ipcRenderer.removeListener('updater:status', handler)
  },
}

contextBridge.exposeInMainWorld('samhanUpdater', samhanUpdater)

const samhanDetailWindow = {
  open: (payload: {
      documentType: 'OUTBOUND_SLIP' | 'INBOUND_SLIP' | 'TAX_INVOICE' | 'ESTIMATE' | 'PARTNER_ORDER' | 'TRANSFER' | 'INVENTORY_AUDIT'
    documentId: string
    route: string
  }): Promise<void> => ipcRenderer.invoke('detail-window:open', payload),
  close: (): Promise<void> => ipcRenderer.invoke('detail-window:close'),
  toggleMaximize: (): Promise<boolean> => ipcRenderer.invoke('detail-window:toggle-maximize'),
  setDirty: (dirty: boolean): Promise<void> => ipcRenderer.invoke('detail-window:set-dirty', dirty),
  onMaximizedChange: (listener: (maximized: boolean) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, maximized: boolean) => listener(maximized)
    ipcRenderer.on('detail-window:maximized-change', handler)
    return () => ipcRenderer.removeListener('detail-window:maximized-change', handler)
  },
}

contextBridge.exposeInMainWorld('samhanDetailWindow', samhanDetailWindow)
