/**
 * #836 — 거래처 4탭 신규등록/행클릭 권한 parity mock 회귀.
 *
 * ACCOUNTANT 는 partners.list 만 조회하고 partners.4tab 권한은 없으므로
 * 신규 등록 버튼·행클릭 상세·신규 라우트 폼이 모두 노출되지 않아야 한다.
 * SALES 는 partners.4tab VIEW/CREATE 를 보유하므로 기존 동작을 유지한다.
 */
import { expect, test } from '@playwright/test'

const PARTNERS_PATH = '/#/admin/partners'
const NEW_PARTNER_PATH = '/#/admin/partners/new'
const ACCOUNTANT_PARTNERS_URL = `${PARTNERS_PATH}?mockRole=ACCOUNTANT`
const SALES_PARTNERS_URL = `${PARTNERS_PATH}?mockRole=SALES`
const ACCOUNTANT_NEW_URL = `${NEW_PARTNER_PATH}?mockRole=ACCOUNTANT`
const SALES_NEW_URL = `${NEW_PARTNER_PATH}?mockRole=SALES`

async function openPartnersPage(page: import('@playwright/test').Page, role: 'ACCOUNTANT' | 'SALES') {
  await page.goto(role === 'ACCOUNTANT' ? ACCOUNTANT_PARTNERS_URL : SALES_PARTNERS_URL, {
    waitUntil: 'domcontentloaded',
  })
  await expect(page.getByTestId('admin-partners-table')).toBeVisible()
}

test.describe('#836 거래처 4탭 ACCOUNTANT/SALES mock parity', () => {
  test('ACCOUNTANT — 신규 등록 버튼이 없고 행클릭으로 상세 다이얼로그가 열리지 않는다', async ({ page }) => {
    await openPartnersPage(page, 'ACCOUNTANT')

    await expect(page.getByRole('button', { name: '신규 등록' })).toHaveCount(0)

    const row = page.getByTestId('admin-partners-row-1234567890')
    await expect(row).toBeVisible()
    await row.click()
    await expect(page.getByRole('dialog', { name: /거래처 상세/ })).toHaveCount(0)
  })

  test('ACCOUNTANT — 신규 라우트 직접 진입은 홈으로 redirect되고 생성 폼이 없다', async ({ page }) => {
    await page.goto(ACCOUNTANT_NEW_URL, { waitUntil: 'domcontentloaded' })

    await expect(page).toHaveURL(/#\/$/)
    await expect(page.getByTestId('partner-create-form')).toHaveCount(0)
  })

  test('SALES — 신규 등록 버튼·행클릭 상세·신규 라우트 폼이 유지된다', async ({ page }) => {
    await openPartnersPage(page, 'SALES')

    await expect(page.getByRole('button', { name: '신규 등록' })).toBeVisible()

    const row = page.getByTestId('admin-partners-row-1234567890')
    await expect(row).toBeVisible()
    await row.click()
    await expect(page.getByRole('dialog', { name: /거래처 상세/ })).toBeVisible()

    await page.goto(SALES_NEW_URL, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('partner-create-form')).toBeVisible()
  })

  test('SALES — partners.4tab.edit 미보유 시 버전 이력 탭과 패널이 노출되지 않는다', async ({ page }) => {
    await openPartnersPage(page, 'SALES')

    await page.getByTestId('admin-partners-row-1234567890').click()
    await expect(page.getByRole('dialog', { name: /거래처 상세/ })).toBeVisible()
    await expect(page.getByRole('tab', { name: '버전 이력' })).toHaveCount(0)
    await expect(page.getByTestId('partner-version-history-panel')).toHaveCount(0)
  })

  for (const role of ['MASTER', 'MANAGER'] as const) {
    test(`${role} — partners.4tab.edit VIEW 보유 시 버전 이력 탭이 노출된다`, async ({ page }) => {
      await page.goto(`${PARTNERS_PATH}?mockRole=${role}`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('admin-partners-table')).toBeVisible()

      await page.getByTestId('admin-partners-row-1234567890').click()
      await expect(page.getByRole('dialog', { name: /거래처 상세/ })).toBeVisible()
      await expect(page.getByRole('tab', { name: '버전 이력' })).toBeVisible()

      if (role === 'MANAGER') {
        await page.getByRole('tab', { name: '버전 이력' }).click()
        await expect(page.getByTestId('partner-version-history-panel')).toBeVisible()
        await page.getByTestId('partner-version-history-open').click()
        await expect(page.getByTestId('partner-version-history-restore-button-1')).toHaveCount(0)
      }
    })
  }
})
