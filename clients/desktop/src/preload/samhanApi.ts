/**
 * legacy webview shim 의 backend 호출 모듈 — `google.script.run.<fnName>(args)` 호출을
 * SamhanLogis MS endpoint 로 매핑.
 *
 * <h2>매핑 표 (estimate index.html 의 11 RPC site)</h2>
 *
 * | fnName               | HTTP method + path                                    | M-단계 |
 * |----------------------|--------------------------------------------------------|--------|
 * | checkUserAuth        | GET  /api/v1/auth/me?email={...}                       | M2     |
 * | getCustomerDataAsync | GET  /api/v1/partners?withDc=true                       | M2     |
 * | getInventoryTable    | GET  /api/v1/products?usageScope=ESTIMATE&date={...}    | M1a    |
 * | getNotionHistory     | GET  /api/v1/partner-orders?from={...}&to={...}         | M4     |
 * | getQuoteHistory      | GET  /api/v1/estimates/snapshots?from={...}&to={...}    | M3     |
 * | saveQuoteSnapshot    | POST /api/v1/estimates/snapshots                        | M3     |
 * | sendOrderFromUi      | POST /api/v1/estimates/finalize                         | M3+M4  |
 * | getGateImages        | GET  /api/v1/files/gate-images                          | files  |
 * | logFrontEvent        | POST /api/v1/audit-logs/front                           | 공통   |
 *
 * <h2>외부 호출 폐기</h2>
 * <ul>
 *   <li>e-Count `UrlFetchApp.fetch('http://152.69.228.109:3000/proxy/ecount/...')` —
 *       Apps Script server-side Code.js 만 호출. webview client 에서는 발생 X.
 *       안전망: 본 매핑 표에 등록된 fnName 외 호출은 noop + warn.</li>
 *   <li>Notion API — 동상.</li>
 * </ul>
 *
 * <p>참조: {@code docs/dev-reports/legacy-rpc-mapping-estimate.md}</p>
 *
 * <p>UUID 비공개 가드 ({@code feedback_uuid_no_user_visibility.md}): 본 모듈은 단순 fetch
 * proxy 이며 UUID 노출/숨김 책임 없음. backend 응답에 노출 식별자만 포함되도록 backend 가
 * 보장 (M1a 완료, M2~M5 진행).</p>
 */

/** SamhanLogis MS 응답 envelope (`shared/common/dto/ApiResponse.java` 와 1:1). */
export interface ApiEnvelope<T = unknown> {
  success: boolean
  code: string
  message: string
  data: T
  timestamp: string
}

/** RPC 결과 — Apps Script 호환을 위해 임의 형태 (object/array/null). */
export type RpcResponse = unknown

/** HTTP method. */
type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** 단일 매핑 entry — fnName → endpoint resolver. */
interface RpcMapping {
  /** Apps Script 함수명. */
  fnName: string
  /** HTTP method. */
  method: HttpMethod
  /**
   * endpoint path — args 를 받아 path string 반환. query string + path param 모두 본 함수가 조립.
   * body 는 별도 {@link toBody} 로 분리.
   */
  toPath: (args: unknown[]) => string
  /** request body builder — GET 일 때는 unused. 미정의 시 빈 body. */
  toBody?: (args: unknown[]) => unknown
  /**
   * response transformer — backend 응답 envelope 의 `data` 를 legacy code 가 기대하는
   * 형태로 변환. 미정의 시 envelope.data 그대로 반환.
   */
  fromResponse?: (data: unknown) => unknown
}

/** querystring 안전 인코딩. */
function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const parts: string[] = []
  for (const [k, v] of Object.entries(params)) {
    if (v === null || v === undefined || v === '') continue
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  }
  return parts.length ? `?${parts.join('&')}` : ''
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => {
    const table: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }
    return table[ch] ?? ch
  })
}

const LEGACY_TABLE_ALLOWED_TAGS = new Set([
  'TABLE',
  'THEAD',
  'TBODY',
  'TFOOT',
  'TR',
  'TD',
  'TH',
  'COLGROUP',
  'COL',
  'SPAN',
  'DIV',
  'BR',
  'STRONG',
  'B',
])
const LEGACY_TABLE_ALLOWED_ATTRS = new Set(['class', 'style', 'colspan', 'rowspan', 'width'])

