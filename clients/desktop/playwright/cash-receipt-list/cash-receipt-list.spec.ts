/**
 * cash-receipt-list.spec.ts
 *
 * 입금보고서 목록(E3 S4a) mock 회귀 가드 + 단계별 캡처.
 * 회귀: 전표번호 plain text(dead-link fix)·화면명 '입금보고서'(메뉴 정렬)·kind 3종 badge·구분 필터.
 * 저장 경로: docs/qa/727-cash-receipt-list/
 */
import { test, expect, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import * as path from 'path'
import * as fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const QA_DIR = path.resolve(__dirname, '../../../../docs/qa/727-cash-receipt-list')

async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(QA_DIR, { recursive: true })
  await page.screenshot({ path: path.join(QA_DIR, name), fullPage: true })
}

test.describe('입금보고서 목록 (E3 S4a)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('목록·kind badge·전표번호 plain text·구분 필터', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/accounting/admin/cash-receipts?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })

    // 화면명 '입금보고서'(메뉴 라벨과 정렬 — 구 '현금 입금')
    await expect(page.getByTestId('header-page-title')).toContainText('입금보고서')
    await expect(page.getByTestId('cash-receipt-list-page')).toBeVisible()

    // 시드 3종 kind 전부 노출 + 전표번호
    const table = page.getByTestId('cash-receipt-list-table')
    const slip = page.getByTestId('cash-receipt-slip-2026/05/19-3')
    await expect(slip).toBeVisible()
    // 회귀 가드: 전표번호는 링크(<a>)가 아닌 plain text(상세 링크는 S4b)
    await expect(slip.locator('xpath=ancestor::a')).toHaveCount(0)
    await expect(table).toContainText('입금보고서')
    await expect(table).toContainText('수기 입금')
    await expect(table).toContainText('통장연계')
    await shot(page, '01-list-all-kinds.png')

    // 구분 필터(통장연계 BANK_LINKED) → 검색: 세진산업만 남고 삼한공조(DEPOSIT_REPORT) 제외
    await page.getByTestId('cash-receipt-filter-kind').selectOption('BANK_LINKED')
    await page.getByRole('button', { name: '검색' }).click()
    await expect(table).toContainText('세진산업')
    await expect(table).not.toContainText('삼한공조')
    await shot(page, '02-filter-bank-linked.png')
  })
})
