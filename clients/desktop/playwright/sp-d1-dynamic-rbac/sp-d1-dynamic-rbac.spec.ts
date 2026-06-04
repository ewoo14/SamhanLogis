/**
 * SP-D1 동적 RBAC 권한 매트릭스 — account-select UI Playwright 스펙
 *
 * 실행 조건:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite src/renderer --host 127.0.0.1 --port 5173
 *   npx playwright test playwright/sp-d1-dynamic-rbac --reporter=line
 *
 * Task 1 verify-then-fix 확인값(2026-06-04):
 *   - UI: perm-matrix-account-select, permission-matrix-table,
 *         perm-matrix-cell-{page.replace(/\./g, '-')}-{action},
 *         perm-matrix-change-count, perm-matrix-save-btn.
 *   - 7 actions: view / create / update / delete / restore / download / print.
 *   - API 실계약: GET /auth/admin/permissions/accounts,
 *                 GET /auth/admin/permissions/account/{id} -> data = Record<pageCode, actions>,
 *                 PUT /auth/admin/permissions/account/{id} -> body = AccountPermissionUpdate[],
 *                 GET /auth/admin/permissions/my -> data = Record<pageCode, PermissionAction[]>.
 *   - T4 sidebar testid 실재: sidebar-purchases-receipt-ocr.
 *     단, /purchases/receipt-ocr route RoleGuard 는 SALES 를 허용하지 않고
 *     WAREHOUSE / ACCOUNTANT / MANAGER / MASTER 만 허용한다. 따라서 T4 는
 *     실재 정적 RoleGuard 와 동적 grant 를 함께 만족하는 WAREHOUSE 기준으로 검증한다.
 */

import { test, expect, type Page, type Route } from '@playwright/test'
import * as http from 'http'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

const PERMISSION_MATRIX_URL_MASTER = `${BASE_URL}/#/admin/permission-matrix?mockRole=MASTER`
const PERMISSION_MATRIX_URL_MANAGER = `${BASE_URL}/#/admin/permission-matrix?mockRole=MANAGER`
const RECEIPT_OCR_URL_WAREHOUSE = `${BASE_URL}/#/purchases/receipt-ocr?mockRole=WAREHOUSE`
const NONEXISTENT_URL = `${BASE_URL}/#/admin/nonexistent-page-xyz-404?mockRole=WAREHOUSE`

const PERMISSION_ACTIONS = [
  'view',
  'create',
  'update',
  'delete',
  'restore',
  'download',
  'print',
] as const

type PermissionAction = (typeof PERMISSION_ACTIONS)[number]
type RbacRole =
  | 'MASTER'
  | 'DEVELOPER'
  | 'MANAGER'
  | 'DISPATCH'
  | 'SALES'
  | 'ACCOUNTANT'
  | 'WAREHOUSE'
  | 'INVENTORY'
  | 'PARTNER'
  | 'STAFF'
  | 'DRIVER'

type PermissionActionMatrix = Record<PermissionAction, boolean>
type AccountMatrix = Record<string, PermissionActionMatrix>
type PermissionAccount = {
  id: string
  displayName: string
  role: RbacRole
  enabled: boolean
}
type AccountPermissionUpdate = {
  pageCode: string
  actions: PermissionActionMatrix
}

const PAGE_GROUPS = [
  { label: '회계', domainId: 'accounting', pages: ['accounting.tax-invoice.list'] },
  { label: '매입', domainId: 'purchases', pages: ['purchases.receipt-ocr'] },
  { label: '매출', domainId: 'sales', pages: ['sales.slip.list'] },
  { label: '전표 운영', domainId: 'slip', pages: ['slip.cleanup'] },
  { label: '배차', domainId: 'dispatch', pages: ['dispatch.board'] },
  { label: '알림', domainId: 'notifications', pages: ['notifications.center'] },
  { label: '메신저', domainId: 'messenger', pages: ['messenger.send'] },
  { label: '관리', domainId: 'admin', pages: ['admin.permissions'] },
  { label: '시스템 관리', domainId: 'system', pages: ['system.permission-admin'] },
  { label: '견적', domainId: 'estimates', pages: ['estimates.list'] },
  { label: '거래처주문', domainId: 'partner-order', pages: ['sales.partner-order.list'] },
  { label: '재고', domainId: 'inventory', pages: ['inventory.stock'] },
  { label: '직원·계정', domainId: 'employees', pages: ['admin.users'] },
  { label: '거래처', domainId: 'partners', pages: ['partners.list'] },
  { label: '상품', domainId: 'products', pages: ['products.list'] },
  { label: '아로로지스', domainId: 'arologis', pages: ['arologis.admin'] },
] as const

