/**
 * 배차 #3 Round C — 수정요청 → 수락/거부 → 재배차 + 수동 발송완료 mock 회귀.
 *
 * 개발책임자 결정 Option A: 재배차 진입은 배차현황(완료배차) 상세에서 시작한다.
 *  ① 배차현황 DISPATCHED 상세 → [수정 요청] → mock 즉시 수락 → [재배차 시작]
 *     → 그룹 '미발송' / task '작성 중' (모달 레벨 단언).
 *  ② 수정 거부 회신 → 상세 상태 배너에 '수정 거부됨' + 거부 사유.
 *  ③ 보드 DRAFT 상세 → 기사/차량 수동기입(vendor GYEONGGI_QUICK) → 수동 발송완료
 *     → 모달에 '배차 완료' + '기사 …(경기퀵)' + 차량번호 (모달 레벨 단언 —
 *     배차현황 round-trip 금지: 보드 생성 task 의 history summary 는 날짜 민감 flake).
 *
 * mock 흐름: modification-request 는 `mockModificationDecision` 쿼리 파라미터로
 * accepted/rejected 즉시 회신을 시뮬레이션한다 (mock.ts).
 */
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

function todayIsoSeoul(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function taskCode(dateIso: string, suffix: string): string {
  return `${dateIso.replace(/-/g, '/')}-${suffix}`
}

const CURRENT_TASK_CODE = taskCode(todayIsoSeoul(), '1')

async function gotoHistory(
  page: Page,
  extraParams?: Record<string, string>,
): Promise<void> {
  const params = new URLSearchParams({ mockRole: 'DISPATCH' })
  for (const [key, value] of Object.entries(extraParams ?? {})) {
    params.set(key, value)
  }
  await page.goto(`${BASE_URL}/#/dispatch-board/history?${params.toString()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  })
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
}

async function openCurrentTaskDetail(page: Page): Promise<void> {
  await page.getByTestId(`dispatch-history-row-${CURRENT_TASK_CODE}`).click()
  await expect(page.getByTestId('dispatch-task-detail-body')).toBeVisible()
}

async function submitModificationRequest(page: Page, reason: string): Promise<void> {
  await page.getByTestId('dispatch-task-detail-request-modification').click()
  await page.getByTestId('modification-request-dialog-reason').fill(reason)
  await page.getByTestId('modification-request-dialog-submit').click()
}

test.describe('배차 수정제안 재배차 루프 (배차현황 경유, Option A)', () => {
  test('수정 요청 → mock 수락 → 재배차 시작 시 그룹 미발송 + 작성 중으로 복귀한다', async ({ page }) => {
    await gotoHistory(page, { mockModificationDecision: 'accepted' })
    await openCurrentTaskDetail(page)
    const detail = page.getByTestId('dispatch-task-detail-body')

    // 사전 상태 — DISPATCHED 그룹 '발송완료' (전이 후 단언이 vacuous 하지 않도록 고정)
    await expect(page.getByTestId('dispatch-task-detail-group-1-dispatch-status'))
      .toHaveText('발송완료')

    await submitModificationRequest(page, '정차 순서 조정 + 슬립 1건 교체 필요')

    // mock 즉시 수락 — 상세 모달은 유지되고 수락 배너 + [재배차 시작] 노출
    const banner = page.getByTestId('dispatch-task-detail-status-banner')
    await expect(banner).toContainText('수정 수락됨')
    const redispatchButton = page.getByTestId('dispatch-task-detail-start-redispatch')
    await expect(redispatchButton).toBeVisible()
    await redispatchButton.click()

    // DRAFT 복귀 — 그룹 '미발송' + task '작성 중' (slim ack 의 상세 cache 병합 즉시 반영)
    await expect(page.getByTestId('dispatch-task-detail-group-1-dispatch-status'))
      .toHaveText('미발송')
    await expect(detail).toContainText('작성 중')
    await expect(page.getByTestId('dispatch-task-detail-start-redispatch')).toHaveCount(0)
  })

  test('수정 거부 회신 시 상세 상태 배너에 거부 사유가 표시된다', async ({ page }) => {
    await gotoHistory(page, { mockModificationDecision: 'rejected' })
    await openCurrentTaskDetail(page)

    await submitModificationRequest(page, '기사 교체 요청')

    const banner = page.getByTestId('dispatch-task-detail-status-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('수정 거부됨')
    await expect(banner).toContainText('거부 사유: mock 수정 거부')
    // 거부 시 재배차 진입 불가
    await expect(page.getByTestId('dispatch-task-detail-start-redispatch')).toHaveCount(0)
    // 그룹은 발송완료 상태 유지 (DISPATCHED 로 복귀 시맨틱)
    await expect(page.getByTestId('dispatch-task-detail-group-1-dispatch-status'))
      .toHaveText('발송완료')
  })

  test('보드 DRAFT 상세에서 기사/차량 수동기입 + 수동 발송완료 시 모달에 배차 완료가 표시된다', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/dispatch-board?mockRole=DISPATCH`, {
      waitUntil: 'domcontentloaded',
      timeout: 20_000,
    })
    await expect(page.getByTestId('dispatch-board-page')).toBeVisible()
    await expect(page.getByTestId('dispatch-board-add-vehicle-button')).toBeEnabled()

    // 차량 그룹 1개 추가 (카고 1톤)
    await page.getByTestId('dispatch-board-add-vehicle-button').click()
    await page.getByTestId('dispatch-board-add-vehicle-body-option-CARGO').click()
    await page.getByTestId('dispatch-board-add-vehicle-tonnage-option-T_1').click()
    await page.getByTestId('dispatch-board-add-vehicle-submit').click()
    await expect(page.getByTestId('dispatch-board-vehicle-group-1')).toBeVisible()

    // Round C P1-4 — DRAFT 상태 배지로 상세 모달 진입 (수동완료 도달성)
    await page.getByTestId('dispatch-board-task-status').click()
    const detail = page.getByTestId('dispatch-task-detail-body')
    await expect(detail).toBeVisible()
    await expect(detail).toContainText('작성 중')

    // 타사 기사/차량 수동기입 — vendor 는 enum select (GYEONGGI_QUICK)
    await page.getByTestId('dispatch-task-detail-set-matched-driver-1').click()
    await page.getByTestId('matched-driver-driver-name').fill('이경기')
    await page.getByTestId('matched-driver-vehicle-plate-number').fill('12가9999')
    await page.getByTestId('matched-driver-driver-phone-number').fill('010-7777-8888')
    await page.getByTestId('matched-driver-driver-source').selectOption('GYEONGGI_QUICK')
    await page.getByTestId('matched-driver-submit').click()
    await expect(detail).toContainText('기사 이경기 (경기퀵)')

    // 수동 발송완료 → 모달 레벨 단언 (배차현황 round-trip 금지)
    await page.getByTestId('dispatch-task-detail-manual-complete-1').click()
    await expect(detail).toContainText('배차 완료')
    await expect(page.getByTestId('dispatch-task-detail-group-1-dispatch-status'))
      .toHaveText('발송완료')
    await expect(detail).toContainText('기사 이경기 (경기퀵)')
    await expect(detail).toContainText('차량번호 12가9999')
    // 발송완료 그룹에는 수동완료 버튼이 다시 노출되지 않는다
    await expect(page.getByTestId('dispatch-task-detail-manual-complete-1')).toHaveCount(0)
    // 수동-only 완료는 arologisDispatchId 가 없으므로 수정/취소 요청 진입을 노출하지 않는다
    await expect(page.getByTestId('dispatch-task-detail-request-modification')).toHaveCount(0)
    await expect(page.getByTestId('dispatch-task-detail-request-cancellation')).toHaveCount(0)
  })
})
