/**
 * legacy partner-order/index.html (Apps Script) 호출 → SamhanLogis MS REST 변환 shim.
 *
 * <p>주입 항목 (window 전역):
 * 1. `window.google.script.run.<fnName>(...args)` Proxy
 *    - `withSuccessHandler(cb)` / `withFailureHandler(cb)` chainable
 *    - `<fnName>(...args)` → samhanApi.call(fnName, args) → onSuccess / onFailure 분기
 * 2. `window.UrlFetchApp.fetch(...)` noop + warn (Code.js e-Count proxy 폐기)
 * 3. `window.__SAMHAN_BOOTSTRAP__` 객체 (legacy index.html line 1230~ 의 `__BS = ...` 가 참조).
 *    - main.ts 가 samhanApi.fetchBootstrap() 으로 prefetch 후 채움.
 *
 * <p>외부 호출 폐기:
 * - e-Count `UrlFetchApp.fetch('http://152.69.228.109:3000/proxy/ecount/...')` — slip-service 자동 출고전표
 * - Notion API 9 토큰 호출 — SamhanLogis MS DB 직접 (RPC_MAP 의 partner / order 핸들러로 대체)
 *
 * <p>회고 가드:
 * - feedback_uuid_no_user_visibility: 본 shim 응답에서 UUID 노출 금지 — RPC_MAP 응답 그대로 전달
 *   (UUID 가리기는 백엔드 endpoint 책임, partner-service 가 BizCode/슬립번호 만 반환)
 */
import { samhanApi } from './samhanApi'

/** Apps Script 의 `google.script.run` chainable RPC 인터페이스 (런타임 Proxy). */
interface GoogleScriptRunChain {
  withSuccessHandler(cb: ((result: unknown) => void) | null): GoogleScriptRunChain
  withFailureHandler(cb: ((err: unknown) => void) | null): GoogleScriptRunChain
  /** 동적 함수 호출 — Proxy 가 fnName 키로 dispatch. */
  [fnName: string]: unknown
}

/** Window 전역 확장 (TS 타입). */
declare global {
  interface Window {
    google?: { script?: { run?: GoogleScriptRunChain } }
    UrlFetchApp?: { fetch: (url: string, opts?: unknown) => unknown }
    __SAMHAN_BOOTSTRAP__?: Record<string, unknown>
    __SAMHAN_BOOTSTRAP_PREFETCHED__?: boolean
    __SAMHAN_BOOTSTRAP_FATAL__?: boolean
    __SAMHAN_BOOTSTRAP_ERROR_MESSAGE__?: string
    __SAMHAN_RENDER_BOOTSTRAP_FATAL__?: () => void
  }
}

/**
 * `window.google.script.run` Proxy 빌더. legacy 호출 패턴:
 *
 * ```js
 * google.script.run
 *   .withSuccessHandler(onOk)
 *   .withFailureHandler(onErr)
 *   .tryLogin(bizNo, pw);
 * ```
 *
 * <p>구현: 외부 Proxy → 내부 chain 객체 (handler 보관). chain 의 fnName access 시 핸들러
 * 함수 반환 → 호출 시 samhanApi.call 로 dispatch + then/catch 분기.
 */
function buildGoogleScriptRun(): GoogleScriptRunChain {
  return new Proxy({} as GoogleScriptRunChain, {
    get(_target, _outerKey) {
      // 매 진입마다 신규 chain (legacy 가 각 RPC 호출마다 fresh chain 사용)
      let onSuccess: ((result: unknown) => void) | null = null
      let onFailure: ((err: unknown) => void) | null = null

      const chain: GoogleScriptRunChain = new Proxy({} as GoogleScriptRunChain, {
        get(_t, key) {
          const k = String(key)
          if (k === 'withSuccessHandler') {
            return (cb: ((r: unknown) => void) | null) => {
              onSuccess = cb
              return chain
            }
          }
          if (k === 'withFailureHandler') {
            return (cb: ((e: unknown) => void) | null) => {
              onFailure = cb
              return chain
            }
          }
          // RPC 호출
          return (...args: unknown[]) =>
            samhanApi
              .call(k, args)
              .then((result) => {
                if (onSuccess) onSuccess(result)
              })
              .catch((err: unknown) => {
                if (onFailure) onFailure(err)
                else console.warn(`[v4 shim] RPC '${k}' rejected (no failure handler)`, err)
              })
        },
      })

      // `google.script.run.<fnName>` 직접 호출 (withSuccessHandler 미사용 패턴) 도 지원 —
      // outer Proxy 의 _outerKey 가 fnName 일 때 (체인 없이) 즉시 호출 함수 반환.
      const outerKey = String(_outerKey)
      if (outerKey === 'withSuccessHandler') {
        return (cb: ((r: unknown) => void) | null) => {
          onSuccess = cb
          return chain
        }
      }
      if (outerKey === 'withFailureHandler') {
        return (cb: ((e: unknown) => void) | null) => {
          onFailure = cb
          return chain
        }
      }
      // outer 단계에서 fnName 직접 호출 시
      return (...args: unknown[]) => samhanApi.call(outerKey, args)
    },
  })
}

/** UrlFetchApp.fetch noop — Code.js 의 e-Count / Notion 직접 호출 차단 (warn). */
function buildUrlFetchAppNoop(): { fetch: (url: string, opts?: unknown) => unknown } {
  return {
    fetch(url: string, _opts?: unknown) {
      console.warn(
        `[v4 shim] UrlFetchApp.fetch('${url}') 차단 — 외부 호출은 SamhanLogis 백엔드 (slip-service / partner-service) 가 대체. RPC_MAP 보강 또는 백엔드 endpoint 추가`,
      )
      return {
        getResponseCode: () => 200,
        getContentText: () => '{}',
      }
    },
  }
}

/**
 * shim 설치 — main.ts 진입에서 1회 호출.
 *
 * @param bootstrap 부트스트랩 데이터 (legacy `<?!= var ?>` 17종 — main.ts 가 samhanApi.fetchBootstrap 결과를 전달)
 */
export function installLegacyShim(bootstrap: Record<string, unknown>): void {
  // 1. window.google.script.run Proxy
  if (!window.google) window.google = {}
  if (!window.google.script) window.google.script = {}
  window.google.script.run = buildGoogleScriptRun()

  // 2. UrlFetchApp noop (legacy index.html 은 직접 호출 X 지만 안전망)
  window.UrlFetchApp = buildUrlFetchAppNoop()

  // 3. 부트스트랩 데이터 주입
  window.__SAMHAN_BOOTSTRAP__ = bootstrap

  // 4. 로고 이미지 (logoData) — legacy 에서는 Apps Script 가 렌더링 시점에 주입.
  //    v4 는 부트스트랩에 logoData 가 있으면 #bizGateLogo 에 src 주입 + display:block, fallback 숨김.
  const logoData = bootstrap.logoData as string | undefined
  if (logoData) {
    const setLogo = () => {
      const img = document.getElementById('bizGateLogo') as HTMLImageElement | null
      const fb = document.getElementById('bizGateLogoFallback') as HTMLDivElement | null
      if (img) {
        img.src = logoData
        img.style.display = 'block'
      }
      if (fb) fb.style.display = 'none'
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setLogo, { once: true })
    } else {
      setLogo()
    }
  }
}
