import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const UUID_REGEX =
  /\b(?:[0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i

type MockPerm = { pageCode: string; view?: boolean; edit?: boolean }

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

function mockPerms(perms: MockPerm[]): string {
  return btoa(JSON.stringify(perms))
}

async function gotoHistoryWithEditPermission(page: Page): Promise<void> {
  const perms = mockPerms([
    { pageCode: 'dispatch.board', view: true, edit: true },
  ])
  await page.goto(
    `${BASE_URL}/#/dispatch-board/history?mockRole=DISPATCH&mockPerms=${encodeURIComponent(perms)}`,
    { waitUntil: 'domcontentloaded', timeout: 20_000 },
  )
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
}

test.describe('AROLOGIS 배차현황 코멘트 mock', () => {
  test('상세 모달에서 코멘트 목록을 보여주고 조회 전용으로 작성/삭제를 막는다', async ({ page }) => {
    await gotoHistoryWithEditPermission(page)

    await page.getByTestId(`dispatch-history-row-${CURRENT_TASK_CODE}`).click()
    const thread = page.getByTestId('dispatch-comment-thread')
    await expect(thread).toBeVisible()
    await expect(page.getByTestId('dispatch-comment-item')).toHaveCount(2)
    await expect(thread).toContainText('시스템')
    await expect(thread).not.toContainText('system')
    await expect(thread).toContainText('배차 완료 후 기사 매칭 확인했습니다.')
    await expect(thread).toContainText('성남냉열 연락처는 오전 중 한 번 더 확인 필요합니다.')

    await expect(page.getByTestId('dispatch-comment-input')).toHaveCount(0)
    await expect(page.getByTestId('dispatch-comment-submit')).toHaveCount(0)
    await expect(thread.getByRole('button', { name: '코멘트 삭제' })).toHaveCount(0)

    const bodyText = await page.locator('body').textContent()
    expect(bodyText ?? '').not.toMatch(UUID_REGEX)
  })
})
