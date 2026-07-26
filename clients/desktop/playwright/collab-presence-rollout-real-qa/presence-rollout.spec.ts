import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * collab presence 4문서 롤아웃 — 실 서버 2세션 QA 스크린샷 캡처.
 *
 * [[no-fake-data-ever]] [[real-server-check-screenshot]] [[realqa-run-and-false-red]]
 * - VITE_MOCK_MODE OFF — 실 게이트웨이 :8080 (page.route 프록시 + 실 JWT).
 * - 2 브라우저 컨텍스트(master + 문서별 2차 사용자, 서로 다른 X-User-Id→다른 색상).
 * - 각 문서 상세에 동시 진입 → PresenceIndicator 2명 상호 표시 캡처.
 *
 * 🪤 (Codex 진단) page.route('**\/*') 로 전체 가로채면 렌더러 자원(/@vite,/src,/node_modules,HMR)
 * 까지 route 핸들러를 거쳐 첫 goto 가 stall + 백지. → API glob 만 개별 등록(아래 PROXY_GLOBS),
 * 렌더러 자원은 네이티브 통과. estimate-collab-real-qa 가 '**\/api/v1/**' 만 써서 멀쩡했던 이유.
 *
 * 실행(렌더러 :5175 mock off 선기동 후):
 *   cd clients/desktop && AUDIT_BASE_URL=http://127.0.0.1:5175 \
 *     node_modules/.bin/playwright test --config playwright/collab-presence-rollout-real-qa/playwright.config.ts
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, type Page, type Route, type BrowserContext } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GW = 'http://127.0.0.1:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOT_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/collab-presence-rollout'))
fs.mkdirSync(SHOT_DIR, { recursive: true })

/**
 * 백엔드 XHR/fetch 만 가로챈다. 🪤 절대 '**\/accounting/**' 같은 넓은 글롭 금지 —
 * 앱 lazy 라우트 청크(/routes/accounting/*.tsx)까지 매칭→게이트웨이 404→앱 백지.
 * collab/presence 는 모두 '/collab/' 세그먼트 보유(앱 모듈엔 없음) → 안전. + resourceType 가드 이중방어.
 */
const PROXY_GLOBS = [
  '**/api/v1/**', '**/collab/**', '**/admin/groupware/approvals/**',
]

interface DevUser { loginId: string; userId: string; displayName: string }

const USERS: Record<string, DevUser> = {
  master: { loginId: 'dev_master', userId: 'a0000000-0000-0000-0000-000000000001', displayName: '[DEV-SEED] 개발마스터' },
  sales: { loginId: 'dev_sales', userId: 'a0000000-0000-0000-0000-000000000004', displayName: '[DEV-SEED] 개발영업' },
  accountant: { loginId: 'dev_accountant', userId: 'a0000000-0000-0000-0000-000000000005', displayName: '[DEV-SEED] 개발회계' },
  manager: { loginId: 'dev_manager', userId: 'a0000000-0000-0000-0000-000000000003', displayName: '[DEV-SEED] 개발매니저' },
}

const DOCS = [
  { key: 'accounting-journal', label: '회계전표', route: (id: string) => `/#/accounting/journals/${id}`, id: 'fd0a7b35-3f5a-3b2d-ab94-44f45d25c7f6', second: 'accountant' },
  { key: 'estimate', label: '견적', route: (id: string) => `/#/sales/estimates/${id}`, id: '829e012a-e7da-4777-bd94-a67d177f17dc', second: 'sales' },
  { key: 'partner-order', label: '주문', route: (id: string) => `/#/sales/partner-orders/${id}`, id: '2026-06-08-1983', second: 'sales' },
  { key: 'groupware-approval', label: '그룹웨어 결재', route: (id: string) => `/#/groupware/approvals/${id}`, id: 'd16da703-e914-4bd0-bdd2-43a715e6e418', second: 'manager' },
] as const

async function fetchToken(loginId: string): Promise<string> {
  const http = await import('http')
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ loginId, password: PASSWORD })
    const req = http.default.request(
      { hostname: '127.0.0.1', port: 8080, path: '/api/v1/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { let d = ''; res.on('data', (c) => { d += c }); res.on('end', () => {
        try { resolve(JSON.parse(d).data.token as string) } catch { reject(new Error('token: ' + d)) } }) })
    req.on('error', reject); req.write(body); req.end()
  })
}

