import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 877-opus-r3-c-containment-real-qa.spec.ts
 *
 * 표면 C 부수 확인 — 4단계가 design-system `DataTable.module.css .scroll` 에 추가한
 * `container-type: inline-size` 는 CSS 명세상 `contain: layout style inline-size` 를
 * 함께 적용한다. **layout containment 는 그 요소를 `position: fixed` 후손의 포함 블록으로
 * 만든다.** 입출금 내역 표의 `거래처` 칸에는 `PartnerAutocomplete`(내부 `AsyncAutocomplete`)
 * 가 렌더되고 그 드롭다운은 `position: fixed` + viewport 좌표(getBoundingClientRect)로
 * 자리를 잡는다 — 만약 이 드롭다운이 `.scroll` 안에 남아 있다면 4단계 CSS 한 줄이
 * 드롭다운을 `.scroll` 기준으로 밀어버려 "검색창과 목록이 어긋나는" 실사용 결함이 된다.
 *
 * 여기서는 실서버 실화면에서 드롭다운을 열어 **입력창 rect 와 드롭다운 rect 의 관계를
 * 직접 측정**한다(코드 읽기로 갈음하지 않는다).
 *
 * 🚨 쓰기 금지 — 거래처 옵션을 선택하면 실제 매칭 write 가 발생하므로 선택하지 않는다.
 * 추가로 GET 이외의 모든 요청을 route 에서 abort 시켜 실 write 를 원천 차단한다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5420'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const SHOTS = resolveQaShotsDir(path.resolve('../../docs/qa/877-opus-r3-c'))
fs.mkdirSync(SHOTS, { recursive: true })

async function installAuth(page: Page) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: 'dev_master', password: (process.env.DEV_PASSWORD ?? '') }),
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

test('C-4 DataTable containment — 표 안 거래처 자동완성 드롭다운이 입력창에 정확히 붙는다', async ({ page }) => {
  const writes: string[] = []
  const frontLogs: string[] = []
  await page.route('**/*', async (route) => {
    const m = route.request().method()
    if (m === 'GET' || m === 'OPTIONS' || m === 'HEAD') return route.continue()
    const url = route.request().url()
    if (url.startsWith(API_BASE)) {
      // /logs/front 는 프런트 로그 텔레메트리(도메인 write 아님) — 내용을 기록해 두고 차단한다.
      if (url.includes('/logs/front')) frontLogs.push((route.request().postData() ?? '').slice(0, 400))
      else writes.push(`${m} ${url}`)
      return route.abort()
    }
    return route.continue()
  })
  const consoleErrors: string[] = []
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300)) })
  page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message.slice(0, 300)}`))

  await installAuth(page)
  await page.goto(`${BASE_URL}/#/accounting/bank-transactions`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('codef-import-type')).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1500)

  // 전체/전체 탭 = 소스·매칭상태 열 존재 = 가로 스크롤이 가장 넓은 상태(4단계 조건부 컬럼)
  const headers = await page.locator('table thead th').allTextContents()
  console.log(`[C-4] 헤더: ${JSON.stringify(headers)}`)
  expect(headers).toContain('소스')

  // .scroll 이 실제로 containment context 인지 먼저 확증(측정이 증명하는 것 진술)
  const scrollInfo = await page.evaluate(() => {
    const table = document.querySelector('table')
    if (!table) return null
    let el: HTMLElement | null = table.parentElement
    while (el && getComputedStyle(el).overflowX === 'visible') el = el.parentElement
    if (!el) return null
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return {
      containerType: cs.containerType, contain: cs.contain,
      scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
      top: r.top, left: r.left,
    }
  })
  console.log(`[C-4] .scroll 실측: ${JSON.stringify(scrollInfo)}`)
  expect(scrollInfo?.containerType, '4단계 CSS 가 실제로 적용돼 있어야 이 측정이 의미가 있다').toBe('inline-size')

  // 기본 조회구간(당월)에는 시드 거래가 없어 표가 비어 있다 — 구간을 넓혀 실제 행을 띄운다.
  await page.locator('.mobile-filter-stack input[type="date"]').nth(0).fill('2019-01-01')
  await page.locator('.mobile-filter-stack input[type="date"]').nth(1).fill('2026-12-31')
  await page.getByRole('button', { name: '조회', exact: true }).click()
  await page.waitForTimeout(2500)
  const rowCount = await page.locator('table tbody tr').count()
  console.log(`[C-4] 조회 후 행 수: ${rowCount}`)
  expect(rowCount, '측정하려면 실제 행이 있어야 한다').toBeGreaterThan(1)

  // 첫 미반영 행의 거래처 검색창 열기 (선택은 하지 않는다)
  const input = page.locator('[data-testid^="bank-transaction-partner-search-"] input').first()
  await expect(input).toBeVisible({ timeout: 20_000 })
  await input.scrollIntoViewIfNeeded()
  await input.click()
  await input.type('삼', { delay: 60 })
  await page.waitForTimeout(1200)

  const geom = await page.evaluate(() => {
    const inp = document.querySelector('[data-testid^="bank-transaction-partner-search-"] input') as HTMLElement | null
    if (!inp) return null
    const lb = document.querySelector('[role="listbox"], [role="status"][class*="dropdown"], [class*="dropdown"]') as HTMLElement | null
    if (!lb) return { hasDropdown: false, input: inp.getBoundingClientRect().toJSON() }
    const r = lb.getBoundingClientRect()
    return {
      hasDropdown: true,
      inParentBody: lb.closest('table') === null,
      input: inp.getBoundingClientRect().toJSON(),
      dropdown: r.toJSON(),
      position: getComputedStyle(lb).position,
    }
  })
  console.log(`[C-4] 기하 실측: ${JSON.stringify(geom)}`)
  await page.screenshot({ path: path.join(SHOTS, 'c4-01-partner-autocomplete-dropdown.png'), fullPage: false })

  expect(geom?.hasDropdown, '드롭다운이 열려야 측정 가능').toBeTruthy()
  const g = geom as { input: { left: number; bottom: number; width: number }; dropdown: { left: number; top: number; width: number } }
  console.log(`[C-4] 입력창 bottom=${g.input.bottom} left=${g.input.left} / 드롭다운 top=${g.dropdown.top} left=${g.dropdown.left}`)
  // 판정 기준 — layout containment 가 드롭다운을 삼켰다면 `position:fixed` 의 기준이
  // viewport 가 아니라 `.scroll` 의 패딩 박스가 되어 (.scroll top≈1002 / left≈282 만큼)
  // 수백 px 어긋난다. 실제 어긋남이 입력창 테두리/패딩 수준(≤20px)이면 viewport 기준이다.
  expect(Math.abs(g.dropdown.top - g.input.bottom), '드롭다운은 입력창 바로 아래에 붙어야 한다(수백 px 이탈=containment 파손)').toBeLessThanOrEqual(20)
  expect(Math.abs(g.dropdown.left - g.input.left), '드롭다운 좌측은 입력창 좌측과 거의 일치해야 한다').toBeLessThanOrEqual(20)
  expect(geom?.inParentBody, '드롭다운은 표 밖(document.body 포털)에 렌더돼야 containment 영향권 밖이다').toBeTruthy()

  await page.keyboard.press('Escape')
  console.log(`[C-4] 프런트 로그 텔레메트리(차단됨): ${JSON.stringify(frontLogs)}`)
  console.log(`[C-4] 콘솔 에러: ${JSON.stringify(consoleErrors)}`)
  expect(writes, '이 스펙은 어떤 도메인 write 도 서버에 보내지 않아야 한다').toEqual([])
})
