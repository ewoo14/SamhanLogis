import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
/**
 * §7 슬라이스4 배차(DispatchTask) 협업 "수정완료 1-인" — 실 서버 QA 스크린샷 캡처.
 *
 * [[no-fake-data-ever]] [[real-server-check-screenshot]]
 * - VITE_MOCK_MODE OFF — 실 게이트웨이 http://127.0.0.1:8080 (page.route 프록시 + 실 JWT).
 * - 배차 상세는 /dispatch-board/history(기본 status=DISPATCHED) DataTable 행클릭 → 모달.
 * - 대상: 실 시드 DISPATCHED 배차 task(QA setup 으로 DRAFT→DISPATCHED 전이). 수정완료=비고(memo).
 *
 * 실행: 별도 터미널 vite :5175(mock off);
 *   node_modules/.bin/playwright test --config playwright/dispatch-collab-real-qa/playwright.config.ts
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GW_URL = 'http://127.0.0.1:8080'

const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_ROLE = 'MASTER'
const MASTER_DISPLAY_NAME = '[DEV-SEED] 개발마스터'
/** QA setup 으로 DISPATCHED 전이된 배차 task 코드. */
const TASK_CODE = process.env['DISPATCH_TASK_CODE'] ?? '2026/06/12-3'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/dispatch-collab'))
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

/** :8080 게이트웨이로 향하는 모든 호출(/admin/**, /api/v1/**, /slips/** 등)을 서버사이드 재요청(CORS 우회) + JWT 주입. */
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
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
  await page.waitForTimeout(1_500)
}

test.describe('§7 슬라이스4 배차 협업 실 QA — 수정완료 1-인 모델', () => {
  let realToken = ''
  test.beforeAll(async () => { realToken = await fetchRealToken() })

  test('이력 → 상세 모달 → 수정완료(비고) → diff', async ({ page }) => {
    await installRealAuth(page, realToken)
    await setupApiProxy(page, realToken)

    await gotoAndSettle(page, `${BASE_URL}/#/dispatch-board/history?mockRole=MASTER`)
    await capture(page, 'history-list')

    // DISPATCHED task 행 클릭 → 상세 모달
    await page.getByText(TASK_CODE, { exact: false }).first().click({ timeout: 10_000 }).catch(async () => {
      await page.getByRole('row').nth(1).click().catch(() => {})
    })
    await page.waitForTimeout(1_200)
    await page.getByTestId('dispatch-collab-edit-section').scrollIntoViewIfNeeded().catch(() => {})
    await capture(page, 'detail-modal')

    // 수정 진입
    await page.getByTestId('dispatch-collab-edit-start').click({ timeout: 8_000 })
    await page.waitForTimeout(600)
    await page.getByTestId('dispatch-collab-edit-form').scrollIntoViewIfNeeded().catch(() => {})
    await capture(page, 'edit-mode')

    await page.getByTestId('dispatch-collab-edit-memo').fill('실서버 QA — 배차 비고 정정(수정완료 1-인 즉시 커밋)')
    await page.getByLabel('수정 사유').fill('실서버 QA 검증 — 배차 collab 수정완료')
    await page.waitForTimeout(400)
    await capture(page, 'edit-filled')

    await page.getByTestId('dispatch-collab-edit-submit').click()
    await page.waitForTimeout(1_500)
    await capture(page, 'edit-commit')

    await page.getByTestId('dispatch-collab-edit-item').first().scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(400)
    await capture(page, 'diff-history')
  })
})
