/**
 * §7 회계전표 협업 패널 — Playwright mock 회귀.
 *
 * 검증 대상: JournalCollaborationPanel (분개 상세 `/accounting/journals/:id` 하단 협업 섹션) 의
 *   1) 코멘트 등록 → 목록 반영 → 해결 처리
 *   2) 수정 버튼 → 편집 → 수정완료 → 적요/라인 메모 diff 표시
 *   3) REVERSED 분개에서는 수정 버튼 미노출
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

test.describe('§7 회계전표 협업 패널', () => {
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

  test('수정 버튼 → 적요/라인메모 편집 → 수정완료 → diff 반영', async ({ page }) => {
    await installAuthMock(page)
    await page.goto(detailUrl(POSTED_JOURNAL_ID), { waitUntil: 'domcontentloaded' })

    const panel = page.getByTestId('journal-collaboration-panel')
    await expect(panel).toBeVisible()
    await expect(panel.getByText('아직 수정 이력이 없습니다.')).toBeVisible()

    await page.getByTestId('journal-collab-edit-open').click()

    const form = panel.getByTestId('journal-collab-edit-form')
    await expect(form).toBeVisible()
    await form.getByLabel('적요 수정값').fill('5월 1주차 제품매출 대금 입금 확인')
    await form.getByLabel('1번 라인 메모 수정값').fill('국민은행 입금 확인 완료')
    await form.getByLabel('수정 사유').fill('입금 확인 후 보조메모 정정')
    await form.getByRole('button', { name: '수정완료' }).click()

    const item = panel.getByTestId('journal-collab-edit-item')
    await expect(item).toHaveCount(1)
    await expect(item).toContainText('오병승')
    await expect(item).toContainText('수정완료')
    await expect(item).toContainText('적요')
    await expect(item).toContainText('1번 라인 메모')
    await expect(item).toContainText('5월 1주차 제품매출 대금 입금 확인')
    await expect(item).toContainText('국민은행 입금 확인 완료')
    await expect(item).toContainText('사유: 입금 확인 후 보조메모 정정')
    await expect(panel.getByText('아직 수정 이력이 없습니다.')).toHaveCount(0)
  })

  test('REVERSED 분개에서는 수정 버튼이 노출되지 않는다', async ({ page }) => {
    await installAuthMock(page)
    await page.goto(detailUrl(REVERSED_JOURNAL_ID), { waitUntil: 'domcontentloaded' })

    // 분개번호는 앱 헤더 메타([JV-...])와 상세 제목(h3) 2곳에 나타나므로 제목(heading)으로 특정한다.
    await expect(page.getByRole('heading', { name: '2026/05/01-005', exact: true })).toBeVisible()
    await expect(page.getByTestId('journal-collaboration-panel')).toBeVisible()
    await expect(page.getByTestId('journal-collab-edit-open')).toHaveCount(0)
  })
})
