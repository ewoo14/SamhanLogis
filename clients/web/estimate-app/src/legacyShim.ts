/**
 * legacy estimate/index.html (Apps Script) 호출 → SamhanLogis MS REST 변환 shim.
 *
 * <p>주입 항목 (window 전역):
 * 1. `window.google.script.run.<fnName>(...args)` Proxy
 *    - `withSuccessHandler(cb)` / `withFailureHandler(cb)` chainable
 *    - `<fnName>(...args)` → samhanApi.call(fnName, args) → onSuccess / onFailure 분기
 * 2. `window.UrlFetchApp.fetch(...)` noop + warn (Code.js e-Count proxy 폐기 안전망)
 * 3. `window.__SAMHAN_BOOTSTRAP__` 객체 — main.ts 가 samhanApi.fetchBootstrap() 으로 prefetch 후 채움.
 *    legacy index.html 의 Apps Script 템플릿 (`<?!= homemulti ?>` 등 13종 + `<?= userEmail ?>` /
 *    `<?= authData ?>`) 은 build script 가 빌드 시점에 `window.__SAMHAN_BOOTSTRAP__.{var}` 참조로 변환.
 *
 * <p>외부 호출 폐기:
 * - e-Count `UrlFetchApp.fetch('http://152.69.228.109:3000/proxy/ecount/...')` — Apps Script
 *   server-side Code.js 만 호출. webview client 에서는 발생 X. UrlFetchApp noop 은 안전망.
 * - Notion API 9 토큰 호출 — SamhanLogis MS DB 직접 (RPC_MAP 의 estimate / partner / order 핸들러 대체).
 *
 * <p>회고 가드:
 * - feedback_uuid_no_user_visibility: 본 shim 응답에서 UUID 노출 금지 — RPC_MAP 응답 그대로 전달
 *   (UUID 가리기는 백엔드 endpoint 책임, M1a partner-service / M3 estimate-service 가 BizCode/슬립번호 만 반환)
 *
 * <p>참조: clients/web/order-app v4 의 동일 모듈 (PR #50 MERGED) — 본 shim 은 동일 패턴 + estimate
 * 전용 부트스트랩 키 16+ 종 (homemulti / singleSets / ... / config / userEmail / authData).
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
  }
}

/**
 * `window.google.script.run` Proxy 빌더. legacy 호출 패턴:
 *
 * ```js
 * google.script.run
 *   .withSuccessHandler(onOk)
 *   .withFailureHandler(onErr)
 *   .checkUserAuth(USER_EMAIL);
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
                else
                  console.warn(
                    `[estimate-app v1 shim] RPC '${k}' rejected (no failure handler)`,
                    err,
                  )
              })
        },
      })

      // `google.script.run.<fnName>` 직접 호출 (withSuccessHandler 미사용 패턴) 도 지원 —
      // outer Proxy 의 _outerKey 가 fnName 일 때 (체인 없이) 즉시 호출 함수 반환.
      // legacy index.html line 12879: `google.script.run.withSuccessHandler(prepareGateImages).getGateImages();`
      // 위 패턴은 outerKey='withSuccessHandler' → chain 반환 → chain.getGateImages 호출 분기 필요.
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
        `[estimate-app v1 shim] UrlFetchApp.fetch('${url}') 차단 — 외부 호출은 SamhanLogis 백엔드 (slip-service / partner-service / estimate-service) 가 대체. RPC_MAP 보강 또는 백엔드 endpoint 추가`,
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
 * @param bootstrap 부트스트랩 데이터 (legacy `<?!= var ?>` 13종 + `<?= userEmail ?>` / `<?= authData ?>` —
 *   main.ts 가 samhanApi.fetchBootstrap 결과를 전달). build script 가 legacy index.html 의 템플릿
 *   디렉티브를 `window.__SAMHAN_BOOTSTRAP__.{key}` 참조로 변환했으므로 shim 은 단순 주입만 책임.
 */
export function installLegacyShim(bootstrap: Record<string, unknown>): void {
  // 1. window.google.script.run Proxy
  if (!window.google) window.google = {}
  if (!window.google.script) window.google.script = {}
  window.google.script.run = buildGoogleScriptRun()

  // 2. UrlFetchApp noop (legacy index.html 은 직접 호출 X 지만 안전망)
  window.UrlFetchApp = buildUrlFetchAppNoop()

  // 3. 부트스트랩 데이터 주입 — legacy inline script 가 `window.__SAMHAN_BOOTSTRAP__.homemulti` 등 참조
  window.__SAMHAN_BOOTSTRAP__ = bootstrap

  // 4. 로고 / 인감 이미지 (samhanLogo / stamp) — legacy 에서는 include('logo')/include('stamp')/include('samhan') 가
  //    `var samhanLogo = "data:..."` / `var stamp = "data:..."` 글로벌 변수로 inline.
  //    build script 가 동일하게 inline 처리하므로 본 shim 은 추가 작업 없음.
  //    단 부트스트랩에 logoData 가 있으면 (legacy fallback override 시나리오) #samhanLogoImg 에 src 주입.
  const logoData = bootstrap['logoData'] as string | undefined
  if (logoData) {
    const setLogo = () => {
      const img = document.getElementById('samhanLogoImg') as HTMLImageElement | null
      const fb = document.getElementById('samhanLogoText') as HTMLDivElement | null
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
