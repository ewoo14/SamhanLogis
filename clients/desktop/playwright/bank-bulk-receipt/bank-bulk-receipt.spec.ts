/**
 * E3 S4c — 입출금내역 다중선택 → 벌크 입금보고서 생성 mock 회귀 가드.
 */
import { test, expect, type Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'node:url'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const RENDERER_DIR = path.resolve(__dirname, '../../src/renderer')

function readRendererSource(relativePath: string): string {
  return fs.readFileSync(path.join(RENDERER_DIR, relativePath), 'utf8')
}

function cssRule(source: string, selector: string): string {
  const match = source.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([\\s\\S]*?)\\}`))
  expect(match, `${selector} CSS rule`).toBeTruthy()
  return match![1]
}

function mockPerms(perms: Array<{ pageCode: string; view?: boolean; edit?: boolean }>): string {
  return Buffer.from(JSON.stringify(perms), 'utf8').toString('base64')
}

async function openBankTransactions(page: Page, extra = '') {
  await page.goto(`${BASE_URL}/#/accounting/bank-transactions?mockRole=MASTER${extra}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('header-page-title')).toContainText('입출금 내역')
  await page.locator('input[type="date"]').nth(2).fill('2026-06-01')
  await page.locator('input[type="date"]').nth(3).fill('2026-06-30')
  await page.getByRole('button', { name: '조회' }).click()
  await expect(page.locator('.bank-transaction-table')).toContainText('삼한상사 운임 입금')
}

test.describe('E3 S4c bank bulk receipt', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('source guard: 공용 danger 배너와 S4c 선택 UI는 고대비·고정 레이아웃 계약을 지킨다', () => {
    const globalCss = readRendererSource('styles/global.css')
    const dangerBanner = cssRule(globalCss, '.danger-banner')
    expect(dangerBanner).toContain('border: 1px solid var(--color-danger-300)')
    expect(dangerBanner).toContain('background: var(--color-danger-50)')
    expect(dangerBanner).toContain('color: var(--color-danger-800)')

    const blockingWarning = cssRule(globalCss, '.bank-transaction-blocking-warning')
    expect(blockingWarning).toContain('border: 1px solid var(--color-danger-300)')
    expect(blockingWarning).toContain('background: var(--color-danger-50)')
    expect(blockingWarning).toContain('color: var(--color-danger-800)')

    const selectCheckbox = cssRule(globalCss, ".bank-transaction-select-cell input[type='checkbox']")
    expect(selectCheckbox).toContain('width: 16px')
    expect(selectCheckbox).toContain('height: 16px')
    expect(selectCheckbox).toContain('accent-color: var(--color-brand-600)')

    const pageSource = readRendererSource('routes/BankTransactionPage.tsx')
    expect(pageSource).toContain('tableLayout="fixed"')
    expect(pageSource).toContain("fontVariantNumeric: 'tabular-nums'")
  })

  test('source guard: 입금보고서 모달은 제출 중 헤더 X 닫힘을 차단한다', () => {
    const modalSource = readRendererSource('routes/BankDepositReceiptModal.tsx')
    expect(modalSource).toContain('closeOnBackdropClick={!submitting}')
    expect(modalSource).toContain('closeOnEsc={!submitting}')
    expect(modalSource).toContain('hideCloseButton={submitting}')
  })

  test('다중선택 후 BANK_LINKED 입금보고서를 생성하고 선택행을 REFLECTED로 전이한다', async ({ page }) => {
    await openBankTransactions(page)

    await page.getByTestId('bank-transaction-select-mock-bank-20260623-001').check()
    await page.getByTestId('bank-transaction-select-mock-bank-20260624-004').check()

    await expect(page.getByTestId('bank-transaction-bulk-bar')).toContainText('선택 2건')
    await expect(page.getByTestId('bank-transaction-bulk-bar')).toContainText('합산 4,000,000원')
    // #832: 시드 통장거래(입금자명 삼한상사)의 매칭 거래처를 실재 master P-2026-0001(삼한공조 A)로 정합화.
    await expect(page.getByTestId('bank-transaction-bulk-bar')).toContainText('삼한공조 A')

    await page.getByTestId('bank-transaction-create-receipt').click()
    await expect(page.getByRole('dialog', { name: '입금보고서 생성' })).toBeVisible()
    await expect(page.getByTestId('bank-deposit-receipt-transaction-date')).toHaveValue('2026-06-24')
    await page.getByTestId('bank-deposit-receipt-memo').fill('S4c 벌크 입금보고서')
    await page.getByTestId('bank-deposit-receipt-confirm').click()

    await expect(page.getByTestId('bank-transaction-toast')).toContainText(/입금보고서를 생성했습니다/)
    const slipNo = await page.getByTestId('bank-transaction-toast').textContent()
    const slipMatch = slipNo?.match(/\d{4}\/\d{2}\/\d{2}-\d+/)
    expect(slipMatch?.[0]).toBeTruthy()

    // #897 W5 적대검증 fix로 전표번호 배지는 선택 셀(92→56px 침범 결함)에서 표 아래
    // 상세 패널로 이동했다(BankTransactionDetailPanel). 존재 확인이 아니라 상세를 열어
    // 실제 전표번호 값을 대조한다 — 두 선택행 모두 발급된 전표에 연결됐는지가 이 스펙의 핵심 단정이다.
    await page.getByTestId('bank-transaction-detail-toggle-mock-bank-20260623-001').click()
    await expect(page.getByTestId('bank-transaction-detail-cash-receipt-slip-mock-bank-20260623-001')).toContainText(slipMatch![0])

    await page.getByTestId('bank-transaction-detail-toggle-mock-bank-20260624-004').click()
    await expect(page.getByTestId('bank-transaction-detail-cash-receipt-slip-mock-bank-20260624-004')).toContainText(slipMatch![0])

    await expect(page.getByTestId('bank-transaction-select-mock-bank-20260623-001')).toBeDisabled()
    await expect(page.getByTestId('bank-transaction-select-mock-bank-20260624-004')).toBeDisabled()
  })

  test('거래처가 혼재되면 경고를 표시하고 생성 버튼을 비활성화한다', async ({ page }) => {
    await openBankTransactions(page)

    await page.getByTestId('bank-transaction-select-mock-bank-20260624-005').check()
    await page.getByTestId('bank-transaction-select-mock-bank-20260624-006').check()

    await expect(page.getByTestId('bank-transaction-mixed-partner-warning')).toContainText('동일 거래처')
    await expect(page.getByTestId('bank-transaction-create-receipt')).toBeDisabled()
  })

  test('생성 액션은 accounting.cash-receipts update 권한으로 게이팅한다', async ({ page }) => {
    const perms = encodeURIComponent(mockPerms([
      { pageCode: 'accounting.bank-matching', view: true, edit: true },
      { pageCode: 'accounting.cash-receipts', view: true, edit: false },
    ]))
    await openBankTransactions(page, `&mockPerms=${perms}`)

    await expect(page.getByTestId('bank-transaction-select-mock-bank-20260623-001')).toHaveCount(0)
    await expect(page.getByText('입금보고서 생성 권한이 없습니다')).toBeVisible()
    await expect(page.getByTestId('bank-transaction-create-receipt')).toBeDisabled()
  })
})