async function prepareContext(ctx: BrowserContext, user: DevUser, token: string): Promise<Page> {
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log(`[pageerror:${user.loginId}] ${e.message}`))
  page.on('console', (m) => { if (m.type() === 'error') console.log(`[console:${user.loginId}] ${m.text()}`) })
  await page.addInitScript(({ t, userId, displayName }: { t: string; userId: string; displayName: string }) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => ({ token: t, userId, role: 'MASTER', displayName, fullName: displayName }),
      setToken: async () => undefined, clearToken: async () => undefined } })
  }, { t: token, userId: user.userId, displayName: user.displayName })

  const handler = async (route: Route) => {
    // 모듈/문서/스타일 등 렌더러 자원은 절대 프록시하지 않는다(앱 백지 방지).
    const rt = route.request().resourceType()
    if (rt !== 'xhr' && rt !== 'fetch') return route.continue()
    const u = new URL(route.request().url())
    if (u.pathname.endsWith('/collab/stream')) return route.abort() // SSE → fetch hang 방지
    const headers: Record<string, string> = {}
    for (const { name, value } of await route.request().headersArray()) {
      if (name.toLowerCase() !== 'host') headers[name] = value
    }
    headers['Authorization'] = `Bearer ${token}`
    const pd = route.request().postData()
    try {
      const response = await route.fetch({ url: `${GW}${u.pathname}${u.search}`, method: route.request().method(), headers, body: pd ?? undefined })
      await route.fulfill({ response })
    } catch (err) { console.log(`[proxyfail] ${u.pathname} ${String(err)}`); await route.abort() }
  }
  for (const g of PROXY_GLOBS) await page.route(g, handler)
  return page
}

// networkidle 은 SSE 재시도로 절대 idle 안 됨(시간 sink) → 사용 금지. 준비완료 신호는 shoot 의 indicator 대기.
async function gotoSettle(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForTimeout(1_500)
}

async function shoot(page: Page, file: string): Promise<string> {
  // 콜드 vite dev 모듈 컴파일이 느리므로 presence-indicator 가 뜰 때까지 넉넉히 대기.
  await page.getByTestId('presence-indicator').first().waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {})
  await page.getByTestId('presence-indicator').first().scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(1_000)
  await page.screenshot({ path: path.join(SHOT_DIR, file), fullPage: false })
  return page.getByTestId('presence-indicator').first().innerText().catch(() => '(no indicator)')
}

test.describe('collab presence 4문서 롤아웃 — 2세션 실 QA', () => {
  for (const doc of DOCS) {
    test(`${doc.label} 2세션 presence 상호 표시`, async ({ browser }) => {
      const second = USERS[doc.second]!
      const [tA, tB] = await Promise.all([fetchToken(USERS.master!.loginId), fetchToken(second.loginId)])
      const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } })
      const pageA = await prepareContext(ctxA, USERS.master!, tA)
      const pageB = await prepareContext(ctxB, second, tB)
      const url = `${BASE_URL}${doc.route(doc.id)}`

      // A 진입 → presence join (자기 1명)
      await gotoSettle(pageA, url)
      const a1 = await shoot(pageA, `${doc.key}-01-A-self.png`)

      // B 진입 → mount list 가 A 포함 + 자기 join → 2명
      await gotoSettle(pageB, url)
      const b = await shoot(pageB, `${doc.key}-02-B-sees-two.png`)

      // A reload → 최신 list(자기+B) → 2명 (SSE abort 환경)
      await gotoSettle(pageA, url)
      const a2 = await shoot(pageA, `${doc.key}-03-A-sees-two.png`)

      console.log(`[PRESENCE ${doc.key}] A-self="${a1.replace(/\n/g, ' ')}" | B="${b.replace(/\n/g, ' ')}" | A-after="${a2.replace(/\n/g, ' ')}"`)

      await ctxA.close(); await ctxB.close()
    })
  }
})
