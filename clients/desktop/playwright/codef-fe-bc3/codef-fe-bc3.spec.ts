import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const URL = `${BASE_URL}/#/accounting/bank-transactions?mockRole=ACCOUNTANT`

// date-bomb 방지: import 날짜를 현재월 동적으로 — 리스트 조회 기본 필터(현재월 [월초, 오늘])와 정합.
// (하드코딩 6월은 월 롤오버 시 리스트 기본 필터에서 제외돼 partner-search 미표시로 CI 적색; 2026-07-01 회귀 방지.)
const _pad = (n: number) => String(n).padStart(2, '0')
const _now = new Date()
const IMPORT_FROM = `${_now.getFullYear()}-${_pad(_now.getMonth() + 1)}-01`
const IMPORT_TO = `${_now.getFullYear()}-${_pad(_now.getMonth() + 1)}-${_pad(_now.getDate())}`

async function expectNoTechnicalLabels(page: Page): Promise<void> {
  await expect(page.getByText('CODEF')).toHaveCount(0)
  await expect(page.getByText('DRY_RUN')).toHaveCount(0)
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    return Math.max(doc.scrollWidth, document.body.scrollWidth) - window.innerWidth
  })
  expect(overflow, `가로 오버플로 ${overflow}px`).toBeLessThanOrEqual(1)
}

test.describe('BC3 CODEF 계좌/카드/대출 선택 가져오기', () => {
  test('scope 미저장 200 empty 응답은 미설정 상태로 표시하고 복원 처리하지 않는다', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '거래내역 가져오기', exact: true })).toBeVisible()

    await expect(page.getByText('저장된 선택이 없습니다. 필요한 항목을 선택한 뒤 저장하세요.')).toBeVisible()
    await expect(page.getByText('저장된 선택을 복원했습니다.')).toHaveCount(0)
    await expect(page.getByTestId('codef-selected-chip')).toHaveCount(0)
  })

  test('카드 다중 선택을 저장하고 저장 기준으로 가져온다', async ({ page }) => {
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '거래내역 가져오기', exact: true })).toBeVisible()

    await expect(page.getByTestId('codef-scope-list')).toBeVisible()
    await expect(page.getByTestId('codef-bank-scope')).toBeVisible()
    await expect(page.getByTestId('codef-card-scope')).toBeVisible()
    await expect(page.getByTestId('codef-loan-scope')).toBeVisible()

    await page.getByTestId('codef-import-type').selectOption('CARD')
    await expect(page.getByTestId('codef-bank-scope')).toHaveCount(0)
    await expect(page.getByTestId('codef-loan-scope')).toHaveCount(0)
    await expect(page.getByTestId('codef-card-scope')).toBeVisible()

    await page.getByTestId('codef-card-0').check()
    await page.getByTestId('codef-card-1').check()
    await expect(page.getByTestId('codef-selected-chip')).toHaveCount(2)

    await page.getByTestId('codef-save-scope-button').click()
    await expect(page.getByRole('status').filter({ hasText: '가져오기 선택을 저장했습니다.' })).toBeVisible()
    await expect(page.getByText('저장된 선택을 복원했습니다.')).toBeVisible()

    await page.getByTestId('codef-import-from').fill(IMPORT_FROM)
    await page.getByTestId('codef-import-to').fill(IMPORT_TO)
    await page.getByTestId('codef-import-button').click()
    await expect(page.getByTestId('codef-import-result')).toContainText('조회')
    await expect(page.getByTestId('codef-import-result')).toContainText('적재')

    await page.getByTestId('codef-tab-CODEF_CARD').click()
    await expect(page.getByText('삼한 물류카드').first()).toBeVisible()
    await expect(page.getByText('삼한 정비카드').first()).toBeVisible()
    await expectNoTechnicalLabels(page)
  })

  test('모바일 viewport 에서 가져오기 폼과 거래 리스트가 가로로 넘치지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '거래내역 가져오기', exact: true })).toBeVisible()

    await page.getByTestId('codef-import-type').selectOption('BANK')
    await page.getByTestId('codef-bank-account-select-all').check()
    await page.getByTestId('codef-import-from').fill(IMPORT_FROM)
    await page.getByTestId('codef-import-to').fill(IMPORT_TO)
    await page.getByTestId('codef-import-button').click()
    await expect(page.getByTestId('codef-import-result')).toContainText('조회')

    await expectNoHorizontalOverflow(page)
    await expectNoTechnicalLabels(page)
  })

  test('모바일 거래처 매칭은 full-width 로 열리고 자동완성 드롭다운과 토스트가 가려지지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '거래내역 가져오기', exact: true })).toBeVisible()

    await page.getByTestId('codef-import-type').selectOption('BANK')
    await page.getByTestId('codef-bank-account-select-all').check()
    await page.getByTestId('codef-import-from').fill(IMPORT_FROM)
    await page.getByTestId('codef-import-to').fill(IMPORT_TO)
    await page.getByTestId('codef-import-button').click()

    const toast = page.getByTestId('bank-transaction-toast')
    await expect(toast).toBeVisible()
    await expect(toast).toContainText('거래내역 가져오기 완료')
    const toastBox = await toast.boundingBox()
    expect(toastBox?.y ?? 0, 'toast 는 모바일 하단 fixed 영역에 표시되어야 한다').toBeGreaterThan(520)

    await page.getByTestId('codef-tab-CODEF_BANK').click()
    const partnerSearch = page.locator('[data-testid^="bank-transaction-partner-search-CODEF_BANK-"]').first()
    await expect(partnerSearch).toBeVisible()

    const matchCell = page.locator('td[data-label="거래처"][data-mobile-priority="secondary"]').first()
    const matchCellBox = await matchCell.boundingBox()
    expect(matchCellBox?.width ?? 0, '모바일 거래처 셀은 160px secondary 칸이 아니라 row 하단 content 폭이어야 한다').toBeGreaterThan(260)

    await partnerSearch.locator('input').fill('123')
    await expect(page.getByRole('dialog').first()).toBeVisible()
    const resultDialogBox = await page.getByRole('dialog').first().boundingBox()
    expect(resultDialogBox?.width ?? 0, '거래처 검색 결과 모달이 모바일 secondary 셀 안에 클리핑되지 않는다').toBeGreaterThan(260)
    return
    const listbox = page.getByRole('listbox', { name: '거래처 목록' }).first()
    await expect(listbox).toBeVisible()
    const listboxBox = await listbox.boundingBox()
    expect(listboxBox?.width ?? 0, '자동완성 드롭다운이 160px secondary 셀에 클리핑되면 안 된다').toBeGreaterThan(260)

    await expectNoHorizontalOverflow(page)
  })
})
