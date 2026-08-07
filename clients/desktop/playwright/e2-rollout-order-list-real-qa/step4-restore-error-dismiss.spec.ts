import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #757 STEP4 FE LOW 실증 — restoreError 배너 필터변경 소거 + × dismiss 버튼.
 *
 * 실 backend 409 (PartnerOrder#requireRestorable, CONFIRMING/CANCELED 삭제행 복원 차단)를
 * 조직적으로 재현하려면(그 상태 조합은 정상 앱 플로우로 도달 불가 — delete 자체가 DRAFT/
 * CONFIRMING 만 허용하고 CONFIRMING 삭제 후 복원시도가 유일한 경로라 시드 재현이 어려움)
 * 네트워크 계층에서 이 PR 의 GlobalExceptionHandler#handleResponseStatus 실제 계약과 바이트
 * 단위로 동일한 ApiResponse.fail(CONFLICT, ...) envelope 을 1회 fulfill 해 FE 에러 배너 렌더
 * 경로를 결정적으로 노출시킨다(FE 코드 자체는 100% 실행 — 왜곡 없음). 이후 인터셉트 해제하고
 * 실 복원 클릭으로 마무리해 DB 는 원상복귀.
 *
 * 삭제 대상: 2026/06/08-1981 (DRAFT, 테스트 내 원복).
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5199'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const ORDER_NO = process.env['DISMISS_ORDER_NO'] ?? '2026/06/08-1981'
const ORDER_PATH = ORDER_NO.replace(/\//g, '-')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/e2-rollout-order-list'))
fs.mkdirSync(SHOTS, { recursive: true })

// GlobalExceptionHandler#handleResponseStatus 실 계약과 동일 envelope shape(ApiResponse.fail).
// 메시지 문구도 PartnerOrder#requireRestorable() 실제 한국어 문구 그대로 사용(조작된 카피 아님).
const SIMULATED_409_BODY = {
  success: false,
  code: 'CONFLICT',
  message: '진행 중(전환)이거나 취소된 주문은 복원할 수 없습니다. 현재 상태: 확인중',
  data: null,
  timestamp: new Date().toISOString(),
}

interface LoginResult { token: string; role: string; userId: string; displayName: string }

async function realLogin(page: Page): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId: 'dev_master', password: PASSWORD } })
  expect(res.ok(), `로그인 실패: HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return { token: d.token ?? '', role: d.role ?? '', userId: d.userId ?? '', displayName: d.displayName ?? 'dev_master' }
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

test('restoreError 배너 — × dismiss 버튼 동작 + 필터변경 자동 소거', async ({ page }) => {
  const login = await realLogin(page)
  await installAuthStub(page, login)

  // ---- 0) 실 UI 삭제 ----
  await page.goto(`${BASE_URL}/#/sales/partner-orders/${ORDER_PATH}`)
  await expect(page.getByTestId('partner-order-delete-open')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('partner-order-delete-open').click()
  await expect(page.getByTestId('partner-order-delete-confirm-dialog')).toBeVisible({ timeout: 10_000 })
  await page.getByTestId('partner-order-delete-confirm').click()
  await page.waitForURL('**/sales/partner-orders', { timeout: 20_000 }).catch(() => undefined)
  await page.waitForTimeout(1200)

  await page.getByTestId('partner-order-list-status-filter').selectOption('DRAFT')
  await page.getByTestId('partner-order-list-keyword-filter').fill(ORDER_NO)
  const deletedRow = page.getByTestId(`partner-order-row-${ORDER_NO}:deleted`)
  await expect(deletedRow, '삭제행 렌더').toBeVisible({ timeout: 20_000 })
  const restoreBtn = page.getByTestId(`partner-order-restore-${ORDER_NO}:deleted`)
  await expect(restoreBtn).toBeVisible()

  // ---- 1) 이 특정 복원 호출 1회만 네트워크 계층에서 409 로 fulfill ----
  let intercepted = false
  await page.route(`**/api/v1/partner-orders/${ORDER_PATH}/restore`, async (route) => {
    intercepted = true
    await route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify(SIMULATED_409_BODY) })
  })

  await restoreBtn.click()
  const banner = page.getByTestId('partner-order-restore-error')
  await expect(banner, '복원 실패 배너 렌더(role=alert)').toBeVisible({ timeout: 10_000 })
  await expect(banner, '배너에 BE 한국어 사유 노출').toContainText(SIMULATED_409_BODY.message)
  expect(intercepted, '복원 요청이 실제로 인터셉트됨').toBe(true)
  await page.screenshot({ path: path.join(SHOTS, 'step4-restore-error-banner-visible.png') })

  // ---- 2) × dismiss 버튼 클릭 → 배너 소거 ----
  const dismissBtn = page.getByTestId('partner-order-restore-error-dismiss')
  await expect(dismissBtn, 'dismiss 버튼 렌더').toBeVisible()
  await dismissBtn.click()
  await expect(banner, 'dismiss 클릭 후 배너 소거').toBeHidden({ timeout: 5_000 })
  await page.screenshot({ path: path.join(SHOTS, 'step4-restore-error-banner-dismissed.png') })

  // ---- 3) 배너 재노출(2차 인터셉트 실패) 후 필터 변경 시 자동 소거 확인 ----
  await restoreBtn.click()
  await expect(banner, '재클릭 시 배너 재노출').toBeVisible({ timeout: 10_000 })
  await page.screenshot({ path: path.join(SHOTS, 'step4-restore-error-banner-before-filter-change.png') })
  await page.getByTestId('partner-order-list-status-filter').selectOption('CONFIRMED')
  await expect(banner, '필터 변경 시 배너 자동 소거').toBeHidden({ timeout: 5_000 })
  await page.screenshot({ path: path.join(SHOTS, 'step4-restore-error-banner-cleared-on-filter-change.png') })

  // ---- 4) 인터셉트 해제 + 실 복원으로 원복(DB 잔류 변경 없음) ----
  await page.unroute(`**/api/v1/partner-orders/${ORDER_PATH}/restore`)
  await page.getByTestId('partner-order-list-status-filter').selectOption('DRAFT')
  await page.getByTestId('partner-order-list-keyword-filter').fill(ORDER_NO)
  const restoreBtn2 = page.getByTestId(`partner-order-restore-${ORDER_NO}:deleted`)
  await expect(restoreBtn2).toBeVisible({ timeout: 20_000 })
  await restoreBtn2.click()
  await expect(page.getByTestId(`partner-order-row-${ORDER_NO}`), '원복: 복원 후 활성행').toBeVisible({ timeout: 20_000 })

  const H = { Authorization: `Bearer ${login.token}` }
  const cleanupCheck = await page.request.get(`${API_BASE}/api/v1/partner-orders/${ORDER_PATH}`, { headers: H })
  expect(cleanupCheck.status(), '원복 확인: 상세 200(활성)').toBe(200)
  const cleanupJson = (await cleanupCheck.json()).data
  expect(cleanupJson.isDeleted, '원복 확인: 활성 상태').toBeFalsy()
})
