import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #757 STEP4 회귀 보충 캡처 — 목록(키워드 미필터)에 활성행과 삭제행이 동시 공존하는 넓은 뷰.
 *
 * 기존 STEP4 재검증 스펙들은 searchKeyword 로 단일 행만 노출해 "공존" 시각 증빙이 약했다.
 * 이 스펙은 DRAFT 필터만 걸고 키워드는 비워 여러 활성행 사이에 삭제행 1건이 취소선/중립배지/
 * 복원버튼으로 섞여 렌더되는 것을 한 화면에서 캡처한다.
 *
 * 삭제 대상: 2026/06/08-1980 (DRAFT, 테스트 내 원복).
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5199'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const ORDER_NO = process.env['COEXIST_ORDER_NO'] ?? '2026/06/08-1980'
const ORDER_PATH = ORDER_NO.replace(/\//g, '-')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/e2-rollout-order-list'))
fs.mkdirSync(SHOTS, { recursive: true })

async function realLogin(page: Page): Promise<{ token: string; role: string; userId: string; displayName: string }> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId: 'dev_master', password: PASSWORD } })
  expect(res.ok(), `로그인 실패: HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return { token: d.token ?? '', role: d.role ?? '', userId: d.userId ?? '', displayName: d.displayName ?? 'dev_master' }
}

test('DRAFT 목록(키워드 미필터) — 활성행 다수 + 삭제행 1건 공존 뷰', async ({ page }) => {
  const login = await realLogin(page)
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

  // ---- 0) 실 UI 삭제 (검색 없이 넓은 목록에서 바로) ----
  await page.goto(`${BASE_URL}/#/sales/partner-orders/${ORDER_PATH}`)
  await expect(page.getByTestId('partner-order-delete-open')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('partner-order-delete-open').click()
  await expect(page.getByTestId('partner-order-delete-confirm-dialog')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('partner-order-delete-confirm').click()
  await page.waitForURL('**/sales/partner-orders', { timeout: 20_000 }).catch(() => undefined)
  await page.waitForTimeout(1200)

  // ---- 1) 키워드 없이 DRAFT 전체 목록 — 활성행 다수 + 삭제행 1건(취소선/중립배지/복원버튼) 공존 ----
  await page.getByTestId('partner-order-list-status-filter').selectOption('DRAFT')
  await page.waitForTimeout(1000)
  const deletedRow = page.getByTestId(`partner-order-row-${ORDER_NO}:deleted`)
  await expect(deletedRow, '삭제행 렌더(공존 뷰)').toBeVisible({ timeout: 20_000 })
  const activeRows = page.locator('table tbody tr:not([data-testid$=":deleted"])')
  const activeCount = await activeRows.count()
  expect(activeCount, '활성행 다수 공존').toBeGreaterThan(3)
  await page.screenshot({ path: path.join(SHOTS, 'step4-coexist-active-and-deleted-rows.png') })

  // ---- 2) 원복 ----
  const restoreBtn = page.getByTestId(`partner-order-restore-${ORDER_NO}:deleted`)
  await expect(restoreBtn).toBeVisible()
  await restoreBtn.click()
  await expect(page.getByTestId(`partner-order-row-${ORDER_NO}`), '원복: 복원 후 활성행').toBeVisible({ timeout: 20_000 })

  const H = { Authorization: `Bearer ${login.token}` }
  const cleanupCheck = await page.request.get(`${API_BASE}/api/v1/partner-orders/${ORDER_PATH}`, { headers: H })
  expect(cleanupCheck.status(), '원복 확인: 상세 200(활성)').toBe(200)
  expect((await cleanupCheck.json()).data.isDeleted, '원복 확인: 활성 상태').toBeFalsy()
})
