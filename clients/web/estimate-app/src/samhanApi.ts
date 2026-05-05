/**
 * SamhanLogis MS API client (axios) — estimate-app v1 shim 의 백엔드 호출 entry.
 *
 * <p>역할: legacy `google.script.run.<fnName>(...args)` → 본 모듈의 `samhanApi.call(fnName, args)`
 * → 함수명 → SamhanLogis MS REST endpoint 매핑 테이블 (RPC_MAP) 조회 → axios fetch.
 *
 * <p>매핑 표 출처: docs/dev-reports/legacy-rpc-mapping-estimate-app.md (RPC 11 site → 9 distinct fnName).
 * 신규 RPC 추가 시 RPC_MAP 보강 + 매핑 표 동기화 의무 (`feedback_function_documentation.md`).
 *
 * <p>외부 호출 (e-Count UrlFetchApp / Notion API 9 토큰) 은 본 모듈 범위 밖 — Code.js 의 외부 호출은
 * SamhanLogis 백엔드 (slip-service / partner-service / estimate-service 등) 가 대체. 클라이언트는 noop + warn.
 *
 * <p>참조: clients/desktop v4 의 src/preload/samhanApi.ts (동일 매핑, 단 fetch API 사용) 와 1:1 호환.
 * web 환경은 axios + sessionStorage 토큰, electron preload 는 fetch + ipcRenderer 토큰 — 매핑은 공유.
 */
import axios, { type AxiosRequestConfig } from 'axios'

/** dev 환경 BASE URL (vite proxy / nginx) — `VITE_API_BASE_URL` 로 override. */
const BASE_URL: string = import.meta.env.VITE_API_BASE_URL || '/api/v1'

/** 세션 토큰 저장소 (sessionStorage 키) — 내부 영업/관리자 로그인 후 발급. */
const TOKEN_KEY = 'samhan-estimate-token'

/** axios 인스턴스 — JWT bearer 자동 첨부 + 8초 timeout (estimate 는 견적이력 조회 등 무거운 쿼리 가능). */
const http = axios.create({
  baseURL: BASE_URL,
  timeout: 8000,
})

