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

function offsetIsoSeoul(baseIso: string, offsetDays: number): string {
  const d = new Date(baseIso + 'T00:00:00')
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function taskCode(dateIso: string, suffix: string): string {
  return `${dateIso.replace(/-/g, '/')}-${suffix}`
}

const CURRENT_DISPATCH_DATE = todayIsoSeoul()
const PREVIOUS_DISPATCH_DATE = offsetIsoSeoul(CURRENT_DISPATCH_DATE, -6)
const CURRENT_TASK_CODE = taskCode(CURRENT_DISPATCH_DATE, '1')
const PREVIOUS_TASK_CODE = taskCode(PREVIOUS_DISPATCH_DATE, '2')
const MANUAL_ONLY_TASK_CODE = taskCode(CURRENT_DISPATCH_DATE, 'MANUAL')
const CURRENT_SLIP_NO = `${CURRENT_DISPATCH_DATE.replace(/-/g, '/')}-001`

function mockPerms(perms: MockPerm[]): string {
  return btoa(JSON.stringify(perms))
}

async function gotoHistory(
  page: Page,
  role = 'DISPATCH',
  perms?: MockPerm[],
  extraParams?: Record<string, string>,
): Promise<void> {
  const params = new URLSearchParams({ mockRole: role })
  if (perms) params.set('mockPerms', mockPerms(perms))
  for (const [key, value] of Object.entries(extraParams ?? {})) {
    params.set(key, value)
  }
  await page.goto(`${BASE_URL}/#/dispatch-board/history?${params.toString()}`, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  })
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
}

