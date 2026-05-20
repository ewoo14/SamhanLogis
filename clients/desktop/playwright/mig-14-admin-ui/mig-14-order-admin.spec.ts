/**
 * MIG-14 Order admin UI Playwright spec.
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

const ORDER_PAGE_CODES = ['ecount.mig14.order-list']
const ORDER_LIST_ROUTE = '/accounting/admin/orders'
const ORDER_DETAIL_ROUTE = '/accounting/admin/orders/ORD-2026-0001'

const orderRows = [
  {
    orderNo: 'ORD-2026-0001',
    orderDate: '2026-05-21',
    partnerName: '삼한테스트상사',
    managerName: '김관리',
    progressStatus: 'IN_PROGRESS',
    linkedSlipNo: 'S-2026-0001',
    totalAmount: '180000',
    lineCount: 1,
  },
  {
    orderNo: 'ORD-2026-0002',
    orderDate: '2026-05-22',
    partnerName: '아로물류',
    managerName: '박매니저',
    progressStatus: 'READY',
    linkedSlipNo: 'S-2026-0002',
    totalAmount: '95000',
    lineCount: 2,
  },
]

const orderDetail = {
  success: true,
  data: {
    orderNo: 'ORD-2026-0001',
    orderDate: '2026-05-21',
    partnerName: '삼한테스트상사',
    managerName: '김관리',
    progressStatus: 'IN_PROGRESS',
    linkedSlipNo: 'S-2026-0001',
    requestedDate: '2026-05-25',
    deliveryDate: '2026-05-26',
    totalAmount: '180000',
    memo: 'MIG-14 상세 QA',
    lines: [
      {
        lineNo: 1,
        productCode: 'PVC-001',
        productName: 'PVC 파이프',
        quantity: '12',
        unitPrice: '15000',
        supplyAmount: '163636',
        vatAmount: '16364',
        totalAmount: '180000',
        memo: '상세 라인',
      },
    ],
  },
}

test.describe('MIG-14 Order admin UI', () => {
  test.skip(SKIP_UI, 'PLAYWRIGHT_SKIP_UI enabled')

  test.beforeEach(async ({ page }) => {
    const ok = await isServerAvailable()
    test.skip(!ok, 'desktop dev server unavailable; screenshots pending')
    await mockPermissions(page, grant(ORDER_PAGE_CODES))
    await mockApiJson(page, '**/accounting/orders/ORD-2026-0001', orderDetail)
    await mockApiJson(page, '**/accounting/orders**', apiPage(orderRows, 64))
  })

  test('TC-MIG14-ORDER-1: 주문 목록 + 진행상태/담당자 컬럼', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(appUrl(ORDER_LIST_ROUTE), { waitUntil: 'domcontentloaded', timeout: 20000 })
    await waitForSettle(page)
    await capture(page, 'order-admin-01-list.png')

    await expectAnyVisibleText(page, ['주문', 'ORD-2026-0001', '삼한테스트상사', '김관리', 'IN_PROGRESS'], '주문 목록 표시')
    await expectNoUuidVisible(page)
    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  test('TC-MIG14-ORDER-2: 주문 상세 + 라인 표시', async ({ page }) => {
    await page.goto(appUrl(ORDER_DETAIL_ROUTE), { waitUntil: 'domcontentloaded', timeout: 20000 })
    await waitForSettle(page)
    await capture(page, 'order-admin-02-detail.png')

    await expectAnyVisibleText(page, ['ORD-2026-0001', 'PVC 파이프', '12', '180000', 'S-2026-0001'], '주문 상세와 라인 표시')
    await expectNoUuidVisible(page)
  })

  test('TC-MIG14-ORDER-3: 권한 없는 SALES 메뉴 hidden + 직접 진입 차단', async ({ page }) => {
    await mockPermissions(page, [])
    await expectMenuHidden(page, /주문|Order/, 'order-admin-03-sales-menu-hidden.png')
    await expectPermissionBlocked(page, ORDER_LIST_ROUTE, 'order-admin-04-sales-direct-denied.png')
  })

  test('TC-MIG14-ORDER-4: progressStatus 필터 빈 결과', async ({ page }) => {
    await mockApiJson(page, '**/accounting/orders**', apiPage([], 0))

    await page.goto(appUrl(ORDER_LIST_ROUTE, 'MANAGER', { progressStatus: 'DONE', managerName: '없는담당자' }), {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await waitForSettle(page)
    await capture(page, 'order-admin-05-empty-filter.png')

    await expectAnyVisibleText(page, ['조회 결과가 없습니다', '데이터가 없습니다', '0건', 'empty'], '주문 필터 빈 결과')
  })
})
