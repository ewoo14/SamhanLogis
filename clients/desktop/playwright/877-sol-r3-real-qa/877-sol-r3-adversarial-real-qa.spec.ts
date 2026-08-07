import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { expect, test, type APIRequestContext, type Browser, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5490'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = (resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'))
const CONNECTED = 'connected-main'
const SHOTS = resolveQaShotsDir(path.resolve('../../docs/qa/877-sol-r3'))
fs.mkdirSync(SHOTS, { recursive: true })

type Scope = {
  connectedId: string
  accountRefs: string[]
  cardRefs: string[]
  loanRefs: string[]
  defaultImportType: string
  scopeMode: string | null
}

type Auth = {
  token: string
  role: string
  userId: string
  displayName: string
}

type BankRow = {
  transactedAt: string
  txnType: 'DEPOSIT' | 'WITHDRAWAL'
  amount: number
  bankAccountLabel: string
  source: 'CODEF_BANK' | 'CODEF_CARD' | 'CODEF_LOAN'
  externalRef: string
  matchStatus: 'UNREFLECTED' | 'REFLECTED' | 'FORCED'
  matchedPartnerCode: string | null
  // #897 I-B2 값 대조용 — BankTransactionResponse(BE) 원문 그대로, 상세 패널 전용 필드.
  cardName?: string | null
  approvalId?: string | null
  loanName?: string | null
}

let master: Auth
let accountant: Auth
let originalMasterScope: Scope

async function login(req: APIRequestContext, loginId: string): Promise<Auth> {
  const res = await req.post(`${API_BASE}/auth/login`, {
    data: { loginId, password: PASSWORD },
  })
  expect(res.ok(), `${loginId} 로그인 실패 HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return {
    token: d.token ?? '',
    role: d.role ?? '',
    userId: d.userId ?? '',
    displayName: d.displayName ?? loginId,
  }
}

function authHeaders(auth: Auth) {
  return {
    Authorization: `Bearer ${auth.token}`,
    'Content-Type': 'application/json',
  }
}

async function getScope(req: APIRequestContext, auth: Auth): Promise<Scope> {
  const res = await req.get(`${API_BASE}/accounting/codef/scopes?connectedId=${CONNECTED}`, {
    headers: authHeaders(auth),
  })
  expect(res.ok(), `GET scope HTTP ${res.status()}`).toBeTruthy()
  return (await res.json()).data as Scope
}

async function putScope(req: APIRequestContext, auth: Auth, scope: Scope) {
  const res = await req.put(`${API_BASE}/accounting/codef/scopes`, {
    headers: authHeaders(auth),
    data: {
      connectedId: CONNECTED,
      accountRefs: scope.accountRefs ?? [],
      cardRefs: scope.cardRefs ?? [],
      loanRefs: scope.loanRefs ?? [],
      defaultImportType: scope.defaultImportType ?? 'ALL',
      scopeMode: scope.scopeMode ?? 'ALL',
    },
  })
  expect(res.ok(), `PUT scope HTTP ${res.status()}`).toBeTruthy()
}

async function installAuth(page: Page, auth: Auth) {
  await page.addInitScript((a) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({
          token: a.token,
          userId: a.userId,
          role: a.role,
          fullName: a.displayName,
          partnerCode: null,
        }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, auth)
}

async function dismissUpdateModal(page: Page) {
  for (const label of ['닫기', '확인']) {
    const button = page.getByRole('button', { name: label, exact: true })
    if (await button.count().catch(() => 0)) {
      await button.first().click({ timeout: 2_000 }).catch(() => undefined)
    }
  }
}

async function gotoBank(page: Page) {
  await page.goto(`${BASE_URL}/#/accounting/bank-transactions`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('codef-import-type')).toBeVisible({ timeout: 30_000 })
  await dismissUpdateModal(page)
  await page.waitForTimeout(700)
}

async function shot(page: Page, name: string, fullPage = true) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage })
}

async function setType(page: Page, type: 'ALL' | 'BANK' | 'CARD' | 'LOAN') {
  await page.getByTestId('codef-import-type').selectOption(type)
  await page.waitForTimeout(250)
}

