/**
 * SamhanLogis MS API client (axios) — order-app v4 shim 의 백엔드 호출 entry.
 *
 * <p>역할: legacy `google.script.run.<fnName>(...args)` → 본 모듈의 `samhanApi.call(fnName, args)`
 * → 함수명 → SamhanLogis MS REST endpoint 매핑 테이블 (RPC_MAP) 조회 → axios fetch.
 *
 * <p>매핑 표 출처: docs/dev-reports/legacy-rpc-mapping-partner-order.md (RPC 12 site).
 * 신규 RPC 추가 시 RPC_MAP 보강 + 매핑 표 동기화 의무.
 *
 * <p>외부 호출 (e-Count UrlFetchApp / Notion API) 은 본 모듈 범위 밖 — Code.js 의 외부 호출은
 * SamhanLogis 백엔드 (slip-service / partner-service 등) 가 대체. 클라이언트는 noop + warn.
 */
import axios, { type AxiosRequestConfig } from 'axios'

/** dev 환경 BASE URL (vite proxy / nginx) — `VITE_API_BASE_URL` 로 override. */
const BASE_URL: string = import.meta.env.VITE_API_BASE_URL || '/api/v1'

/** 세션 토큰 저장소 (sessionStorage 키). */
const TOKEN_KEY = 'samhan-partner-token'
/** 3d backlog — 로그인 응답의 config (거래처 + DC 설정) 캐시 키. */
const CONFIG_KEY = 'samhan-partner-config'

/** axios 인스턴스 — JWT bearer 자동 첨부 + 5초 timeout. */
const http = axios.create({
  baseURL: BASE_URL,
  timeout: 5000,
})

http.interceptors.request.use((cfg) => {
  const token = sessionStorage.getItem(TOKEN_KEY)
  if (token) {
    cfg.headers.Authorization = `Bearer ${token}`
  }
  return cfg
})

/** 함수명 → SamhanLogis MS endpoint 매핑 (RPC 12 site + 외부 호출 대체).
 *
 * <p>각 entry 는 axios 호출을 만들어 반환. arguments 는 legacy Apps Script 시그니처와 동일.
 *
 * <p>**legacy 함수명 → SamhanLogis 매핑** (전체 표는 docs/dev-reports/legacy-rpc-mapping-partner-order.md):
 *
 * - `getGateImages()` → `GET /api/v1/partner-orders/gate-images` (이미지 base64 prefetch)
 * - `checkAuthStatus(bizNo)` → `GET /api/v1/auth/partner-status?bizNo=...`
 * - `requestAuthApproval(bizNo, ...)` → `POST /api/v1/auth/partner-register` (M2)
 * - `setAuthPassword(bizNo, pw)` → `PATCH /api/v1/auth/partner-password`
 * - `tryLogin(bizNo, pw)` → `POST /api/v1/auth/partner-login` (M2 PartnerAuth)
 * - `getAccessExpiration(bizNo)` → `GET /api/v1/auth/partner-expiration?bizNo=...`
 * - `getOrderHistory(bizCode, dateRange)` → `GET /api/v1/partner-orders/history?bizCode=...`
 * - `logFrontEvent(action, detail)` → `POST /api/v1/partner-orders/log` (frontend audit)
 * - `saveOrderSnapshot(payload)` → `POST /api/v1/partner-orders/drafts` (M4, 30일 expiry)
 * - `getOrderSnapshotHistory(bizNo, from, to)` → `GET /api/v1/partner-orders/drafts?from=&to=`
 * - `sendOrderFromUi(payload)` → `POST /api/v1/partner-orders/{id}/confirm` + slip-service Event (M4)
 * - `saveTutorialState(state)` → `PATCH /api/v1/auth/partner-tutorial`
 *
 * 추가 (legacy index.html 외부 호출 대응 — Code.js 분석 §1):
 * - `getCustomerData(partnerCode)` → `GET /api/v1/partners/{partnerCode}` (M2)
 * - `getProducts(category)` → `GET /api/v1/products?usageScope=PARTNER_ORDER&category=...` (M1a 완료)
 * - `applyConfigFromServer(partnerCode)` → 3d backlog 로 sessionStorage 캐시 재사용 (tryLogin 시점 저장)
 * - `requestTempPassword(bizNo)` → `POST /api/v1/auth/partner-temp-password` (M2)
 * - `register(payload)` → `POST /api/v1/auth/partner-register` (M2)
 * - `saveDraft(payload)` → `POST /api/v1/partner-orders/drafts` (M4) — saveOrderSnapshot 별칭
 * - `getDraftList(bizNo, from, to)` → `GET /api/v1/partner-orders/drafts?from=&to=` (M4) — getOrderSnapshotHistory 별칭
 */
