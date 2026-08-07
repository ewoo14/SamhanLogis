import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * §7 슬라이스3 견적 collab — Codex 5-agent 라운드 실 서버 QA (회귀 무 재확인).
 *
 * Opus 라운드 이후 Codex 변경(부모 @Version 강제증가 lock / overlay 길이 400 / FE revision·audit-log
 * invalidate / a11y) 적용 후 수정완료→diff→코멘트 happy-path 가 라이브에서 그대로 동작하는지 캡처.
 * (overlay 길이 400 은 FE Input maxLength=1000 으로 UI 차단 → IT 가 API-direct 로 커버, UI 캡처 불가.)
 *
 * [[no-fake-data-ever]] [[real-server-check-screenshot]] — 실 게이트웨이/실 JWT/실 DB, 합성 0.
 * 실행: 별도 터미널 vite :5175(mock off);
 *   ESTIMATE_ID=<accepted-uuid> node_modules/.bin/playwright test \
 *     --config playwright/estimate-collab-real-qa/playwright.config.ts \
 *     playwright/estimate-collab-real-qa/estimate-collab-codex-round.spec.ts
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
const ESTIMATE_ID = process.env['ESTIMATE_ID'] ?? '461531e0-6a89-4f92-ab2f-2c18e8d8a9f5'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/estimate-collab-codex'))
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

let n = 0
async function capture(page: Page, name: string): Promise<void> {
  n++
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${String(n).padStart(2, '0')}-${name}.png`), fullPage: false })
}

async function fetchRealToken(): Promise<string> {
  const http = await import('http')
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ loginId: 'dev_master', password: 'dev_p05_pass!' })
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

test.describe('§7 슬라이스3 견적 협업 Codex 라운드 실 QA — 회귀 무', () => {
  let realToken = ''
  test.beforeAll(async () => { realToken = await fetchRealToken() })

  test('수정완료 → 누적 diff → 코멘트 (Codex 변경 후)', async ({ page }) => {
    await installRealAuth(page, realToken)
    await setupApiProxy(page, realToken)

    await gotoAndSettle(page, `${BASE_URL}/#/sales/estimates/${ESTIMATE_ID}?mockRole=MASTER`)
    await page.getByTestId('estimate-collaboration-panel').scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(800)
    await capture(page, 'detail-after-codex')

    await page.getByTestId('estimate-detail-collab-edit-button').click()
    await page.waitForTimeout(800)
    await page.getByLabel('비고 수정값').fill('Codex 라운드 QA — 부모 버전 강제증가 lock 적용 후 수정완료')
    await page.getByLabel('수정 사유').fill('Codex 라운드 회귀 무 확인')
    await page.waitForTimeout(300)
    await capture(page, 'edit-filled')

    await page.getByRole('button', { name: '수정완료' }).click()
    await page.waitForTimeout(1500)
    await capture(page, 'edit-commit')

    // #31 이력 일원화 이후 changeSet diff 목록은 제거되고 EstimateVersionHistoryPanel
    // (버전이력 row-level highlight) 로 일원화된다.
    await page.getByTestId('estimate-version-history-panel').scrollIntoViewIfNeeded().catch(() => {})
    await page.getByTestId('estimate-version-history-open').click()
    await page.waitForTimeout(400)
    await capture(page, 'diff-accumulated')

    const commentInput = page.getByTestId('estimate-collab-comment-input')
    await commentInput.scrollIntoViewIfNeeded().catch(() => {})
    await commentInput.fill('Codex 라운드 QA 코멘트 — 버전이력/감사 overlay 갱신 확인')
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: '등록' }).click()
    await page.waitForTimeout(1200)
    await capture(page, 'comment-posted')
  })
})
