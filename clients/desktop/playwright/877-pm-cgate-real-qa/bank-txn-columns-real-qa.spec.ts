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
 * 불변식:
 *   I-B1 — 소스/매칭상태 정보가 필요한 상태(각 탭=전체)에서는 열이 남아 도달 가능.
 *   I-B2 — 카드 탭(법인카드/승인번호)·대출 탭(대출명)·mobilePriority 무회귀.
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5420'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const SHOTS = resolveQaShotsDir(path.resolve('../../docs/qa/877-sonnet-r2-mascot'))
fs.mkdirSync(SHOTS, { recursive: true })

async function installAuth(page: Page) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: 'dev_master', password: 'dev_p05_pass!' }),
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

  test('I-B2 — 카드 탭 조건부 열(법인카드/승인번호) 무회귀', async ({ page }) => {
    await installAuth(page)
    await page.goto(`${BASE_URL}/#/accounting/bank-transactions`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25_000 })
    await dismissUpdateModal(page)
    await expect(page.locator('table thead th')).not.toHaveCount(0, { timeout: 20_000 })

    await clickSourceTab(page, 'codef-tab-CODEF_CARD')
    const headers = await headerTexts(page)
    console.log('[B/CARD] headers=' + JSON.stringify(headers))
    await page.locator('table').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(SHOTS, '14-columns-card-tab.png'), fullPage: false })

    expect(headers, '카드 탭에서 법인카드 열이 없음(회귀)').toContain('법인카드')
    expect(headers, '카드 탭에서 승인번호 열이 없음(회귀)').toContain('승인번호')
    // 카드 탭은 source 가 CODEF_CARD 로 고정이라 소스 열은 여전히 중복(제거 대상).
    expect(headers, '카드 탭에서 소스 열이 남아있음(중복)').not.toContain('소스')
  })

  test('I-B2 — 대출 탭 조건부 열(대출명) 무회귀', async ({ page }) => {
    await installAuth(page)
    await page.goto(`${BASE_URL}/#/accounting/bank-transactions`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25_000 })
    await dismissUpdateModal(page)
    await expect(page.locator('table thead th')).not.toHaveCount(0, { timeout: 20_000 })

    await clickSourceTab(page, 'codef-tab-CODEF_LOAN')
    const headers = await headerTexts(page)
    console.log('[B/LOAN] headers=' + JSON.stringify(headers))
    await page.locator('table').first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(SHOTS, '15-columns-loan-tab.png'), fullPage: false })

    expect(headers, '대출 탭에서 대출명 열이 없음(회귀)').toContain('대출명')
    expect(headers, '대출 탭에서 소스 열이 남아있음(중복)').not.toContain('소스')
  })
})
