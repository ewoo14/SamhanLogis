import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * PR #590 슬1 — 배차 발송 대기 검수 완료 게이트 실 서버 QA 캡처.
 *
 * [[feedback_no_fake_data_ever]] [[feedback_real_server_check_screenshot]] [[feedback_realqa_run_and_false_red]]
 * - VITE_MOCK_MODE OFF — 실 게이트웨이 http://127.0.0.1:8080 (page.route 프록시 + 실 JWT).
 * - 대상 화면: /dispatch-board (배차 메뉴) 좌측 "미배차 출고전표" 패널(UnDispatchedSlipList).
 * - 실 시드(DB INSERT): A=검수완료(COMPLETED+inspector) / B=미검수(PROCESSING, inspector NULL).
 *   기대: A 만 목록에 표시(검수자/검수일시/배송지/수령자 동반) + B 미표시(게이트).
 *
 * 실행: 별도 터미널 vite :5175(mock off);
 *   node_modules/.bin/playwright test --config playwright/dispatch-send-queue-inspect-gate-real-qa/playwright.config.ts
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, expect, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GW_URL = 'http://127.0.0.1:8080'

const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_ROLE = 'MASTER'
const MASTER_DISPLAY_NAME = '[DEV-SEED] 개발마스터'

const SLIP_A = '2026/06/24-901' // 검수완료 → 표시되어야 함
const SLIP_B = '2026/06/24-902' // 미검수 → 미표시(게이트)

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/dispatch-send-queue-inspect-gate-s1'))
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: false })
}

async function fetchRealToken(): Promise<string> {
  const http = await import('http')
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ loginId: 'dev_master', password: 'dev_p05_pass!' })
    const req = http.default.request(
      { hostname: '127.0.0.1', port: 8080, path: '/auth/login', method: 'POST',
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
      getToken: async () => ({ token: t, userId, role, displayName, fullName: displayName }),
      setToken: async () => undefined, clearToken: async () => undefined } })
  }, { t: token, userId: MASTER_USER_ID, role: MASTER_ROLE, displayName: MASTER_DISPLAY_NAME })
}

async function setupApiProxy(page: Page, token: string): Promise<void> {
  await page.route(/:8080\//, async (route) => {
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
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {})
  await page.waitForTimeout(2_000)
}

test.describe('PR #590 슬1 배차 발송 대기 — 검수 완료 게이트 실 QA', () => {
  let realToken = ''
  test.beforeAll(async () => { realToken = await fetchRealToken() })

  test('배차현황 미배차 목록 = 검수완료(A)만 표시 + 미검수(B) 미표시', async ({ page }) => {
    await installRealAuth(page, realToken)
    await setupApiProxy(page, realToken)

    await gotoAndSettle(page, `${BASE_URL}/#/dispatch-board?mockRole=MASTER`)

    // 좌측 미배차 패널 렌더 대기
    await page.getByTestId('dispatch-board-undispatched-list').waitFor({ timeout: 15_000 })
    await page.waitForTimeout(1_500)
    await capture(page, '02-dispatch-board-undispatched-list')

    // 좌측 패널만 크롭(검수자/검수일시/배송지/수령자 셀 확대)
    const panel = page.getByTestId('dispatch-board-undispatched-list')
    await panel.scrollIntoViewIfNeeded().catch(() => {})
    await panel.screenshot({ path: path.join(SCREENSHOT_DIR, '03-undispatched-panel-detail.png') }).catch(() => {})

    // 게이트 단언: A 행 존재, B 행 부재
    const rowA = page.getByTestId(`dispatch-board-slip-row-${SLIP_A}`)
    const rowB = page.getByTestId(`dispatch-board-slip-row-${SLIP_B}`)
    await expect(rowA, 'A(검수완료) 전표는 미배차 목록에 표시되어야 함').toBeVisible({ timeout: 10_000 })
    await expect(rowB, 'B(미검수) 전표는 게이트로 미표시되어야 함').toHaveCount(0)

    // 검수자/검수일시/배송지/수령자 라벨 + 값 존재 단언
    await expect(page.getByText('검수자', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('검수일시', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('배송지', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('수령자', { exact: false }).first()).toBeVisible()
  })
})
