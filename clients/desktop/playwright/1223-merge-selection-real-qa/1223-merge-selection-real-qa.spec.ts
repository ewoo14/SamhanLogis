import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE_URL = process.env['AUDIT_BASE_URL']
if (!BASE_URL) throw new Error('AUDIT_BASE_URL is required')

const SHOTS = resolveQaShotsDir(path.resolve(process.cwd(), 'playwright/1223-merge-selection-real-qa'))

async function login(page: Page): Promise<void> {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await page.locator('input').nth(0).fill('dev_master')
  await page.locator('input').nth(1).fill(resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'))
  await page.getByRole('button', { name: '로그인', exact: true }).click()
  await page.waitForURL(/#\/$/, { timeout: 20_000 })
}

async function openOrders(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}#/sales/partner-orders`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('merge-convert-open')).toBeVisible()
  await expect(page.locator('[data-testid^="partner-order-select-"]').first()).toBeVisible()
}

async function capture(page: Page, name: string, provenance: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, name), fullPage: true })
  console.log(`[SHOT] ${name} — ${provenance}`)
}

test('목록 선택은 거래처·상태를 지키고 기존 무선택 흐름도 유지한다', async ({ page }) => {
  await login(page)
  await openOrders(page)

  const rows = page.locator('[data-testid^="partner-order-row-"]')
  const rowInfo = await rows.evaluateAll((elements) => elements.map((element) => {
    const checkbox = element.querySelector<HTMLInputElement>('input[type="checkbox"]')
    const cells = Array.from(element.querySelectorAll('td')).map((cell) => cell.textContent?.trim() ?? '')
    return {
      testId: element.getAttribute('data-testid'),
      disabled: checkbox?.disabled ?? true,
      partnerCode: cells[2] ?? '',
    }
  }))
  const eligible = rowInfo.filter((row) => !row.disabled)
  expect(eligible.length).toBeGreaterThanOrEqual(2)
  const samePartner = eligible.find((row, index) => eligible.slice(index + 1).some((candidate) => candidate.partnerCode === row.partnerCode))
  expect(samePartner).toBeTruthy()
  const secondSamePartner = eligible.find((row) => row.partnerCode === samePartner!.partnerCode && row.testId !== samePartner!.testId)
  expect(secondSamePartner).toBeTruthy()

  const firstCheckbox = page.getByTestId(`partner-order-select-${samePartner!.testId!.replace('partner-order-row-', '')}`)
  const secondCheckbox = page.getByTestId(`partner-order-select-${secondSamePartner!.testId!.replace('partner-order-row-', '')}`)
  await firstCheckbox.check()
  await secondCheckbox.check()
  await expect(firstCheckbox).toBeChecked()
  await expect(secondCheckbox).toBeChecked()
  await expect(page.getByTestId('merge-convert-selection-count')).toContainText('2')
  await capture(page, '01-two-orders-selected.png', '사용자는 주문서 관리 목록에서 병합할 주문의 체크박스를 직접 선택한다.')

  const differentPartner = eligible.find((row) => row.partnerCode !== samePartner!.partnerCode)
  expect(differentPartner).toBeTruthy()
  const differentCheckbox = page.getByTestId(`partner-order-select-${differentPartner!.testId!.replace('partner-order-row-', '')}`)
  await differentCheckbox.click()
  await expect(differentCheckbox).not.toBeChecked()
  await expect(page.getByTestId('merge-convert-selection-error')).toContainText('서로 다른 거래처')
  await capture(page, '02-different-partner-blocked.png', '사용자는 같은 목록에서 다른 거래처 주문을 추가로 고르려다 병합 제한 안내를 확인한다.')

  await page.getByTestId('merge-convert-open').click()
  await expect(page.getByTestId('merge-convert-dialog-body')).toBeVisible()
  await expect(page.getByTestId('merge-convert-irreversible-warning')).toContainText('2개 주문')
  await capture(page, '03-selected-orders-in-dialog.png', '사용자는 선택한 주문을 확인한 뒤 병합 전환 모달에서 거래처·후보를 검토한다.')

  await page.getByTestId('merge-convert-cancel').click()
  await expect(page.getByTestId('merge-convert-dialog-body')).toHaveCount(0)
  await firstCheckbox.uncheck()
  await secondCheckbox.uncheck()
  await page.getByTestId('merge-convert-open').click()
  await expect(page.getByTestId('merge-convert-dialog-body')).toBeVisible()
  await expect(page.getByTestId('merge-convert-partner-required')).toBeVisible()
  await capture(page, '04-no-selection-existing-flow.png', '사용자는 목록에서 주문을 고르지 않고 기존 병합 전환 버튼으로 거래처 우선 모달을 연다.')
})
