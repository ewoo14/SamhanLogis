import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const URL = `${BASE_URL}/#/accounting/bank-transactions?mockRole=ACCOUNTANT`

// date-bomb 방지: import 날짜를 현재월 동적으로 — 리스트 조회 기본 필터(현재월 [월초, 오늘])와 정합.
// (하드코딩 6월은 월 롤오버 시 리스트 기본 필터에서 제외돼 partner-search 미표시로 CI 적색; 2026-07-01 회귀 방지.)
const _pad = (n: number) => String(n).padStart(2, '0')
const _now = new Date()
const IMPORT_FROM = `${_now.getFullYear()}-${_pad(_now.getMonth() + 1)}-01`
const IMPORT_TO = `${_now.getFullYear()}-${_pad(_now.getMonth() + 1)}-${_pad(_now.getDate())}`

/**
 * #897 컬럼 계층화로 법인카드/승인번호/대출명은 목록 열이 아니라 상세 패널
 * (BankTransactionDetailPanel) 전용이 됐다. 이 스펙이 원래 검증하던 업무 사실 —
 * "카드 탭에는 카드 고유 정보가, 대출 탭에는 대출 고유 정보가 표시되고 서로 섞이지
 * 않는다" — 은 그대로 유지하되, 확인 경로를 상세 패널 값 대조로 바꾼다.
 *
 * ALL scope CODEF import(mock)가 생성하는 행은 결정적이다(clients/desktop/src/
 * renderer/api/mock.ts mockCodefCardRows/mockCodefLoanRows — cardRefs/loanRefs 는
 * MOCK_CODEF_CARDS/MOCK_CODEF_LOANS 순서 그대로, externalRef = `CODEF-{CARD|LOAN}-
 * ${to}-{index+1 두자리}-001`, 카드 승인번호 = `CARD-{to 압축}-{index+1 두자리}-001`).
 * MOCK_CODEF_CARDS[0] = '삼한 물류카드', MOCK_CODEF_LOANS[0] = '운전자금 대출' 이므로
 * 이 공식을 그대로 재현해 특정 행을 정확히 짚고 상세 패널의 dt/dd 값을 대조한다
 * (존재 확인이 아니라 값 일치 — 반대 탭 필드가 섞여 표시되지 않는지도 함께 확인).
 */
const IMPORT_TO_COMPACT = IMPORT_TO.replace(/-/g, '')
const CARD_NAME = '삼한 물류카드' // MOCK_CODEF_CARDS[0].ref
const CARD_EXTERNAL_REF = `CODEF-CARD-${IMPORT_TO}-01-001`
const CARD_APPROVAL_ID = `CARD-${IMPORT_TO_COMPACT}-01-001`
const LOAN_NAME = '운전자금 대출' // MOCK_CODEF_LOANS[0].ref
const LOAN_EXTERNAL_REF = `CODEF-LOAN-${IMPORT_TO}-01-001`

/** `<dl>` 안에서 dtLabel 과 정확히 일치하는 dt 바로 다음 dd(값)를 찾는다(그리드 배치라도 DOM 상 인접 형제). */
function detailFieldValue(detail: import('@playwright/test').Locator, dtLabel: string) {
  return detail.locator(`xpath=.//dt[normalize-space(text())="${dtLabel}"]/following-sibling::dd[1]`)
}

async function visibleTextHasNoUuid(page: Page): Promise<void> {
  const uuids = await page.evaluate(() => {
    const uuidRegex = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const found: string[] = []
    let node: Node | null
    while ((node = walker.nextNode())) {
      const parent = node.parentElement
      if (!parent) continue
      if (['script', 'style'].includes(parent.tagName.toLowerCase())) continue
      const matches = (node.textContent ?? '').match(uuidRegex)
      if (matches) found.push(...matches)
    }
    return found
  })
  expect(uuids, `화면에 UUID가 노출됨: ${uuids.join(', ')}`).toHaveLength(0)
}

