import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * bank-txn-columns-real-qa.spec.ts
 *
 * 개발책임자 지시 작업 B — 입출금 내역(`/accounting/bank-transactions`) 표에서
 * `소스`·`매칭상태` 2열을 없애 표 폭을 줄인다(1654 → 1474px).
 *
 * 🚨 실측(PM 사전 경고 검증, SONNET5 R2) — `GET /accounting/bank-transactions`
 * (전체/전체 상당, from=2019-01-01~to=2026-12-31) 로 직접 확인한 결과:
 *   source 분포:      CODEF_BANK 85 / CODEF_CARD 60 / CODEF_LOAN 40 (섞여 있음)
 *   matchStatus 분포:  UNREFLECTED 185 (현재 시드는 전부 미반영 — REFLECTED/FORCED 0건)
 * source 는 실측으로 "전체" 탭에서 행마다 값이 다름이 확인됐다 — 무조건 삭제하면
 * I-B1(정보 보존) 위반. matchStatus 는 현재 시드가 우연히 전부 UNREFLECTED 라 이
 * 시드만으로는 다르다는 게 실측되지 않지만, 코드상 `STATUS_TABS`(전체/미반영/반영/
 * 강제) 자체가 REFLECTED/FORCED 존재를 전제하고, `거래처` 열은 UNREFLECTED 만
 * 인터랙티브 검색창으로 보여줄 뿐 REFLECTED 와 FORCED 는 시각적으로 구분 불가하다
 * (`matchedPartnerDisplay` 가 matchStatus 무관하게 동일 렌더) — 실사용에서 반드시
 * 섞인다.
 *
 * 판단(선택한 수단) — 두 열을 "탭이 전체일 때만" 보존하는 조건부 컬럼으로 만든다.
 * 특정 탭으로 좁히면(그 값이 모든 행에 공통이라 열 자체가 중복 정보이므로) 열이
 * 사라져 표가 좁아지고, 전체 탭에서는 열이 남아 정보가 보존된다.
 *
 * 🚨 2026-07-26 개발책임자 결정("현행 유지 · #877 스펙을 고침") — I-B2 확인 경로 갱신.
 * 카드·대출 탭에 법인카드·승인번호·대출명 열을 되돌리는 안은 +160px 로 카드 탭 @1600 이
 * 다시 1336 vs 1278 로 폭 예산을 초과해 채택되지 않았다. 그 필드들은 #897(2f67d29bd)에서
 * 목록 열이 아닌 상세 패널(`BankTransactionDetailPanel`, 표 아래 전폭 `<section>`) 전용으로
 * 이미 이동했는데, 이 스펙은 그 이전 DOM(columnheader)을 그대로 단정해 드리프트돼 있었다
 * (eb7ba588e 조사 코멘트 "미수정 1건" — 개발책임자 결정 대기 상태였음). I-B2 가 원래
 * 증명하려던 것 — "그 필드들이 카드·대출 탭에서 사용자에게 도달한다" — 은 그대로 두고
 * 확인 경로만 상세 패널로 바꾼다: 실 API 로 독립적으로 조회한 참값과 토글 클릭 후 열리는
 * 상세 패널 dd 텍스트를 직접 대조한다(존재/개수 확인이 아니다 — 못 찾으면 RED, soft-pass 없음).
 *
 * 불변식:
 *   I-B1 — 소스/매칭상태 정보가 필요한 상태(각 탭=전체)에서는 열이 남아 도달 가능.
 *   I-B2 — 법인카드·승인번호(카드 탭)·대출명(대출 탭)은 상세 패널을 통해 실제 값까지
 *          사용자에게 도달 가능해야 하고, columnheader 로는 더 이상 존재하지 않아야 한다
 *          (#897 상세 패널 전용 이동이 확정 — 되돌리면 그것이 회귀) · mobilePriority 무회귀.
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5420'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const SHOTS = resolveQaShotsDir(path.resolve('../../docs/qa/877-sonnet-r2-mascot'))
fs.mkdirSync(SHOTS, { recursive: true })

async function installAuth(page: Page): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: 'dev_master', password: (resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')) }),
  })
  const d = (await res.json()).data
  await page.addInitScript((a) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token: a.token, userId: a.userId, role: a.role, fullName: a.displayName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, { token: d.token, userId: d.userId, role: d.role, displayName: d.displayName ?? 'dev_master' })
  // I-B2 값 대조(실 API 참값 vs 상세 패널 dd 텍스트)를 위해 토큰을 호출부에도 반환한다.
  return d.token as string
}

async function dismissUpdateModal(page: Page) {
  for (const label of ['닫기', '확인']) {
    const b = page.getByRole('button', { name: label })
    if (await b.count().catch(() => 0)) await b.first().click().catch(() => undefined)
  }
}

