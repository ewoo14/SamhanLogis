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
/** 서버 전용 네이버 자격증명을 보유한 estimate-app의 공개 주소. */
const ESTIMATE_APP_URL: string = (
  import.meta.env.VITE_ESTIMATE_APP_URL || 'https://quote.samhan-air.com'
).replace(/\/+$/, '')

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
 * - `tryLogin(bizNo, pw, mobile)` → `POST /api/v1/auth/partner-login` (M2 PartnerAuth)
 * - `getAccessExpiration(bizNo)` → `GET /api/v1/auth/partner-expiration?bizNo=...`
 * - `getOrderHistory(bizCode, dateRange)` → `GET /api/v1/partner-orders/history?bizCode=...`
 * - `logFrontEvent(action, detail)` → `POST /api/v1/partner-orders/log` (frontend audit)
 * - `saveOrderSnapshot(payload)` → `POST /api/v1/partner-orders/drafts` (M4, 30일 expiry)
 * - `getOrderSnapshotHistory(bizNo, from, to)` → `GET /api/v1/partner-orders/drafts?from=&to=`
 * - `sendOrderFromUi(items, order)` → draft 생성 후 `POST /api/v1/partner-orders/{draftId}/confirm` (M4)
 * - `pricePreview(items, order)` → `POST /api/v1/partner-orders/price-preview` (서버 권위 단가)
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

type PageMetadata = {
  totalElements: number
  totalPages: number
  page: number
  size: number
}

type CollectionResponse = {
  rows: unknown[]
  page?: PageMetadata
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

function decodeCollectionResponse(body: unknown): CollectionResponse {
  const data = unwrapApiResponse(body)
  if (Array.isArray(data)) return { rows: data }
  if (!data || typeof data !== 'object') {
    throw new Error('목록 응답 형식이 올바르지 않습니다')
  }

  const page = data as {
    content?: unknown
    totalElements?: unknown
    totalPages?: unknown
    number?: unknown
    size?: unknown
  }
  if (!Array.isArray(page.content)) {
    throw new Error('목록 응답 형식이 올바르지 않습니다')
  }

  const totalElements = nonNegativeInteger(page.totalElements)
  const totalPages = nonNegativeInteger(page.totalPages)
  const pageNumber = nonNegativeInteger(page.number)
  const size = typeof page.size === 'number' && Number.isInteger(page.size) && page.size > 0
    ? page.size
    : null
  if (totalElements == null || totalPages == null || pageNumber == null || size == null) {
    throw new Error('목록 응답 페이지 메타데이터가 올바르지 않습니다')
  }

  return {
    rows: page.content,
    page: { totalElements, totalPages, page: pageNumber, size },
  }
}

async function fetchAllPages(
  path: string,
  baseParams: Record<string, unknown>,
  initialSize: number,
): Promise<unknown[]> {
  const firstResponse = await http.get(path, {
    params: { ...baseParams, page: 0, size: initialSize },
  })
  const first = decodeCollectionResponse(firstResponse.data)
  if (!first.page) return first.rows

  const rows = [...first.rows]
  for (let page = 1; page < first.page.totalPages; page += 1) {
    const nextResponse = await http.get(path, {
      params: { ...baseParams, page, size: first.page.size },
    })
    const next = decodeCollectionResponse(nextResponse.data)
    if (!next.page) {
      throw new Error('목록 응답 페이지 메타데이터가 올바르지 않습니다')
    }
    rows.push(...next.rows)
  }

  if (rows.length < first.page.totalElements) {
    throw new Error('목록 응답이 일부만 반환되었습니다')
  }
  return rows
}

/** 홈멀티 주문 화면이 소비하는 활성 HOME_MULTI 수량 동기화 규칙 목록. */
function fetchQuantitySyncRules(): Promise<unknown[]> {
  return fetchAllPages('/quantity-sync-rules', { estimateCategory: 'HOME_MULTI' }, 50)
}

type LegacyOrderItem = {
  section?: unknown
  model?: unknown
  qty?: unknown
  price?: unknown
  setAllocation?: unknown
  remarks?: unknown
}

const CONFIRM_CATEGORY_BY_SECTION: Record<string, string> = {
  HOME: 'homemulti',
  COMM: 'commercialMulti',
  SINGLE: 'singleSets',
  OLD: 'oldProducts',
}

function confirmLines(itemsArg: unknown): Array<{
  modelCode: string
  categoryKey: string
  quantity: number
  remark: string | null
}> {
  if (!Array.isArray(itemsArg) || itemsArg.length === 0) {
    throw new Error('전송할 주문 품목이 없습니다')
  }

  return itemsArg.map((rawItem, index) => {
    const item = (rawItem || {}) as LegacyOrderItem
    const modelCode = String(item.model ?? '').trim()
    const section = String(item.section ?? '').trim().toUpperCase()
    const categoryKey = CONFIRM_CATEGORY_BY_SECTION[section]
    const quantity = Number(item.qty)

    if (!modelCode) throw new Error(`주문 ${index + 1}번째 품목의 모델코드가 없습니다`)
    if (!categoryKey) throw new Error(`주문 ${index + 1}번째 품목의 카테고리를 확인할 수 없습니다`)
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new Error(`주문 ${index + 1}번째 품목의 수량이 올바르지 않습니다`)
    }

    const remark = typeof item.remarks === 'string' && item.remarks.trim()
      ? item.remarks.trim()
      : null
    const unitPrice = Number(item.price)
    return {
      modelCode,
      categoryKey,
      quantity,
      ...(item.setAllocation === true && Number.isFinite(unitPrice) && unitPrice > 0
        ? { unitPrice, setAllocation: true } : {}),
      remark,
    }
  })
}

function apiErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const code = (error as { code?: unknown }).code
    if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
      return '서버 응답이 지연되어 처리 결과를 확인할 수 없습니다. 재전송해도 중복 주문으로 처리되지 않습니다.'
    }
    const responseData = (error as { response?: { data?: unknown } }).response?.data
    if (responseData && typeof responseData === 'object') {
      const message = (responseData as { message?: unknown }).message
      if (typeof message === 'string' && message.trim()) return message
    }
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return message
  }
  return '주문 전송에 실패했습니다'
}

function confirmHeaders(order: unknown): { headers: { 'X-Biz-Code': string } } {
  const bizCode = order && typeof order === 'object'
    ? String((order as { bizno?: unknown; custCode?: unknown }).bizno
      ?? (order as { custCode?: unknown }).custCode ?? '').trim()
    : ''
  if (!bizCode) throw new Error('주문 사업자번호가 없습니다')
  return { headers: { 'X-Biz-Code': bizCode } }
}

function previewHeaders(order: unknown): { headers: { 'X-Partner-Code': string } } {
  const partnerCode = order && typeof order === 'object'
    ? String((order as { partnerCode?: unknown; bizno?: unknown }).partnerCode
      ?? (order as { bizno?: unknown }).bizno ?? '').trim()
    : ''
  if (!partnerCode) throw new Error('가격 미리보기 거래처 코드가 없습니다')
  return { headers: { 'X-Partner-Code': partnerCode } }
}

const RPC_MAP: Record<string, RpcHandler> = {
  // 브라우저는 네이버를 직접 호출하지 않고 estimate-app 서버 프록시만 호출한다.
  searchNaverAddress: ([query]) =>
    axios
      .post(`${ESTIMATE_APP_URL}/address-search`, { query }, { timeout: 15000 })
      .then((r) => r.data),

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
  tryLogin: ([bizNo, pw, mobile]) =>
    http
      .post('/auth/partner-login', {
        bizNo,
        password: pw,
        mobile,
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
    fetchAllPages(
      '/partner-orders/history',
      {
        bizCode,
        from: toIsoDateTimeParam(from, false),
        to: toIsoDateTimeParam(to, true),
      },
      20,
    ),
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
    fetchAllPages('/partner-orders/drafts', draftHistoryParams(args), 20),
  getDraftList: (args) =>
    fetchAllPages('/partner-orders/drafts', draftHistoryParams(args), 20),

  // ─── 최종 주문 전송 (RPC §O buildSendRows + §X sendOrderFromUi) ─────
  sendOrderFromUi: ([itemsArg, orderArg]) =>
    Promise.resolve()
      .then(() => {
        const items = Array.isArray(itemsArg) ? itemsArg : []
        const lines = confirmLines(items)
        const order = orderArg && typeof orderArg === 'object' ? orderArg : {}
        const headers = confirmHeaders(order)
        return http.post('/partner-orders/drafts', {
          label: '주문서 확정 임시저장',
          payloadJson: JSON.stringify({ items, order }),
        }).then((r) => ({ lines, draft: unwrapApiResponse(r.data), headers }))
      })
      .then(({ lines, draft, headers }) => {
        const draftId = draft && typeof draft === 'object'
          ? (draft as { draftId?: unknown }).draftId
          : null
        if (typeof draftId !== 'string' || !draftId.trim()) {
          throw new Error('임시저장 ID를 받지 못했습니다')
        }
        return http
          .post(`/partner-orders/${encodeURIComponent(draftId)}/confirm`, { lines }, headers)
          .then((r) => ({
            ok: r.data?.success === true,
            orderNo: r.data?.data?.orderNo ?? null,
            error: r.data?.message ?? null,
          }))
      })
      .catch((error: unknown) => ({
        ok: false,
        orderNo: null,
        error: apiErrorMessage(error),
      })),

  // ─── 서버 권위 가격 미리보기 ────────────────────────────────────────────
  // 40% 규칙을 브라우저에서 재현하지 않는다. 서버 오류는 throw 하여 화면이
  // 명시적 미리보기 실패 상태를 보여 주고, 정상가/기존율로 폴백하지 않는다.
  pricePreview: ([itemsArg, orderArg]) =>
    Promise.resolve().then(() => {
      const lines = confirmLines(Array.isArray(itemsArg) ? itemsArg : [])
      return http
        .post('/partner-orders/price-preview', { lines }, previewHeaders(orderArg))
        .then((r) => unwrapApiResponse(r.data))
    }),

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
    fetchAllPages('/products', { usageScope: 'PARTNER_ORDER', category }, 50)
      .then((rows) => rows.filter((row) => {
        const status = row && typeof row === 'object' && 'status' in row
          ? String((row as { status?: unknown }).status ?? '')
          : ''
        return status !== 'DISCONTINUED' && status !== 'NOT_FOR_SALE'
      })),
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

  /**
   * 로그인 후 칩 기반 S-03 evaluator가 읽는 규칙 목록.
   * 로그인 전 공개 bootstrap과 분리해 JWT가 준비된 뒤 호출한다.
   */
  fetchQuantitySyncRules(): Promise<unknown[]> {
    return fetchQuantitySyncRules()
  },

  fetchAddressSearchStatus(): Promise<{ enabled: boolean }> {
    return axios
      .get<{ enabled?: boolean }>(`${ESTIMATE_APP_URL}/address-search/status`, { timeout: 5000 })
      .then((r) => ({ enabled: r.data?.enabled === true }))
  },
}
