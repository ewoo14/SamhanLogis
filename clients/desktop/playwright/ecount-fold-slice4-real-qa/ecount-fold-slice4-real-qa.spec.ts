import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 이카운트 네이티브 편입 슬4 — "회계 관리자" silo 그룹 해체 → 네이티브 메뉴 편입 Docker 실서버 QA.
 *
 * 대상(개발책임자 확정): 회계 관리자 중첩 토글 그룹 완전 삭제.
 *   - 매출/매입 원장 대조 + 운영 대시보드 + 회계 수정 요청 → 회계 카테고리 flat 항목
 *   - 주문서 관리(eCount 주문 silo) → 판매 카테고리 flat 항목(판매 도메인, 슬6에서 네이티브 이식)
 *   - route/page-code/롤 무변경(cutover 전 폐기 금지)
 *
 * 실서버: api-gateway :8080, FE renderer dev :5175(mock OFF). dev_master.
 * 산출: docs/qa/ecount-fold-slice4/*.png
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
const SCREENSHOTS_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/ecount-fold-slice4'))
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

interface LoginResult { token: string; role: string; userId: string; displayName: string }
async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId, password: PASSWORD } })
  expect(res.ok(), `로그인 실패(${loginId}): HTTP ${res.status()}`).toBeTruthy()
  const body = await res.json()
  return { token: body.data?.token ?? '', role: body.data?.role ?? '', userId: body.data?.userId ?? '', displayName: body.data?.displayName ?? loginId }
}
async function installAuthStub(page: Page, login: LoginResult): Promise<void> {
  await page.addInitScript(({ tok, r, uid, name }: { tok: string; r: string; uid: string; name: string }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => ({ token: tok, userId: uid, role: r, fullName: name, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined },
    })
  }, { tok: login.token, r: login.role, uid: login.userId, name: login.displayName })
}
async function openCategory(page: Page, label: string): Promise<void> {
  const t = page.getByTestId(`sidebar-category-toggle-${label}`)
  await expect(t, `${label} 토글`).toBeVisible({ timeout: 15_000 })
  if ((await t.getAttribute('aria-expanded')) !== 'true') await t.click()
}

test('MASTER — 회계 관리자 그룹 해체: 원장대조·운영·수정요청 회계 flat 편입 + 그룹 토글 소멸', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  await page.goto(`${BASE_URL}/#/`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
  await openCategory(page, '회계')

  // 핵심: '회계 관리자' 중첩 그룹 토글 소멸
  await expect(page.getByTestId('sidebar-accounting-admin-group-toggle'), '회계 관리자 그룹 토글(삭제됨)').toHaveCount(0)
  // 원장대조/운영/수정요청은 회계 flat 으로 가시
  await expect(page.getByTestId('sidebar-accounting-admin-sales-ledger'), '매출 원장 대조(회계 flat)').toBeVisible()
  await expect(page.getByTestId('sidebar-accounting-admin-purchase-ledger'), '매입 원장 대조(회계 flat)').toBeVisible()
  await expect(page.getByTestId('sidebar-accounting-admin-migration-ops'), '운영 대시보드(회계 flat)').toBeVisible()
  await expect(page.getByTestId('sidebar-accounting-admin-edit-requests'), '회계 수정 요청(회계 flat)').toBeVisible()
  await page.getByTestId('sidebar-accounting-admin-edit-requests').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'T1-master-accounting-flat-no-admin-group.png'), fullPage: false })
})

test('MASTER — 주문서 관리(eCount 주문 silo)는 판매 카테고리 flat (회계 아님)', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  await page.goto(`${BASE_URL}/#/`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
  await openCategory(page, '판매')
  await expect(page.getByTestId('sidebar-accounting-admin-orders'), '주문서 관리(판매 flat)').toBeVisible()
  await expect(page.getByTestId('sidebar-accounting-admin-orders'), '이관 주문서 라벨 구분').toContainText('주문서 관리 (이관)')
  await page.getByTestId('sidebar-accounting-admin-orders').scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'T2-master-orders-under-sales.png'), fullPage: false })
})
