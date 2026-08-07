/**
 * §7 주문 협업 패널 — Playwright mock 회귀.
 *
 * 검증 대상: SalesPartnerOrderDetailPage (`/sales/partner-orders/:id`) 하단 협업 섹션의
 *   1) 코멘트 등록 → 목록 반영 → 해결 처리
 *   2) 수정 버튼 → 요청사항/납기/라인 비고 편집 → 수정완료 → 버전이력으로 일원화
 *   3) 잠금 상태(CANCELED/CONVERTED/CONFIRMING) 주문에서는 수정 버튼 미노출
 *
 * <p>#31 이력 일원화(2026-07-06) 이후 "협업" 헤더 + changeSet diff(수정 이력) 목록은
 * 제거되었고, {@link PartnerOrderVersionHistoryPanel} (row-level highlight) 로 일원화됐다
 * — slip-collab-panel.spec.ts 와 동일 계약.
 *
 * UUID 비공개 가드: 화면 단언은 작성자 실명, 주문번호, 필드 라벨만 사용한다.
 */
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const CONFIRMED_ORDER_ID = 'ord-confirmed'
/** 잠금 상태(수정완료 미노출) 3종 — CANCELED·CONVERTED·CONFIRMING. */
const LOCKED_ORDER_IDS = ['ord-canceled', 'ord-converted', 'ord-confirming'] as const

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

  test('수정 버튼 → 요청사항/납기/라인비고 편집 → 수정완료 → 버전이력으로 일원화', async ({ page }) => {
    await installAuthMock(page)
    await page.goto(detailUrl(CONFIRMED_ORDER_ID), { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('partner-order-collaboration-panel')
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('heading', { name: '협업' })).toHaveCount(0)
    await expect(panel.getByLabel('수정 이력')).toHaveCount(0)
    await expect(panel.getByTestId('partner-order-collab-edit-item')).toHaveCount(0)
    // mock fixture(ord-confirmed) 는 rev3(RESTORE)/rev2(EDIT)/rev1(CREATE) 3건 고정 —
    // 최신(rev3) 행이 버전이력 통합의 회귀 가드.
    const versionHistory = panel.getByTestId('partner-order-version-history-panel')
    await expect(versionHistory).toBeVisible()
    await page.getByTestId('partner-order-version-history-open').click()
    await expect(page.getByTestId('partner-order-version-history-row-3')).toBeVisible()
    await page.getByRole('dialog', { name: '버전 이력' }).getByRole('button', { name: '닫기' }).click()

    await page.getByTestId('partner-order-collab-edit-open').click()

    const form = panel.getByTestId('partner-order-collab-edit-form')
    await expect(form).toBeVisible()
    await form.getByLabel('요청사항 수정값').fill('5/7 오전 입고 후 담당자 확인 요청')
    await form.getByLabel('납기 수정값').fill('2026-06-03')
    await form.getByLabel('1번 라인 비고 수정값').fill('실외기 설치 위치 재확인')
    await form.getByLabel('수정 사유').fill('거래처 요청사항 반영')
    await form.getByRole('button', { name: '수정완료' }).click()

    // diff 전용 목록은 만들지 않고, 버전이력 패널만 남긴다.
    await expect(panel.getByTestId('partner-order-collab-edit-item')).toHaveCount(0)
    await expect(panel.getByLabel('수정 이력')).toHaveCount(0)
    await expect(versionHistory).toBeVisible()
    await page.getByTestId('partner-order-version-history-open').click()

    // 버전이력 항목 선택은 공유 highlight 상태를 반영한다.
    const revisionRow = page.getByTestId('partner-order-version-history-row-3')
    await revisionRow.click()
    await expect(revisionRow).toHaveAttribute('data-active', 'true')
  })

  // 잠금 상태(CANCELED·CONVERTED·CONFIRMING) 3종 모두에서 협업 수정완료 버튼 미노출.
  for (const lockedId of LOCKED_ORDER_IDS) {
    test(`잠금 상태 주문(${lockedId})에서는 수정 버튼이 노출되지 않는다`, async ({ page }) => {
      await installAuthMock(page)
      await page.goto(detailUrl(lockedId), { waitUntil: 'domcontentloaded' })

      await expect(page.getByTestId('partner-order-collaboration-panel')).toBeVisible()
      // 핵심: 잠금 주문은 협업 수정완료 버튼 미노출.
      await expect(page.getByTestId('partner-order-collab-edit-open')).toHaveCount(0)
    })
  }
})
