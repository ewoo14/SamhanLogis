/**
 * §7 회계전표 협업 패널 — Playwright mock 회귀.
 *
 * 검증 대상: JournalCollaborationPanel (분개 상세 `/accounting/journals/:id` 하단 협업 섹션) 의
 *   1) 코멘트 등록 → 목록 반영 → 해결 처리
 *   2) 수정 버튼 → 편집 → 수정완료 (적요/라인 메모) → 수정 이력 diff 반영
 *   3) REVERSED 분개에서는 수정 버튼 미노출
 *
 * <p>#31 이력 일원화(2026-07-06) 개발책임자 결정1(같은 날 재확인) — 회계 분개/그룹웨어 결재는
 * full-snapshot revision/restore API 가 없어 Slip/Estimate/PartnerOrder 처럼 버전이력 패널로
 * 대체할 수 없다. 대신 changeSet 기반 "수정 이력"(1인 수정완료 diff 목록,
 * {@code journal-collab-edit-list})을 복구해 코멘트와 함께 제공한다 — 버전이력이 아니다.
 *
 * UUID 비공개 가드: 화면 단언은 작성자 실명, journalNo, 필드 라벨만 사용한다.
 */
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const POSTED_JOURNAL_ID = 'jv-001'
const REVERSED_JOURNAL_ID = 'jv-005'

const detailUrl = (id: string) =>
  `${BASE_URL}/#/accounting/journals/${encodeURIComponent(id)}?mockRole=MASTER`

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

async function installMockRealtimeHandler(page: Page): Promise<void> {
  await page.route('**/api/v1/**/collab/stream**', (route) => route.fulfill({
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache' },
    body: ': mock keep-alive\n\n',
  }))
}

