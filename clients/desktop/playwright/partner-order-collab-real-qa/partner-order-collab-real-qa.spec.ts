import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * §7 슬라이스2 주문(PartnerOrder) 협업 "수정완료 1-인" 모델 — 실 서버 QA 스크린샷 캡처.
 *
 * [[no-fake-data-ever]] [[real-server-check-screenshot]]
 * - VITE_MOCK_MODE OFF — 실 게이트웨이 http://127.0.0.1:8080 직접 연결.
 * - window.samhanAuth stub 으로 실 JWT 주입.
 * - 실 시드 CONFIRMED 주문(orderNo 2026/04/15-29) 대상. 상세 라우트는 하이픈 path-id(2026-04-15-29).
 *
 * 실행: cd clients/desktop; 별도 터미널 vite :5176(mock off);
 *   node_modules/.bin/playwright test --config playwright/partner-order-collab-real-qa/playwright.config.ts
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5176'
const GW_URL = 'http://127.0.0.1:8080'

const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_ROLE = 'MASTER'
const MASTER_DISPLAY_NAME = '[DEV-SEED] 개발마스터'

/** 실 시드 CONFIRMED 주문 — 하이픈 path-id(toOrderPathId). 미편집 초기 상태 캡처용. */
const ORDER_PATH_ID = '2026-04-15-29'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/partner-order-collab'))
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

let n = 0
async function capture(page: Page, name: string): Promise<void> {
  n++
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${String(n).padStart(2, '0')}-${name}.png`), fullPage: false })
}

async function fetchRealToken(): Promise<string> {
  const http = await import('http')
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ loginId: 'dev_master', password: (resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')) })
    const req = http.default.request(
      { hostname: '127.0.0.1', port: 8080, path: '/api/v1/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { let d = ''; res.on('data', (c) => { d += c }); res.on('end', () => {
        try { resolve(JSON.parse(d).data.token as string) } catch (e) { reject(new Error('token: ' + d)) } }) },
    )
    req.on('error', reject); req.write(body); req.end()
  })
}

async function installRealAuth(page: Page, token: string): Promise<void> {
  await page.addInitScript(({ t, userId, role, displayName }: { t: string; userId: string; role: string; displayName: string }) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => ({ token: t, userId, role, displayName }),
      setToken: async () => undefined, clearToken: async () => undefined } })
  }, { t: token, userId: MASTER_USER_ID, role: MASTER_ROLE, displayName: MASTER_DISPLAY_NAME })
}

async function setupApiProxy(page: Page, token: string): Promise<void> {
  await page.route('**/api/v1/**', async (route) => {
    const u = new URL(route.request().url())
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
  })
}

async function gotoAndSettle(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
  await page.waitForTimeout(1_500)
}

test.describe('§7 슬라이스2 주문 협업 실 QA — 수정완료 1-인 모델', () => {
  let realToken = ''
  test.beforeAll(async () => { realToken = await fetchRealToken() })

  test('목록 → 상세 → 수정완료 → diff → 코멘트', async ({ page }) => {
    await installRealAuth(page, realToken)
    await setupApiProxy(page, realToken)

    await gotoAndSettle(page, `${BASE_URL}/#/sales/partner-orders?mockRole=MASTER`)
    await capture(page, 'order-list')

    await gotoAndSettle(page, `${BASE_URL}/#/sales/partner-orders/${ORDER_PATH_ID}?mockRole=MASTER`)
    await page.getByTestId('partner-order-collaboration-panel').scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(800)
    await capture(page, 'order-detail')

    const editBtn = page.getByTestId('partner-order-collab-edit-open')
    await editBtn.scrollIntoViewIfNeeded().catch(() => {})
    await capture(page, 'edit-button')

    await editBtn.click()
    await page.waitForTimeout(800)
    await page.getByTestId('partner-order-collab-edit-form').scrollIntoViewIfNeeded().catch(() => {})
    await capture(page, 'edit-mode')

    await page.getByLabel('요청사항 수정값').fill('실서버 QA — 5/7 오전 입고 후 담당자 확인 요청')
    await page.getByLabel('납기 수정값').fill('2026-06-03')
    await page.getByLabel('1번 라인 비고 수정값').fill('실서버 QA 라인 비고 정정')
    await page.getByLabel('수정 사유').fill('실서버 QA 검증 — 수정완료 즉시 커밋')
    await page.waitForTimeout(400)
    await capture(page, 'edit-filled')

    await page.getByRole('button', { name: '수정완료' }).click()
    await page.waitForTimeout(1500)
    await capture(page, 'edit-commit')

    // #31 이력 일원화 이후 changeSet diff 목록은 제거되고 PartnerOrderVersionHistoryPanel
    // (버전이력 row-level highlight) 로 일원화된다.
    await page.getByTestId('partner-order-version-history-panel').scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(400)
    await capture(page, 'diff-history')

    const commentInput = page.getByTestId('partner-order-collab-comment-input')
    await commentInput.scrollIntoViewIfNeeded().catch(() => {})
    await commentInput.fill('실서버 QA 협업 코멘트 — 납기 확인 부탁드립니다')
    await page.waitForTimeout(400)
    await capture(page, 'comment-input')

    await page.getByRole('button', { name: '등록' }).click()
    await page.waitForTimeout(1200)
    await capture(page, 'comment-posted')
  })
})
