import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * mascot-datatable-fence-real-qa.spec.ts
 *
 * #877 SONNET5 R2 작업 A 회귀 울타리 — DataTable 빈 상태 중앙 정렬 fix 가
 * bank-transactions 화면 하나에만 좁게 맞춰지지 않았는지 다른 두 표로 확인한다.
 *
 *   울타리 1 — 가로 스크롤이 "없는" 표의 빈 상태는 기존처럼 중앙 그대로.
 *              `/accounting/reports/collection-plans` (열 폭 합 1094px < 보이는 창) —
 *              기본 진입 시 이미 0건이라 별도 조작 없이 측정 가능.
 *   울타리 2 — bank-transactions 가 아닌 다른 "가로 스크롤 있는" 표에서도 개선 확인.
 *              `/accounting/reports/income-statement/monthly` (tableLayout="fixed",
 *              열 폭 1882px > 보이는 창) — 해당 연도 rows=[] 를 목록 GET 읽기 전용
 *              가로채기로 재현(DB 무변경). 아래 두 후보를 먼저 실측했으나 부적합했다:
 *                - `/accounting/deposit-mappings` — 열 폭 합 ≈1250px 로 조건은 맞지만
 *                  dev_master 가 `accounting.deposit-mapping:view` 페이지 권한이 없어
 *                  (사이드바 링크 자체가 숨김) 접근 불가 — 별개의 기존 권한 시드 갭,
 *                  본 작업 범위 밖이라 손대지 않음.
 *                - `/products/estimate-items`, `/accounting/bank-card-admin` 등 나머지
 *                  wide 후보는 tableLayout 기본값(auto) 이라 0건일 때 표 자체가
 *                  보이는 창 이하로 줄어들어(스크롤 소멸) 애초에 이 버그의 전제(가로
 *                  스크롤+0건)를 재현할 수 없었다.
 *
 * 🚨 실측 결과 — income-statement/monthly 는 DataTable 을 자체 `overflowX:auto` +
 * `minWidth:1760px` 외부 div 로 한 번 더 감싼다(BankTransactionPage 등 나머지 10개
 * 소비처와 다른 유일한 예외). 본 fix 는 DataTable **자신의** 내부 `.scroll` 기준으로
 * 정확히 중앙 정렬한다(아래 GREEN 단언 — 이건 fix 의 실제 계약이자 컴포넌트가 통제할
 * 수 있는 유일한 경계다). 그러나 이 페이지는 그 바깥에 컨슈머가 추가한 스크롤 경계가
 * 하나 더 있어 "사용자가 실제로 보는 창"은 `.scroll` 이 아니라 그 바깥 div 다 — 그
 * 기준으로는 본 fix 가 중앙을 못 맞춘다(별도로 측정해 로그만 남기고 하드 단언하지
 * 않는다). 이 페이지의 BE 는 실거래 없는 연도에도 계정 스켈레톤 행을 항상 반환해
 * `rows.length===0` 경로 자체가 실사용에서 도달 불가로 보이므로(1901년 재현 시도 —
 * 9행 유지 확인) **기존에도 못 맞추던 경로라 회귀는 아니다.** 권장 후속(범위 밖,
 * 손대지 않음): 이 페이지의 중복 외부 wrapper 를 제거하면 DataTable 자체 스크롤로
 * 자연히 해결된다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5420'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const SHOTS = resolveQaShotsDir(path.resolve('../../docs/qa/877-sonnet-r2-mascot'))
fs.mkdirSync(SHOTS, { recursive: true })

interface Box { left: number; right: number; width: number; center: number }

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

async function measureEmptyState(page: Page, expectedMessage: string) {
  await expect(page.getByText(expectedMessage)).toBeVisible({ timeout: 20_000 })
  await page.getByText(expectedMessage).scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  return page.evaluate((msg) => {
    const label = Array.from(document.querySelectorAll('*')).find(
      (el) => el.children.length === 0 && el.textContent?.trim() === msg,
    ) as HTMLElement | undefined
    if (!label) return { error: 'label not found' }
    const table = label.closest('table') as HTMLElement | null
    const wrapper = table?.parentElement as HTMLElement | null
    const box = (el: Element | null | undefined): Box | null => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), center: Math.round(r.left + r.width / 2) }
    }
    return {
      wrapper: box(wrapper),
      wrapperClientWidth: wrapper ? Math.round(wrapper.clientWidth) : null,
      tableScrollWidth: table ? Math.round(table.scrollWidth) : null,
      label: box(label),
    }
  }, expectedMessage)
}

