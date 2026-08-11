import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5193'
const screenshotDir = resolveQaShotsDir(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../docs/qa/2026-08-11-dg1-s3-fix/screenshots'),
)

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(screenshotDir, name), fullPage: true })
}

async function installAuthMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const session = {
      token: 'playwright-token',
      userId: '00000000-0000-0000-0000-000000010001',
      role: 'MASTER',
      fullName: '오병승',
      partnerCode: 'P-MOCK-001',
    }
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => session,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  })
}

test('지출결의서 정산서 검색·선택은 isolated mock에서 결과와 refDocNo를 유지한다', async ({ page }) => {
  const apiBase = 'http://127.0.0.1:1'
  const leakedRequests: string[] = []
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(apiBase)) leakedRequests.push(`${request.method()} ${request.url()}`)
  })

  await page.goto(`${BASE_URL}/?mockRole=MASTER#/groupware/approvals/new`, {
    waitUntil: 'domcontentloaded',
  })
  await expect(page.locator('main.app-main')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('groupware-approval-create-template').selectOption({ label: '지출결의서' })
  await expect(page.getByRole('button', { name: '문서 참조 추가' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: '문서 참조 추가' }).click()

  const typeSelect = page.getByTestId('doc-ref-type-select').first()
  const searchInput = page.getByTestId('doc-ref-search-input').first()
  await typeSelect.selectOption({ label: '영업수수료 정산서' })
  await searchInput.fill('2026/08/11')

  const option = page.getByTestId('doc-ref-search-option').first()
  await expect(option).toContainText('2026/08/11-1', { timeout: 10_000 })
  await capture(page, '01-settlement-search-result.png')

  await option.click()
  await expect(page.getByTestId('attachment-chip')).toContainText('영업수수료 정산서')
  await expect(page.getByTestId('attachment-chip')).toContainText('2026/08/11-1')
  await expect(searchInput).toHaveCount(0)
  await capture(page, '02-settlement-selected.png')

  expect(leakedRequests).toEqual([])
})

test('선택한 정산서는 상세와 인쇄에서 업무 라벨·번호로 표시된다', async ({ page }) => {
  await installAuthMock(page)
  await page.goto(`${BASE_URL}/?mockRole=MASTER#/groupware/approvals/new`, {
    waitUntil: 'domcontentloaded',
  })
  await expect(page.locator('main.app-main')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('groupware-approval-create-template').selectOption({ label: '지출결의서' })
  await page.getByTestId('groupware-approval-create-title').fill('S3 정산서 소비자 표시 QA')

  const approverInput = page.getByTestId('approver-search-input')
  await approverInput.fill('김기철')
  await page.getByRole('listbox', { name: '결재자 검색 결과' }).getByRole('option').first().click()

  await page.getByTestId('dynamic-approval-field-expenseItem').fill('S3 정산서 참조')
  await page.getByTestId('dynamic-approval-field-amount').fill('1320000')
  await page.getByTestId('dynamic-approval-field-accountCode').selectOption({ label: '복리후생비' })
  await page.getByTestId('dynamic-approval-field-expenseDate').fill('2026-08-11')

  await page.getByRole('button', { name: '문서 참조 추가' }).click()
  await page.getByTestId('doc-ref-type-select').first().selectOption({ label: '영업수수료 정산서' })
  await page.getByTestId('doc-ref-search-input').first().fill('2026/08/11')
  const option = page.getByTestId('doc-ref-search-option').first()
  await expect(option).toContainText('2026/08/11-1', { timeout: 10_000 })
  await option.click()

  await page.getByTestId('groupware-approval-create-submit').click()
  await expect(page.getByTestId('groupware-approval-detail-no')).toBeVisible({ timeout: 15_000 })
  const detailAttachment = page.getByText('2026/08/11-1').last().locator('xpath=../../..')
  await expect(detailAttachment).toContainText('영업수수료 정산서')
  await expect(detailAttachment).toContainText('2026/08/11-1')
  await expect(detailAttachment.locator('a[href="#"]')).toHaveCount(0)
  await capture(page, '03-settlement-detail.png')

  await page.getByRole('button', { name: '인쇄 미리보기' }).click()
  await expect(page.getByLabel('결재문서 첨부')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByLabel('결재문서 첨부')).toContainText('영업수수료 정산서')
  await expect(page.getByLabel('결재문서 첨부')).toContainText('2026/08/11-1')
  await capture(page, '04-settlement-print.png')
})