type RpcHandler = (args: unknown[]) => Promise<unknown>

function toIsoDateParam(value: unknown): string | undefined {
  if (value == null || value === '') return undefined
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return undefined
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    return `${value.getFullYear()}-${month}-${day}`
  }

  const text = String(value).trim()
  if (!text) return undefined
  const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? text : toIsoDateParam(parsed)
}

function toIsoDateTimeParam(value: unknown, endOfDay: boolean): string | undefined {
  const date = toIsoDateParam(value)
  if (!date) return undefined
  return `${date}T${endOfDay ? '23:59:59' : '00:00:00'}`
}

function draftHistoryParams(args: unknown[]): { from?: string; to?: string } {
  const [bizNo, from, to] = args
  void bizNo
  return { from: toIsoDateParam(from), to: toIsoDateParam(to) }
}

function unwrapApiResponse(body: unknown): unknown {
  if (
    body &&
    typeof body === 'object' &&
    ('success' in body || 'code' in body) &&
    'data' in body
  ) {
    return (body as { data?: unknown }).data
  }
  return body
}

const RPC_MAP: Record<string, RpcHandler> = {
  // ─── 인증 / 등록 / 잠금 (RPC §S 카테고리) ───────────────────────────────
  checkAuthStatus: ([bizNo]) =>
    http
      .get('/auth/partner-status', { params: { bizNo } })
      .then((r) => unwrapApiResponse(r.data)),
  requestAuthApproval: ([bizNo]) =>
    http
      .post('/auth/partner-register', { bizNo })
      .then((r) => unwrapApiResponse(r.data)),
  register: ([payload]) =>
    http.post('/auth/partner-register', payload).then((r) => unwrapApiResponse(r.data)),
  setAuthPassword: ([bizNo, pw]) =>
    http
      .patch('/auth/partner-password', {
        bizNo,
        newPassword: pw,
      })
      .then((r) => unwrapApiResponse(r.data)),
  tryLogin: ([bizNo, pw]) =>
    http
      .post('/auth/partner-login', {
        bizNo,
        password: pw,
      })
      .then((r) => {
        const data = unwrapApiResponse(r.data) as { token?: string; config?: unknown } | null
        if (data?.token) sessionStorage.setItem(TOKEN_KEY, data.token)
        // 3d backlog — partner-auth-service 의 로그인 응답 config (DC 율 포함) 캐싱.
        // applyConfigFromServer 가 별도 backend 호출 없이 본 캐시를 재사용한다.
        if (data?.config) {
          try {
            sessionStorage.setItem(CONFIG_KEY, JSON.stringify(data.config))
          } catch (err) {
            console.warn('[v4 shim] tryLogin: config 캐싱 실패', err)
          }
        }
        return data
      }),
  requestTempPassword: ([bizNo]) =>
    http.post('/auth/partner-temp-password', { bizNo }).then((r) => unwrapApiResponse(r.data)),
  getAccessExpiration: ([bizNo]) =>
    http
      .get('/auth/partner-expiration', { params: { bizNo } })
      .then((r) => unwrapApiResponse(r.data)),

  // ─── 게이트 이미지 (RPC §R 카테고리) ───────────────────────────────────
  getGateImages: () =>
    http.get('/partner-orders/gate-images').then((r) => unwrapApiResponse(r.data)),

  // ─── 주문이력 / 로그 (RPC §T 카테고리) ────────────────────────────────
  getOrderHistory: ([bizCode, , from, to]) =>
    http
      .get('/partner-orders/history', {
        params: {
          bizCode,
          from: toIsoDateTimeParam(from, false),
          to: toIsoDateTimeParam(to, true),
        },
      })
      .then((r) => unwrapApiResponse(r.data)),
  logFrontEvent: (args) => {
    const [first, second, third] = args
    const action = args.length >= 4 ? second : first
    const detail = args.length >= 4 ? third : second
    const config: AxiosRequestConfig | undefined =
      args.length >= 4
        ? {
            headers: {
              'X-Biz-Code': String(first || ''),
            },
          }
        : undefined

    const request = {
      action: String(action || 'legacy-action'),
      detail: String(detail || ''),
    }
    return (config ? http.post('/partner-orders/log', request, config) : http.post('/partner-orders/log', request))
      .then((r) => unwrapApiResponse(r.data))
      .catch((err: unknown) => {
        // 로그 실패는 swallow (legacy 동작 — sendLog 도 silent)
        console.warn('[v4 shim] logFrontEvent silent fail', err)
        return null
      })
  },

  // ─── 임시저장 / 스냅샷 (RPC §U/§V 카테고리) ──────────────────────────
  saveOrderSnapshot: ([payload]) =>
    http.post('/partner-orders/drafts', payload).then((r) => unwrapApiResponse(r.data)),
  saveDraft: ([payload]) =>
    http.post('/partner-orders/drafts', payload).then((r) => unwrapApiResponse(r.data)),
  getOrderSnapshotHistory: (args) =>
    http.get('/partner-orders/drafts', { params: draftHistoryParams(args) }).then((r) => unwrapApiResponse(r.data)),
  getDraftList: (args) =>
    http.get('/partner-orders/drafts', { params: draftHistoryParams(args) }).then((r) => unwrapApiResponse(r.data)),

  // ─── 최종 주문 전송 (RPC §O buildSendRows + §X sendOrderFromUi) ─────
  sendOrderFromUi: ([payload]) => {
    const p = (payload || {}) as { id?: string }
    const id = p.id || 'new'
    return http
      .post(`/partner-orders/${encodeURIComponent(id)}/confirm`, payload)
      .then((r) => ({
        ok: r.data?.success === true,
        orderNo: r.data?.data?.orderNo ?? null,
        error: r.data?.message ?? null,
      }))
  },

  // ─── 튜토리얼 상태 (RPC §W 카테고리) ──────────────────────────────────
  saveTutorialState: ([bizNo, mobile]) =>
    http
      .patch('/auth/partner-tutorial', {
        bizNo,
        platform: mobile ? 'MOBILE' : 'PC',
        done: true,
      })
      .then((r) => unwrapApiResponse(r.data)),

  // ─── 거래처 마스터 / 카탈로그 / DC 설정 (Code.js 외부 호출 대체) ─────
  getCustomerData: ([partnerCode]) =>
    http.get(`/partners/${encodeURIComponent(String(partnerCode))}`).then((r) => unwrapApiResponse(r.data)),
  getProducts: ([category]) =>
    http
      .get('/products', { params: { usageScope: 'PARTNER_ORDER', category } })
      .then((r) => unwrapApiResponse(r.data)),
  // 3d backlog — partner-auth-service 의 로그인 응답이 이미 DC 정책을 nested 로 포함하므로
  // 별도 backend 호출 없이 sessionStorage 캐시를 즉시 반환한다. 캐시 부재 시 graceful null.
  // 외부 단건 endpoint `/partner-dc-configs/{partnerCode}` 는 admin list 전용 (4b backlog 와 별개).
  applyConfigFromServer: ([_partnerCode]) => {
    void _partnerCode
    try {
      const cached = sessionStorage.getItem(CONFIG_KEY)
      if (!cached) return Promise.resolve(null)
      return Promise.resolve(JSON.parse(cached))
    } catch (err) {
      console.warn('[v4 shim] applyConfigFromServer: config 캐시 파싱 실패', err)
      return Promise.resolve(null)
    }
  },
}