test('울타리1 — 가로 스크롤 없는 표(수금계획) 빈 상태는 그대로 중앙', async ({ page }) => {
  await installAuth(page)
  await page.goto(`${BASE_URL}/#/accounting/reports/collection-plans`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25_000 })
  await dismissUpdateModal(page)

  const g = await measureEmptyState(page, '등록된 수금계획이 없습니다')
  await page.screenshot({ path: path.join(SHOTS, '01-collection-plans-no-scroll-empty.png'), fullPage: false })
  console.log('[FENCE1] ' + JSON.stringify(g, null, 2))

  if ('error' in g) throw new Error(`[FENCE1] 빈 상태 라벨을 찾지 못함: ${g.error}`)
  if (!g.wrapper || g.wrapperClientWidth === null || !g.label) throw new Error(`[FENCE1] 측정치 누락: ${JSON.stringify(g)}`)

  const hasScroll = (g.tableScrollWidth ?? 0) > g.wrapperClientWidth + 1
  expect(hasScroll, '[FENCE1] 전제 위반 — 이 표에 가로 스크롤이 생겼다(다른 표로 재선정 필요)').toBe(false)

  const visibleCenter = g.wrapper.left + g.wrapperClientWidth / 2
  expect(
    Math.abs(g.label.center - visibleCenter),
    `[FENCE1] 회귀 — 스크롤 없는 표에서도 중앙이 어긋남(${g.label.center} vs ${visibleCenter})`,
  ).toBeLessThanOrEqual(4)
})

test('울타리2 — 가로 스크롤 있는 다른 표(월별손익분석)에서도 DataTable 자체 스크롤 기준 중앙 정렬 확인', async ({ page }) => {
  await installAuth(page)
  // 목록 GET 만 읽기 전용으로 가로채 rows=[] 로 fulfill(DB 무변경) — 실 BE 는 특정
  // 연도에도 계정 스켈레톤을 반환해 실사용 경로로는 0건을 재현할 수 없었다(위 docstring).
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
        data: { fiscalYear: 1901, priorYear: 1900, fromDate: '1901-01-01', toDate: '1901-12-31', generatedAt: new Date().toISOString(), months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], rows: [] },
      }),
    })
  })

  await page.goto(`${BASE_URL}/#/accounting/reports/income-statement/monthly`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25_000 })
  await dismissUpdateModal(page)

  const g = await measureEmptyState(page, '해당 연도 손익 데이터가 없습니다.')
  await page.screenshot({ path: path.join(SHOTS, '02-monthly-income-statement-scroll-empty.png'), fullPage: false })
  console.log('[FENCE2] ' + JSON.stringify(g, null, 2))

  if ('error' in g) throw new Error(`[FENCE2] 빈 상태 라벨을 찾지 못함: ${g.error}`)
  if (!g.wrapper || g.wrapperClientWidth === null || !g.label) throw new Error(`[FENCE2] 측정치 누락: ${JSON.stringify(g)}`)

  const hasScroll = (g.tableScrollWidth ?? 0) > g.wrapperClientWidth + 1
  expect(hasScroll, '[FENCE2] 전제 위반 — DataTable 자체 스크롤 컨테이너에 가로 스크롤이 없다').toBe(true)

  // fix 의 실제 계약 — DataTable 자신의 내부 `.scroll` 기준으로는 항상 정확히 중앙(GREEN).
  const visibleCenter = g.wrapper.left + g.wrapperClientWidth / 2
  expect(
    Math.abs(g.label.center - visibleCenter),
    `[FENCE2] 회귀 — DataTable 자체 스크롤 기준 중앙 정렬이 다른 표에서도 깨짐(${g.label.center} vs ${visibleCenter})`,
  ).toBeLessThanOrEqual(4)

  // 참고 측정(하드 단언 아님) — 이 페이지가 추가한 바깥 `overflowX:auto` 카드 경계 기준
  // "실제 보이는 창"은 얼마나 다른지 로그로만 남긴다(알려진 아키텍처 캐벗 — docstring).
  const outer = await page.evaluate(() => {
    const table = document.querySelector('table')
    const scroll = table?.parentElement as HTMLElement | null // DataTable 내부 .scroll
    const outerScroller = scroll?.parentElement as HTMLElement | null // 컨슈머가 추가한 overflowX:auto div
    const card = outerScroller?.closest('[class*="Card"]') as HTMLElement | null
    const r = (el: HTMLElement | null) => el ? Math.round(el.getBoundingClientRect().left + el.clientWidth / 2) : null
    return { outerScrollerCenter: r(outerScroller), cardCenter: r(card) }
  })
  console.log(`[FENCE2/caveat] label.center=${g.label.center} vs outerScrollerCenter=${outer.outerScrollerCenter} cardCenter=${outer.cardCenter} (알려진 갭 — 하드 단언 아님)`)
})