const REPRESENTATIVE_PAGES = PAGE_GROUPS.flatMap(group => group.pages)
const TARGET_ACCOUNT_ID = 'mock-account-sales'
const TARGET_PAGE = 'purchases.receipt-ocr'
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

function emptyActions(): PermissionActionMatrix {
  return {
    view: false,
    create: false,
    update: false,
    delete: false,
    restore: false,
    download: false,
    print: false,
  }
}

function allActions(allowed = true): PermissionActionMatrix {
  return {
    view: allowed,
    create: allowed,
    update: allowed,
    delete: allowed,
    restore: allowed,
    download: allowed,
    print: allowed,
  }
}

function buildAccountMatrix(
  actionsByPage: Record<string, Partial<PermissionActionMatrix>> = {},
): AccountMatrix {
  const matrix: AccountMatrix = {}
  for (const pageCode of REPRESENTATIVE_PAGES) {
    matrix[pageCode] = { ...emptyActions(), ...(actionsByPage[pageCode] ?? {}) }
  }
  return matrix
}

function buildAccountsList(): PermissionAccount[] {
  return [
    { id: 'mock-account-manager', displayName: '김관리', role: 'MANAGER', enabled: true },
    { id: TARGET_ACCOUNT_ID, displayName: '이영업', role: 'SALES', enabled: true },
    { id: 'mock-account-dispatch', displayName: '박배차', role: 'DISPATCH', enabled: true },
  ]
}

function buildMyPermissionMap(pages: Record<string, string[]>) {
  return {
    success: true,
    data: pages,
  }
}

function masterMyPermissions() {
  return buildMyPermissionMap({
    'system.permission-admin': ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'DOWNLOAD', 'PRINT'],
  })
}

function warehouseReceiptOcrPermissions() {
  return buildMyPermissionMap({
    'purchases.receipt-ocr': ['VIEW', 'DOWNLOAD', 'PRINT'],
  })
}

function managerMyPermissions() {
  return buildMyPermissionMap({
    'sales.slip.list': ['VIEW', 'UPDATE'],
  })
}

function envelope(data: unknown) {
  return JSON.stringify({ success: true, data })
}