async function headerTexts(page: Page): Promise<string[]> {
  return page.locator('table thead th').allTextContents()
}

/** colgroup 의 <col style="width:Npx"> 합(px) — table-layout:fixed 표의 실제 렌더 폭과 직결. */
async function colWidthSum(page: Page): Promise<number> {
  return page.evaluate(() => {
    const cols = Array.from(document.querySelectorAll('table colgroup col'))
    return cols.reduce((sum, col) => {
      const w = (col as HTMLElement).style.width
      const n = w ? parseInt(w, 10) : 0
      return sum + (Number.isFinite(n) ? n : 0)
    }, 0)
  })
}

async function clickSourceTab(page: Page, testId: string) {
  await page.getByTestId(testId).click()
  await page.waitForTimeout(300)
}

async function clickStatusTab(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).click()
  await page.waitForTimeout(300)
}

/**
 * 실 시드는 2019~2026 전 구간에 걸쳐 있지만 목록 필터 기본값은 당월(오늘 기준)이라,
 * 오늘 날짜에 의존하면 카드/대출 실 행이 기본 필터 밖이라 화면에 아예 안 뜰 수 있다
 * (897-column-hierarchy.spec.ts 의 showBankRows 가 "오늘 날짜에 의존하지 않는다"고 명시한
 * 것과 동일 이유). 파일 상단 실측과 동일한 넓은 구간(2019-01-01~2026-12-31)으로 명시
 * 설정해 ground truth 행이 항상 화면에 뜨게 한다. CodefImportScopeForm 도 동일 라벨
 * (시작일/종료일) 입력을 갖고 있어 목록 필터는 항상 두 번째(.nth(1))다
 * (897-column-hierarchy.spec.ts:45-46 과 동일 관례 — 검증된 선택자를 그대로 재사용).
 */
async function widenListDateRange(page: Page) {
  await page.getByRole('textbox', { name: '시작일' }).nth(1).fill('2019-01-01')
  await page.getByRole('textbox', { name: '종료일' }).nth(1).fill('2026-12-31')
  await page.getByRole('button', { name: '조회', exact: true }).click()
  await page.waitForTimeout(400)
}

/** I-B2 값 대조용 실 API 행 형태 — 목록 응답 중 상세 패널 검증에 필요한 필드만 좁힌다. */
type BankApiRow = {
  externalRef: string
  source: string
  cardName?: string | null
  approvalId?: string | null
  loanName?: string | null
}

/**
 * 실 API 로 파일 상단 실측과 동일한 넓은 구간을 조회해 UI 와 독립적인 참값을 확보한다.
 * I-B2 는 이 참값과 상세 패널 dd 텍스트를 직접 대조해야 "값 대조"이지, 열림/존재만
 * 보면 존재·개수 확인에 그친다(이 슬라이스에서 897-column-hierarchy-real-qa.spec.ts 가
 * 이미 그런 soft-pass 로 거짓 green 을 낸 전례가 있다).
 */
