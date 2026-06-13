/**
 * MIG-14 Cash admin UI Playwright spec.
 *
 * 실행:
 *   cd clients/desktop
 *   npx playwright test playwright/mig-14-admin-ui/mig-14-cash-admin.spec.ts --reporter=line
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

const CASH_PAGE_CODES = [
  'ecount.mig14.cash-list',
]

const DISBURSEMENT_ROUTE = '/accounting/admin/cash-disbursements'
const RECEIPT_ROUTE = '/accounting/admin/cash-receipts'

const disbursementRows = [
  {
    slipNo: 'CD-2026-0001',
    partnerCode: 'P-001',
    partnerName: '삼한테스트상사',
    amount: '125000',
    journalNo: '2026/05/21-1',
    kind: 'EXPENSE_VOUCHER',
    transactionDate: '2026-05-21',
    memo: '운송비',
  },
  {
    slipNo: 'CD-2026-0002',
    partnerCode: 'P-002',
    partnerName: '아로물류',
    amount: '78000',
    journalNo: '2026/05/22-1',
    kind: 'MANUAL',
    transactionDate: '2026-05-22',
    memo: '수기 지출',
  },
]

const receiptRows = [
  {
    slipNo: 'CR-2026-0001',
    partnerCode: 'P-101',
    partnerName: '서울유통',
    amount: '250000',
    journalNo: '2026/05/21-2',
    kind: 'DEPOSIT_REPORT',
    transactionDate: '2026-05-21',
    memo: '입금보고',
  },
  {
    slipNo: 'CR-2026-0002',
    partnerCode: 'P-102',
    partnerName: '부산건재',
    amount: '95000',
    journalNo: '2026/05/22-2',
    kind: 'MANUAL',
    transactionDate: '2026-05-22',
    memo: '수기 회수',
  },
]

test.describe('MIG-14 Cash admin UI', () => {
  test.skip(SKIP_UI, 'PLAYWRIGHT_SKIP_UI enabled')

  test.beforeEach(async ({ page }) => {
    const ok = await isServerAvailable()
    test.skip(!ok, 'desktop dev server unavailable; screenshots pending')
    await mockPermissions(page, grant(CASH_PAGE_CODES))
    await mockApiJson(page, '**/accounting/cash-disbursements**', apiPage(disbursementRows, 75))
    await mockApiJson(page, '**/accounting/cash-receipts**', apiPage(receiptRows, 75))
  })

  test('TC-MIG14-CASH-1: 지출 트랜잭션 목록과 UUID 비공개 계약', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(appUrl(DISBURSEMENT_ROUTE), { waitUntil: 'domcontentloaded', timeout: 20000 })
    await waitForSettle(page)
    await capture(page, 'cash-admin-01-disbursement-list.png')

    await expectAnyVisibleText(page, ['지출', 'CD-2026-0001', '삼한테스트상사', '2026/05/21-1'], '지출 목록 row 표시')
    await expectNoUuidVisible(page)
    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  test('TC-MIG14-CASH-2: 권한 없는 SALES 메뉴 hidden + 직접 진입 차단', async ({ page }) => {
    await mockPermissions(page, [])
    await expectMenuHidden(page, /현금|Cash|지출|회수/, 'cash-admin-02-sales-menu-hidden.png')
    await expectPermissionBlocked(page, DISBURSEMENT_ROUTE, 'cash-admin-03-sales-direct-denied.png')
  })

  test('TC-MIG14-CASH-3: 거래처 필터 빈 결과 empty state', async ({ page }) => {
    await mockApiJson(page, '**/accounting/cash-disbursements**', apiPage([], 0))

    await page.goto(appUrl(DISBURSEMENT_ROUTE, 'MANAGER', { partnerName: '없는거래처' }), {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)
    await capture(page, 'cash-admin-04-empty-filter.png')

    await expectAnyVisibleText(page, ['조회 결과가 없습니다', '데이터가 없습니다', '0건', 'empty'], '현금 필터 빈 결과')
  })

  test('TC-MIG14-CASH-4: 회수 목록 페이지네이션 계약', async ({ page }) => {
    await page.goto(appUrl(RECEIPT_ROUTE, 'MANAGER', { page: '1', size: '50' }), {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)
    await capture(page, 'cash-admin-05-receipt-pagination.png')

    await expectAnyVisibleText(page, ['회수', 'CR-2026-0001', '서울유통', '2026/05/21-2'], '회수 목록 row 표시')
    await expectAnyVisibleText(page, ['다음', '2', '75', '페이지'], '회수 목록 페이지네이션 표시')
    await expectNoUuidVisible(page)
  })
})
