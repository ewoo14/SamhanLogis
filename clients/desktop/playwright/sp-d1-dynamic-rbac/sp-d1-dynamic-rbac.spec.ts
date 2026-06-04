/**
 * SP-D1 동적 RBAC 권한 매트릭스 — account-select UI Playwright 스펙
 *
 * VITE_MOCK_MODE 에서는 api/client.ts 의 axios mock adapter 가 in-process 로 응답한다.
 * 이 파일은 Playwright 네트워크 mock 을 쓰지 않고, api/mock.ts 의 결정적 fixture 와
 * 해시 쿼리 주입점(mockRole/mockPerms)만 사용한다.
 *
 * 확인된 in-process mock 계약:
 * - accounts: mock-account-manager / mock-account-sales / mock-account-dispatch
 * - account/{id}: id 기반 role 매트릭스. SALES purchases.receipt-ocr view=false.
 * - PUT account/{id}: stateless, { changedCount: updates.length }.
 * - permissions/my: mockRole 기본값 또는 mockPerms base64(JSON) override.
 */

import { test, expect, type Page } from '@playwright/test'
import * as http from 'http'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

const PERMISSION_MATRIX_URL_MASTER = `${BASE_URL}/#/admin/permission-matrix?mockRole=MASTER`
const PERMISSION_MATRIX_URL_MANAGER = `${BASE_URL}/#/admin/permission-matrix?mockRole=MANAGER`
const NONEXISTENT_URL = `${BASE_URL}/#/admin/nonexistent-page-xyz-404?mockRole=WAREHOUSE`
const WAREHOUSE_HOME_URL = `${BASE_URL}/#/?mockRole=WAREHOUSE`

const PERMISSION_ACTIONS = [
  'view',
  'create',
  'update',
  'delete',
  'restore',
  'download',
  'print',
] as const

const PAGE_GROUPS = [
  { label: '회계', domainId: 'accounting' },
  { label: '매입', domainId: 'purchases' },
  { label: '매출', domainId: 'sales' },
  { label: '전표 운영', domainId: 'slip' },
  { label: '배차', domainId: 'dispatch' },
  { label: '알림', domainId: 'notifications' },
  { label: '메신저', domainId: 'messenger' },
  { label: '관리', domainId: 'admin' },
  { label: '시스템 관리', domainId: 'system' },
  { label: '견적', domainId: 'estimates' },
  { label: '거래처주문', domainId: 'partner-order' },
  { label: '재고', domainId: 'inventory' },
  { label: '직원·계정', domainId: 'employees' },
  { label: '거래처', domainId: 'partners' },
  { label: '상품', domainId: 'products' },
  { label: '아로로지스', domainId: 'arologis' },
] as const

const TARGET_ACCOUNT_ID = 'mock-account-sales'
const TARGET_CELL = 'perm-matrix-cell-purchases-receipt-ocr-view'

async function isServerAvailable(): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const url = new URL(BASE_URL)
      const req = http.get(
        {
          hostname: url.hostname,
          port: Number(url.port) || 80,
          path: '/',
          timeout: 2000,
        },
        res => {
          resolve(true)
          res.resume()
        },
      )
      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })
    } catch {
      resolve(false)
    }
  })
}

function attachPageErrorHook(page: Page, errors: string[]): void {
  page.on('pageerror', err => {
    errors.push(err.message)
  })
}

function mockPermsParam(perms: Array<{ pageCode: string; view?: boolean; edit?: boolean }>): string {
  return Buffer.from(JSON.stringify(perms), 'utf8').toString('base64')
}

function warehouseHomeWithMockPerms(perms: Array<{ pageCode: string; view?: boolean; edit?: boolean }>): string {
  return `${WAREHOUSE_HOME_URL}&mockPerms=${encodeURIComponent(mockPermsParam(perms))}`
}

function isAccessBlocked(currentUrl: string, bodyText: string, pathFragment: string): boolean {
  const roleGuardBlocked =
    bodyText.includes('접근 권한이 없습니다') ||
    bodyText.includes('권한 보유자만') ||
    bodyText.includes('현재 role:')
  const forbiddenRedirect = currentUrl.includes('/forbidden')
  const permissionRedirect =
    currentUrl.endsWith('/#/') ||
    currentUrl.endsWith('/#') ||
    (currentUrl.includes(BASE_URL) && !currentUrl.includes(pathFragment))

  return roleGuardBlocked || forbiddenRedirect || permissionRedirect
}

