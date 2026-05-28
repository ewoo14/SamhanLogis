import { expect, test, type Page, type Route } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const PAGE_URL = `${BASE_URL}/#/admin/permission-matrix?mockRole=MASTER`

const ACTIONS = ['view', 'create', 'update', 'delete', 'restore', 'download', 'print'] as const

type Action = (typeof ACTIONS)[number]

const emptyActions = (): Record<Action, boolean> => ({
  view: false,
  create: false,
  update: false,
  delete: false,
  restore: false,
  download: false,
  print: false,
})

async function fulfillJson(route: Route, body: unknown) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

async function mockPermissionAdmin(page: Page) {
  await page.route('**/permissions/my', async route => {
    await fulfillJson(route, {
      success: true,
      data: {
        'system.permission-admin': ['view', 'update'],
      },
    })
  })
}

async function mockAccounts(page: Page) {
  await page.route('**/permissions/accounts', async route => {
    await fulfillJson(route, {
      success: true,
      data: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          displayName: '김관리',
          role: 'MANAGER',
          enabled: true,
        },
        {
          id: '22222222-2222-4222-8222-222222222222',
          displayName: '이영업',
          role: 'SALES',
          enabled: true,
        },
      ],
    })
  })
}

async function mockAccountMatrix(page: Page) {
  await page.route('**/permissions/account/**', async route => {
    const request = route.request()
    const url = request.url()
    const method = request.method()

    if (method === 'GET') {
      await fulfillJson(route, {
        success: true,
        data: {
          'accounting.deposit-match': {
            ...emptyActions(),
            view: true,
          },
          'dispatch.board': {
            ...emptyActions(),
            view: true,
            update: true,
          },
        },
      })
      return
    }

    if (method === 'PUT' && !url.includes('/apply-template') && !url.includes('/copy-from')) {
      await fulfillJson(route, {
        success: true,
        data: { changedCount: 1 },
      })
      return
    }

    await route.continue()
  })
}

test.describe('Phase 1 Stage 3 Task 12 permission matrix', () => {
  test('계정 선택 → 7 action 렌더 → 셀 토글 → 변경 카운트 → 저장 호출', async ({ page }) => {
    await mockPermissionAdmin(page)
    await mockAccounts(page)
    await mockAccountMatrix(page)

    await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' })

    const accountSelect = page.getByTestId('perm-matrix-account-select')
    await expect(accountSelect).toBeVisible()
    await accountSelect.selectOption({ index: 1 })

    for (const action of ACTIONS) {
      await expect(page.getByTestId(`perm-matrix-col-all-${action}`)).toBeVisible()
    }

    const cell = page.getByTestId('perm-matrix-cell-accounting-deposit-match-delete')
    await expect(cell).toBeVisible()
    await expect(cell).not.toBeChecked()
    await cell.check()

    await expect(page.getByTestId('perm-matrix-change-count')).toContainText('1')

    await page.getByTestId('perm-matrix-save-btn').click()
    await expect(page.getByRole('alert')).toContainText('저장')
    await expect(page.getByTestId('perm-matrix-change-count')).toContainText('0')
  })
})
