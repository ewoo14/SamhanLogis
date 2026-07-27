/**
 * cash-receipt-list.spec.ts
 *
 * 입금보고서 목록(E3 S4a) mock 회귀 가드 + 단계별 캡처.
 * 회귀: 전표번호 상세 링크(S4b)·화면명 '입금보고서'(메뉴 정렬)·kind 3종 badge·구분 필터.
 * 저장 경로: docs/qa/727-cash-receipt-list/
 */
import { test, expect, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import * as path from 'path'
import * as fs from 'fs'
import { resolveMockQaShotsDir } from '../support/qa-screenshot-dir'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const QA_DIR = resolveMockQaShotsDir(path.resolve(__dirname, '../../../../docs/qa/727-cash-receipt-list'))

async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(QA_DIR, { recursive: true })
  await page.screenshot({ path: path.join(QA_DIR, name), fullPage: true })
}

test.describe('입금보고서 목록 (E3 S4a)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('목록·kind badge·전표번호 상세 링크·구분 필터', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/accounting/admin/cash-receipts?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })

    // 화면명 '입금보고서'(메뉴 라벨과 정렬 — 구 '현금 입금')
    await expect(page.getByTestId('header-page-title')).toContainText('입금보고서')
    await expect(page.getByTestId('cash-receipt-list-page')).toBeVisible()

    // 시드 3종 kind 전부 노출 + 전표번호
    const table = page.getByTestId('cash-receipt-list-table')
    const slip = page.getByTestId('cash-receipt-slip-2026/05/19-3')
    await expect(slip).toBeVisible()
    // S4b: 전표번호는 상세 페이지로 이동하는 링크.
    await expect(slip).toHaveAttribute('href', /\/accounting\/admin\/cash-receipts\/00000000-0000-4000-8000-/)
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
