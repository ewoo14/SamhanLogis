/**
 * §7 주문 협업 패널 — Playwright mock 회귀.
 *
 * 검증 대상: SalesPartnerOrderDetailPage (`/sales/partner-orders/:id`) 하단 협업 섹션의
 *   1) 코멘트 등록 → 목록 반영 → 해결 처리
 *   2) 수정 버튼 → 요청사항/납기/라인 비고 편집 → 수정완료 → diff 표시
 *   3) 잠금 상태(CANCELED/CONVERTED/CONFIRMING) 주문에서는 수정 버튼 미노출
 *
 * UUID 비공개 가드: 화면 단언은 작성자 실명, 주문번호, 필드 라벨만 사용한다.
 */
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const CONFIRMED_ORDER_ID = 'ord-confirmed'
const CANCELED_ORDER_ID = 'ord-canceled'

const detailUrl = (id: string) =>
  `${BASE_URL}/#/sales/partner-orders/${encodeURIComponent(id)}?mockRole=MASTER`

async function installAuthMock(page: Page) {
  await page.addInitScript(() => {
    const auth = {
      token: 'playwright-token',
      userId: '00000000-0000-0000-0000-000000010001',
      role: 'MASTER',
      fullName: '오병승',
      partnerCode: 'P-MOCK-001',
    }
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => auth,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  })
}

test.describe('§7 주문 협업 패널', () => {
  test('코멘트 등록 → 목록 반영 → 해결 처리', async ({ page }) => {
    await installAuthMock(page)
    await page.goto(detailUrl(CONFIRMED_ORDER_ID), { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('partner-order-collaboration-panel')
    await expect(panel).toBeVisible()
    await expect(panel.getByText('아직 코멘트가 없습니다.')).toBeVisible()

    const input = panel.getByTestId('partner-order-collab-comment-input')
    await expect(input).toBeVisible()
    await input.fill('납기와 요청사항 확인 부탁드립니다')
    await panel.getByRole('button', { name: '등록' }).click()

    const commentItem = panel.getByTestId('partner-order-collab-comment-item')
    await expect(commentItem).toHaveCount(1)
    await expect(commentItem).toContainText('오병승')
    await expect(commentItem).toContainText('납기와 요청사항 확인 부탁드립니다')

    await commentItem.getByRole('button', { name: '해결' }).click()
    await expect(commentItem.getByRole('button', { name: '해결' })).toHaveCount(0)
    await expect(commentItem).toContainText('해결')
  })

  test('수정 버튼 → 요청사항/납기/라인비고 편집 → 수정완료 → diff 반영', async ({ page }) => {
    await installAuthMock(page)
    await page.goto(detailUrl(CONFIRMED_ORDER_ID), { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('partner-order-collaboration-panel')
    await expect(panel).toBeVisible()
    await expect(panel.getByText('아직 수정 이력이 없습니다.')).toBeVisible()

    await page.getByTestId('partner-order-collab-edit-open').click()

    const form = panel.getByTestId('partner-order-collab-edit-form')
    await expect(form).toBeVisible()
    await form.getByLabel('요청사항 수정값').fill('5/7 오전 입고 후 담당자 확인 요청')
    await form.getByLabel('납기 수정값').fill('2026-06-03')
    await form.getByLabel('1번 라인 비고 수정값').fill('실외기 설치 위치 재확인')
    await form.getByLabel('수정 사유').fill('거래처 요청사항 반영')
    await form.getByRole('button', { name: '수정완료' }).click()

    const item = panel.getByTestId('partner-order-collab-edit-item')
    await expect(item).toHaveCount(1)
    await expect(item).toContainText('오병승')
    await expect(item).toContainText('수정완료')
    await expect(item).toContainText('요청사항')
    await expect(item).toContainText('납기')
    await expect(item).toContainText('1번 라인 비고')
    await expect(item).toContainText('5/7 오전 입고 후 담당자 확인 요청')
    await expect(item).toContainText('2026-06-03')
    await expect(item).toContainText('실외기 설치 위치 재확인')
    await expect(item).toContainText('사유: 거래처 요청사항 반영')
    await expect(panel.getByText('아직 수정 이력이 없습니다.')).toHaveCount(0)
  })

  test('잠금 상태 주문에서는 수정 버튼이 노출되지 않는다', async ({ page }) => {
    await installAuthMock(page)
    await page.goto(detailUrl(CANCELED_ORDER_ID), { waitUntil: 'domcontentloaded' })

    await expect(page.getByTestId('partner-order-collaboration-panel')).toBeVisible()
    // '취소'는 상태 배지·액션 버튼 등 여러 곳에 나타나므로 first 로 스코프(잠금상태 로드 확인용).
    await expect(page.getByText('취소').first()).toBeVisible()
    // 핵심: 잠금(CANCELED) 주문은 협업 수정완료 버튼 미노출.
    await expect(page.getByTestId('partner-order-collab-edit-open')).toHaveCount(0)
  })
})
