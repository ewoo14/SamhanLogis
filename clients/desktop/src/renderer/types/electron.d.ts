/**
 * 렌더러용 ambient 타입 — preload 가 contextBridge 로 노출한
 * `window.samhanAuth` API 의 시그니처를 TypeScript 에 알려준다.
 *
 * 본 파일은 import/export 가 없는 ambient 모듈이며, tsconfig `include`
 * 에 잡혀 있는 한 별도 import 없이 전역 타입으로 인식된다.
 */
/** 권한 그룹 항목 — preload IPC 경유 렌더러 노출형. */
export interface AuthGroupItem {
  id: string
  name: string
  builtin: boolean
}

export interface AuthSnapshot {
  token: string
  userId: string
  role: string
  fullName: string
  partnerCode?: string
  /** Phase C5-3: 권한 그룹 목록. 기존 저장소 호환을 위해 optional. */
  groups?: AuthGroupItem[]
}

export interface DesktopUpdateStatus {
  kind: 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'
  version?: string
  percent?: number
  message?: string
}

declare global {
  /**
   * [Phase 6 v4] Electron `<webview>` tag JSX intrinsic — React 표준 HTML element 가 아님.
   * legacy estimate index.html 임베드 (EstimateLegacyWebviewPage) 에서 사용.
   *
   * <p>Electron 의 webview attribute spec:
   * https://www.electronjs.org/docs/latest/api/webview-tag</p>
   */
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        preload?: string
        /** Electron webview boolean attribute — React 표준 `allowpopups: boolean` 와 호환. */
        allowpopups?: boolean
        partition?: string
        httpreferrer?: string
        useragent?: string
        disablewebsecurity?: string
        nodeintegration?: string
        plugins?: string
        webpreferences?: string
      }
    }
  }

  interface Window {
    samhanDetailWindow?: {
      open: (payload: {
        documentType: 'OUTBOUND_SLIP' | 'INBOUND_SLIP' | 'TAX_INVOICE'
        documentId: string
        route: string
      }) => Promise<void>
      close: () => Promise<void>
      toggleMaximize: () => Promise<boolean>
      setDirty: (dirty: boolean) => Promise<void>
      onMaximizedChange: (listener: (maximized: boolean) => void) => () => void
    }
    /**
     * 메인 프로세스 인증 토큰 게이트웨이.
     * 모든 메서드는 IPC 비동기 호출이다.
     */
    samhanAuth: {
      getToken: () => Promise<AuthSnapshot | null>
      setToken: (payload: AuthSnapshot) => Promise<void>
      clearToken: () => Promise<void>
    }
    /**
     * [Phase 6 v4] legacy estimate webview 자산 URL gateway — main 프로세스의
     * `legacy:get-estimate-url` IPC 와 1:1. EstimateLegacyWebviewPage 가 사용.
     */
    samhanLegacy: {
      getEstimateUrl: () => Promise<string>
      openExternal: (url: string) => Promise<void>
    }
    /** Electron packaged 앱의 자동 업데이트 IPC gateway. */
    samhanUpdater?: {
      check: () => Promise<void>
      install: () => Promise<void>
      quit: () => Promise<void>
      onStatus: (listener: (status: DesktopUpdateStatus) => void) => () => void
    }
  }
}

export {}
