/**
 * bank-txn-filter.spec.ts
 *
 * 입출금내역 계좌 필터 부분선택 유지(#726 라운드1 B1) mock 회귀 가드 + 단계별 캡처.
 * 회귀: 과거 effectiveBankTransactionLabels 가 저장값이 있으면 options 전체를 union 해
 * "계좌 N개만 보기"가 저장 직후 '계좌 전체'로 팽창하던 결함 → 저장값 as-is 복원으로 수정.
 *
 * 저장 경로: docs/qa/726-bank-txn-filter/
 */
import { test, expect, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import * as path from 'path'
import * as fs from 'fs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const QA_DIR = resolveQaShotsDir(path.resolve(__dirname, '../../../../docs/qa/726-bank-txn-filter'))

async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(QA_DIR, { recursive: true })
  await page.screenshot({ path: path.join(QA_DIR, name), fullPage: true })
}

test.describe('입출금내역 계좌 필터 부분선택 유지(B1)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('부분 선택이 저장 직후 전체로 팽창하지 않고 유지·복원된다', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/accounting/bank-transactions?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('header-page-title')).toContainText('입출금 내역')

    // 기간을 mock 시드(6월)까지 확장해 거래가 목록에 보이도록 조회(기본 기간=당월이라 6월 시드가 가려짐)
    await page.locator('input[type="date"]').nth(2).fill('2026-06-01')
    await page.getByRole('button', { name: '조회' }).click()

    // 1) 초기: 계좌 필터 '계좌 전체' — 국민/신한 계좌 거래가 모두 보임
    const table = page.locator('.bank-transaction-table')
    const accountBtn = page.getByTestId('bank-transaction-account-filter-button')
    await expect(accountBtn).toContainText('계좌 전체')
    await expect(table).toContainText('국민 123-456')
    await expect(table).toContainText('신한 777-888')
    await shot(page, '01-initial-all.png')

    // 2) 계좌 모달 열기 (기본 전체 선택)
    await accountBtn.click()
    await expect(page.getByTestId('bank-transaction-filter-options')).toBeVisible()
    await expect(page.getByTestId('bank-transaction-filter-select-all')).toBeChecked()
    await shot(page, '02-modal-open-all-checked.png')

    // 3) 전체선택 해제 후 첫 계좌만 선택(부분)
    await page.getByTestId('bank-transaction-filter-select-all').uncheck()
    await page.getByTestId('bank-transaction-filter-option-0').check()
    await shot(page, '03-partial-checked.png')

    // 4) 확인 → 저장. 회귀 가드: '계좌 전체'로 팽창하지 않고 '계좌 1개' 유지
    await page.getByTestId('bank-transaction-filter-confirm').click()
    await expect(accountBtn).toContainText('계좌 1개')
    await expect(accountBtn).not.toContainText('계좌 전체')
    // 부분 필터 실효: 국민 계좌 거래만 남고 신한 계좌 거래는 제외
    await expect(table).toContainText('국민 123-456')
    await expect(table).not.toContainText('신한 777-888')
    await shot(page, '04-after-save-partial-retained.png')

    // 5) 재오픈 → 부분 선택 상태 복원(옵션0 체크·전체선택 미체크)
    await accountBtn.click()
    await expect(page.getByTestId('bank-transaction-filter-option-0')).toBeChecked()
    await expect(page.getByTestId('bank-transaction-filter-select-all')).not.toBeChecked()
    await shot(page, '05-reopen-partial-restored.png')
  })
})
