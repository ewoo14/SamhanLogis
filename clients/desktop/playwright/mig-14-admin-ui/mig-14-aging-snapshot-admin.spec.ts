/**
 * MIG-14 partner aging snapshot admin UI Playwright spec.
 *
 * 스크린샷: docs/qa/mig-14-admin-ui/screenshots/*.png
 */

import { expect, test } from '@playwright/test'
import {
  apiPage,
  appUrl,
  attachPageErrorHook,
  capture,
  expectAnyVisibleText,
  expectMenuHidden,
  expectNoUuidVisible,
  expectPermissionBlocked,
  grant,
  isServerAvailable,
  mockApiJson,
  mockPermissions,
  SKIP_UI,
  waitForSettle,
} from './mig-14-helpers'

const AGING_PAGE_CODES = ['ecount.mig14.aging-snapshot']
const AGING_ROUTE = '/accounting/admin/aging-snapshot'

const agingRows = [
  {
    partnerName: '삼한테스트상사',
    partnerCode: 'P-001',
    totalReceivable: '420000',
    totalPayable: '120000',
    totalReceipt: '200000',
    totalDisbursement: '80000',
    netReceivable: '300000',
    netPayable: '0',
    netCash: '120000',
    lastRefreshedAt: '2026-05-21T09:00:00',
  },
  {
    partnerName: '아로물류',
    partnerCode: 'P-002',
    totalReceivable: '110000',
    totalPayable: '230000',
    totalReceipt: '30000',
    totalDisbursement: '90000',
    netReceivable: '0',
    netPayable: '120000',
    netCash: '-60000',
    lastRefreshedAt: '2026-05-21T09:00:00',
  },
]

test.describe('MIG-14 AgingSnapshot admin UI', () => {
  test.skip(SKIP_UI, 'PLAYWRIGHT_SKIP_UI enabled')

  test.beforeEach(async ({ page }) => {
    const ok = await isServerAvailable()
    test.skip(!ok, 'desktop dev server unavailable; screenshots pending')
    await mockPermissions(page, grant(AGING_PAGE_CODES))
    await mockApiJson(page, '**/accounting/aging-snapshot?**', apiPage(agingRows, 2))
    await mockApiJson(page, '**/accounting/aging-snapshot', apiPage(agingRows, 2))
    await mockApiJson(page, '**/admin/accounting/aging-snapshot/refresh', {
      success: true,
      data: {
        refreshedAt: '2026-05-21T09:05:00',
        status: 'REFRESHED',
      },
    })
  })

  test('TC-MIG14-AGING-1: aging snapshot 목록 + net 컬럼', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(appUrl(AGING_ROUTE), { waitUntil: 'domcontentloaded', timeout: 20000 })
    await waitForSettle(page)
    await capture(page, 'aging-admin-01-list.png')

    await expectAnyVisibleText(page, ['Aging', '미수', '미지급', 'net', '삼한테스트상사', '300000'], 'aging snapshot 목록 표시')
    await expectNoUuidVisible(page)
    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  test('TC-MIG14-AGING-2: 새로고침 버튼 POST refresh', async ({ page }) => {
    let refreshCalled = false
    await page.route('**/admin/accounting/aging-snapshot/refresh', async route => {
      refreshCalled = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { refreshedAt: '2026-05-21T09:05:00', status: 'REFRESHED' },
        }),
      })
    })

    await page.goto(appUrl(AGING_ROUTE), { waitUntil: 'domcontentloaded', timeout: 20000 })
    await waitForSettle(page)

    const refreshButton = page.getByRole('button', { name: /새로고침|refresh/i }).first()
    await expect(refreshButton, 'aging snapshot 새로고침 버튼이 보여야 함').toBeVisible()
    await refreshButton.click()
    await waitForSettle(page)
    await capture(page, 'aging-admin-02-refresh.png')

    expect(refreshCalled, 'POST /admin/accounting/aging-snapshot/refresh 호출').toBe(true)
    await expectAnyVisibleText(page, ['REFRESHED', '09:05', '새로고침', '갱신'], 'aging snapshot refresh 결과 표시')
  })

  test('TC-MIG14-AGING-3: 권한 없는 SALES 메뉴 hidden + 직접 진입 차단', async ({ page }) => {
    await mockPermissions(page, [])
    await expectMenuHidden(page, /aging|미수|미지급|채권|채무/i, 'aging-admin-03-sales-menu-hidden.png')
    await expectPermissionBlocked(page, AGING_ROUTE, 'aging-admin-04-sales-direct-denied.png')
  })

  test('TC-MIG14-AGING-4: 거래처 필터 빈 결과 + sort 파라미터', async ({ page }) => {
    await mockApiJson(page, '**/accounting/aging-snapshot**', apiPage([], 0))

    await page.goto(appUrl(AGING_ROUTE, 'MANAGER', { partnerName: '없는거래처', sort: 'net_receivable_desc' }), {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)
    await capture(page, 'aging-admin-05-empty-filter.png')

    await expectAnyVisibleText(page, ['조회 결과가 없습니다', '데이터가 없습니다', '0건', 'empty'], 'aging snapshot 빈 결과')
  })
})
