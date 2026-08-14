import { test, expect } from '@playwright/test'
import path from 'node:path'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const SHOTS = resolveQaShotsDir(path.resolve(process.cwd(), '../../docs/qa/2026-08-11-1068-real-qa'))

async function openNewSalesSlip(page: import('@playwright/test').Page, suffix = '') {
  await page.goto(`/#/sales/new${suffix}`)
  await expect(page.getByTestId('slip-partner-header-autofill')).toBeVisible()
}

async function selectMockPartner(page: import('@playwright/test').Page) {
  const partnerInput = page.getByRole('combobox', { name: '거래처' })
  await partnerInput.fill('1234567890')
  await expect(page.getByText('엘에이시스템에어')).toBeVisible()
  await page.getByText('엘에이시스템에어').last().click()
}

test.describe('1068 출고전표 헤더 자동채움 real-qa', () => {
  test('거래처 선택 시 헤더와 원장 전잔을 표시한다', async ({ page }) => {
    await openNewSalesSlip(page)

    await selectMockPartner(page)

    await expect(page.getByTestId('slip-customer-tel')).toHaveValue('02-1234-5678')
    await expect(page.getByTestId('slip-customer-address')).toHaveValue('서울특별시 강남구 테헤란로 152 삼성빌딩 8층')
    await expect(page.getByTestId('slip-customer-representative')).toHaveValue('이엘에이')
    await expect(page.getByTestId('slip-partner-note')).toHaveText('납품 전 담당자 확인')
    await expect(page.getByTestId('slip-partner-manager')).toHaveText('박담당')
    await expect(page.getByTestId('slip-form-opening-balance')).toHaveText('4,250,000원')
    await expect(page.getByTestId('slip-form-closing-balance')).toHaveText('저장 후 산출')

    await page.screenshot({ path: path.join(SHOTS, 'partner-header-real-qa.png'), fullPage: true })
  })

  test('accounting 장애는 조회 실패로 구별되고 전표 입력 화면은 열린다', async ({ page }) => {
    await openNewSalesSlip(page, '?mockAccountingFailure=1')
    await selectMockPartner(page)
    await expect(page.getByTestId('slip-form-opening-balance')).toHaveText('조회 실패')
    await expect(page.getByTestId('slip-form-closing-balance')).toHaveText('저장 후 산출')
    await expect(page.getByRole('button', { name: '저장' })).toBeVisible()
    await page.screenshot({ path: path.join(SHOTS, 'accounting-failure-real-qa.png'), fullPage: true })
  })

  test('거래처 없는 전표도 헤더가 깨지지 않는다', async ({ page }) => {
    await openNewSalesSlip(page)
    await expect(page.getByTestId('slip-form-opening-balance')).toHaveText('거래처 없음')
    await expect(page.getByTestId('slip-form-closing-balance')).toHaveText('저장 후 산출')
    await page.screenshot({ path: path.join(SHOTS, 'partnerless-real-qa.png'), fullPage: true })
  })
})