async function leaveAllScope(page: Page) {
  const pressable = page.getByTestId('codef-all-scope-chip').locator('[role="button"]').first()
  if ((await pressable.getAttribute('aria-pressed')) === 'true') {
    await page.getByRole('button', { name: '전체 범위 제거' }).click()
    await expect(pressable).toHaveAttribute('aria-pressed', 'false')
  }
}

async function armImportInterceptor(page: Page) {
  const bodies: string[] = []
  await page.route('**/accounting/codef/import-scoped', async (route) => {
    bodies.push(route.request().postData() ?? '')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        code: 'OK',
        message: '',
        timestamp: new Date().toISOString(),
        data: {
          fetchedCount: 0,
          importedCount: 0,
          duplicateSkippedCount: 0,
          matchedCount: 0,
          staleSkippedCount: 0,
          staleNormalizedNames: [],
          unavailableSkippedCount: 0,
          unavailableNames: [],
        },
      }),
    })
  })
  return bodies
}

async function runImport(page: Page) {
  await page.getByTestId('codef-import-from').fill('2019-05-01')
  await page.getByTestId('codef-import-to').fill('2019-05-03')
  await page.getByTestId('codef-import-button').click()
  await expect(page.getByTestId('codef-import-result')).toBeVisible({ timeout: 30_000 })
}

async function loadAllTransactions(page: Page) {
  const queryDates = page.locator('input[type="date"]:not([data-testid^="codef-import-"])')
  expect(await queryDates.count(), '입출금 조회용 날짜 입력 2개가 있어야 한다').toBe(2)
  await queryDates.nth(0).fill('2019-01-01')
  await queryDates.nth(1).fill('2026-12-31')
  const response = page.waitForResponse(
    (res) => res.request().method() === 'GET' && /\/accounting\/bank-transactions\?/.test(res.url()),
    { timeout: 30_000 },
  )
  await page.getByRole('button', { name: '조회', exact: true }).click()
  const result = await response
  expect(result.ok(), `입출금 조회 HTTP ${result.status()}`).toBeTruthy()
  const rows = ((await result.json()).data ?? []) as BankRow[]
  await expect(page.locator('table tbody tr')).toHaveCount(rows.length, { timeout: 30_000 })
  return rows
}

async function clickSource(page: Page, source: BankRow['source'] | 'ALL') {
  await page.getByTestId(`codef-tab-${source}`).click()
  await page.waitForTimeout(250)
}

async function clickStatus(page: Page, label: '전체' | '미반영' | '반영' | '강제') {
  await page.getByRole('button', { name: label, exact: true }).click()
  await page.waitForTimeout(250)
}

async function tableGeometry(page: Page) {
  return page.evaluate(() => {
    const table = document.querySelector('table') as HTMLElement | null
    if (!table) return { error: 'table 없음' }
    const scroll = table.parentElement as HTMLElement
    const sticky = table.querySelector('[class*="emptyCellSticky"]') as HTMLElement | null
    const rect = (el: HTMLElement | null) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return {
        left: Math.round(r.left),
        right: Math.round(r.right),
        width: Math.round(r.width),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
      }
    }
    return {
      containerType: getComputedStyle(scroll).containerType,
      overflowX: getComputedStyle(scroll).overflowX,
      scrollClientWidth: scroll.clientWidth,
      scrollWidth: scroll.scrollWidth,
      scrollLeft: scroll.scrollLeft,
      table: rect(table),
      scroll: rect(scroll),
      sticky: rect(sticky),
      stickyPosition: sticky ? getComputedStyle(sticky).position : null,
      stickyWidth: sticky ? getComputedStyle(sticky).width : null,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }
  })
}

/**
 * `<dl>` 안에서 dtLabel 과 정확히 일치하는 dt 바로 다음 dd(값)를 찾는다(그리드 배치라도 DOM 상
 * 인접 형제) — 877-pm-cgate-real-qa/bank-txn-columns-real-qa.spec.ts·codef-fe-bc2.spec.ts 와
 * 동일 헬퍼(I-B2 값 대조 — 존재/개수가 아니라 dd 텍스트를 실 API 값과 직접 비교).
 */
function detailFieldValue(detail: import('@playwright/test').Locator, dtLabel: string) {
  return detail.locator(`xpath=.//dt[normalize-space(text())="${dtLabel}"]/following-sibling::dd[1]`)
}

