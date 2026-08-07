import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #757 STEP4 FE LOW 실증 — 복원(RESTORE) 권한 없는 사용자에게 "복원" 컬럼 자체 생략.
 *
 * 대상 fix: SalesPartnerOrderListPage.tsx `...(canRestoreDeletedOrder ? [restore column] : [])`.
 * ACCOUNTANT 역할(auth V10 role_page_permissions 이관분 = sales.partner-order.list can_view=TRUE,
 * V83 이 MASTER/MANAGER/SALES 에게만 can_restore=TRUE 부여 — ACCOUNTANT 는 제외) 로 실 로그인해
 * 목록 화면에서 "복원" 헤더/버튼이 DOM 에 전혀 없는지 확인한다.
 *
 * 대조를 위해 동일 삭제행을 MASTER(복원 권한 보유) 로도 렌더링해 "복원" 컬럼이 실제로 존재함을
 * 함께 증빙한다(있어야 할 곳엔 있고, 없어야 할 곳엔 없음 — 양성/음성 대조).
 *
 * 삭제 대상: 2026/06/08-1982 (DRAFT, 사용 후 동일 테스트 내에서 원복 — DB 잔류 변경 없음).
 */
import { expect, test, type Page, type Browser } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5199'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const ORDER_NO = process.env['PERM_ORDER_NO'] ?? '2026/06/08-1982'
const ORDER_PATH = ORDER_NO.replace(/\//g, '-')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/e2-rollout-order-list'))
fs.mkdirSync(SHOTS, { recursive: true })

interface LoginResult { token: string; role: string; userId: string; displayName: string }

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId, password: PASSWORD } })
  expect(res.ok(), `로그인 실패(${loginId}): HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return { token: d.token ?? '', role: d.role ?? '', userId: d.userId ?? '', displayName: d.displayName ?? loginId }
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

async function newIdentityPage(browser: Browser, loginId: string): Promise<{ page: Page; login: LoginResult }> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const login = await realLogin(page, loginId)
  await installAuthStub(page, login)
  return { page, login }
}

test('RESTORE 권한 없는 ACCOUNTANT = 복원 컬럼 생략 (MASTER 대조)', async ({ browser }) => {
  // ---- 0) MASTER 로 삭제 실행 (실 UI 클릭 — API 직접호출 아님) ----
  const { page: masterPage } = await newIdentityPage(browser, 'dev_master')
  await masterPage.goto(`${BASE_URL}/#/sales/partner-orders/${ORDER_PATH}`)
  await expect(masterPage.getByTestId('partner-order-delete-open'), 'MASTER 상세 진입').toBeVisible({ timeout: 30_000 })
  await masterPage.getByTestId('partner-order-delete-open').click()
  await expect(masterPage.getByTestId('partner-order-delete-confirm-dialog')).toBeVisible({ timeout: 10_000 })
  await masterPage.getByTestId('partner-order-delete-confirm').click()
  await masterPage.waitForURL('**/sales/partner-orders', { timeout: 20_000 }).catch(() => undefined)
  await masterPage.waitForTimeout(1200)

  // ---- 1) MASTER 관점 — "복원" 컬럼 존재 + 버튼 렌더 (양성 대조) ----
  await masterPage.getByTestId('partner-order-list-status-filter').selectOption('DRAFT')
  await masterPage.getByTestId('partner-order-list-keyword-filter').fill(ORDER_NO)
  const masterDeletedRow = masterPage.getByTestId(`partner-order-row-${ORDER_NO}:deleted`)
  await expect(masterDeletedRow, 'MASTER: 삭제행 렌더').toBeVisible({ timeout: 20_000 })
  const masterHeaders = await masterPage.locator('table thead th').allTextContents()
  expect(masterHeaders.some((h) => h.trim() === '복원'), 'MASTER: "복원" 컬럼 헤더 존재').toBe(true)
  const masterRestoreBtn = masterPage.getByTestId(`partner-order-restore-${ORDER_NO}:deleted`)
  await expect(masterRestoreBtn, 'MASTER: 복원 버튼 렌더').toBeVisible()
  await masterPage.screenshot({ path: path.join(SHOTS, 'step4-restore-column-master-positive-control.png') })

  // ---- 2) ACCOUNTANT 관점 — "복원" 컬럼/버튼 완전 부재 (권한 omit 실증) ----
  const { page: acctPage } = await newIdentityPage(browser, 'dev_accountant')
  await acctPage.goto(`${BASE_URL}/#/sales/partner-orders`)
  await acctPage.getByTestId('partner-order-list-status-filter').selectOption('DRAFT')
  await acctPage.getByTestId('partner-order-list-keyword-filter').fill(ORDER_NO)
  const acctDeletedRow = acctPage.getByTestId(`partner-order-row-${ORDER_NO}:deleted`)
  await expect(acctDeletedRow, 'ACCOUNTANT: 삭제행은 여전히 렌더(view 권한만으로 조회 가능)').toBeVisible({ timeout: 20_000 })
  const acctHeaders = await acctPage.locator('table thead th').allTextContents()
  expect(acctHeaders.some((h) => h.trim() === '복원'), 'ACCOUNTANT: "복원" 컬럼 헤더 부재').toBe(false)
  const acctRestoreBtnCount = await acctPage.getByTestId(`partner-order-restore-${ORDER_NO}:deleted`).count()
  expect(acctRestoreBtnCount, 'ACCOUNTANT: 복원 버튼 DOM 자체 부재').toBe(0)
  await acctPage.screenshot({ path: path.join(SHOTS, 'step4-restore-column-omitted-accountant.png') })
  const zoom = await acctDeletedRow.screenshot()
  fs.writeFileSync(path.join(SHOTS, 'step4-restore-column-omitted-accountant-row-zoom.png'), zoom)

  // ---- 3) 원복 — MASTER 로 실 복원(DB 잔류 변경 없음) ----
  await masterPage.bringToFront()
  await masterPage.reload()
  await masterPage.getByTestId('partner-order-list-status-filter').selectOption('DRAFT')
  await masterPage.getByTestId('partner-order-list-keyword-filter').fill(ORDER_NO)
  await expect(masterPage.getByTestId(`partner-order-restore-${ORDER_NO}:deleted`)).toBeVisible({ timeout: 20_000 })
  await masterPage.getByTestId(`partner-order-restore-${ORDER_NO}:deleted`).click()
  await expect(masterPage.getByTestId(`partner-order-row-${ORDER_NO}`), '원복: 복원 후 활성행').toBeVisible({ timeout: 20_000 })

  const cleanupCheck = await masterPage.request.get(`${API_BASE}/api/v1/partner-orders/${ORDER_PATH}`, {
    headers: { Authorization: `Bearer ${(await realLogin(masterPage, 'dev_master')).token}` },
  })
  expect(cleanupCheck.status(), '원복 확인: 상세 200(활성)').toBe(200)
})
