import { expect, test, type Locator, type Page } from '@playwright/test'

async function installAuthMock(page: Page): Promise<void> {
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

async function openInventoryLookupModal(page: Page): Promise<Locator> {
  await installAuthMock(page)
  await page.goto('/#/sales/partner-orders/ord-draft?mockRole=MASTER', {
    waitUntil: 'domcontentloaded',
  })

  await expect(page.getByText('주문서 상세')).toBeVisible({ timeout: 15_000 })

  const lookupButton = page.getByTestId('partner-order-inventory-lookup-btn')
  await expect(lookupButton).toBeVisible({ timeout: 10_000 })
  await expect(lookupButton).toBeDisabled()

  await page.getByRole('checkbox', { name: /재고조회 선택/ }).first().check()
  await expect(lookupButton).toBeEnabled()
  await lookupButton.click()

  const dialog = page.locator('[role="dialog"]').filter({
    has: page.getByTestId('inventory-lookup-modal'),
  })
  await expect(dialog).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('inventory-lookup-modal')).toBeVisible()

  return dialog
}

async function expectHeaderCloseButtonVisible(dialog: Locator): Promise<void> {
  const closeButton = dialog.getByRole('button', { name: '닫기' }).first()
  await expect(closeButton).toBeVisible()

  const [dialogBox, closeBox] = await Promise.all([
    dialog.boundingBox(),
    closeButton.boundingBox(),
  ])
  expect(dialogBox).not.toBeNull()
  expect(closeBox).not.toBeNull()
  expect(closeBox!.y).toBeLessThan(dialogBox!.y + 96)
}

test.describe('모바일 슬4a 공용 Modal 풀스크린', () => {
  test('390px 모바일에서는 공용 Modal 이 viewport 를 거의 채운다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const dialog = await openInventoryLookupModal(page)

    const box = await dialog.boundingBox()
    const viewport = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
    }))

    expect(box).not.toBeNull()
    expect(box!.width).toBeGreaterThanOrEqual(viewport.width * 0.95)
    expect(box!.height).toBeGreaterThanOrEqual(viewport.height * 0.9)

    await expectHeaderCloseButtonVisible(dialog)
  })

  test('1280px 데스크탑에서는 공용 Modal 이 중앙 카드 폭을 유지한다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const dialog = await openInventoryLookupModal(page)

    const box = await dialog.boundingBox()
    const viewportWidth = await page.evaluate(() => window.innerWidth)

    expect(box).not.toBeNull()
    expect(box!.width).toBeLessThan(viewportWidth)

    await expectHeaderCloseButtonVisible(dialog)
  })
})