test.describe('AROLOGIS 배차현황 뷰 mock', () => {
  test('DISPATCHED 완료배차 목록을 렌더한다', async ({ page }) => {
    await gotoHistory(page)

    await expect(page.getByTestId('dispatch-history-page')).toBeVisible()
    await expect(page.getByTestId('dispatch-history-table')).toBeVisible()
    await expect(page.getByTestId(`dispatch-history-row-${CURRENT_TASK_CODE}`)).toBeVisible()
    await expect(page.getByTestId(`dispatch-history-row-${PREVIOUS_TASK_CODE}`)).toBeVisible()
    await expect(page.getByTestId('dispatch-history-table').getByText('배차 완료').first()).toBeVisible()
  })

  test('상태 필터는 완료(DISPATCHED)만 노출한다 - 대상자는 배차현황 편입', async ({ page }) => {
    await gotoHistory(page)

    const statusSelect = page.getByTestId('dispatch-history-status')
    await expect(statusSelect.locator('option')).toHaveCount(1)
    await expect(statusSelect.locator('option')).toHaveText(['배차 완료'])

    await expect(page.getByTestId(`dispatch-history-row-${CURRENT_TASK_CODE}`)).toBeVisible()
  })

  // Round C Option A (개발책임자 결정) — 배차현황 상세는 더 이상 전면 조회 전용이 아니다.
  // UPDATE 권한이면 DISPATCHED 상세에서 [수정 요청]/[취소 요청] 으로 재배차 루프에 진입한다.
  // 코멘트 스레드는 배차현황에서 계속 조회 전용 (readOnly 유지).
  test('UPDATE 권한은 상세에서 수정/취소 요청 버튼이 노출되고 코멘트는 조회 전용을 유지한다', async ({ page }) => {
    await gotoHistory(page)

    await page.getByTestId(`dispatch-history-row-${CURRENT_TASK_CODE}`).click()
    await expect(page.getByTestId('dispatch-task-detail-body')).toBeVisible()

    await expect(page.getByTestId('dispatch-task-detail-request-modification')).toBeVisible()
    await expect(page.getByTestId('dispatch-task-detail-request-cancellation')).toBeVisible()
    // 코멘트는 배차현황에서 여전히 조회 전용 (dispatch-comments.spec.ts 와 동일 계약)
    await expect(page.getByTestId('dispatch-comment-input')).toHaveCount(0)
    await expect(page.getByTestId('dispatch-comment-submit')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '코멘트 삭제' })).toHaveCount(0)
  })

  test('VIEW 전용 사용자는 상세에서 수정/취소 요청 버튼을 볼 수 없다', async ({ page }) => {
    await gotoHistory(page, 'DISPATCH', [
      { pageCode: 'dispatch.board', view: true, edit: false },
    ])

    await page.getByTestId(`dispatch-history-row-${CURRENT_TASK_CODE}`).click()
    await expect(page.getByTestId('dispatch-task-detail-body')).toBeVisible()

    await expect(page.getByTestId('dispatch-task-detail-request-modification')).toHaveCount(0)
    await expect(page.getByTestId('dispatch-task-detail-request-cancellation')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '수정 요청' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '취소 요청' })).toHaveCount(0)
  })

  test('행 클릭 후 차량그룹, 전표, 기사 상세를 보여준다', async ({ page }) => {
    await gotoHistory(page)

    await page.getByTestId(`dispatch-history-row-${CURRENT_TASK_CODE}`).click()
    const detail = page.getByTestId('dispatch-task-detail-body')
    await expect(detail).toBeVisible()
    await expect(detail).toContainText('1톤 #1')
    await expect(detail).toContainText(CURRENT_SLIP_NO)
    await expect(detail).toContainText('동탄공조')
    await expect(detail).toContainText('기사 김배차 (DRV-101) 010-9000-1001')
  })

  test('행 클릭은 arologisDispatchId 대신 task UUID 상세 key 를 사용한다', async ({ page }) => {
    await gotoHistory(page, 'DISPATCH', undefined, { mockDispatchDetailError: '1' })

    await page.getByTestId(`dispatch-history-row-${CURRENT_TASK_CODE}`).click()

    const detail = page.getByTestId('dispatch-task-detail-body')
    await expect(detail).toBeVisible()
    await expect(detail).toContainText(CURRENT_TASK_CODE)
    await expect(page.getByTestId('dispatch-history-detail-error')).toHaveCount(0)
  })

  test('arologisDispatchId 없는 수동-only 완료 task 도 행 클릭으로 상세를 연다', async ({ page }) => {
    await gotoHistory(page)

    await page.getByTestId(`dispatch-history-row-${MANUAL_ONLY_TASK_CODE}`).click()

    const detail = page.getByTestId('dispatch-task-detail-body')
    await expect(detail).toBeVisible()
    await expect(detail).toContainText(MANUAL_ONLY_TASK_CODE)
    await expect(detail).toContainText('수동완료거래처')
    await expect(detail).toContainText('기사 이경기 (경기퀵) 010-7777-8888')
  })

  test('UPDATE 권한 사용자는 배차현황 상세에서 타사 기사/차량을 수동 입력한다', async ({ page }) => {
    await gotoHistory(page)

    await page.getByTestId(`dispatch-history-row-${CURRENT_TASK_CODE}`).click()
    const detail = page.getByTestId('dispatch-task-detail-body')
    await expect(detail).toBeVisible()

    await page.getByTestId('dispatch-task-detail-set-matched-driver-1').click()
    await page.getByTestId('matched-driver-driver-name').fill('이경기')
    await page.getByTestId('matched-driver-vehicle-plate-number').fill('12가9999')
    await page.getByTestId('matched-driver-driver-phone-number').fill('010-7777-8888')
    await page.getByTestId('matched-driver-driver-source').selectOption('GYEONGGI_QUICK')
    await page.getByTestId('matched-driver-submit').click()

    await expect(detail).toContainText('기사 이경기 (경기퀵) 010-7777-8888')
    await expect(detail).toContainText('차량번호 12가9999')
  })

  test('VIEW 전용 사용자는 기사/차량 입력 액션을 볼 수 없다', async ({ page }) => {
    await gotoHistory(page, 'DISPATCH', [
      { pageCode: 'dispatch.board', view: true, edit: false },
    ])

    await page.getByTestId(`dispatch-history-row-${CURRENT_TASK_CODE}`).click()
    await expect(page.getByTestId('dispatch-task-detail-body')).toBeVisible()
    await expect(page.getByTestId('dispatch-task-detail-set-matched-driver-1')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '기사/차량 입력' })).toHaveCount(0)
  })

  test('dispatch.board view 없는 역할은 홈으로 redirect 된다', async ({ page }) => {
    await gotoHistory(page, 'DISPATCH', [
      { pageCode: 'dispatch.board', view: false, edit: false },
    ])

    await expect(page.getByTestId('dispatch-history-page')).toHaveCount(0)
    await expect(page).toHaveURL(/#\/$/)
  })

  test('상세 조회 실패 시 오류 배너를 표시하고 같은 행을 다시 열 수 있다', async ({ page }) => {
    await gotoHistory(page, 'DISPATCH', undefined, { mockDispatchTaskIdDetailError: '1' })

    await page.getByTestId(`dispatch-history-row-${CURRENT_TASK_CODE}`).click()
    await expect(page.getByRole('alert')).toContainText('배차현황 상세를 불러오지 못했습니다.')

    await page.getByTestId(`dispatch-history-row-${CURRENT_TASK_CODE}`).click()
    await expect(page.getByRole('alert')).toContainText('배차현황 상세를 불러오지 못했습니다.')
  })

  test('화면 텍스트에 raw UUID가 노출되지 않는다', async ({ page }) => {
    await gotoHistory(page)

    await page.getByTestId(`dispatch-history-row-${CURRENT_TASK_CODE}`).click()
    await expect(page.getByTestId('dispatch-task-detail-body')).toBeVisible()

    const bodyText = await page.locator('body').textContent()
    expect(bodyText ?? '').not.toMatch(UUID_REGEX)

    const domAttributes = await page.locator('body').evaluate((body) => {
      const elements = [body, ...Array.from(body.querySelectorAll('*'))]
      return elements.flatMap((element) =>
        Array.from(element.attributes).map((attr) => `${attr.name}=${attr.value}`),
      )
    })
    expect(domAttributes.join('\n')).not.toMatch(UUID_REGEX)
  })
})
