/**
 * MIG-14 sales/purchase ledger admin UI Playwright spec.
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

const LEDGER_PAGE_CODES = ['ecount.mig14.ledger']
const SALES_LEDGER_ROUTE = '/accounting/admin/ledger/sales'
const PURCHASE_LEDGER_ROUTE = '/accounting/admin/ledger/purchase'

const salesRows = [
  {
    ledgerDate: '2026-05-21',
    slipNo: 'SL-2026-0001',
    partnerCode: 'P-001',
    closingDate: '2026-05-21',
    partnerName: '삼한테스트상사',
    rawTotal: '550000',
    closingTotal: '550000',
    diff: '0',
    status: 'MATCHED',
  },
  {
    ledgerDate: '2026-05-22',
    slipNo: 'SL-2026-0002',
    partnerCode: 'P-002',
    closingDate: '2026-05-22',
    partnerName: '아로물류',
    rawTotal: '210000',
    closingTotal: '200000',
    diff: '10000',
    status: 'DIFF',
  },
]

const purchaseRows = [
  {
    ledgerDate: '2026-05-21',
    slipNo: 'PL-2026-0001',
    partnerCode: 'P-101',
    closingDate: '2026-05-21',
    partnerName: '부산건재',
    rawTotal: '330000',
    closingTotal: '330000',
    diff: '0',
    status: 'MATCHED',
  },
  {
    ledgerDate: '2026-05-22',
    slipNo: 'PL-2026-0002',
    partnerCode: 'P-102',
    closingDate: '2026-05-22',
    partnerName: '서울유통',
    rawTotal: '150000',
    closingTotal: '140000',
    diff: '10000',
    status: 'DIFF',
  },
]

test.describe('MIG-14 Ledger admin UI', () => {
  test.skip(SKIP_UI, 'PLAYWRIGHT_SKIP_UI enabled')

  test.beforeEach(async ({ page }) => {
    const ok = await isServerAvailable()
    test.skip(!ok, 'desktop dev server unavailable; screenshots pending')
    await mockPermissions(page, grant(LEDGER_PAGE_CODES, false))
    await mockApiJson(page, '**/accounting/ledger/sales**', apiPage(salesRows, 75))
    await mockApiJson(page, '**/accounting/ledger/purchase**', apiPage(purchaseRows, 75))
  })

  test('TC-MIG14-LEDGER-1: 매출 원장 목록 + DailyClosing 대조 diff', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(appUrl(SALES_LEDGER_ROUTE), { waitUntil: 'domcontentloaded', timeout: 20000 })
    await waitForSettle(page)
    await capture(page, 'ledger-admin-01-sales-list.png')

    await expectAnyVisibleText(page, ['매출', 'SL-2026-0001', '원장 합계', '마감 합계', '차이', '일치'], '매출 원장 목록 표시')
    await expectNoUuidVisible(page)
    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  test('TC-MIG14-LEDGER-2: 매입 원장 목록', async ({ page }) => {
    await page.goto(appUrl(PURCHASE_LEDGER_ROUTE), { waitUntil: 'domcontentloaded', timeout: 20000 })
    await waitForSettle(page)
    await capture(page, 'ledger-admin-02-purchase-list.png')

    await expectAnyVisibleText(page, ['매입', 'PL-2026-0001', '부산건재', '일치'], '매입 원장 목록 표시')
    await expectNoUuidVisible(page)
  })

  test('TC-MIG14-LEDGER-3: 페이지네이션과 diff row 표시', async ({ page }) => {
    await page.goto(appUrl(SALES_LEDGER_ROUTE, 'MANAGER', { page: '1', size: '50' }), {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)
    await capture(page, 'ledger-admin-03-pagination-diff.png')

    await expectAnyVisibleText(page, ['SL-2026-0002', '10000', '차이', 'diff', '다음', '페이지'], '원장 페이지네이션과 차이 표시')
  })

  test('TC-MIG14-LEDGER-4: 권한 없는 SALES 메뉴 hidden + 직접 진입 차단', async ({ page }) => {
    await mockPermissions(page, [])
    await expectMenuHidden(page, /원장|ledger/i, 'ledger-admin-04-sales-menu-hidden.png')
    await expectPermissionBlocked(page, SALES_LEDGER_ROUTE, 'ledger-admin-05-sales-direct-denied.png')
  })

  test('TC-MIG14-LEDGER-5: 매입 원장 거래처 필터 빈 결과', async ({ page }) => {
    await mockApiJson(page, '**/accounting/ledger/purchase**', apiPage([], 0))

    await page.goto(appUrl(PURCHASE_LEDGER_ROUTE, 'MANAGER', { partnerName: '없는거래처' }), {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)
    await capture(page, 'ledger-admin-06-empty-filter.png')

    await expectAnyVisibleText(page, ['조회 결과가 없습니다', '데이터가 없습니다', '0건', 'empty'], '매입 원장 빈 결과')
  })
})
