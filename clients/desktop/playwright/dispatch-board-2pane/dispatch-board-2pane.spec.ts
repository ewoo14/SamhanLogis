import { expect, test } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

function mockPerms(perms: Array<{ pageCode: string; view?: boolean; edit?: boolean }>): string {
  return Buffer.from(JSON.stringify(perms), 'utf8').toString('base64')
}

async function openDispatchBoard(page: import('@playwright/test').Page) {
  await page.goto(`${BASE_URL}/#/dispatch-board?mockRole=DISPATCH`, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  })
  await expect(page.getByTestId('dispatch-board-page')).toBeVisible()
  await expect(page.getByTestId('dispatch-board-add-vehicle-button')).toBeEnabled()
}

async function openDispatchBoardViewOnly(page: import('@playwright/test').Page) {
  const taskId = '11111111-aaaa-4aaa-8aaa-000000000001'
  const perms = encodeURIComponent(mockPerms([{ pageCode: 'dispatch.board', view: true, edit: false }]))
  await page.goto(`${BASE_URL}/#/dispatch-board?mockRole=DISPATCH&mockPerms=${perms}&taskId=${taskId}`, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  })
  await expect(page.getByTestId('dispatch-board-page')).toBeVisible()
}

async function addCargoGroup(page: import('@playwright/test').Page, sequence: number) {
  await page.getByTestId('dispatch-board-add-vehicle-button').click()
  await expect(page.getByTestId('dispatch-board-add-vehicle-submit')).toBeVisible()
  await page.getByTestId('dispatch-board-add-vehicle-body-option-CARGO').click()
  await page.getByTestId('dispatch-board-add-vehicle-tonnage-option-T_1').click()
  await page.getByTestId('dispatch-board-add-vehicle-submit').click()
  await expect(page.getByTestId(`dispatch-board-vehicle-group-${sequence}`)).toBeVisible()
}

test.describe('dispatch board 2-pane 고도화', () => {
  test('전표번호 직접 입력, 중복 붉은 표시, 선택 전송 payload를 검증한다', async ({ page }) => {
    await openDispatchBoard(page)
    await addCargoGroup(page, 1)
    await addCargoGroup(page, 2)

    await expect(page.getByTestId('dispatch-board-selected-complete-button')).toBeDisabled()

    const firstSlipRow = page.locator('[data-testid^="dispatch-board-slip-row-"]').first()
    await expect(firstSlipRow).toBeVisible()
    const slipNo = (await firstSlipRow.getAttribute('data-testid'))!
      .replace('dispatch-board-slip-row-', '')

    await page.getByTestId('dispatch-board-vehicle-group-1-slip-input').fill(slipNo)
    await page.getByTestId('dispatch-board-vehicle-group-1-slip-add').click()
    await expect(page.getByTestId(`dispatch-board-group-slip-${slipNo}`)).toBeVisible()

    await page.getByTestId('dispatch-board-vehicle-group-2-slip-input').fill(slipNo)
    await page.getByTestId('dispatch-board-vehicle-group-2-slip-add').click()
    await expect(page.getByTestId(`dispatch-board-group-slip-${slipNo}-duplicate-warning`).first()).toBeVisible()
    await expect(page.getByTestId(`dispatch-board-group-slip-${slipNo}-duplicate-warning`).first())
      .toHaveAttribute('role', 'img')
    await expect(page.getByTestId(`dispatch-board-group-slip-${slipNo}`).first())
      .toHaveAttribute('data-duplicate', 'true')

    await page.getByTestId('dispatch-board-vehicle-group-1-select').check()
    await expect(page.getByTestId('dispatch-board-selected-complete-button')).toBeEnabled()
    await page.getByTestId('dispatch-board-selected-complete-button').click()
    await page.getByTestId('dispatch-board-complete-submit').click()

    await expect.poll(async () => page.evaluate(() => {
      const win = window as typeof window & {
        __SAMHAN_MOCK_LAST_DISPATCH_BODY__?: unknown
      }
      return win.__SAMHAN_MOCK_LAST_DISPATCH_BODY__
    })).toMatchObject({
      groupIds: [expect.any(String)],
    })

    await expect(page.getByTestId('dispatch-board-vehicle-group-1-dispatch-status')).toContainText('발송완료')
    await expect(page.getByTestId('dispatch-board-vehicle-group-2-dispatch-status')).toContainText('미발송')
    await expect(page.getByTestId('dispatch-board-vehicle-group-1-select')).toBeDisabled()
    await expect(page.getByTestId('dispatch-board-vehicle-group-2-select')).toBeEnabled()
    await page.getByTestId('dispatch-board-vehicle-group-2-select').check()
    await expect(page.getByTestId('dispatch-board-selected-complete-button')).toBeEnabled()
  })

  test('view-only role 에서는 그룹 입력과 선택 전송 controls 가 비활성화된다', async ({ page }) => {
    await openDispatchBoardViewOnly(page)

    await expect(page.getByTestId('dispatch-board-vehicle-group-1-slip-input')).toBeDisabled()
    await expect(page.getByTestId('dispatch-board-vehicle-group-1-select')).toBeDisabled()
    await expect(page.getByTestId('dispatch-board-selected-complete-button')).toBeDisabled()
  })
})