test.describe('§7 회계전표 협업 패널', () => {
  test.beforeEach(async ({ page }) => {
    await installMockRealtimeHandler(page)
  })
  test('코멘트 등록 → 목록 반영 → 해결 처리', async ({ page }) => {
    await installAuthMock(page)
    await page.goto(detailUrl(POSTED_JOURNAL_ID), { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('journal-collaboration-panel')
    await expect(panel).toBeVisible()
    await expect(panel.getByText('아직 코멘트가 없습니다.')).toBeVisible()

    const input = panel.getByTestId('journal-collab-comment-input')
    await expect(input).toBeVisible()
    await input.fill('입금 적요 확인 부탁드립니다')
    await panel.getByRole('button', { name: '등록' }).click()

    const commentItem = panel.getByTestId('journal-collab-comment-item')
    await expect(commentItem).toHaveCount(1)
    await expect(commentItem).toContainText('오병승')
    await expect(commentItem).toContainText('입금 적요 확인 부탁드립니다')

    await commentItem.getByRole('button', { name: '해결' }).click()
    await expect(commentItem.getByRole('button', { name: '해결' })).toHaveCount(0)
    await expect(commentItem).toContainText('해결')
  })

  test('코멘트 연결 필드를 선택해 등록하면 anchor 가 반영된다', async ({ page }) => {
    await installAuthMock(page)
    await page.goto(detailUrl(POSTED_JOURNAL_ID), { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('journal-collaboration-panel')
    await expect(panel).toBeVisible()

    await panel.getByTestId('journal-collab-comment-anchor-select').selectOption('description')
    const input = panel.getByTestId('journal-collab-comment-input')
    await input.fill('적요 필드 관련 코멘트입니다')
    await panel.getByRole('button', { name: '등록' }).click()

    const commentItem = panel.getByTestId('journal-collab-comment-item')
    await expect(commentItem).toHaveCount(1)
    await expect(commentItem).toContainText('적요 필드 관련 코멘트입니다')
    // anchor 있는 코멘트는 role=button 으로 클릭 가능 — 자기 자신의 필드와 매치되어 하이라이트된다.
    await commentItem.click()
    await expect(commentItem).toHaveAttribute('data-active', 'true')
  })

  test('수정 버튼 → 적요/라인메모 편집 → 수정완료 → 수정 이력 diff 반영 (#31 결정1 복구)', async ({ page }) => {
    await installAuthMock(page)
    await page.goto(detailUrl(POSTED_JOURNAL_ID), { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('journal-collaboration-panel')
    await expect(panel).toBeVisible()
    await expect(panel.getByRole('heading', { name: '협업' })).toHaveCount(0)
    await expect(panel.getByTestId('journal-collab-edit-item')).toHaveCount(0)
    // 회계 분개는 revision/restore API 부재 — 버전이력 격차 안내 카드는 결정1로 완전히 대체된다.
    await expect(page.getByTestId('journal-version-history-gap')).toHaveCount(0)

    const editHistory = panel.getByTestId('journal-collab-edit-history-panel')
    await expect(editHistory).toBeVisible()
    await expect(editHistory.getByRole('heading', { name: '수정 이력' })).toBeVisible()
    await expect(editHistory.getByText('아직 수정 이력이 없습니다.')).toBeVisible()

    await page.getByTestId('journal-collab-edit-open').click()

    const form = panel.getByTestId('journal-collab-edit-form')
    await expect(form).toBeVisible()
    await form.getByLabel('적요 수정값').fill('5월 1주차 제품매출 대금 입금 확인')
    await form.getByLabel('1번 라인 메모 수정값').fill('국민은행 입금 확인 완료')
    await form.getByLabel('수정 사유').fill('입금 확인 후 보조메모 정정')
    await form.getByRole('button', { name: '수정완료' }).click()

    // 수정완료 알림 + 수정 이력 목록에 changeSet diff(before→after) 가 반영된다.
    await expect(panel.getByRole('status')).toContainText('수정완료되었습니다.')
    const editItem = editHistory.getByTestId('journal-collab-edit-item')
    await expect(editItem).toHaveCount(1)
    await expect(editItem).toContainText('오병승')
    await expect(editItem).toContainText('수정완료')
    await expect(editItem).toContainText('적요')
    await expect(editItem).toContainText('5월 1주차 제품매출 대금 입금 확인')
    await expect(editItem).toContainText('1번 라인 메모')
    await expect(editItem).toContainText('국민은행 입금 확인 완료')
    await expect(editItem).toContainText('사유: 입금 확인 후 보조메모 정정')
  })

  test('수정 이력 diff 클릭과 코멘트 anchor 클릭이 activeFieldPath 하이라이트를 공유한다 (결정2 양방향)', async ({ page }) => {
    await installAuthMock(page)
    await page.goto(detailUrl(POSTED_JOURNAL_ID), { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('journal-collaboration-panel')
    await expect(panel).toBeVisible()

    // 1) 적요에 연결된 코멘트 등록.
    await panel.getByTestId('journal-collab-comment-anchor-select').selectOption('description')
    await panel.getByTestId('journal-collab-comment-input').fill('적요 확인 요청')
    await panel.getByRole('button', { name: '등록' }).click()
    const commentItem = panel.getByTestId('journal-collab-comment-item')
    await expect(commentItem).toHaveCount(1)

    // 2) 수정완료로 적요 changeSet diff 를 생성.
    await page.getByTestId('journal-collab-edit-open').click()
    const form = panel.getByTestId('journal-collab-edit-form')
    await form.getByLabel('적요 수정값').fill('적요 최종 확정')
    await form.getByLabel('수정 사유').fill('결정2 검증')
    await form.getByRole('button', { name: '수정완료' }).click()
    await expect(panel.getByRole('status')).toContainText('수정완료되었습니다.')

    const descriptionDiff = panel.getByTestId('journal-collab-edit-change-description')
    await expect(descriptionDiff).toBeVisible()

    // 3) 코멘트 클릭 → 같은 필드(description) 수정 이력 diff 가 하이라이트된다.
    await commentItem.click()
    await expect(descriptionDiff).toHaveAttribute('data-active', 'true')

    // 4) 반대 방향 — diff 를 다시 클릭해도 같은 activeFieldPath 상태를 유지한다(양방향 공유 확인).
    await descriptionDiff.click()
    await expect(commentItem).toHaveAttribute('data-active', 'true')
  })

  test('REVERSED 분개에서는 수정 버튼이 노출되지 않는다', async ({ page }) => {
    await installAuthMock(page)
    await page.goto(detailUrl(REVERSED_JOURNAL_ID), { waitUntil: 'domcontentloaded' })

    // 분개번호는 앱 헤더 메타([JV-...])와 상세 제목(h3) 2곳에 나타나므로 제목(heading)으로 특정한다.
    await expect(page.getByRole('heading', { name: '2026/05/01-5', exact: true })).toBeVisible()
    await expect(page.getByTestId('journal-collaboration-panel')).toBeVisible()
    await expect(page.getByTestId('journal-collab-edit-open')).toHaveCount(0)
  })
})
