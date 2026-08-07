import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * E3 S4d 입금보고서(CashReceipt) coedit — 실 서버 GUI QA 스크린샷 캡처(단일 세션).
 *
 * [[no-fake-data-ever]] [[real-server-check-screenshot]]
 * - VITE_MOCK_MODE OFF — 실 게이트웨이 http://127.0.0.1:8080 직접 연결(page.route 프록시 + 실 JWT).
 * - window.samhanAuth stub 으로 실 dev_master JWT 주입.
 * - RECEIPT_ID env = 실 DRAFT 입금보고서(MANUAL_RECEIPT). DETAIL 은 읽기전용.
 *
 * 2세션 SSE 양방향 GUI 자동화는 accounting /collab SSE 의 real-qa 프록시 한계로 미포함 —
 * 라이브 relay 2-연결 브로드캐스트는 별도 curl 실증(docs/qa/e3-s4d-coedit/) + CashReceiptCoeditIT(6, 실 PG).
 *
 * 실행: cd clients/desktop; 별도 터미널 vite dev(mock off, :5177);
 *   DEV_SEED_PASSWORD=<dev_master 비번> RECEIPT_ID=<draft-uuid> \
 *     node_modules/.bin/playwright test --config playwright/cash-receipt-coedit-real-qa/playwright.config.ts
 * (비밀번호는 하드코딩하지 않고 env 로 주입 — CLAUDE.md placeholder 의무.)
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, type Page } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5177'
const GW_URL = 'http://127.0.0.1:8080'
const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const RECEIPT_ID = process.env['RECEIPT_ID'] ?? ''

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/e3-s4d-coedit'))
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

let n = 0
async function capture(page: Page, name: string): Promise<void> {
  n++
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${String(n).padStart(2, '0')}-${name}.png`), fullPage: false })
}

async function fetchRealToken(): Promise<string> {
  const http = await import('http')
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') })
    const req = http.default.request(
      { hostname: '127.0.0.1', port: 8080, path: '/api/v1/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { let d = ''; res.on('data', (c) => { d += c }); res.on('end', () => {
        try { resolve(JSON.parse(d).data.token as string) } catch { reject(new Error('token: ' + d)) } }) },
    )
    req.on('error', reject); req.write(body); req.end()
  })
}

async function installRealAuth(page: Page, token: string): Promise<void> {
  await page.addInitScript(({ t, userId }: { t: string; userId: string }) => {
    const displayName = '[DEV-SEED] 개발마스터'
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => ({ token: t, userId, role: 'MASTER', displayName, fullName: displayName }),
      setToken: async () => undefined, clearToken: async () => undefined } })
  }, { t: token, userId: MASTER_USER_ID })
}

async function setupApiProxy(page: Page, token: string): Promise<void> {
  const handler = async (route: import('@playwright/test').Route) => {
    const rt = route.request().resourceType()
    if (rt !== 'xhr' && rt !== 'fetch') return route.continue()
    const u = new URL(route.request().url())
    // SSE(/collab/stream)는 응답이 종료되지 않아 route.fetch() 가 teardown 까지 hang → abort 로 끊고 실 클라이언트 재연결에 위임
    // (proxy resourceType 가드와 함께 이중방어 — feedback_realqa_proxy_glob_resourcetype).
    if (u.pathname.endsWith('/collab/stream')) return route.abort()
    const realUrl = `${GW_URL}${u.pathname}${u.search}`
    const headers: Record<string, string> = {}
    for (const { name, value } of await route.request().headersArray()) {
      if (name.toLowerCase() !== 'host') headers[name] = value
    }
    headers['Authorization'] = `Bearer ${token}`
    const postData = route.request().postData()
    try {
      const response = await route.fetch({ url: realUrl, method: route.request().method(), headers, body: postData ?? undefined })
      await route.fulfill({ response })
    } catch (err) { console.error('[PROXY]', realUrl, err); await route.abort() }
  }
  await page.route('**/api/v1/**', handler)
  await page.route('**/accounting/**', handler)
}

async function gotoAndSettle(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(2_500)
}

test.describe('E3 S4d 입금보고서 coedit 실 GUI QA (단일 세션)', () => {
  let token = ''
  test.beforeAll(async () => { token = await fetchRealToken() })

  test('DRAFT 편집폼 coedit + 상세 읽기전용', async ({ page }) => {
    test.skip(!RECEIPT_ID, 'RECEIPT_ID env 필요')
    page.on('pageerror', (e) => console.log('[PAGEERR]', e.message))
    page.on('console', (m) => { if (m.type() === 'error') console.log('[CONSOLE.ERR]', m.text().slice(0, 200)) })
    await installRealAuth(page, token)
    await setupApiProxy(page, token)

    // ① 목록
    await gotoAndSettle(page, `${BASE_URL}/#/accounting/admin/cash-receipts?mockRole=MASTER`)
    await capture(page, 'cash-receipt-list')
    console.log('[TITLE]', await page.title(), '| body chars:', (await page.textContent('body').catch(() => ''))?.length)

    // ② 상세(읽기전용 Field + 편집버튼)
    await gotoAndSettle(page, `${BASE_URL}/#/accounting/admin/cash-receipts/${RECEIPT_ID}?mockRole=MASTER`)
    await capture(page, 'detail-readonly')

    // ③ 편집폼(coedit 필드 배선 — CollaborativeSlipInput)
    await gotoAndSettle(page, `${BASE_URL}/#/accounting/admin/cash-receipts/${RECEIPT_ID}/edit?mockRole=MASTER`)
    await capture(page, 'edit-coedit-form')
  })
})