test.describe('CODEF FE BC2 거래내역 import + source 탭 + 매칭', () => {
  test('거래내역 가져오기 후 계좌/카드/대출 탭과 매칭 정책을 표시한다', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '입출금 내역', exact: true }).last()).toBeVisible()
    await expect(page.getByRole('heading', { name: '거래내역 가져오기', exact: true })).toBeVisible()

    await expect(page.getByTestId('codef-import-type')).toBeVisible()
    await page.getByTestId('codef-import-type').selectOption('ALL')
    await page.getByTestId('codef-import-from').fill(IMPORT_FROM)
    await page.getByTestId('codef-import-to').fill(IMPORT_TO)
    // [#825 S5] 빈 선택 목록은 전체로 폴백하지 않는다. BC2의 전체 조회 의도를
    // 명시적인 ALL 범위로 고정해 import/source 탭 계약만 검증한다.
    await page.getByTestId('codef-all-scope-chip').click()
    await page.getByTestId('codef-import-button').click()

    await expect(page.getByTestId('codef-import-result')).toContainText('조회')
    await expect(page.getByTestId('codef-import-result')).toContainText('적재')
    await expect(page.getByLabel('CSV 파일')).toHaveCount(0)
    await expect(page.getByTestId('bank-transaction-file')).toHaveCount(0)
    await expect(page.getByTestId('bank-transaction-import')).toHaveCount(0)
    await expect(page.getByTestId('bank-transaction-import-result')).toHaveCount(0)
    await expect(page.getByTestId('codef-tab-CSV_IMPORT')).toHaveCount(0)
    await expect(page.getByTestId('codef-tab-CODEF_BANK')).toBeVisible()
    await expect(page.getByTestId('codef-tab-CODEF_CARD')).toBeVisible()
    await expect(page.getByTestId('codef-tab-CODEF_LOAN')).toBeVisible()
    await expect(page.getByTestId('codef-tab-CODEF_BANK')).toHaveText('계좌')
    await expect(page.getByTestId('codef-tab-CODEF_CARD')).toHaveText('카드')
    await expect(page.getByTestId('codef-tab-CODEF_LOAN')).toHaveText('대출')
    await expect(page.getByText('CODEF')).toHaveCount(0)
    // #897 — 법인카드/승인번호/대출명은 목록 열에서 상세 패널로 옮겨졌으므로 columnheader
    // 로는 어느 탭에서도 더 이상 존재하지 않는다(되돌리면 회귀 — 897-column-hierarchy 스펙 참고).
    await expect(page.getByRole('columnheader', { name: '법인카드' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: '승인번호' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: '대출명' })).toHaveCount(0)

    await page.getByTestId('codef-tab-CODEF_BANK').click()
    await expect(page.getByRole('columnheader', { name: '법인카드' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: '승인번호' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: '대출명' })).toHaveCount(0)

    await page.getByTestId('codef-tab-CODEF_CARD').click()
    await expect(page.getByRole('columnheader', { name: '법인카드' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: '승인번호' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: '대출명' })).toHaveCount(0)
    // 값 대조 — 카드 탭 행 상세를 열어 카드 고유 정보(법인카드/승인번호)가 실제로
    // 사용자에게 도달하고, 대출 고유 정보(대출명)는 섞여 표시되지 않는지 확인한다.
    const cardToggle = page.getByTestId(`bank-transaction-detail-toggle-${CARD_EXTERNAL_REF}`)
    await expect(cardToggle, `카드 행(${CARD_EXTERNAL_REF}) 토글을 찾을 수 없음 — mock import 공식과 어긋남(RED)`).toBeVisible()
    await cardToggle.click()
    const cardDetail = page.getByTestId(`bank-transaction-detail-${CARD_EXTERNAL_REF}`)
    await expect(cardDetail, 'I-B2 위반 — 카드 탭 상세 패널이 열리지 않음(법인카드/승인번호 도달 불가)').toBeVisible()
    await expect(detailFieldValue(cardDetail, '법인카드'), '카드 탭 상세의 법인카드 값이 어긋남').toContainText(CARD_NAME)
    await expect(detailFieldValue(cardDetail, '승인번호'), '카드 탭 상세의 승인번호 값이 어긋남').toContainText(CARD_APPROVAL_ID)
    await expect(detailFieldValue(cardDetail, '대출명'), '카드 행 상세에 대출명이 섞여 표시됨(#897 회귀)').toHaveText('—')
    await expect(page.getByText('삼한 물류카드').first()).toBeVisible()
    await expect(page.locator('[data-testid^="bank-transaction-partner-search-CODEF_CARD-"]').first()).toBeVisible()

    await page.getByTestId('codef-tab-CODEF_LOAN').click()
    await expect(page.getByRole('columnheader', { name: '법인카드' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: '승인번호' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: '대출명' })).toHaveCount(0)
    await expect(page.getByRole('note')).toContainText('대출 거래는 거래처 매칭 대상이 아닙니다')
    // 값 대조 — 대출 탭 행 상세를 열어 대출 고유 정보(대출명)가 실제로 도달하고,
    // 카드 고유 정보(법인카드/승인번호)는 섞여 표시되지 않는지 확인한다.
    const loanToggle = page.getByTestId(`bank-transaction-detail-toggle-${LOAN_EXTERNAL_REF}`)
    await expect(loanToggle, `대출 행(${LOAN_EXTERNAL_REF}) 토글을 찾을 수 없음 — mock import 공식과 어긋남(RED)`).toBeVisible()
    await loanToggle.click()
    const loanDetail = page.getByTestId(`bank-transaction-detail-${LOAN_EXTERNAL_REF}`)
    await expect(loanDetail, 'I-B2 위반 — 대출 탭 상세 패널이 열리지 않음(대출명 도달 불가)').toBeVisible()
    await expect(detailFieldValue(loanDetail, '대출명'), '대출 탭 상세의 대출명 값이 어긋남').toContainText(LOAN_NAME)
    await expect(detailFieldValue(loanDetail, '법인카드'), '대출 행 상세에 법인카드가 섞여 표시됨(#897 회귀)').toHaveText('—')
    await expect(detailFieldValue(loanDetail, '승인번호'), '대출 행 상세에 승인번호가 섞여 표시됨(#897 회귀)').toHaveText('—')
    await expect(page.getByText('운전자금 대출').first()).toBeVisible()
    await expect(page.locator('[data-testid^="bank-transaction-partner-search-CODEF_LOAN-"]')).toHaveCount(0)

    await visibleTextHasNoUuid(page)
    expect(pageErrors).toHaveLength(0)
  })
})