function isUnsafeLegacyAttrValue(value: string): boolean {
  const compact = value.replace(/[\u0000-\u001F\u007F\s]+/g, '').toLowerCase()
  return compact.includes('javascript:') || compact.includes('vbscript:') || /expression\s*\(/i.test(value)
}

function sanitizeLegacyAttrs(attrs: string): string {
  const kept: string[] = []
  const attrRe = /([^\s"'=<>`]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let match: RegExpExecArray | null
  while ((match = attrRe.exec(attrs)) !== null) {
    const name = String(match[1] ?? '').toLowerCase()
    const value = match[2] ?? match[3] ?? match[4] ?? ''
    if (!LEGACY_TABLE_ALLOWED_ATTRS.has(name) || name.startsWith('on') || isUnsafeLegacyAttrValue(value)) continue
    kept.push(`${name}="${escapeHtml(value)}"`)
  }
  return kept.length ? ` ${kept.join(' ')}` : ''
}

export function sanitizeLegacyTableHtmlPassthrough(html: string): string {
  return String(html ?? '')
    .replace(/<\s*script\b[^>]*>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*\/?\s*([a-zA-Z0-9:-]+)([^>]*)>/g, (match, tagName, attrs) => {
      const tag = String(tagName).toUpperCase()
      if (!LEGACY_TABLE_ALLOWED_TAGS.has(tag)) return ''
      if (/^<\s*\//.test(match)) return `</${tag.toLowerCase()}>`
      if (/\/\s*>$/.test(match) || tag === 'BR' || tag === 'COL') {
        return `<${tag.toLowerCase()}${sanitizeLegacyAttrs(String(attrs ?? ''))}>`
      }
      return `<${tag.toLowerCase()}${sanitizeLegacyAttrs(String(attrs ?? ''))}>`
    })
}

/** legacy `getCustomerDataAsync` 응답 형태 — Apps Script 코드가 기대하는 array<Customer>. */
interface LegacyCustomer {
  partnerCode: string
  name: string
  contact?: string
  address?: string
  // ... estimate index.html 가 사용하는 추가 필드
}

/**
 * 11 RPC site → 9 distinct fnName 매핑 표 (DECISIONS Phase 6 v4 §매핑).
 *
 * estimate index.html 분석:
 *   1) checkUserAuth (line 8726)
 *   2) sendOrderFromUi (line 10084 + 15049 — 동일 fnName 2 site)
 *   3) getNotionHistory (line 13218)
 *   4) logFrontEvent (line 13942)
 *   5) getCustomerDataAsync (line 15091 + 15228 — 동일 fnName 2 site)
 *   6) getInventoryTable (line 15506)
 *   7) getQuoteHistory (line 16434)
 *   8) saveQuoteSnapshot (line 16717)
 *   9) getGateImages (line 12879)
 */
const RPC_MAPPINGS: RpcMapping[] = [
  {
    fnName: 'checkUserAuth',
    method: 'GET',
    toPath: (args) => `/api/v1/auth/me${qs({ email: String(args[0] ?? '') })}`,
    fromResponse: (data) => {
      // legacy 기대: { authorized: boolean, managerName?: string }
      const d = (data ?? {}) as { authorized?: boolean; managerName?: string }
      return { authorized: !!d.authorized, managerName: d.managerName ?? '' }
    },
  },
  {
    fnName: 'getCustomerDataAsync',
    method: 'GET',
    toPath: () => `/api/v1/partners${qs({ withDc: true, size: 9999 })}`,
    fromResponse: (data) => {
      // legacy 기대: array<{ partnerCode, name, ... }>
      // backend Page<Partner> 응답을 array 로 평탄화
      const page = (data ?? {}) as { content?: LegacyCustomer[] }
      return Array.isArray(page) ? page : page.content ?? []
    },
  },
  {
    fnName: 'getInventoryTable',
    method: 'GET',
    toPath: (args) => {
      const dateVal = args[0]
      const items = args[1]
      return `/api/v1/products${qs({
        usageScope: 'ESTIMATE',
        date: typeof dateVal === 'string' ? dateVal : '',
        items: items ? JSON.stringify(items) : '',
        size: 9999,
      })}`
    },
    fromResponse: (data) => {
      // legacy 기대: HTML string (legacy code 가 div.innerHTML = data)
      // backend 가 raw HTML 을 응답하지 않으면 placeholder html 합성
      if (typeof data === 'string') return sanitizeLegacyTableHtmlPassthrough(data)
      const page = (data ?? {}) as { content?: unknown[] }
      const rows = Array.isArray(page) ? page : page.content ?? []
      const tdHtml = rows
        .map((r) => {
          const item = r as { modelCode?: string; name?: string; releasePrice?: number }
          return `<tr><td>${escapeHtml(item.modelCode)}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(
            item.releasePrice,
          )}</td></tr>`
        })
        .join('')
      return `<table style="width:100%"><thead><tr><th>모델명</th><th>품목명</th><th>출시가</th></tr></thead><tbody>${tdHtml}</tbody></table>`
    },
  },
  {
    fnName: 'getNotionHistory',
    method: 'GET',
    toPath: (args) =>
      `/api/v1/partner-orders${qs({
        from: String(args[0] ?? ''),
        to: String(args[1] ?? ''),
        size: 9999,
      })}`,
    fromResponse: (data) => {
      const page = (data ?? {}) as { content?: unknown[] }
      return Array.isArray(page) ? page : page.content ?? []
    },
  },
  {
    fnName: 'logFrontEvent',
    method: 'POST',
    toPath: () => `/api/v1/audit-logs/front`,
    toBody: (args) => ({
      group: String(args[0] ?? ''),
      message: String(args[1] ?? ''),
      isMobile: !!args[2],
      manager: String(args[3] ?? ''),
    }),
  },
  {
    fnName: 'getQuoteHistory',
    method: 'GET',
    toPath: (args) =>
      `/api/v1/estimates/snapshots${qs({
        from: String(args[0] ?? ''),
        to: String(args[1] ?? ''),
        size: 9999,
      })}`,
    fromResponse: (data) => {
      const page = (data ?? {}) as { content?: unknown[] }
      return Array.isArray(page) ? page : page.content ?? []
    },
  },
  {
    fnName: 'saveQuoteSnapshot',
    method: 'POST',
    toPath: () => `/api/v1/estimates/snapshots`,
    toBody: (args) => args[0] ?? {},
  },
  {
    fnName: 'sendOrderFromUi',
    method: 'POST',
    toPath: () => `/api/v1/estimates/finalize`,
    toBody: (args) => args[0] ?? {},
    fromResponse: (data) => {
      // legacy 기대: { slipNo: string } 또는 string
      if (typeof data === 'string') return { slipNo: data }
      return data ?? { slipNo: '' }
    },
  },
  {
    fnName: 'getGateImages',
    method: 'GET',
    toPath: () => `/api/v1/files/gate-images`,
    fromResponse: (data) => {
      // legacy 기대: array<{ name, url }>
      return Array.isArray(data) ? data : []
    },
  },
]

/** fnName → mapping lookup. */
const MAPPING_INDEX: Record<string, RpcMapping> = Object.fromEntries(
  RPC_MAPPINGS.map((m) => [m.fnName, m]),
)

/**
 * baseUrl 결정 — Vite 환경변수 (`process.env.VITE_API_BASE_URL`) 또는 기본 `http://localhost:8080`.
 * preload 컨텍스트는 Node 가 활성이므로 process.env 직접 접근 가능.
 */
function resolveBaseUrl(): string {
  const env = process.env['VITE_API_BASE_URL'] || process.env['API_BASE_URL']
  return env || 'http://localhost:8080'
}

/** 토큰 조회 — main 프로세스의 auth-store 와 동기화 (preload 의 fetch 직전 호출). */
async function getAuthToken(): Promise<string | null> {
  // electron preload 는 ipcRenderer 를 직접 사용 가능 (contextIsolation true)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ipcRenderer } = require('electron')
    const auth = await ipcRenderer.invoke('auth:get-token')
    if (auth && typeof auth === 'object' && 'token' in auth) {
      return String((auth as { token?: string }).token ?? '') || null
    }
  } catch (err) {
    console.warn('[samhanApi] 토큰 조회 IPC 실패 — 익명 호출', err)
  }
  return null
}

/** 단일 RPC 호출 — fnName + args → fetch + envelope unwrap. */
async function callRpc(fnName: string, args: unknown[]): Promise<RpcResponse> {
  const mapping = MAPPING_INDEX[fnName]
  if (!mapping) {
    console.warn(
      `[samhanApi] 매핑 누락 — fnName="${fnName}" (e-Count/Notion 외부 호출 또는 신규 함수)`,
    )
    // legacy 코드가 실패 핸들러로 분기하지 않도록 빈 객체 반환
    return null
  }

  const baseUrl = resolveBaseUrl()
  const url = baseUrl + mapping.toPath(args)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const token = await getAuthToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const init: RequestInit = { method: mapping.method, headers }
  if (mapping.method !== 'GET' && mapping.toBody) {
    init.body = JSON.stringify(mapping.toBody(args))
  }

  const res = await fetch(url, init)
  if (!res.ok) {
    throw new Error(`${mapping.method} ${url} → ${res.status} ${res.statusText}`)
  }
  const json = (await res.json()) as ApiEnvelope
  const data = json && typeof json === 'object' && 'data' in json ? json.data : json
  return mapping.fromResponse ? mapping.fromResponse(data) : data
}

/** 외부 노출 — `legacyShim.ts` 가 import. */
export const samhanApi = {
  call(fnName: string, args: unknown[]): Promise<RpcResponse> {
    return callRpc(fnName, args)
  },
  mappedFunctions(): string[] {
    return RPC_MAPPINGS.map((m) => m.fnName)
  },
}
