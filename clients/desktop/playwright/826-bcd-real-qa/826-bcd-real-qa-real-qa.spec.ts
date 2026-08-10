import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5175'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SCREENSHOTS_DIR = resolveQaShotsDir(
  path.resolve(_dirname, '../../../../docs/qa/2026-08-10-826-real-qa'),
)

interface LoginResult {
  token: string
  role: string
  userId: string
  displayName: string
}

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId, password: PASSWORD },
  })
  expect(response.ok(), `실제 로그인 실패(${loginId}): HTTP ${response.status()}`).toBeTruthy()
  const body = await response.json()
  return {
    token: body.data?.token ?? '',
    role: body.data?.role ?? '',
    userId: body.data?.userId ?? '',
    displayName: body.data?.displayName ?? loginId,
  }
}

async function installAuthBridge(page: Page, login: LoginResult): Promise<void> {
  await page.addInitScript(
    ({ token, role, userId, displayName }: LoginResult) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token, userId, role, fullName: displayName, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    login,
  )
}

test('B-C-D 실 QA: 기본 주문 목록, 첫 행 상세, 제거 경로 NotFound', async ({ page }) => {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  const relevantResponses: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('response', (response) => {
    const url = response.url()
    if (url.startsWith(API_BASE) && (url.includes('/auth/') || url.includes('/partner-orders'))) {
      relevantResponses.push(`${response.status()} ${response.request().method()} ${url}`)
    }
  })

  const login = await realLogin(page, 'dev_master')
  await installAuthBridge(page, login)

  // B: 상태 필터를 조작하지 않고 기본 진입 상태 그대로 확인한다.
  await page.goto(`${BASE_URL}/#/sales/partner-orders`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
  await expect(page.getByText('주문서 관리', { exact: true }).first()).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1_000)

  const rows = page.locator('[data-testid^="partner-order-row-"]:visible')
  await expect(rows.first(), '기본 주문 목록의 첫 행').toBeVisible({ timeout: 30_000 })
  const visibleRowCount = await rows.count()
  const listText = await page.locator('body').innerText()
  const totalMatch = listText.match(/전체\s*([\d,]+)\s*건/)
  console.log(`B_VISIBLE_ROW_COUNT=${visibleRowCount}`)
  console.log(`B_SCREEN_TOTAL=${totalMatch?.[1] ?? '확인 불가'}`)
  console.log(`REAL_API_RESPONSES_AFTER_B=${relevantResponses.join(' | ')}`)
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '2026-08-10-826-real-qa-B-list.png'),
    fullPage: true,
  })

  // C: 첫 행 자체를 클릭하고, 상세 라우트와 실제 데이터 표시를 확인한다.
  const firstRow = rows.first()
  const firstRowText = (await firstRow.innerText()).trim()
  await firstRow.click()
  await expect(page).toHaveURL(/#\/sales\/partner-orders\/[^/?#]+/, { timeout: 30_000 })
  await expect(page.getByText('주문서 상세', { exact: true })).toBeVisible({ timeout: 30_000 })
  const detailText = await page.locator('body').innerText()
  expect(detailText.length, '상세 화면 내용').toBeGreaterThan(250)
  expect(detailText, '상세 화면에 첫 행의 주문 식별 정보').toContain(firstRowText.split(/\s+/)[0] ?? '')
  console.log(`C_DETAIL_URL=${page.url()}`)
  console.log(`C_DETAIL_TEXT_PREVIEW=${detailText.replace(/\s+/g, ' ').slice(0, 240)}`)
  console.log(`REAL_API_RESPONSES_AFTER_C=${relevantResponses.join(' | ')}`)
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '2026-08-10-826-real-qa-C-detail.png'),
    fullPage: true,
  })

  // D 이동 전: C에서 확인한 상세 화면을 보존한다.
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '2026-08-10-826-real-qa-D-before-direct-route.png'),
    fullPage: true,
  })

  await page.goto(`${BASE_URL}/#/accounting/admin/orders`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
  await expect(page.getByTestId('not-found-page'), '제거된 경로의 정상 NotFound 화면').toBeVisible({ timeout: 30_000 })
  const notFoundText = await page.locator('body').innerText()
  expect(notFoundText).toContain('404')
  console.log(`D_AFTER_URL=${page.url()}`)
  console.log(`D_NOT_FOUND_TEXT_PREVIEW=${notFoundText.replace(/\s+/g, ' ').slice(0, 240)}`)
  console.log(`CONSOLE_ERRORS=${consoleErrors.length}`)
  console.log(`PAGE_ERRORS=${pageErrors.length}`)
  if (consoleErrors.length > 0) console.log(`CONSOLE_ERROR_TEXT=${consoleErrors.join(' | ')}`)
  if (pageErrors.length > 0) console.log(`PAGE_ERROR_TEXT=${pageErrors.join(' | ')}`)
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, '2026-08-10-826-real-qa-D-after-notfound.png'),
    fullPage: true,
  })
})