test.describe.serial('#877 CODEX SOL 5.6 2차 — 실 사용자 경로 적대검증', () => {
  test.beforeAll(async ({ playwright }) => {
    const req = await playwright.request.newContext()
    master = await login(req, 'dev_master')
    accountant = await login(req, 'dev_accountant')
    originalMasterScope = await getScope(req, master)
    console.log(`[BASELINE master scope] ${JSON.stringify(originalMasterScope)}`)
    console.log(`[BASELINE accountant scope] ${JSON.stringify(await getScope(req, accountant))}`)
    await req.dispose()
  })

  test.afterAll(async ({ playwright }) => {
    const req = await playwright.request.newContext()
    await putScope(req, master, originalMasterScope)
    console.log(`[CLEANUP master scope] ${JSON.stringify(await getScope(req, master))}`)
    await req.dispose()
    const cleanup = execFileSync(
      'docker',
      [
        'exec',
        'samhan-postgres',
        'psql',
        '-U',
        'samhan',
        '-d',
        'accounting_db',
        '-At',
        '-c',
        "UPDATE user_codef_import_scope SET is_deleted=true, deleted_at=CURRENT_TIMESTAMP, deleted_by='QA-877-SOL-R3-CLEANUP' WHERE user_id='a0000000-0000-0000-0000-000000000005' AND connected_id='connected-main' AND is_deleted=false;",
      ],
      { encoding: 'utf8' },
    ).trim()
    console.log(`[CLEANUP accountant scope] ${cleanup}`)
  })

  test('각도1·4 — ①②③ 무회귀 + clean/dirty + 탭/페이지 재진입 상태머신', async ({ page }) => {
    await installAuth(page, master)
    const importBodies = await armImportInterceptor(page)
    await gotoBank(page)

    await setType(page, 'ALL')
    await leaveAllScope(page)
    for (const i of [0, 1, 2]) await page.getByTestId(`codef-bank-account-${i}`).check()
    for (const i of [0, 1]) await page.getByTestId(`codef-card-${i}`).check()
    await setType(page, 'CARD')
    expect(await page.getByTestId('codef-bank-account-0').count(), 'CARD 화면에는 계좌가 없어야 한다').toBe(0)

    let saveBody = ''
    page.on('request', (request) => {
      if (request.method() === 'PUT' && request.url().includes('/accounting/codef/scopes')) {
        saveBody = request.postData() ?? ''
      }
    })
    await page.getByTestId('codef-save-scope-button').click()
    await expect(page.getByText('가져오기 선택을 저장했습니다.')).toBeVisible({ timeout: 15_000 })
    const saved = JSON.parse(saveBody)
    console.log(`[① SAVE PUT] ${JSON.stringify(saved)}`)
    expect(saved.accountRefs).toHaveLength(3)
    expect(saved.cardRefs).toHaveLength(2)
    expect(saved.defaultImportType).toBe('CARD')
    expect(saved.scopeMode).toBe('SELECTED')
    console.log(`[① SERVER GET] ${JSON.stringify(await getScope(page.request, master))}`)
    await shot(page, '01-invariants-after-card-save')

    await page.getByRole('button', { name: '미반영', exact: true }).click()
    await page.getByTestId('codef-tab-CODEF_CARD').click()
    await page.goto(`${BASE_URL}/#/accounting/journals`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 30_000 })
    await gotoBank(page)
    expect(await page.getByTestId('codef-import-type').inputValue()).toBe('CARD')
    await expect(page.getByText('저장된 선택을 복원했습니다.', { exact: false })).toBeVisible()

    await runImport(page)
    const clean = JSON.parse(importBodies[0] ?? '{}')
    console.log(`[③ CLEAN IMPORT POST] ${JSON.stringify(clean)}`)
    expect(clean.type).toBe('CARD')
    expect(clean.accountRefs ?? []).toEqual([])
    expect(clean.cardRefs).toHaveLength(2)
    expect(clean.loanRefs ?? []).toEqual([])
    expect(clean.scopeMode).toBe('SELECTED')

    await setType(page, 'ALL')
    expect(await page.getByTestId('codef-selected-chip').count()).toBe(5)
    await setType(page, 'CARD')
    await expect(page.getByText('저장된 선택을 복원했습니다.', { exact: false })).toHaveCount(0)
    await runImport(page)
    const dirty = JSON.parse(importBodies[1] ?? '{}')
    console.log(`[③ DIRTY IMPORT POST] ${JSON.stringify(dirty)}`)
    expect(dirty).toEqual(clean)
    await shot(page, '02-invariants-clean-dirty-equal')

    const accContext = await page.context().browser()!.newContext()
    const accPage = await accContext.newPage()
    try {
      await installAuth(accPage, accountant)
      await gotoBank(accPage)
      const missing = accPage.getByText('저장된 선택이 없습니다. 필요한 항목을 선택한 뒤 저장하세요.')
      await expect(missing).toBeVisible()
      await setType(accPage, 'BANK')
      await leaveAllScope(accPage)
      await accPage.getByTestId('codef-bank-account-0').check()
      await accPage.getByTestId('codef-save-scope-button').click()
      await expect(accPage.getByText('가져오기 선택을 저장했습니다.')).toBeVisible({ timeout: 15_000 })
      await expect(missing).toHaveCount(0)
      await expect(accPage.getByText('저장된 선택을 복원했습니다.', { exact: false })).toBeVisible()
      console.log(`[② FIRST SAVE GET] ${JSON.stringify(await getScope(accPage.request, accountant))}`)
      console.log('[② FIRST SAVE DOM] 미저장 안내=0, 복원 안내=1')
      await shot(accPage, '03-first-save-no-missing-hint')
    } finally {
      await accContext.close()
    }
  })

  test('각도2 — 소스4×상태4 16조합 열·행·중복성 + 선택/일괄작업', async ({ page }) => {
    await installAuth(page, master)
    await gotoBank(page)
    const allRows = await loadAllTransactions(page)
    const sourceCounts = Object.fromEntries(
      ['CODEF_BANK', 'CODEF_CARD', 'CODEF_LOAN'].map((source) => [
        source,
        allRows.filter((row) => row.source === source).length,
      ]),
    )
    const statusCounts = Object.fromEntries(
      ['UNREFLECTED', 'REFLECTED', 'FORCED'].map((status) => [
        status,
        allRows.filter((row) => row.matchStatus === status).length,
      ]),
    )
    console.log(`[REAL BE DISTRIBUTION] total=${allRows.length} sources=${JSON.stringify(sourceCounts)} statuses=${JSON.stringify(statusCounts)}`)
    expect(sourceCounts).toEqual({ CODEF_BANK: 85, CODEF_CARD: 60, CODEF_LOAN: 40 })
    expect(statusCounts).toEqual({ UNREFLECTED: 185, REFLECTED: 0, FORCED: 0 })

    const sources = [
      { key: 'ALL' as const, slug: 'all' },
      { key: 'CODEF_BANK' as const, slug: 'bank' },
      { key: 'CODEF_CARD' as const, slug: 'card' },
      { key: 'CODEF_LOAN' as const, slug: 'loan' },
    ]
    const statuses = [
      { key: 'ALL' as const, label: '전체' as const, slug: 'all' },
      { key: 'UNREFLECTED' as const, label: '미반영' as const, slug: 'unreflected' },
      { key: 'REFLECTED' as const, label: '반영' as const, slug: 'reflected' },
      { key: 'FORCED' as const, label: '강제' as const, slug: 'forced' },
    ]

    for (const source of sources) {
      await clickSource(page, source.key)
      for (const status of statuses) {
        await clickStatus(page, status.label)
        const expected = allRows.filter(
          (row) => (source.key === 'ALL' || row.source === source.key)
            && (status.key === 'ALL' || row.matchStatus === status.key),
        )
        const headers = await page.locator('table thead th').allTextContents()
        const emptyVisible = await page.getByText('입출금 거래가 없습니다').isVisible().catch(() => false)
        const actualRows = emptyVisible ? 0 : await page.locator('table tbody tr').count()
        const uniqueSources = [...new Set(expected.map((row) => row.source))]
        const uniqueStatuses = [...new Set(expected.map((row) => row.matchStatus))]
        console.log(
          `[16-COMBO ${source.key}/${status.key}] expected=${expected.length} actual=${actualRows} `
          + `headers=${JSON.stringify(headers)} uniqueSources=${JSON.stringify(uniqueSources)} `
          + `uniqueStatuses=${JSON.stringify(uniqueStatuses)}`,
        )
        expect(actualRows, `${source.key}/${status.key} UI 행 수`).toBe(expected.length)
        expect(headers.includes('소스'), `${source.key}/${status.key} 소스 열 조건`).toBe(source.key === 'ALL')
        expect(headers.includes('매칭상태'), `${source.key}/${status.key} 상태 열 조건`).toBe(status.key === 'ALL')
        if (source.key !== 'ALL' && expected.length > 0) expect(uniqueSources).toEqual([source.key])
        if (status.key !== 'ALL' && expected.length > 0) expect(uniqueStatuses).toEqual([status.key])
        // #897(2f67d29bd) 컬럼 계층화로 법인카드/승인번호/대출명은 어느 소스 탭에서도
        // columnheader 로 존재하지 않는다(BankTransactionDetailPanel 전용 이동 확정 —
        // 되돌리면 회귀). 카드/대출 탭에서 여전히 columnheader 를 기대하던 구 단정은
        // 실 서버 기준 드리프트였다(877-pm-cgate-real-qa/bank-txn-columns-real-qa.spec.ts,
        // codef-fe-bc2.spec.ts 와 동일 판단).
        expect(headers, `${source.key}/${status.key} 법인카드가 columnheader 로 남아있음(#897 회귀)`).not.toContain('법인카드')
        expect(headers, `${source.key}/${status.key} 승인번호가 columnheader 로 남아있음(#897 회귀)`).not.toContain('승인번호')
        expect(headers, `${source.key}/${status.key} 대출명이 columnheader 로 남아있음(#897 회귀)`).not.toContain('대출명')

        // I-B2 값 대조 — "카드 탭에는 카드 고유 정보가, 대출 탭에는 대출 고유 정보가 표시되고
        // 서로 섞이지 않는다"는 이 스펙의 원래 업무 사실을 상세 패널 경로로 확인한다. 카드/대출
        // 탭 각 1회(상태=전체 — sourceCounts 실측으로 CARD 60/LOAN 40 존재 보장)만 열어
        // allRows(이미 실 서버 응답) 의 참값과 dd 텍스트를 직접 비교한다(존재/개수 확인이 아님).
        // 반대 탭 필드가 섞여 표시되지 않는지도 함께 확인한다(카드 행 상세의 대출명, 대출 행
        // 상세의 법인카드/승인번호는 반드시 '—').
        if (source.key === 'CODEF_CARD' && status.key === 'ALL') {
          const cardRow = expected.find((row) => row.cardName && row.approvalId)
          expect(cardRow, 'CODEF_CARD 실 행 중 법인카드·승인번호가 모두 채워진 행이 없음 — I-B2 값 대조 불가(RED)').toBeTruthy()

          const toggle = page.getByTestId(`bank-transaction-detail-toggle-${cardRow!.externalRef}`).first()
          await expect(toggle, `카드 실 행(${cardRow!.externalRef}) 토글을 찾을 수 없음 — I-B2 도달 불가(RED)`).toBeVisible({ timeout: 15_000 })
          await toggle.click()
          const detail = page.getByTestId(`bank-transaction-detail-${cardRow!.externalRef}`).first()
          await expect(detail, 'I-B2 위반 — 카드 탭 상세 패널이 열리지 않음(법인카드/승인번호 도달 불가)').toBeVisible({ timeout: 10_000 })

          await expect(
            detailFieldValue(detail, '법인카드'),
            `I-B2 위반 — 상세 패널 법인카드 값이 실 API 값(${cardRow!.cardName})과 다름`,
          ).toContainText(cardRow!.cardName as string)
          await expect(
            detailFieldValue(detail, '승인번호'),
            `I-B2 위반 — 상세 패널 승인번호 값이 실 API 값(${cardRow!.approvalId})과 다름`,
          ).toContainText(cardRow!.approvalId as string)
          await expect(detailFieldValue(detail, '대출명'), '카드 행 상세에 대출명이 섞여 표시됨(#897 회귀)').toHaveText('—')
          await toggle.click()
        }
        if (source.key === 'CODEF_LOAN' && status.key === 'ALL') {
          const loanRow = expected.find((row) => row.loanName)
          expect(loanRow, 'CODEF_LOAN 실 행 중 대출명이 채워진 행이 없음 — I-B2 값 대조 불가(RED)').toBeTruthy()

          const toggle = page.getByTestId(`bank-transaction-detail-toggle-${loanRow!.externalRef}`).first()
          await expect(toggle, `대출 실 행(${loanRow!.externalRef}) 토글을 찾을 수 없음 — I-B2 도달 불가(RED)`).toBeVisible({ timeout: 15_000 })
          await toggle.click()
          const detail = page.getByTestId(`bank-transaction-detail-${loanRow!.externalRef}`).first()
          await expect(detail, 'I-B2 위반 — 대출 탭 상세 패널이 열리지 않음(대출명 도달 불가)').toBeVisible({ timeout: 10_000 })

          await expect(
            detailFieldValue(detail, '대출명'),
            `I-B2 위반 — 상세 패널 대출명 값이 실 API 값(${loanRow!.loanName})과 다름`,
          ).toContainText(loanRow!.loanName as string)
          await expect(detailFieldValue(detail, '법인카드'), '대출 행 상세에 법인카드가 섞여 표시됨(#897 회귀)').toHaveText('—')
          await expect(detailFieldValue(detail, '승인번호'), '대출 행 상세에 승인번호가 섞여 표시됨(#897 회귀)').toHaveText('—')
          await toggle.click()
        }
        await shot(page, `combo-${source.slug}-${status.slug}`, false)
      }
    }

    await clickSource(page, 'ALL')
    await clickStatus(page, '전체')
    const enabledBefore = await page.locator('table tbody input[type="checkbox"]:not(:disabled)').count()
    const disabledBefore = await page.locator('table tbody input[type="checkbox"]:disabled').count()
    await expect(page.getByTestId('bank-transaction-create-receipt')).toBeDisabled()
    console.log(`[BULK baseline] enabled=${enabledBefore} disabled=${disabledBefore} createDisabled=true`)

    const candidate = allRows.find(
      (row) => row.source === 'CODEF_BANK' && row.txnType === 'DEPOSIT' && row.matchStatus === 'UNREFLECTED',
    )
    expect(candidate, '임시 매칭할 계좌 입금행이 있어야 한다').toBeTruthy()
    const partnerRes = await page.request.get(`${API_BASE}/admin/partners/search?q=&size=1&status=ACTIVE`, {
      headers: authHeaders(master),
    })
    expect(partnerRes.ok()).toBeTruthy()
    const partner = (await partnerRes.json()).data.items[0] as { partnerCode: string; name: string }
    const naturalKey = {
      bankAccountLabel: candidate!.bankAccountLabel,
      transactedAt: candidate!.transactedAt,
      amount: candidate!.amount,
      externalRef: candidate!.externalRef,
    }
    try {
      const matched = await page.request.patch(`${API_BASE}/accounting/bank-transactions/match-partner`, {
        headers: authHeaders(master),
        data: { ...naturalKey, partnerCode: partner.partnerCode },
      })
      expect(matched.ok(), `임시 매칭 HTTP ${matched.status()}`).toBeTruthy()
      console.log(`[THROWAWAY MATCH] externalRef=${candidate!.externalRef} partnerCode=${partner.partnerCode}`)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('codef-import-type')).toBeVisible({ timeout: 30_000 })
      await dismissUpdateModal(page)
      await loadAllTransactions(page)
      const row = page.getByTestId(`bank-transaction-partner-search-${candidate!.source}-${candidate!.externalRef}`).locator('xpath=ancestor::tr')
      const checkbox = row.locator('input[type="checkbox"]').first()
      await expect(checkbox).toBeEnabled()
      await checkbox.check()
      await expect(page.getByTestId('bank-transaction-create-receipt')).toBeEnabled()
      await expect(page.getByTestId('bank-transaction-bulk-bar')).toContainText('선택 1건')
      await page.getByTestId('bank-transaction-create-receipt').click()
      await expect(page.getByRole('dialog')).toBeVisible()
      console.log('[BULK user path] 임시 매칭 입금 1건 선택 → 합계/거래처 표시 → 입금보고서 모달 열림')
      await shot(page, 'bulk-one-selected-modal-open')
      await page.getByRole('dialog').getByRole('button', { name: '취소', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
    } finally {
      const cleared = await page.request.patch(`${API_BASE}/accounting/bank-transactions/match-partner/clear`, {
        headers: authHeaders(master),
        data: naturalKey,
      })
      console.log(`[THROWAWAY MATCH CLEANUP] HTTP ${cleared.status()}`)
      expect(cleared.ok()).toBeTruthy()
    }
  })

  test('각도3 — DataTable 빈 상태: 가로스크롤 유/무·모달·좁은 폭', async ({ page }) => {
    await installAuth(page, master)

    await page.goto(`${BASE_URL}/#/accounting/reports/collection-plans`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 30_000 })
    await dismissUpdateModal(page)
    await expect(page.locator('table')).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(800)
    const noScroll = await tableGeometry(page)
    console.log(`[DATATABLE no-scroll real] ${JSON.stringify(noScroll)}`)
    expect(noScroll.containerType).toBe('inline-size')
    expect(noScroll.scrollWidth).toBeLessThanOrEqual(noScroll.scrollClientWidth)
    await shot(page, 'datatable-no-horizontal-scroll-empty')

    await page.route('**/accounting/reports/income-statement/monthly**', async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          code: 'OK',
          message: '',
          timestamp: new Date().toISOString(),
          data: {
            fiscalYear: 1901,
            priorYear: 1900,
            fromDate: '1901-01-01',
            toDate: '1901-12-31',
            generatedAt: new Date().toISOString(),
            months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            rows: [],
          },
        }),
      })
    })
    await page.goto(`${BASE_URL}/#/accounting/reports/income-statement/monthly`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('해당 연도 손익 데이터가 없습니다.')).toBeVisible({ timeout: 30_000 })
    let horizontal = await tableGeometry(page)
    console.log(`[DATATABLE horizontal empty left] ${JSON.stringify(horizontal)}`)
    expect(horizontal.containerType).toBe('inline-size')
    expect(horizontal.scrollWidth).toBeGreaterThan(horizontal.scrollClientWidth)
    expect(horizontal.stickyPosition).toBe('sticky')
    await page.evaluate(() => {
      const table = document.querySelector('table') as HTMLElement
      const scroll = table.parentElement as HTMLElement
      scroll.scrollLeft = scroll.scrollWidth
    })
    await page.waitForTimeout(300)
    horizontal = await tableGeometry(page)
    console.log(`[DATATABLE horizontal empty right] ${JSON.stringify(horizontal)}`)
    expect(horizontal.sticky?.left).toBe(horizontal.scroll?.left)
    await shot(page, 'datatable-horizontal-empty-scrolled-right')
    await page.unroute('**/accounting/reports/income-statement/monthly**')

    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`${BASE_URL}/#/accounting/reports/collection-plans`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1_200)
    const narrow = await tableGeometry(page)
    console.log(`[DATATABLE narrow 375] ${JSON.stringify(narrow)}`)
    expect(narrow.containerType).toBe('inline-size')
    expect(narrow.documentWidth).toBeLessThanOrEqual(narrow.viewportWidth)
    await page.locator('table').scrollIntoViewIfNeeded()
    await shot(page, 'datatable-narrow-375-empty', false)

    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${BASE_URL}/#/admin/users`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(1_500)
    const historyButton = page.getByRole('button', { name: /이력/ }).first()
    await expect(historyButton).toBeVisible({ timeout: 20_000 })
    await historyButton.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('table')).toBeVisible()
    const modalGeometry = await dialog.locator('table').evaluate((table) => {
      const t = table as HTMLElement
      const scroll = t.parentElement as HTMLElement
      const dialog = t.closest('[role="dialog"]') as HTMLElement
      return {
        dialogWidth: Math.round(dialog.getBoundingClientRect().width),
        tableWidth: Math.round(t.getBoundingClientRect().width),
        scrollClientWidth: scroll.clientWidth,
        scrollWidth: scroll.scrollWidth,
        containerType: getComputedStyle(scroll).containerType,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      }
    })
    console.log(`[DATATABLE modal real] ${JSON.stringify(modalGeometry)}`)
    expect(modalGeometry.containerType).toBe('inline-size')
    expect(modalGeometry.documentWidth).toBeLessThanOrEqual(modalGeometry.viewportWidth)
    await shot(page, 'datatable-modal-role-history')
  })

  test('각도5 — 실 BE와 부분 mock scope가 같은 사용자 저장 결과를 낸다', async ({ browser, page }) => {
    await putScope(page.request, master, {
      connectedId: CONNECTED,
      accountRefs: ['국민 123456-78-901234'],
      cardRefs: ['삼한 법인카드 1111'],
      loanRefs: [],
      defaultImportType: 'ALL',
      scopeMode: 'SELECTED',
    })
    await installAuth(page, master)
    await gotoBank(page)
    await setType(page, 'ALL')
    const realBefore = {
      bank0: await page.getByTestId('codef-bank-account-0').isChecked(),
      card0: await page.getByTestId('codef-card-0').isChecked(),
    }
    await page.getByTestId('codef-bank-account-1').check()
    await page.getByTestId('codef-card-1').check()
    await setType(page, 'CARD')
    await page.getByTestId('codef-save-scope-button').click()
    await expect(page.getByText('가져오기 선택을 저장했습니다.')).toBeVisible()
    await setType(page, 'ALL')
    const realAfter = {
      bank0: await page.getByTestId('codef-bank-account-0').isChecked(),
      bank1: await page.getByTestId('codef-bank-account-1').isChecked(),
      card0: await page.getByTestId('codef-card-0').isChecked(),
      card1: await page.getByTestId('codef-card-1').isChecked(),
    }

    const mockContext = await browser.newContext()
    const mockPage = await mockContext.newPage()
    let mockedScope: Scope = {
      connectedId: CONNECTED,
      accountRefs: ['국민 123456-78-901234'],
      cardRefs: ['삼한 법인카드 1111'],
      loanRefs: [],
      defaultImportType: 'ALL',
      scopeMode: 'SELECTED',
    }
    await mockPage.route('**/accounting/codef/scopes**', async (route) => {
      if (route.request().method() === 'PUT') {
        mockedScope = JSON.parse(route.request().postData() ?? '{}')
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          code: 'OK',
          message: '',
          timestamp: new Date().toISOString(),
          data: mockedScope,
        }),
      })
    })
    try {
      await installAuth(mockPage, master)
      await gotoBank(mockPage)
      await setType(mockPage, 'ALL')
      const mockBefore = {
        bank0: await mockPage.getByTestId('codef-bank-account-0').isChecked(),
        card0: await mockPage.getByTestId('codef-card-0').isChecked(),
      }
      await mockPage.getByTestId('codef-bank-account-1').check()
      await mockPage.getByTestId('codef-card-1').check()
      await setType(mockPage, 'CARD')
      await mockPage.getByTestId('codef-save-scope-button').click()
      await expect(mockPage.getByText('가져오기 선택을 저장했습니다.')).toBeVisible()
      await setType(mockPage, 'ALL')
      const mockAfter = {
        bank0: await mockPage.getByTestId('codef-bank-account-0').isChecked(),
        bank1: await mockPage.getByTestId('codef-bank-account-1').isChecked(),
        card0: await mockPage.getByTestId('codef-card-0').isChecked(),
        card1: await mockPage.getByTestId('codef-card-1').isChecked(),
      }
      console.log(`[PARITY real before] ${JSON.stringify(realBefore)}`)
      console.log(`[PARITY mock before] ${JSON.stringify(mockBefore)}`)
      console.log(`[PARITY real after] ${JSON.stringify(realAfter)}`)
      console.log(`[PARITY mock after] ${JSON.stringify(mockAfter)}`)
      expect(mockBefore).toEqual(realBefore)
      expect(mockAfter).toEqual(realAfter)
      await shot(page, 'parity-real-be')
      await shot(mockPage, 'parity-partial-mock')
    } finally {
      await mockContext.close()
    }
  })
})