/**
 * legacy 함수명 → SamhanLogis MS endpoint 호출 dispatcher.
 *
 * <p>매핑 누락 시 console.warn + Promise.resolve(null) (legacy 동작 graceful — withFailureHandler
 * 가 호출되지 않고 withSuccessHandler 가 null 로 호출됨).
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
        `[v4 shim] unmapped RPC '${fnName}' — noop. RPC_MAP 보강 + dev-reports/legacy-rpc-mapping-partner-order.md 동기화 필요`,
      )
      return Promise.resolve(null)
    }
    return handler(args)
  },

  /**
   * 부트스트랩 prefetch — legacy 의 `<?!= var ?>` 17종 (homemulti / singleSets / ... / config)
   * 에 해당하는 데이터를 단일 endpoint 에서 한 번에 받음.
   *
   * <p>endpoint: `GET /api/v1/partner-orders/bootstrap` (M4 PartnerOrderBootstrapController, PR #76).
   * 호출 실패 (네트워크 / 5xx) 는 호출자에게 throw 전파 — 빈 카탈로그 silent fallback 은
   * Phase 6 backend 머지 후 폐기 (회귀 위험 차단).
   *
   * <p>BE 응답이 ApiResponse&lt;BootstrapResponse&gt; envelope 이므로 `data` 만 추출.
   */
  fetchBootstrap(): Promise<Record<string, unknown>> {
    const cfg: AxiosRequestConfig = { timeout: 8000 }
    return http
      .get('/partner-orders/bootstrap', cfg)
      .then((r) => {
        const body = r.data as
          | { data?: { payloads?: Record<string, unknown> } & Record<string, unknown> }
          | Record<string, unknown>
        if (body && typeof body === 'object' && 'data' in body && body.data) {
          if (
            typeof body.data === 'object' &&
            'payloads' in body.data &&
            body.data.payloads
          ) {
            return body.data.payloads as Record<string, unknown>
          }
          return body.data as Record<string, unknown>
        }
        return body as Record<string, unknown>
      })
  },
}