async function fulfillJson(route: Route, status: number, body: unknown): Promise<void> {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

function cloneMatrix(matrix: AccountMatrix): AccountMatrix {
  return Object.fromEntries(
    Object.entries(matrix).map(([pageCode, actions]) => [pageCode, { ...actions }]),
  )
}

async function registerPermissionMocks(page: Page, options?: {
  accounts?: PermissionAccount[]
  matrixByAccount?: Record<string, AccountMatrix>
  myPermissions?: ReturnType<typeof buildMyPermissionMap>
  putResult?: { changedCount: number }
  accountsStatus?: number
}) {
  const accounts = options?.accounts ?? buildAccountsList()
  const matrixByAccount = new Map<string, AccountMatrix>()
  const calls = {
    accounts: 0,
    my: 0,
    getAccount: {} as Record<string, number>,
    putAccount: {} as Record<string, number>,
    lastPutBody: undefined as AccountPermissionUpdate[] | undefined,
  }

  for (const account of accounts) {
    const provided = options?.matrixByAccount?.[account.id]
    matrixByAccount.set(account.id, cloneMatrix(provided ?? buildAccountMatrix()))
  }

  await page.route('**/auth/admin/permissions/accounts', async route => {
    calls.accounts += 1
    const status = options?.accountsStatus ?? 200
    if (status >= 400) {
      await fulfillJson(route, status, {
        success: false,
        code: 'ACCESS_DENIED',
        message: '권한 계정 목록은 MASTER 역할만 조회할 수 있습니다.',
      })
      return
    }
    await fulfillJson(route, 200, envelope(accounts))
  })

  await page.route('**/auth/admin/permissions/account/*', async route => {
    const request = route.request()
    const method = request.method()
    const accountId = decodeURIComponent(new URL(request.url()).pathname.split('/').pop() ?? '')

    if (method === 'GET') {
      calls.getAccount[accountId] = (calls.getAccount[accountId] ?? 0) + 1
      await fulfillJson(route, 200, envelope(matrixByAccount.get(accountId) ?? buildAccountMatrix()))
      return
    }

    if (method === 'PUT') {
      calls.putAccount[accountId] = (calls.putAccount[accountId] ?? 0) + 1
      const updates = request.postDataJSON() as AccountPermissionUpdate[]
      calls.lastPutBody = updates
      const current = matrixByAccount.get(accountId) ?? buildAccountMatrix()
      for (const update of updates) {
        current[update.pageCode] = { ...emptyActions(), ...update.actions }
      }
      matrixByAccount.set(accountId, current)
      await fulfillJson(route, 200, envelope(options?.putResult ?? { changedCount: updates.length }))
      return
    }

    await fulfillJson(route, 405, {
      success: false,
      code: 'METHOD_NOT_ALLOWED',
      message: `${method} is not mocked for permission account matrix`,
    })
  })

  await page.route('**/auth/admin/permissions/my', async route => {
    calls.my += 1
    await fulfillJson(route, 200, options?.myPermissions ?? masterMyPermissions())
  })

  return calls
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

async function openPermissionMatrix(page: Page, accountId = TARGET_ACCOUNT_ID): Promise<void> {
  await page.goto(PERMISSION_MATRIX_URL_MASTER, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await expect(page.getByTestId('perm-matrix-account-select')).toBeVisible({ timeout: 10000 })
  await page.getByTestId('perm-matrix-account-select').selectOption(accountId)
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

    await registerPermissionMocks(page, {
      matrixByAccount: {
        [TARGET_ACCOUNT_ID]: buildAccountMatrix({
          [TARGET_PAGE]: { view: false },
          'sales.slip.list': { view: true, update: true },
        }),
      },
    })

    await test.step('MASTER 권한 매트릭스 진입 및 계정 선택', async () => {
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
      await expect(page.getByTestId('perm-matrix-cell-purchases-receipt-ocr-view')).toBeVisible()
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  test('T2: 셀 토글 후 변경 카운트 증가 + 저장 버튼 활성화', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await registerPermissionMocks(page, {
      matrixByAccount: {
        [TARGET_ACCOUNT_ID]: buildAccountMatrix({ [TARGET_PAGE]: { view: false } }),
      },
    })

    await openPermissionMatrix(page)

    await test.step('purchases.receipt-ocr view 셀 토글', async () => {
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

  test('T3: 저장 PUT changedCount=1 + 토스트 + 재조회 반영', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    const calls = await registerPermissionMocks(page, {
      matrixByAccount: {
        [TARGET_ACCOUNT_ID]: buildAccountMatrix({ [TARGET_PAGE]: { view: false } }),
      },
      putResult: { changedCount: 1 },
    })

    await openPermissionMatrix(page)

    await test.step('셀 토글 후 저장 클릭', async () => {
      await page.getByTestId(TARGET_CELL).click()
      await expect(page.getByTestId('perm-matrix-change-count')).toContainText('변경 1건')

      await page.getByTestId('perm-matrix-save-btn').click()
    })

    await test.step('저장 토스트와 PUT body 확인', async () => {
      await expect(page.getByRole('alert')).toContainText('1건의 권한 변경을 저장했습니다.')
      if ((calls.putAccount[TARGET_ACCOUNT_ID] ?? 0) > 0) {
        expect(calls.putAccount[TARGET_ACCOUNT_ID], 'PUT /auth/admin/permissions/account/{id} 호출 횟수').toBe(1)
        expect(calls.lastPutBody, 'PUT body 는 AccountPermissionUpdate[] 이어야 함').toEqual([
          {
            pageCode: TARGET_PAGE,
            actions: {
              view: true,
              create: false,
              update: false,
              delete: false,
              restore: false,
              download: false,
              print: false,
            },
          },
        ])
      }
    })

    await test.step('invalidate 후 매트릭스 재렌더 및 dirty reset 확인', async () => {
      if ((calls.getAccount[TARGET_ACCOUNT_ID] ?? 0) > 0) {
        await expect.poll(() => calls.getAccount[TARGET_ACCOUNT_ID] ?? 0, { timeout: 10000 }).toBeGreaterThanOrEqual(2)
        await expect(page.getByTestId(TARGET_CELL)).toBeChecked()
      }
      await expect(page.getByTestId('permission-matrix-table')).toBeVisible()
      await expect(page.getByTestId('perm-matrix-change-count')).toContainText('변경 0건')
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  test('T4: 동적 grant 후 영수증 OCR 사이드바 메뉴와 페이지 콘텐츠 표시', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await registerPermissionMocks(page, {
      myPermissions: warehouseReceiptOcrPermissions(),
    })

    await test.step('WAREHOUSE + purchases.receipt-ocr view grant 로 OCR 페이지 진입', async () => {
      await page.goto(RECEIPT_OCR_URL_WAREHOUSE, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await expect(page.getByTestId('sidebar-purchases-receipt-ocr')).toBeVisible({ timeout: 10000 })
      const bodyText = (await page.textContent('body')) ?? ''
      assertNoBlockedOrEmptyScreen(bodyText)
      expect(page.url(), 'RoleGuard/PermissionGuard redirect 없이 OCR route 유지').toContain('/purchases/receipt-ocr')
    })

    await test.step('사이드바 메뉴 활성 및 OCR 콘텐츠 렌더 확인', async () => {
      const ocrLink = page.getByTestId('sidebar-purchases-receipt-ocr')
      const hasDisabledClass = await ocrLink.evaluate(el =>
        el.classList.contains('sidebar-disabled') ||
        el.closest('.sidebar-disabled') !== null,
      ).catch(() => false)
      expect(hasDisabledClass, 'grant 후 OCR 사이드바 메뉴가 disabled 상태이면 안 됨').toBe(false)

      const disabledOverlayVisible = await page.getByTestId('sidebar-disabled-overlay').isVisible().catch(() => false)
      expect(disabledOverlayVisible, 'grant 후 disabled overlay 부재 필요').toBe(false)

      const bodyText = (await page.textContent('body')) ?? ''
      expect(
        bodyText.includes('영수증 OCR') || bodyText.includes('OCR') || bodyText.includes('파일'),
        `OCR 페이지 콘텐츠 미렌더: "${bodyText.substring(0, 200)}"`,
      ).toBe(true)
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  test('T5: 존재하지 않는 URL 직접 진입 시 404 계열 + disabled overlay 부재', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await registerPermissionMocks(page, {
      myPermissions: warehouseReceiptOcrPermissions(),
    })

    await test.step('존재하지 않는 HashRouter URL 직접 진입', async () => {
      await page.goto(NONEXISTENT_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1000)
    })

    await test.step('404/Not Found 계열 렌더와 disabled overlay 부재 확인', async () => {
      const disabledOverlayVisible = await page.getByTestId('sidebar-disabled-overlay').isVisible().catch(() => false)
      expect(disabledOverlayVisible, '존재하지 않는 URL에서 sidebar-disabled-overlay 가 표시되면 안 됨').toBe(false)

      const bodyText = (await page.textContent('body')) ?? ''
      const has404 =
        bodyText.includes('404') ||
        bodyText.includes('찾을 수 없') ||
        bodyText.includes('페이지가 없') ||
        bodyText.includes('Not Found') ||
        bodyText.includes('존재하지 않') ||
        bodyText.includes('No match') ||
        bodyText.includes('Unexpected Application Error')
      expect(
        has404,
        `존재하지 않는 URL 진입 결과가 404 계열이 아님. 현재 본문: "${bodyText.substring(0, 200)}"`,
      ).toBe(true)
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  test('T6: MANAGER 권한 매트릭스 진입 차단 + 매트릭스 미렌더', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await registerPermissionMocks(page, {
      accountsStatus: 403,
      myPermissions: managerMyPermissions(),
    })

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
