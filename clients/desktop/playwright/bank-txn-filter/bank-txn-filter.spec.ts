/**
 * bank-txn-filter.spec.ts
 *
 * 입출금내역 계좌 필터 부분선택 유지(#726 라운드1 B1) mock 회귀 가드 + 단계별 캡처.
 * 회귀: 과거 effectiveBankTransactionLabels 가 저장값이 있으면 options 전체를 union 해
 * "계좌 N개만 보기"가 저장 직후 '계좌 전체'로 팽창하던 결함 → 저장값 as-is 복원으로 수정.
 *
 * 저장 경로: docs/qa/726-bank-txn-filter/
 *
 * #897 컬럼 계층화로 계좌 라벨(bankAccountLabel)이 목록 열에서 상세 패널로 옮겨졌다.
 * 이 스펙이 원래 검증하던 업무 사실 — "부분 선택이 저장 직후 전체로 팽창하지 않고,
 * 선택하지 않은 계좌의 거래는 실제로 화면에서 제외된다" — 은 그대로 유지하되, 행
 * 존재/부재는 여전히 목록에 남아있는 적요(description)로, 계좌 소속은 상세 패널을
 * 열어 값으로 대조한다(존재 확인이 아니라 값 일치).
 */
import { test, expect, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import * as path from 'path'
import * as fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const QA_DIR = path.resolve(__dirname, '../../../../docs/qa/726-bank-txn-filter')

// 시드(mock.ts MOCK_BANK_TRANSACTIONS, 2026-06) 중 계좌가 다른 두 거래 — 적요는 목록에
// 그대로 남아 행 식별자로 쓸 수 있고, 계좈 라벨(bankAccountLabel)은 상세 패널 전용이다.
const SHINHAN_EXTERNAL_REF = 'mock-bank-20260621-003' // 신한 777-888, 적요 '아로물류 B 수금'
const SHINHAN_DESCRIPTION = '아로물류 B 수금'
const SHINHAN_LABEL = '신한 777-888'
const KOOKMIN_EXTERNAL_REF = 'mock-bank-20260624-004' // 국민 123-456, 적요 '삼한상사 운임 입금'
const KOOKMIN_DESCRIPTION = '삼한상사 운임 입금'
const KOOKMIN_LABEL = '국민 123-456'

async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(QA_DIR, { recursive: true })
  await page.screenshot({ path: path.join(QA_DIR, name), fullPage: true })
}

/** `<dl>` 안에서 dtLabel 과 정확히 일치하는 dt 바로 다음 dd(값)를 찾는다. */
function detailFieldValue(detail: import('@playwright/test').Locator, dtLabel: string) {
  return detail.locator(`xpath=.//dt[normalize-space(text())="${dtLabel}"]/following-sibling::dd[1]`)
}

/**
 * 행 상세를 연다. 상세 패널은 화면에 한 번에 한 행만 펼쳐지므로(expandedRowKey 단일
 * 상태), 이미 열려 있는 행을 다시 클릭하면 오히려 접힌다 — 열려 있지 않을 때만 클릭한다.
 */
async function openBankTransactionDetail(page: Page, externalRef: string) {
  const detail = page.getByTestId(`bank-transaction-detail-${externalRef}`)
  if (!(await detail.isVisible().catch(() => false))) {
    await page.getByTestId(`bank-transaction-detail-toggle-${externalRef}`).click()
  }
  await expect(detail).toBeVisible()
  return detail
}

test.describe('입출금내역 계좌 필터 부분선택 유지(B1)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('부분 선택이 저장 직후 전체로 팽창하지 않고 유지·복원된다', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/accounting/bank-transactions?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('header-page-title')).toContainText('입출금 내역')

    // 기간을 mock 시드(6월)까지 확장해 거래가 목록에 보이도록 조회(기본 기간=당월이라 6월 시드가 가려짐)
    await page.locator('input[type="date"]').nth(2).fill('2026-06-01')
    await page.getByRole('button', { name: '조회' }).click()

    // 1) 초기: 계좌 필터 '계좌 전체' — 국민/신한 계좌 거래가 모두 보임(행 존재는 적요로,
    //    계좌 소속은 상세 패널 값 대조로 확인)
    const table = page.locator('.bank-transaction-table')
    const accountBtn = page.getByTestId('bank-transaction-account-filter-button')
    await expect(accountBtn).toContainText('계좌 전체')
    await expect(table).toContainText(SHINHAN_DESCRIPTION)
    await expect(table).toContainText(KOOKMIN_DESCRIPTION)
    const shinhanDetail = await openBankTransactionDetail(page, SHINHAN_EXTERNAL_REF)
    await expect(detailFieldValue(shinhanDetail, '계좌·카드·대출'), '신한 계좌 거래의 상세 계좌 라벨이 어긋남').toContainText(SHINHAN_LABEL)
    const kookminDetail = await openBankTransactionDetail(page, KOOKMIN_EXTERNAL_REF)
    await expect(detailFieldValue(kookminDetail, '계좌·카드·대출'), '국민 계좌 거래의 상세 계좌 라벨이 어긋남').toContainText(KOOKMIN_LABEL)
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
    // 부분 필터 실효: 국민 계좌 거래만 남고 신한 계좌 거래는 제외 — 행 자체가 사라짐(적요 기준)
    await expect(table).toContainText(KOOKMIN_DESCRIPTION)
    await expect(table).not.toContainText(SHINHAN_DESCRIPTION)
    await expect(
      page.getByTestId(`bank-transaction-detail-toggle-${SHINHAN_EXTERNAL_REF}`),
      '신한 계좌 필터 적용 후에도 신한 거래 행이 남아있음',
    ).toHaveCount(0)
    // 남은 행이 우연이 아니라 실제로 국민 계좌 소속인지 값 대조(다른 행이 남은 게 아님을 확인)
    const kookminDetailAfterFilter = await openBankTransactionDetail(page, KOOKMIN_EXTERNAL_REF)
    await expect(
      detailFieldValue(kookminDetailAfterFilter, '계좌·카드·대출'),
      '필터 후 남은 행의 상세 계좌 라벨이 국민이 아님',
    ).toContainText(KOOKMIN_LABEL)
    await shot(page, '04-after-save-partial-retained.png')

    // 5) 재오픈 → 부분 선택 상태 복원(옵션0 체크·전체선택 미체크)
    await accountBtn.click()
    await expect(page.getByTestId('bank-transaction-filter-option-0')).toBeChecked()
    await expect(page.getByTestId('bank-transaction-filter-select-all')).not.toBeChecked()
    await shot(page, '05-reopen-partial-restored.png')
  })
})
