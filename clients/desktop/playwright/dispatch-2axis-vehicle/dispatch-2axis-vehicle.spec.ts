/**
 * @file 배차 2축 차량 모델 FE 런타임 계약.
 *
 * VITE_MOCK_MODE=1 in-process mock 과 실제 /dispatch-board 화면을 통해
 * AddVehicleModal 렌더링, 차종/톤수 matrix, 요청 body, 그룹 라벨을 함께 검증한다.
 */
import { expect, test } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'

async function openDispatchBoard(page: import('@playwright/test').Page) {
  await page.goto(`${BASE_URL}/#/dispatch-board?mockRole=DISPATCH`, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  })
  await expect(page.getByTestId('dispatch-board-page')).toBeVisible()
  await expect(page.getByTestId('dispatch-board-add-vehicle-button')).toBeEnabled()
}

async function openAddVehicleModal(page: import('@playwright/test').Page) {
  await page.getByTestId('dispatch-board-add-vehicle-button').click()
  await expect(page.getByTestId('dispatch-board-add-vehicle-submit')).toBeVisible()
}

async function lastAddVehicleBody(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const win = window as typeof window & {
      __SAMHAN_MOCK_LAST_ADD_VEHICLE_GROUP_BODY__?: unknown
    }
    return win.__SAMHAN_MOCK_LAST_ADD_VEHICLE_GROUP_BODY__
  })
}

test.describe('배차 2축 차량 모델 FE 런타임 계약', () => {
  test('AddVehicleModal 은 소형 tonnage null, 화물 톤수 stale reset, 추가 그룹 라벨을 검증한다', async ({ page }) => {
    await openDispatchBoard(page)

    await test.step('소형 차종은 톤수 옵션을 숨기고 tonnage null 로 제출한다', async () => {
      await openAddVehicleModal(page)
      await page.getByTestId('dispatch-board-add-vehicle-body-option-MOTORCYCLE').click()
      await expect(page.locator('[data-testid^="dispatch-board-add-vehicle-tonnage-option-"]')).toHaveCount(0)
      await page.getByTestId('dispatch-board-add-vehicle-submit').click()

      await expect(page.getByTestId('dispatch-board-vehicle-group-1')).toContainText('오토바이 #1')
      await expect.poll(() => lastAddVehicleBody(page)).toMatchObject({
        vehicleBodyType: 'MOTORCYCLE',
        tonnage: null,
      })
    })

    await test.step('화물 차종은 10개 톤수를 노출하고 차종 전환 후 stale 톤수를 초기화한다', async () => {
      await openAddVehicleModal(page)
      await expect(page.locator('[data-testid^="dispatch-board-add-vehicle-tonnage-option-"]')).toHaveCount(10)

      await page.getByTestId('dispatch-board-add-vehicle-tonnage-option-T_18').click()
      await expect(page.getByTestId('dispatch-board-add-vehicle-tonnage-option-T_18')).toHaveAttribute('aria-checked', 'true')

      await page.getByTestId('dispatch-board-add-vehicle-body-option-MOTORCYCLE').click()
      await expect(page.locator('[data-testid^="dispatch-board-add-vehicle-tonnage-option-"]')).toHaveCount(0)

      await page.getByTestId('dispatch-board-add-vehicle-body-option-CARGO').click()
      await expect(page.locator('[data-testid^="dispatch-board-add-vehicle-tonnage-option-"]')).toHaveCount(10)
      await expect(page.getByTestId('dispatch-board-add-vehicle-tonnage-option-T_1')).toHaveAttribute('aria-checked', 'true')
      await expect(page.getByTestId('dispatch-board-add-vehicle-tonnage-option-T_18')).toHaveAttribute('aria-checked', 'false')

      await page.getByTestId('dispatch-board-add-vehicle-submit').click()
      await expect(page.getByTestId('dispatch-board-vehicle-group-2')).toContainText('카고 1톤 #2')
      await expect.poll(() => lastAddVehicleBody(page)).toMatchObject({
        vehicleBodyType: 'CARGO',
        tonnage: 'T_1',
      })
    })
  })
})
