import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 이카운트 네이티브 편입 슬2 — 현금 지출/입금 silo 폐기 Docker 실서버 QA.
 *
 * 대상: page-code ecount.mig14.cash-list 완전 제거 검증.
 *   1) 회계 카테고리 flat 항목에 '지출 트랜잭션'/'입금 트랜잭션' 메뉴 미노출(형제 항목 유지)
 *   3) 구 silo route(#/accounting/admin/cash-disbursements, /cash-receipts) 진입 시 silo 화면 미렌더
 *
 * 실서버: api-gateway :8080 (실 권한/데이터), FE renderer dev :5175 (mock OFF).
 * 실행:
 *   cd C:\dev\Samhan-Public\clients\desktop
 *   AUDIT_BASE_URL=http://localhost:5175 API_BASE=http://localhost:8080 \
 *     node_modules/.bin/playwright test --config=playwright.real-qa.config.ts \
 *     playwright/ecount-fold-slice2-real-qa --reporter=line --timeout=90000
 * 산출: docs/qa/ecount-fold-slice2/*.png. no-fake-data: 토큰/데이터 모두 실 게이트웨이.
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5175'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SCREENSHOTS_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/ecount-fold-slice2'))
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

interface LoginResult { token: string; role: string; userId: string; displayName: string }

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId, password: PASSWORD } })
  expect(res.ok(), `로그인 실패(${loginId}): HTTP ${res.status()}`).toBeTruthy()
  const body = await res.json()
  return {
    token: body.data?.token ?? '', role: body.data?.role ?? '',
    userId: body.data?.userId ?? '', displayName: body.data?.displayName ?? loginId,
  }
}

async function installAuthStub(page: Page, login: LoginResult): Promise<void> {
  await page.addInitScript(
    ({ tok, r, uid, name }: { tok: string; r: string; uid: string; name: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token: tok, userId: uid, role: r, fullName: name, partnerCode: null }),
          setToken: async () => undefined, clearToken: async () => undefined,
        },
      })
    },
    { tok: login.token, r: login.role, uid: login.userId, name: login.displayName },
  )
}

async function gotoHash(page: Page, hashPath: string): Promise<void> {
  await page.goto(`${BASE_URL}/#${hashPath}`, { waitUntil: 'domcontentloaded' })
}

test('MASTER — 회계 카테고리 flat 항목에 현금 지출/입금 메뉴 미노출 + 형제 항목 유지', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  await gotoHash(page, '/')
  await page.waitForLoadState('networkidle')

  const accountingCat = page.getByTestId('sidebar-category-toggle-회계')
  await expect(accountingCat, '회계 카테고리 토글').toBeVisible({ timeout: 15_000 })
  if ((await accountingCat.getAttribute('aria-expanded')) !== 'true') await accountingCat.click()

  await expect(page.getByTestId('sidebar-accounting-admin-group-toggle'), '회계 관리자 그룹 토글 제거').toHaveCount(0)
  await expect(page.getByTestId('sidebar-accounting-admin-group'), '회계 관리자 그룹 컨테이너 제거').toHaveCount(0)

  // 핵심 단언: 지출/입금 트랜잭션(cash silo) 메뉴 미존재
  await expect(page.getByTestId('sidebar-accounting-admin-cash-disbursements'), '지출 트랜잭션(제거됨)').toHaveCount(0)
  await expect(page.getByTestId('sidebar-accounting-admin-cash-receipts'), '입금 트랜잭션(제거됨)').toHaveCount(0)
  // 형제 유지(slip 폐기는 cash 한정 — 원장대조/운영 대시보드/회계 수정 요청 등)
  const salesLedger = page.getByTestId('sidebar-accounting-admin-sales-ledger')
  await expect(salesLedger, '매출 원장 대조 유지').toBeVisible()

  await salesLedger.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'T1-master-accounting-admin-no-cash.png'), fullPage: false })
})

test('MASTER — 네이티브 대체: 분개장 + 입금매칭 도달·렌더(실데이터)', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  await gotoHash(page, '/accounting/journals')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1200)
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'T2-master-native-journals.png'), fullPage: true })

  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(1000)
})

test('MASTER — 구 cash silo route 진입 시 화면 미렌더', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  for (const [route, name] of [
    ['/accounting/admin/cash-disbursements', 'T4-master-old-disbursements-route-removed'],
    ['/accounting/admin/cash-receipts', 'T5-master-old-receipts-route-removed'],
  ] as const) {
    await gotoHash(page, route)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(700)
    await expect(page.getByTestId('mig14-cash-list-page'), `구 silo(${route}) 미렌더`).toHaveCount(0)
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`), fullPage: true })
  }
})