async function fetchAllBankTransactionRows(token: string): Promise<BankApiRow[]> {
  const res = await fetch(
    `${API_BASE}/accounting/bank-transactions?from=2019-01-01&to=2026-12-31`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  const body = (await res.json()) as { data?: BankApiRow[] }
  return body.data ?? []
}

/** `<dl>` 안에서 dtLabel 과 정확히 일치하는 dt 바로 다음 dd(값)를 찾는다(그리드 배치라도 DOM 상 인접 형제). */
function detailFieldValue(detail: import('@playwright/test').Locator, dtLabel: string) {
  return detail.locator(`xpath=.//dt[normalize-space(text())="${dtLabel}"]/following-sibling::dd[1]`)
}

test.describe.serial('#877 작업B — 소스/매칭상태 조건부 컬럼(I-B1 정보 보존)', () => {
  test('전체/전체 — 두 열 모두 보존(정보 필요 상태)', async ({ page }) => {
    await installAuth(page)
    await page.goto(`${BASE_URL}/#/accounting/bank-transactions`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25_000 })
    await dismissUpdateModal(page)
    await expect(page.locator('table thead th')).not.toHaveCount(0, { timeout: 20_000 })

    const headers = await headerTexts(page)
    const baselineWidth = await colWidthSum(page)
    console.log('[B/ALL-ALL] headers=' + JSON.stringify(headers) + ' colWidthSum=' + baselineWidth)
    await page.locator('table').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(SHOTS, '10-columns-all-all.png'), fullPage: false })

    expect(headers, 'I-B1 위반 — 전체/전체 탭에서 소스 열이 사라짐(정보 손실)').toContain('소스')
    expect(headers, 'I-B1 위반 — 전체/전체 탭에서 매칭상태 열이 사라짐(정보 손실)').toContain('매칭상태')
  })

  test('소스=계좌, 상태=전체 — 소스만 사라지고 매칭상태는 유지', async ({ page }) => {
    await installAuth(page)
    await page.goto(`${BASE_URL}/#/accounting/bank-transactions`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25_000 })
    await dismissUpdateModal(page)
    await expect(page.locator('table thead th')).not.toHaveCount(0, { timeout: 20_000 })

    await clickSourceTab(page, 'codef-tab-CODEF_BANK')
    const headers = await headerTexts(page)
    console.log('[B/BANK-ALL] headers=' + JSON.stringify(headers))
    await page.locator('table').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(SHOTS, '11-columns-bank-all.png'), fullPage: false })

    expect(headers, '소스=계좌 탭에서 소스 열이 남아있음(중복 정보 — 제거 대상)').not.toContain('소스')
    expect(headers, '소스=계좌 탭에서도 상태=전체 라 매칭상태는 유지돼야 함').toContain('매칭상태')
  })

  test('소스=전체, 상태=미반영 — 매칭상태만 사라지고 소스는 유지', async ({ page }) => {
    await installAuth(page)
    await page.goto(`${BASE_URL}/#/accounting/bank-transactions`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25_000 })
    await dismissUpdateModal(page)
    await expect(page.locator('table thead th')).not.toHaveCount(0, { timeout: 20_000 })

    await clickStatusTab(page, '미반영')
    await page.waitForTimeout(400)
    const headers = await headerTexts(page)
    console.log('[B/ALL-UNREFLECTED] headers=' + JSON.stringify(headers))
    await page.locator('table').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(SHOTS, '12-columns-all-unreflected.png'), fullPage: false })

    expect(headers, '상태=미반영 탭에서 매칭상태 열이 남아있음(중복 정보 — 제거 대상)').not.toContain('매칭상태')
    expect(headers, '상태=미반영 탭에서도 소스=전체 라 소스는 유지돼야 함').toContain('소스')
  })

  test('소스=계좌, 상태=미반영 — 둘 다 사라지고 표 폭이 180px 줄어든다(1654→1474)', async ({ page }) => {
    await installAuth(page)
    await page.goto(`${BASE_URL}/#/accounting/bank-transactions`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25_000 })
    await dismissUpdateModal(page)
    await expect(page.locator('table thead th')).not.toHaveCount(0, { timeout: 20_000 })

    const baselineWidth = await colWidthSum(page)
    const baselineHeaders = await headerTexts(page)

    await clickSourceTab(page, 'codef-tab-CODEF_BANK')
    await clickStatusTab(page, '미반영')
    await page.waitForTimeout(400)

    const headers = await headerTexts(page)
    const narrowedWidth = await colWidthSum(page)
    console.log(`[B/BANK-UNREFLECTED] baselineWidth=${baselineWidth} narrowedWidth=${narrowedWidth} headers=${JSON.stringify(headers)}`)
    await page.locator('table').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(SHOTS, '13-columns-bank-unreflected-narrowed.png'), fullPage: false })

    expect(headers).not.toContain('소스')
    expect(headers).not.toContain('매칭상태')
    expect(
      baselineWidth - narrowedWidth,
      `표 폭 축소량이 180px(소스 80 + 매칭상태 100) 이 아님 — baseline=${baselineWidth} narrowed=${narrowedWidth}`,
    ).toBe(180)
  })

  test('I-B2 — 카드 탭 상세 패널(법인카드/승인번호) 값 대조·무회귀', async ({ page }) => {
    const token = await installAuth(page)
    // ground truth — UI 와 독립적으로 실 API 값을 먼저 확보한다(값 대조. 존재/개수 확인이 아님).
    const rows = await fetchAllBankTransactionRows(token)
    const cardRow = rows.find((row) => row.source === 'CODEF_CARD' && row.cardName && row.approvalId)
    expect(cardRow, 'CODEF_CARD 실 API 행 중 법인카드명·승인번호가 모두 채워진 행이 없음 — 값 대조 불가(RED)').toBeTruthy()

    await page.goto(`${BASE_URL}/#/accounting/bank-transactions`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25_000 })
    await dismissUpdateModal(page)
    await expect(page.locator('table thead th')).not.toHaveCount(0, { timeout: 20_000 })
    await widenListDateRange(page)

    await clickSourceTab(page, 'codef-tab-CODEF_CARD')
    const headers = await headerTexts(page)
    console.log('[B/CARD] headers=' + JSON.stringify(headers))
    await page.locator('table').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(SHOTS, '14-columns-card-tab.png'), fullPage: false })

    // #897(2f67d29bd) 로 법인카드/승인번호는 상세 패널 전용이 됐다 — columnheader 로 남아있으면
    // 그 자체가 회귀다(카드 탭 @1600 폭 예산 재초과, 2026-07-26 개발책임자 결정으로 미채택 확정).
    expect(headers, '카드 탭에서 법인카드가 columnheader 로 남아있음(#897 회귀 — 상세 패널 전용이어야 함)').not.toContain('법인카드')
    expect(headers, '카드 탭에서 승인번호가 columnheader 로 남아있음(#897 회귀 — 상세 패널 전용이어야 함)').not.toContain('승인번호')
    // 카드 탭은 source 가 CODEF_CARD 로 고정이라 소스 열은 여전히 중복(I-B1 제거 대상, 무변경).
    expect(headers, '카드 탭에서 소스 열이 남아있음(중복)').not.toContain('소스')

    // 실 시드에 동일 externalRef 중복 행이 있을 수 있다(라이브 실행에서 실측 — CARD-2026-07-03-001
    // 이 3건). ground truth(cardRow)도 동일 API 응답의 첫 매치라 .first() 로 서로 어긋나지 않는다.
    const toggle = page.getByTestId(`bank-transaction-detail-toggle-${cardRow!.externalRef}`).first()
    await expect(toggle, `카드 실 행(${cardRow!.externalRef}) 토글 버튼을 찾을 수 없음 — I-B2 도달 불가(RED)`).toBeVisible({ timeout: 15_000 })
    await toggle.click()

    const detail = page.getByTestId(`bank-transaction-detail-${cardRow!.externalRef}`).first()
    await expect(detail, 'I-B2 위반 — 카드 탭 상세 패널이 열리지 않음(법인카드/승인번호 도달 불가)').toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: path.join(SHOTS, '16-detail-card.png'), fullPage: false })

    // 값 대조 — 존재/개수가 아니라 실 API 참값과 상세 패널 dd 텍스트를 직접 비교한다.
    await expect(
      detailFieldValue(detail, '법인카드'),
      `I-B2 위반 — 상세 패널 법인카드 값이 실 API 값(${cardRow!.cardName})과 다름`,
    ).toContainText(cardRow!.cardName as string)
    await expect(
      detailFieldValue(detail, '승인번호'),
      `I-B2 위반 — 상세 패널 승인번호 값이 실 API 값(${cardRow!.approvalId})과 다름`,
    ).toContainText(cardRow!.approvalId as string)
  })

  test('I-B2 — 대출 탭 상세 패널(대출명) 값 대조·무회귀', async ({ page }) => {
    const token = await installAuth(page)
    const rows = await fetchAllBankTransactionRows(token)
    const loanRow = rows.find((row) => row.source === 'CODEF_LOAN' && row.loanName)
    expect(loanRow, 'CODEF_LOAN 실 API 행 중 대출명이 채워진 행이 없음 — 값 대조 불가(RED)').toBeTruthy()

    await page.goto(`${BASE_URL}/#/accounting/bank-transactions`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25_000 })
    await dismissUpdateModal(page)
    await expect(page.locator('table thead th')).not.toHaveCount(0, { timeout: 20_000 })
    await widenListDateRange(page)

    await clickSourceTab(page, 'codef-tab-CODEF_LOAN')
    const headers = await headerTexts(page)
    console.log('[B/LOAN] headers=' + JSON.stringify(headers))
    await page.locator('table').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(SHOTS, '15-columns-loan-tab.png'), fullPage: false })

    expect(headers, '대출 탭에서 대출명이 columnheader 로 남아있음(#897 회귀 — 상세 패널 전용이어야 함)').not.toContain('대출명')
    expect(headers, '대출 탭에서 소스 열이 남아있음(중복)').not.toContain('소스')

    // 카드 탭과 동일 이유(실 시드 중복 externalRef 가능성) — .first() 로 ground truth 와 정합.
    const toggle = page.getByTestId(`bank-transaction-detail-toggle-${loanRow!.externalRef}`).first()
    await expect(toggle, `대출 실 행(${loanRow!.externalRef}) 토글 버튼을 찾을 수 없음 — I-B2 도달 불가(RED)`).toBeVisible({ timeout: 15_000 })
    await toggle.click()

    const detail = page.getByTestId(`bank-transaction-detail-${loanRow!.externalRef}`).first()
    await expect(detail, 'I-B2 위반 — 대출 탭 상세 패널이 열리지 않음(대출명 도달 불가)').toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: path.join(SHOTS, '17-detail-loan.png'), fullPage: false })

    await expect(
      detailFieldValue(detail, '대출명'),
      `I-B2 위반 — 상세 패널 대출명 값이 실 API 값(${loanRow!.loanName})과 다름`,
    ).toContainText(loanRow!.loanName as string)
  })
})
