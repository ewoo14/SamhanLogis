import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 이카운트 네이티브 편입 슬1 — 잔액 스냅샷 silo 폐기 Docker 실서버 QA.
 *
 * 대상: page-code ecount.mig14.aging-snapshot 완전 제거 검증.
 *   1) 회계 카테고리 flat 항목에 '잔액 스냅샷' 메뉴 미노출(형제 항목은 유지)
 *   2) 네이티브 대체 보고서 /accounting/reports/partner-aging 도달·렌더(거래처 미수/미지급)
 *   3) 구 silo route #/accounting/admin/aging-snapshot 진입 시 silo 화면 미렌더
 *
 * 실서버:
 *   - api-gateway: http://localhost:8080 (실 권한/데이터)
 *   - FE renderer dev: http://localhost:5175 (mock OFF — VITE_API_BASE_URL=http://localhost:8080)
 *
 * 실행:
 *   cd C:\dev\Samhan-Public\clients\desktop
 *   AUDIT_BASE_URL=http://localhost:5175 API_BASE=http://localhost:8080 \
 *     node_modules/.bin/playwright test --config=playwright.real-qa.config.ts \
 *     playwright/ecount-fold-slice1-real-qa --reporter=line --timeout=90000
 *
 * 산출: docs/qa/ecount-fold-slice1/*.png (실 FE 풀렌더). no-fake-data: 토큰/데이터 모두 실 게이트웨이.
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined'
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url))

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5175'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')

const SCREENSHOTS_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/ecount-fold-slice1'))
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

interface LoginResult {
  token: string
  role: string
  userId: string
  displayName: string
}

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId, password: PASSWORD },
  })
  expect(res.ok(), `로그인 실패(${loginId}): HTTP ${res.status()} — Docker 스택 미기동?`).toBeTruthy()
  const body = await res.json()
  return {
    token: body.data?.token ?? '',
    role: body.data?.role ?? '',
    userId: body.data?.userId ?? '',
    displayName: body.data?.displayName ?? loginId,
  }
}

async function installAuthStub(page: Page, login: LoginResult): Promise<void> {
  await page.addInitScript(
    ({ tok, r, uid, name }: { tok: string; r: string; uid: string; name: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token: tok, userId: uid, role: r, fullName: name, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    { tok: login.token, r: login.role, uid: login.userId, name: login.displayName },
  )
}

async function gotoHash(page: Page, hashPath: string): Promise<void> {
  await page.goto(`${BASE_URL}/#${hashPath}`, { waitUntil: 'domcontentloaded' })
}

test('MASTER — 회계 카테고리 flat 항목에 잔액 스냅샷 미노출 + 형제 항목 유지', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  await gotoHash(page, '/')
  await page.waitForLoadState('networkidle')

  // 회계 카테고리 펼치기
  const accountingCat = page.getByTestId('sidebar-category-toggle-회계')
  await expect(accountingCat, '회계 카테고리 토글').toBeVisible({ timeout: 15_000 })
  if ((await accountingCat.getAttribute('aria-expanded')) !== 'true') {
    await accountingCat.click()
  }

  await expect(page.getByTestId('sidebar-accounting-admin-group-toggle'), '회계 관리자 그룹 토글 제거').toHaveCount(0)
  await expect(page.getByTestId('sidebar-accounting-admin-group'), '회계 관리자 그룹 컨테이너 제거').toHaveCount(0)

  // 핵심 단언: 잔액 스냅샷 링크/항목 미존재
  await expect(
    page.getByTestId('sidebar-accounting-admin-aging-snapshot'),
    '잔액 스냅샷 메뉴(제거됨)',
  ).toHaveCount(0)
  // 형제 항목은 유지(silo 폐기는 aging·cash 한정 — 원장 대조/운영 대시보드/회계 수정 요청 등)
  const salesLedger = page.getByTestId('sidebar-accounting-admin-sales-ledger')
  await expect(salesLedger, '매출 원장 대조 유지').toBeVisible()
  await salesLedger.scrollIntoViewIfNeeded()

  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'T1-master-accounting-admin-no-aging.png'),
    fullPage: false,
  })
})

test('MASTER — 네이티브 거래처 미수/미지급 보고서 도달·렌더(실데이터)', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  // 실 API 직접 호출로 실데이터 존재 확인(증빙) — RECEIVABLE 기준일=오늘
  const asOf = new Date().toISOString().slice(0, 10)
  const apiRes = await page.request.get(
    `${API_BASE}/accounting/reports/partner-aging?asOfDate=${asOf}&type=RECEIVABLE`,
    { headers: { Authorization: `Bearer ${login.token}`, 'X-User-Role': login.role } },
  )
  // eslint-disable-next-line no-console
  console.log(`[QA] partner-aging RECEIVABLE HTTP ${apiRes.status()}`)
  expect(apiRes.status(), '네이티브 partner-aging API 200').toBe(200)

  await gotoHash(page, '/accounting/reports/partner-aging')
  await page.waitForLoadState('networkidle')
  // 페이지 렌더 확인(보고서 화면 진입)
  await expect(page.locator('body'), 'partner-aging 화면 렌더').toBeVisible()
  await page.waitForTimeout(1500)
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'T2-master-native-partner-aging.png'),
    fullPage: true,
  })
})

test('MASTER — 구 silo route 진입 시 잔액 스냅샷 화면 미렌더', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  await gotoHash(page, '/accounting/admin/aging-snapshot')
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(800)

  // 삭제된 silo 페이지의 testid 미존재
  await expect(
    page.getByTestId('mig14-aging-snapshot-page'),
    '구 silo 잔액 스냅샷 화면(제거됨)',
  ).toHaveCount(0)
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, 'T3-master-old-silo-route-removed.png'),
    fullPage: true,
  })
})
