/**
 * cash-receipt-form.spec.ts
 *
 * 입금보고서 S4b 작성폼/상세/편집 mock 회귀 가드.
 */
import { test, expect, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const CONFIRMED_MANUAL_ID = '00000000-0000-4000-8000-000000000717'
const BANK_LINKED_ID = '00000000-0000-4000-8000-000000000711'

async function createDraftReceipt(page: Page, suffix: string): Promise<string> {
  await page.goto(`${BASE_URL}/#/accounting/admin/cash-receipts/new?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
  await page.getByLabel('거래처명').fill(`S4b ${suffix} 거래처`)
  await page.getByLabel('거래처 코드').fill(`P-S4B-${suffix}`)
  await page.getByLabel('사업자번호').fill('111-22-33333')
  await page.getByLabel('입금 행 1 금액').fill('123000')
  await page.getByLabel('금액', { exact: true }).fill('123000')
  await page.getByLabel('적요', { exact: true }).fill(`S4b ${suffix} 입금`)
  await page.getByRole('button', { name: '저장' }).click()
  await expect(page).toHaveURL(/\/accounting\/admin\/cash-receipts\/00000000-0000-4000-8000-/)
  return page.url()
}

test.describe('입금보고서 작성폼 + 상세/편집 (E3 S4b)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('작성: 프리필·검증·DRAFT 생성 후 상세 이동', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/accounting/admin/cash-receipts/new?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('h3').filter({ hasText: '입금보고서 작성' })).toBeVisible()
    await expect(page.getByLabel('거래일')).toHaveValue(/\d{4}-\d{2}-\d{2}/)
    await expect(page.getByLabel('차변 계정')).toHaveValue('102')
    await expect(page.getByLabel('대변 계정')).toHaveValue('110')

    await page.getByRole('button', { name: '저장' }).click()
    await expect(page.getByText('금액은 0보다 커야 합니다.')).toBeVisible()

    await page.getByLabel('거래처명').fill('S4b 수기 거래처')
    await page.getByLabel('거래처 코드').fill('P-S4B-001')
    await page.getByLabel('사업자번호').fill('111-22-33333')
    await page.getByLabel('입금 행 1 금액').fill('123000')
    await page.getByLabel('금액', { exact: true }).fill('123000')
    await page.getByLabel('적요', { exact: true }).fill('S4b 수기 입금')
    await page.getByRole('button', { name: '저장' }).click()

    await expect(page).toHaveURL(/\/accounting\/admin\/cash-receipts\/00000000-0000-4000-8000-/)
    await expect(page.locator('h3').filter({ hasText: /\d{4}\/\d{2}\/\d{2}-\d+/ })).toBeVisible()
    await expect(page.getByText('S4b 수기 거래처')).toBeVisible()
    await expect(page.getByText('수기 입금', { exact: true })).toBeVisible()
  })

  test('상세: 필드·목록 복귀·DRAFT 액션 노출', async ({ page }) => {
    await createDraftReceipt(page, 'detail')

    await expect(page.locator('h3').filter({ hasText: /\d{4}\/\d{2}\/\d{2}-\d+/ })).toBeVisible()
    await expect(page.getByText('S4b detail 거래처')).toBeVisible()
    await expect(page.getByRole('button', { name: '편집' })).toBeEnabled()
    await expect(page.getByRole('button', { name: '확정' })).toBeEnabled()
    await expect(page.getByRole('button', { name: '삭제' })).toBeEnabled()

    await page.getByRole('button', { name: '목록' }).click()
    await expect(page).toHaveURL(/\/accounting\/admin\/cash-receipts(?:\?|$)/)
  })

  test('편집: DRAFT hydrate 후 PATCH 저장', async ({ page }) => {
    const detailUrl = await createDraftReceipt(page, 'edit')
    await page.goto(`${detailUrl}/edit?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('h3').filter({ hasText: '입금보고서 편집' })).toBeVisible()
    await expect(page.getByLabel('거래처명')).toHaveValue('S4b edit 거래처')
    await page.getByLabel('입금 행 1 금액').fill('330000')
    await page.getByLabel('금액', { exact: true }).fill('330000')
    await page.getByLabel('적요', { exact: true }).fill('S4b 편집 저장')
    await page.getByRole('button', { name: '저장' }).click()

    await expect(page).toHaveURL(/\/accounting\/admin\/cash-receipts\/00000000-0000-4000-8000-/)
    await expect(page.getByText('330,000')).toBeVisible()
    await expect(page.getByText('S4b 편집 저장')).toBeVisible()
  })

  test('BANK_LINKED: 상세 편집 비활성 + 직접 edit 진입 read-only', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/accounting/admin/cash-receipts/${BANK_LINKED_ID}?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })

    // exact: true — 상세 aria-describedby 사유 span("통장연계 입금보고서는 수정할 수 없습니다…")과의 strict-mode 2중 매칭 회피(Kind 배지만 매칭).
    await expect(page.getByText('통장연계', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '편집 불가' })).toBeDisabled()
    await expect(page.getByRole('button', { name: /^편집$/ })).toHaveCount(0)

    await page.goto(`${BASE_URL}/#/accounting/admin/cash-receipts/${BANK_LINKED_ID}/edit?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('통장연계 입금보고서는 수정할 수 없습니다. 취소 후 다시 생성하세요.')).toBeVisible()
    await expect(page.getByRole('button', { name: '저장' })).toBeDisabled()
  })

  test('CONFIRMED: 직접 edit 진입 editable + 역분개 재게시 경고', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/accounting/admin/cash-receipts/${CONFIRMED_MANUAL_ID}/edit?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('h3').filter({ hasText: '입금보고서 편집' })).toBeVisible()
    await expect(page.getByText('확정된 입금보고서를 수정하면 기존 분개가 역분개되고 새 분개로 재게시됩니다.')).toBeVisible()
    await expect(page.getByLabel('입금 행 1 금액')).toBeEnabled()
    await expect(page.getByLabel('거래일')).toBeEnabled()
    await expect(page.getByLabel('적요', { exact: true })).toBeEnabled()
    await expect(page.getByRole('button', { name: '저장' })).toBeEnabled()

    await page.getByLabel('입금 행 1 금액', { exact: true }).fill('880000')
    await page.getByLabel('금액', { exact: true }).fill('880000')
    await page.getByLabel('적요', { exact: true }).fill('S4b 확정 수정 재게시')
    await page.getByRole('button', { name: '저장' }).click()

    await expect(page).toHaveURL(new RegExp(`/accounting/admin/cash-receipts/${CONFIRMED_MANUAL_ID}`))
    await expect(page.getByText('880,000')).toBeVisible()
    await expect(page.getByText('S4b 확정 수정 재게시')).toBeVisible()
  })

  test('확정: DRAFT → CONFIRMED', async ({ page }) => {
    page.on('dialog', (dialog) => dialog.accept())
    await createDraftReceipt(page, 'confirm')

    await page.getByRole('button', { name: '확정' }).click()
    await expect(page.getByText('확정')).toBeVisible()
    await expect(page.getByRole('button', { name: '취소' })).toBeVisible()
  })
})