http.interceptors.request.use((cfg) => {
  const token = sessionStorage.getItem(TOKEN_KEY)
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`
  }
  return cfg
})

/** 함수명 → SamhanLogis MS endpoint 매핑 (RPC 11 site → 9 distinct fnName).
 *
 * <p>각 entry 는 axios 호출을 만들어 반환. arguments 는 legacy Apps Script 시그니처와 동일.
 *
 * <p>**legacy 함수명 → SamhanLogis 매핑 (legacy estimate/index.html RPC site 분석):**
 *
 * | line  | fnName(args)                                          | HTTP method + path                                            | M-단계 |
 * |-------|--------------------------------------------------------|----------------------------------------------------------------|--------|
 * | 8726  | checkUserAuth(USER_EMAIL)                              | GET  /auth/me?email={...}                                       | M2     |
 * | 10084 | sendOrderFromUi(orderData) [동일 fn 2 site]             | POST /estimates/finalize                                        | M3+M4  |
 * | 12879 | getGateImages()                                        | GET  /files/gate-images                                         | files  |
 * | 13218 | getNotionHistory(sDate, eDate)                         | GET  /partner-orders?from={sDate}&to={eDate}                    | M4     |
 * | 13942 | logFrontEvent(group, msg, isMobile, mgr)               | POST /audit-logs/front                                          | 공통   |
 * | 15049 | sendOrderFromUi(orderData) [동일 fn 2 site]             | POST /estimates/finalize                                        | M3+M4  |
 * | 15091 | getCustomerDataAsync()                                  | GET  /partners?withDc=true                                      | M2     |
 * | 15228 | getCustomerDataAsync(true)  [refresh — 동일 endpoint]   | GET  /partners?withDc=true                                      | M2     |
 * | 15506 | getInventoryTable(dateVal, items)                       | GET  /products?usageScope=ESTIMATE&date={dateVal}&items={items} | M1a    |
 * | 16434 | getQuoteHistory(sDate, eDate)                           | GET  /estimates/snapshots?from={sDate}&to={eDate}               | M3     |
 * | 16717 | saveQuoteSnapshot({data, summary, image})               | POST /estimates/snapshots                                       | M3     |
 *
 * 합계: 11 site / 9 distinct fnName (sendOrderFromUi 와 getCustomerDataAsync 는 각 2 site).
 */
type RpcHandler = (args: unknown[]) => Promise<unknown>

/** legacy `getCustomerDataAsync` 응답 형태 — Apps Script 코드가 기대하는 array<Customer>. */
interface LegacyCustomer {
  partnerCode: string
  name: string
  contact?: string
  address?: string
  // ... estimate index.html 가 사용하는 추가 필드 (rep, dc 등은 backend 가 응답)
}

/**
 * Page 응답 평탄화 — backend Spring Page<T> 가 `{content: [...]}` 로 응답할 때 array 로 풀어냄.
 * legacy 코드는 array 만 기대하므로 호환을 위한 변환.
 */
function unwrapPage<T = unknown>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[]
  const page = (data ?? {}) as { content?: T[] }
  return page.content ?? []
}

const RPC_MAP: Record<string, RpcHandler> = {
  // ─── 인증 / 등록 (M2 — auth-service) ───────────────────────────────────
  checkUserAuth: ([email]) =>
    http
      .get('/auth/me', { params: { email: String(email ?? '') } })
      .then((r) => {
        // legacy 기대: { authorized: boolean, managerName?: string }
        const d = (r.data ?? {}) as { authorized?: boolean; managerName?: string }
        return { authorized: !!d.authorized, managerName: d.managerName ?? '' }
      })
      .catch((err: unknown) => {
        // backend 미연결 시 graceful: legacy 가 authFailBox 표시 (등록되지 않은 사용자) — UX 보존
        console.warn('[estimate-app v1 shim] checkUserAuth 실패 — fallback authorized=false', err)
        return { authorized: false, managerName: '' }
      }),

  // ─── 거래처 마스터 + DC율 (M2 — partner-service) ───────────────────────
  // legacy 는 args[0] 이 boolean (refresh flag) 또는 undefined. 양쪽 모두 동일 endpoint.
  getCustomerDataAsync: () =>
    http
      .get('/partners', { params: { withDc: true, size: 9999 } })
      .then((r) => unwrapPage<LegacyCustomer>(r.data))
      .catch((err: unknown) => {
        console.warn('[estimate-app v1 shim] getCustomerDataAsync 실패 — 빈 배열 fallback', err)
        return []
      }),

  // ─── 품목 카탈로그 (M1a 완료 — product-service) ────────────────────────
  // legacy 응답: HTML string (innerHTML 직접 주입). backend 가 raw HTML 미지원 시 placeholder 합성.
  getInventoryTable: ([dateVal, items]) =>
    http
      .get('/products', {
        params: {
          usageScope: 'ESTIMATE',
          date: typeof dateVal === 'string' ? dateVal : '',
          items: items ? JSON.stringify(items) : '',
          size: 9999,
        },
      })
      .then((r) => {
        const data = r.data
        if (typeof data === 'string') return data
        const rows = unwrapPage<{ modelCode?: string; name?: string; releasePrice?: number }>(data)
        const tdHtml = rows
          .map(
            (item) =>
              `<tr><td>${item.modelCode ?? ''}</td><td>${item.name ?? ''}</td><td>${
                item.releasePrice ?? ''
              }</td></tr>`,
          )
          .join('')
        return `<table style="width:100%"><thead><tr><th>모델명</th><th>품목명</th><th>출시가</th></tr></thead><tbody>${tdHtml}</tbody></table>`
      })
      .catch((err: unknown) => {
        console.warn('[estimate-app v1 shim] getInventoryTable 실패 — 빈 테이블 fallback', err)
        return '<div style="padding:20px;color:#6b7280;">품목 데이터를 불러오지 못했습니다 (backend 미연결).</div>'
      }),

  // ─── 주문이력 (M4 — partner-order-service, Notion 폐기) ────────────────
  getNotionHistory: ([sDate, eDate]) =>
    http
      .get('/partner-orders', {
        params: {
          from: String(sDate ?? ''),
          to: String(eDate ?? ''),
          size: 9999,
        },
      })
      .then((r) => unwrapPage(r.data))
      .catch((err: unknown) => {
        console.warn('[estimate-app v1 shim] getNotionHistory 실패 — 빈 배열 fallback', err)
        return []
      }),

  // ─── 견적이력 (M3 — estimate-service) ─────────────────────────────────
  getQuoteHistory: ([sDate, eDate]) =>
    http
      .get('/estimates/snapshots', {
        params: {
          from: String(sDate ?? ''),
          to: String(eDate ?? ''),
          size: 9999,
        },
      })
      .then((r) => unwrapPage(r.data))
      .catch((err: unknown) => {
        console.warn('[estimate-app v1 shim] getQuoteHistory 실패 — 빈 배열 fallback', err)
        return []
      }),

  // ─── 견적 스냅샷 저장 (M3 — estimate-service) ──────────────────────────
  saveQuoteSnapshot: ([payload]) =>
    http.post('/estimates/snapshots', payload ?? {}).then((r) => r.data),

  // ─── 최종 주문 전송 (M3 + M4 — estimate-service finalize → slip-service Event) ─
  sendOrderFromUi: ([orderData]) =>
    http
      .post('/estimates/finalize', orderData ?? {})
      .then((r) => {
        const d = r.data
        // legacy 기대: { slipNo: string } 또는 string
        if (typeof d === 'string') return { slipNo: d }
        return d ?? { slipNo: '' }
      }),

  // ─── 게이트 이미지 (files-service — base64 prefetch) ──────────────────
  getGateImages: () =>
    http
      .get('/files/gate-images')
      .then((r) => (Array.isArray(r.data) ? r.data : []))
      .catch((err: unknown) => {
        console.warn('[estimate-app v1 shim] getGateImages 실패 — 빈 배열 fallback', err)
        return []
      }),

  // ─── 프론트 이벤트 로그 (공통 — audit-service) ────────────────────────
  // legacy 는 logFrontEvent(group, msg, isMob, mgr) 시그니처. swallow 정책 (legacy sendLog 동일).
  logFrontEvent: ([group, msg, isMobile, manager]) =>
    http
      .post('/audit-logs/front', {
        group: String(group ?? ''),
        message: String(msg ?? ''),
        isMobile: !!isMobile,
        manager: String(manager ?? ''),
      })
      .then((r) => r.data)
      .catch((err: unknown) => {
        // 로그 실패는 swallow (legacy withFailureHandler 가 console.log 만 호출)
        console.warn('[estimate-app v1 shim] logFrontEvent silent fail', err)
        return null
      }),
}

/**
 * legacy 함수명 → SamhanLogis MS endpoint 호출 dispatcher.
 *
 * <p>매핑 누락 시 console.warn + Promise.resolve(null) (legacy 동작 graceful — withFailureHandler
 * 가 호출되지 않고 withSuccessHandler 가 null 로 호출됨). 이는 Code.js 외부 호출 (e-Count / Notion)
 * 또는 신규 함수에 대한 안전망.
 */
export const samhanApi = {
  /**
   * @param fnName legacy `google.script.run.<fnName>` 의 fnName
   * @param args   legacy 호출 시 전달된 args (Array)
   */
  call(fnName: string, args: unknown[]): Promise<unknown> {
    const handler = RPC_MAP[fnName]
    if (!handler) {
      console.warn(
        `[estimate-app v1 shim] unmapped RPC '${fnName}' — noop. RPC_MAP 보강 + dev-reports/legacy-rpc-mapping-estimate-app.md 동기화 필요`,
      )
      return Promise.resolve(null)
    }
    return handler(args)
  },

  /**
   * 부트스트랩 prefetch — legacy 의 `<?!= var ?>` 13종 (homemulti / singleSets / singleParts /
   * homeDefaults / singleDefaults / singleMatPrices / commercialMulti / commercialParts / oldProducts /
   * config / specDetailMap / recommendData / priceInc) + `<?= userEmail ?>` / `<?= authData ?>` 에
   * 해당하는 데이터를 단일 endpoint 에서 한 번에 받음.
   *
   * <p>endpoint: `GET /api/v1/estimates/bootstrap` (TODO M3 backend 신규).
   * 백엔드 미구현 시 legacy index.html 이 build script 로 inline 된 fallback 빈 배열/객체로 graceful
   * (UI 진입 가능, 카탈로그 비어있는 상태).
   *
   * @returns 부트스트랩 객체 — 각 키는 legacy 변수명과 동일. 일부 누락 시 빈 객체/배열 fallback.
   */
  fetchBootstrap(): Promise<Record<string, unknown>> {
    const cfg: AxiosRequestConfig = { timeout: 12000 }
    return http
      .get('/estimates/bootstrap', cfg)
      .then((r) => r.data as Record<string, unknown>)
      .catch((err: unknown) => {
        console.warn('[estimate-app v1 shim] bootstrap prefetch fail — 빈 객체 fallback', err)
        return {}
      })
  },

  /** 매핑된 fnName 목록 — 디버그/QA 용. */
  mappedFunctions(): string[] {
    return Object.keys(RPC_MAP)
  },
}