async function waitForAccessSettled(page: Page, pathFragment: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const bodyText = (await page.textContent('body')) ?? ''
        return isAccessBlocked(page.url(), bodyText, pathFragment)
      },
      {
        intervals: [250, 500, 750, 1000],
        timeout: 5000,
        message: `${pathFragment} 접근 차단 상태가 정착하지 않았습니다.`,
      },
    )
    .toBe(true)
}

function assertNoBlockedOrEmptyScreen(bodyText: string): void {
  expect(bodyText.includes('접근 권한이 없습니다'), '접근 가능 step 에 차단 화면이 표시됨').toBe(false)
  expect(bodyText.trim().length, '접근 가능 step 에 빈 화면이 렌더링됨').toBeGreaterThan(0)
}

async function openPermissionMatrix(page: Page): Promise<void> {
  await page.goto(PERMISSION_MATRIX_URL_MASTER, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await expect(page.getByTestId('perm-matrix-account-select')).toBeVisible({ timeout: 10000 })
  await expect(page.getByTestId('perm-matrix-account-select')).toContainText('김관리 / 매니저')
  await expect(page.getByTestId('perm-matrix-account-select')).toContainText('이영업 / 영업원')
  await expect(page.getByTestId('perm-matrix-account-select')).toContainText('박배차 / 배차담당자')
  await page.getByTestId('perm-matrix-account-select').selectOption(TARGET_ACCOUNT_ID)
  await expect(page.getByTestId('permission-matrix-table')).toBeVisible({ timeout: 10000 })
  await expect(page.getByTestId(TARGET_CELL)).toBeVisible({ timeout: 10000 })
}

test.describe('SP-D1 동적 RBAC 권한 매트릭스 account-select (T1~T6)', () => {
  test.beforeEach(async () => {
    const ok = await isServerAvailable()
    expect(
      ok,
      `dev server 미접근: ${BASE_URL} — VITE_MOCK_MODE=1 npx vite src/renderer --host 127.0.0.1 --port 5173 실행 후 재시도`,
    ).toBe(true)
  })

  test('T1: 계정 선택 후 7액션 컬럼 + PAGE_GROUPS + 셀 렌더', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await test.step('MASTER 권한 매트릭스 진입 및 SALES 계정 선택', async () => {
      await openPermissionMatrix(page)
      const bodyText = (await page.textContent('body')) ?? ''
      assertNoBlockedOrEmptyScreen(bodyText)
      await expect(page.getByTestId('header-page-title')).toContainText('권한 매트릭스 관리')
      await expect(page.getByTestId('perm-matrix-account-select')).toHaveValue(TARGET_ACCOUNT_ID)
    })

    await test.step('7개 액션 컬럼 헤더 렌더 확인', async () => {
      for (const action of PERMISSION_ACTIONS) {
        await expect(page.getByTestId(`perm-matrix-col-all-${action}`)).toBeVisible()
      }
    })

    await test.step('현행 PAGE_GROUPS 16개 그룹 헤더 렌더 확인', async () => {
      for (const group of PAGE_GROUPS) {
        await expect(page.getByTestId(`perm-matrix-domain-all-${group.domainId}`)).toBeVisible()
        await expect(page.getByText(new RegExp(`^${group.label} \\(\\d+\\)$`))).toBeVisible()
      }
    })

    await test.step('account-select 셀 렌더 count > 0 확인', async () => {
      const cells = page.locator('[data-testid^="perm-matrix-cell-"]')
      await expect.poll(() => cells.count(), { timeout: 10000 }).toBeGreaterThan(0)
      await expect(page.getByTestId(TARGET_CELL)).toBeVisible()
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  test('T2: SALES OCR 셀 토글 후 변경 카운트 증가 + 저장 버튼 활성화', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await openPermissionMatrix(page)

    await test.step('SALES purchases.receipt-ocr view 시작점 unchecked 확인 후 토글', async () => {
      const cell = page.getByTestId(TARGET_CELL)
      await expect(cell).not.toBeChecked()
      await cell.click()
      await expect(cell).toBeChecked()
    })

    await test.step('dirty count 1건 및 저장 버튼 활성 확인', async () => {
      await expect(page.getByTestId('perm-matrix-change-count')).toContainText('변경 1건')
      await expect(page.getByTestId('perm-matrix-save-btn')).toBeEnabled()
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  test('T3: 저장 후 changedCount 토스트 + dirty reset + 계정 재선택 서버상태 확인', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await openPermissionMatrix(page)

    await test.step('unchecked 셀을 토글하고 저장 클릭', async () => {
      const cell = page.getByTestId(TARGET_CELL)
      await expect(cell).not.toBeChecked()
      await cell.click()
      await expect(cell).toBeChecked()
      await expect(page.getByTestId('perm-matrix-change-count')).toContainText('변경 1건')
      await expect(page.getByTestId('perm-matrix-save-btn')).toBeEnabled()
      await page.getByTestId('perm-matrix-save-btn').click()
    })

    await test.step('PUT mock changedCount=updates.length 결과를 UI가 무조건 반영', async () => {
      await expect(page.getByRole('alert')).toContainText('1건의 권한 변경을 저장했습니다.')
      await expect(page.getByTestId('perm-matrix-change-count')).toContainText('변경 0건')
      await expect(page.getByTestId('perm-matrix-save-btn')).toBeDisabled()
    })

    await test.step('계정 전환으로 서버상태를 다시 로드하면 SALES 원래 unchecked 상태 확인', async () => {
      await page.getByTestId('perm-matrix-account-select').selectOption('mock-account-manager')
      await expect(page.getByTestId('perm-matrix-account-select')).toHaveValue('mock-account-manager')
      await expect(page.getByTestId('permission-matrix-table')).toBeVisible()
      await page.getByTestId('perm-matrix-account-select').selectOption(TARGET_ACCOUNT_ID)
      await expect(page.getByTestId('perm-matrix-account-select')).toHaveValue(TARGET_ACCOUNT_ID)
      await expect(page.getByTestId(TARGET_CELL)).not.toBeChecked()
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  test('T4: mockPerms 동적 grant 로 WAREHOUSE 영수증 OCR 사이드바와 route 접근 토글', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await test.step('WAREHOUSE + mockPerms=[] 는 /my 권한이 비어 OCR 링크 부재', async () => {
      await page.goto(warehouseHomeWithMockPerms([]), { waitUntil: 'domcontentloaded', timeout: 20000 })
      await expect(page.getByTestId('sidebar-warehouses')).toBeVisible({ timeout: 10000 })
      await expect(page.getByTestId('sidebar-purchases-receipt-ocr')).toHaveCount(0)
      const bodyText = (await page.textContent('body')) ?? ''
      assertNoBlockedOrEmptyScreen(bodyText)
    })

    await test.step('WAREHOUSE + OCR grant 주입 시 링크 출현 후 route 접근 가능', async () => {
      await page.goto('about:blank')
      await page.goto(
        warehouseHomeWithMockPerms([{ pageCode: 'purchases.receipt-ocr', view: true }]),
        { waitUntil: 'domcontentloaded', timeout: 20000 },
      )
      const ocrLink = page.getByTestId('sidebar-purchases-receipt-ocr')
      await expect(ocrLink).toBeVisible({ timeout: 10000 })
      await ocrLink.click()
      await expect(page).toHaveURL(/\/#\/purchases\/receipt-ocr/)
      await expect(page.getByTestId('receipt-ocr-drop-zone')).toBeVisible({ timeout: 10000 })
      const bodyText = (await page.textContent('body')) ?? ''
      assertNoBlockedOrEmptyScreen(bodyText)
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  test('T5: 존재하지 않는 URL 직접 진입 시 React Router 404 화면 렌더', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await test.step('존재하지 않는 HashRouter URL 직접 진입', async () => {
      await page.goto(NONEXISTENT_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
    })

    await test.step('실 거동: default ErrorBoundary 404 Not Found 렌더', async () => {
      await expect(page.getByText('Unexpected Application Error!')).toBeVisible({ timeout: 10000 })
      await expect(page.getByText('404 Not Found')).toBeVisible()
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  test('T6: MANAGER 권한 매트릭스 진입 차단 + 매트릭스 미렌더', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await test.step('MANAGER 역할로 권한 매트릭스 직접 진입', async () => {
      await page.goto(PERMISSION_MATRIX_URL_MANAGER, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await waitForAccessSettled(page, '/admin/permission-matrix')
    })

    await test.step('RoleGuard/PermissionGuard 차단 및 매트릭스 미렌더 확인', async () => {
      const bodyText = (await page.textContent('body')) ?? ''
      expect(
        isAccessBlocked(page.url(), bodyText, '/admin/permission-matrix'),
        `MANAGER 접근 차단 미작동 — URL: ${page.url()}, body: "${bodyText.substring(0, 200)}"`,
      ).toBe(true)
      await expect(page.getByTestId('permission-matrix-table')).toHaveCount(0)
      await expect(page.getByTestId('perm-matrix-account-select')).toHaveCount(0)
      await expect(page.getByTestId('perm-matrix-save-btn')).toHaveCount(0)
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })
})
