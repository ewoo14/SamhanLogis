/**
 * ct-blast-radius-real-qa.spec.ts — #877 OPUS R3 표면A
 *
 * design-system DataTable 변경(`.scroll{container-type:inline-size}` + 빈 상태
 * `.emptyCellSticky{position:sticky;left:0;width:100cqw}`) 의 blast radius 실측.
 *
 * 🚨 전제 — 머지 전 이 워크트리에서 실행할 때는 clients/desktop/node_modules 가 메인 트리
 * 심볼릭 링크라 :5420/:5421 이 **변경 없는** 메인 트리 design-system dist 를 서빙한다.
 * 그 경우 A-1 이 RED 로 떨어진다(그게 이 테스트의 목적). 이 브랜치 변경을 반영한 렌더러를
 * 별도 포트에 alias 로 띄우고 `AUDIT_BASE_URL` 로 지정해 실행할 것.
 * 머지 후에는 기본 :5420 이 그대로 유효하다.
 *
 * 측정 방식 — 같은 페이지에서 `.scroll` 의 container-type 을 인라인으로 normal 로
 * 되돌린 전/후 기하를 비교(동일 DOM·동일 데이터 A/B). 차이가 나면 그 값이 곧
 * 이 CSS 한 줄이 레이아웃에 미친 영향이다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5420'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const SHOTS = path.resolve('../../docs/qa/877-opus-r3-a')
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
    if (await b.count().catch(() => 0)) await b.first().click({ timeout: 2000 }).catch(() => undefined)
  }
}

/** 페이지 안의 모든 DataTable 기하 + 페이지 전역 기하 스냅샷. */
const SNAP = () => {
  const r = (n: number) => Math.round(n * 100) / 100
  const tables = Array.from(document.querySelectorAll('table')).map((t, i) => {
    const scroll = t.parentElement as HTMLElement
    const wrapper = scroll?.parentElement as HTMLElement
    const ths = Array.from(t.querySelectorAll('thead th')).map((th) => r((th as HTMLElement).getBoundingClientRect().width))
    const firstRow = t.querySelector('tbody tr')
    const tds = firstRow ? Array.from(firstRow.querySelectorAll('td')).map((td) => r((td as HTMLElement).getBoundingClientRect().width)) : []
    const tRect = t.getBoundingClientRect()
    const sRect = scroll?.getBoundingClientRect()
    const wRect = wrapper?.getBoundingClientRect()
    return {
      i,
      rows: t.querySelectorAll('tbody tr').length,
      table: { w: r(tRect.width), left: r(tRect.left), scrollW: t.scrollWidth },
      scroll: { w: r(sRect?.width ?? 0), clientW: scroll?.clientWidth ?? 0, scrollW: scroll?.scrollWidth ?? 0, scrollH: scroll?.scrollHeight ?? 0, clientH: scroll?.clientHeight ?? 0, left: r(sRect?.left ?? 0) },
      wrapper: { w: r(wRect?.width ?? 0), left: r(wRect?.left ?? 0), clientW: wrapper?.clientWidth ?? 0 },
      ths,
      tds,
    }
  })
  return {
    doc: { scrollW: document.documentElement.scrollWidth, clientW: document.documentElement.clientWidth, scrollH: document.documentElement.scrollHeight },
    body: { scrollW: document.body.scrollWidth },
    tables,
  }
}

/** container-type 을 normal 로 되돌린(=변경 전) 상태로 만든다. */
const DISABLE_CT = () => {
  const n = Array.from(document.querySelectorAll('table'))
    .map((t) => t.parentElement as HTMLElement)
    .filter(Boolean)
  n.forEach((el) => { el.style.containerType = 'normal' })
  void document.body.offsetWidth
  return n.length
}

const ENABLE_CT = () => {
  Array.from(document.querySelectorAll('table'))
    .map((t) => t.parentElement as HTMLElement)
    .filter(Boolean)
    .forEach((el) => { el.style.containerType = '' })
  void document.body.offsetWidth
}

function diff(a: ReturnType<typeof SNAP>, b: ReturnType<typeof SNAP>) {
  const out: string[] = []
  if (a.doc.scrollW !== b.doc.scrollW) out.push(`doc.scrollW ${a.doc.scrollW} -> ${b.doc.scrollW}`)
  if (a.doc.scrollH !== b.doc.scrollH) out.push(`doc.scrollH ${a.doc.scrollH} -> ${b.doc.scrollH}`)
  if (a.body.scrollW !== b.body.scrollW) out.push(`body.scrollW ${a.body.scrollW} -> ${b.body.scrollW}`)
  const n = Math.max(a.tables.length, b.tables.length)
  for (let i = 0; i < n; i++) {
    const x = a.tables[i]; const y = b.tables[i]
    if (!x || !y) { out.push(`table[${i}] 존재 여부 불일치`); continue }
    const cmp = (label: string, p: number, q: number) => { if (Math.abs(p - q) > 0.5) out.push(`table[${i}].${label} ${p} -> ${q}`) }
    cmp('table.w', x.table.w, y.table.w)
    cmp('table.scrollW', x.table.scrollW, y.table.scrollW)
    cmp('table.left', x.table.left, y.table.left)
    cmp('scroll.w', x.scroll.w, y.scroll.w)
    cmp('scroll.clientW', x.scroll.clientW, y.scroll.clientW)
    cmp('scroll.scrollW', x.scroll.scrollW, y.scroll.scrollW)
    cmp('scroll.clientH', x.scroll.clientH, y.scroll.clientH)
    cmp('scroll.scrollH', x.scroll.scrollH, y.scroll.scrollH)
    cmp('wrapper.w', x.wrapper.w, y.wrapper.w)
    if (JSON.stringify(x.ths) !== JSON.stringify(y.ths)) out.push(`table[${i}].ths ${JSON.stringify(x.ths)} -> ${JSON.stringify(y.ths)}`)
    if (JSON.stringify(x.tds) !== JSON.stringify(y.tds)) out.push(`table[${i}].tds ${JSON.stringify(x.tds)} -> ${JSON.stringify(y.tds)}`)
  }
  return out
}

const ROUTES: Array<{ path: string; name: string; wait?: string }> = [
  { path: '/accounting/accounts', name: 'account-tree(grid auto-fit 카드 다중 DataTable)' },
  { path: '/accounting/journals', name: 'journal-list' },
  { path: '/products/catalog', name: 'product-catalog' },
  { path: '/accounting/bank-transactions', name: 'bank-transactions(이 PR 대상 화면)' },
  { path: '/accounting/reports/income-statement/monthly', name: 'monthly-income(이중 스크롤+fixed layout)' },
  { path: '/sales/slips', name: 'slip-list' },
  { path: '/admin/partners', name: 'partners' },
  { path: '/products/estimate-items', name: 'estimate-items' },
  { path: '/accounting/reports/collection-plans', name: 'collection-plans(기본 0건)' },
]

test('A-1 서빙 확인 — 이 렌더러가 브랜치 design-system 을 반영하는가', async ({ page }) => {
  await installAuth(page)
  await page.goto(`${BASE_URL}/#/accounting/journals`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 30_000 })
  await dismissUpdateModal(page)
  await page.waitForSelector('table', { timeout: 20_000 })
  const info = await page.evaluate(() => {
    const t = document.querySelector('table')!
    const scroll = t.parentElement as HTMLElement
    const cs = getComputedStyle(scroll)
    const cssText = Array.from(document.styleSheets).flatMap((s) => {
      try { return Array.from(s.cssRules).map((r) => r.cssText) } catch { return [] }
    }).join('\n')
    return {
      containerType: cs.containerType,
      contain: cs.contain,
      hasEmptyCellStickyRule: /emptyCellSticky/.test(cssText),
      has100cqw: /100cqw/.test(cssText),
    }
  })
  console.log('[A-1] ' + JSON.stringify(info))
  expect(info.containerType, '[A-1] 이 렌더러가 브랜치 변경을 반영하지 않음(stale design-system)').toBe('inline-size')
  expect(info.hasEmptyCellStickyRule).toBe(true)
})

for (const route of ROUTES) {
  test(`A-2 ${route.name} — container-type ON/OFF 기하 비교(행 있음/없음 실데이터)`, async ({ page }) => {
    await installAuth(page)
    await page.goto(`${BASE_URL}/#${route.path}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 30_000 })
    await dismissUpdateModal(page)
    await page.waitForSelector('table', { timeout: 25_000 }).catch(() => undefined)
    await page.waitForTimeout(1200)

    const before = await page.evaluate(SNAP)
    const n = await page.evaluate(DISABLE_CT)
    await page.waitForTimeout(250)
    const after = await page.evaluate(SNAP)
    await page.evaluate(ENABLE_CT)

    const d = diff(before, after)
    console.log(`[A-2][${route.path}] tables=${n} rows=${before.tables.map((t) => t.rows).join(',')}`)
    console.log(`[A-2][${route.path}] ON : ${JSON.stringify(before.tables.map((t) => ({ w: t.table.w, sw: t.scroll.scrollW, cw: t.scroll.clientW })))}`)
    console.log(`[A-2][${route.path}] doc ON scrollW=${before.doc.scrollW} clientW=${before.doc.clientW} | OFF scrollW=${after.doc.scrollW}`)
    console.log(`[A-2][${route.path}] DIFF(${d.length}) ${d.length ? '\n  - ' + d.join('\n  - ') : '없음'}`)
  })
}

test('A-3 빈 상태 — emptyCellSticky 기하/오버플로 (가로 스크롤 있는 표)', async ({ page }) => {
  await installAuth(page)
  await page.route('**/accounting/reports/income-statement/monthly**', async (route) => {
    if (route.request().method() !== 'GET') return route.continue()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true, code: 'OK', message: '', timestamp: new Date().toISOString(),
        data: { fiscalYear: 1901, priorYear: 1900, fromDate: '1901-01-01', toDate: '1901-12-31', generatedAt: new Date().toISOString(), months: [1,2,3,4,5,6,7,8,9,10,11,12], rows: [] },
      }),
    })
  })
  await page.goto(`${BASE_URL}/#/accounting/reports/income-statement/monthly`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 30_000 })
  await dismissUpdateModal(page)
  await expect(page.getByText('해당 연도 손익 데이터가 없습니다.')).toBeVisible({ timeout: 25_000 })
  await page.waitForTimeout(500)

  const g = await page.evaluate(() => {
    const sticky = document.querySelector('[class*="emptyCellSticky"]') as HTMLElement | null
    if (!sticky) return { error: 'emptyCellSticky 없음' }
    const td = sticky.parentElement as HTMLElement
    const table = sticky.closest('table') as HTMLElement
    const scroll = table.parentElement as HTMLElement
    const r = (e: HTMLElement) => { const b = e.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width) } }
    return {
      sticky: r(sticky), td: r(td), table: r(table), scroll: r(scroll),
      scrollClientW: scroll.clientWidth, scrollScrollW: scroll.scrollWidth,
      docScrollW: document.documentElement.scrollWidth, docClientW: document.documentElement.clientWidth,
      stickyComputedWidth: getComputedStyle(sticky).width,
      stickyPosition: getComputedStyle(sticky).position,
    }
  })
  console.log('[A-3 초기] ' + JSON.stringify(g, null, 2))
  await page.screenshot({ path: path.join(SHOTS, 'A3-01-empty-wide-initial.png') })

  // 오른쪽 끝까지 스크롤 후 재측정
  await page.evaluate(() => {
    const t = document.querySelector('table')!
    const s = t.parentElement as HTMLElement
    s.scrollLeft = s.scrollWidth
  })
  await page.waitForTimeout(400)
  const g2 = await page.evaluate(() => {
    const sticky = document.querySelector('[class*="emptyCellSticky"]') as HTMLElement
    const table = sticky.closest('table') as HTMLElement
    const scroll = table.parentElement as HTMLElement
    const r = (e: HTMLElement) => { const b = e.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width) } }
    return { sticky: r(sticky), scroll: r(scroll), scrollLeft: scroll.scrollLeft, scrollClientW: scroll.clientWidth }
  })
  console.log('[A-3 우측끝] ' + JSON.stringify(g2))
  await page.screenshot({ path: path.join(SHOTS, 'A3-02-empty-wide-scrolled-right.png') })
})

test('A-4 좁은 화면(375px) 빈 상태 + 행 있음', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await installAuth(page)
  await page.goto(`${BASE_URL}/#/accounting/reports/collection-plans`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  await dismissUpdateModal(page)
  await page.waitForTimeout(1500)
  const g = await page.evaluate(() => {
    const sticky = document.querySelector('[class*="emptyCellSticky"]') as HTMLElement | null
    const table = document.querySelector('table') as HTMLElement | null
    const scroll = table?.parentElement as HTMLElement | null
    const r = (e: HTMLElement | null) => e ? (() => { const b = e.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width) } })() : null
    return {
      found: Boolean(sticky),
      sticky: r(sticky), table: r(table), scroll: r(scroll),
      scrollOverflowX: scroll ? getComputedStyle(scroll).overflowX : null,
      scrollContainerType: scroll ? getComputedStyle(scroll).containerType : null,
      docScrollW: document.documentElement.scrollWidth, docClientW: document.documentElement.clientWidth,
    }
  })
  console.log('[A-4 375px] ' + JSON.stringify(g, null, 2))
  await page.screenshot({ path: path.join(SHOTS, 'A4-01-narrow-375-empty.png'), fullPage: false })

  // 페이지를 가로로 밀어 sticky 가 어디에 붙는지
  await page.evaluate(() => window.scrollTo(document.documentElement.scrollWidth, 0))
  await page.waitForTimeout(300)
  const g2 = await page.evaluate(() => {
    const sticky = document.querySelector('[class*="emptyCellSticky"]') as HTMLElement | null
    const card = sticky?.closest('[class*="wrapper"]') as HTMLElement | null
    const r = (e: HTMLElement | null) => e ? (() => { const b = e.getBoundingClientRect(); return { left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width) } })() : null
    return { scrollX: Math.round(window.scrollX), sticky: r(sticky), wrapper: r(card) }
  })
  console.log('[A-4 375px 가로스크롤 후] ' + JSON.stringify(g2))
  await page.screenshot({ path: path.join(SHOTS, 'A4-02-narrow-375-empty-scrolled.png'), fullPage: false })
})

test('A-5 position:fixed 자손 · loadingOverlay z-순서 · sticky thead', async ({ page }) => {
  await installAuth(page)
  await page.goto(`${BASE_URL}/#/accounting/journals`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 30_000 })
  await dismissUpdateModal(page)
  await page.waitForSelector('table tbody tr', { timeout: 25_000 })
  await page.waitForTimeout(800)

  // (1) 셀 안에 position:fixed 자손을 심어 containing block 이 뷰포트인지 .scroll 인지 판정
  const fixedProbe = await page.evaluate(() => {
    const td = document.querySelector('table tbody tr td') as HTMLElement
    const scroll = (document.querySelector('table') as HTMLElement).parentElement as HTMLElement
    const probe = document.createElement('div')
    probe.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none'
    td.appendChild(probe)
    void document.body.offsetWidth
    const pb = probe.getBoundingClientRect()
    const sb = scroll.getBoundingClientRect()
    const withCt = { probe: { l: Math.round(pb.left), t: Math.round(pb.top), w: Math.round(pb.width), h: Math.round(pb.height) } }
    scroll.style.containerType = 'normal'
    void document.body.offsetWidth
    const pb2 = probe.getBoundingClientRect()
    const withoutCt = { probe: { l: Math.round(pb2.left), t: Math.round(pb2.top), w: Math.round(pb2.width), h: Math.round(pb2.height) } }
    scroll.style.containerType = ''
    probe.remove()
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      scrollBox: { l: Math.round(sb.left), t: Math.round(sb.top), w: Math.round(sb.width), h: Math.round(sb.height) },
      withCt, withoutCt,
    }
  })
  console.log('[A-5 fixed probe] ' + JSON.stringify(fixedProbe, null, 2))

  // (2) sticky thead 가 세로 스크롤에서 여전히 고정되는가
  const stickyThead = await page.evaluate(() => {
    const t = document.querySelector('table') as HTMLElement
    const s = t.parentElement as HTMLElement
    const th = t.querySelector('thead th') as HTMLElement
    const before = Math.round(th.getBoundingClientRect().top)
    s.scrollTop = Math.min(300, s.scrollHeight)
    void document.body.offsetWidth
    const after = Math.round(th.getBoundingClientRect().top)
    const scrollTop = s.scrollTop
    s.scrollTop = 0
    return { before, after, scrollTop, scrollable: s.scrollHeight > s.clientHeight }
  })
  console.log('[A-5 sticky thead] ' + JSON.stringify(stickyThead))

  // (3) loadingOverlay 와 sticky thead 의 paint 순서 (elementFromPoint)
  const overlay = await page.evaluate(() => {
    const t = document.querySelector('table') as HTMLElement
    const scroll = t.parentElement as HTMLElement
    const wrapper = scroll.parentElement as HTMLElement
    const th = t.querySelector('thead th') as HTMLElement
    const thRect = th.getBoundingClientRect()
    const ov = document.createElement('div')
    // DataTable.module.css .loadingOverlay 와 동일한 기하/스타일을 합성해 z-순서만 본다
    ov.setAttribute('data-probe', 'overlay')
    ov.style.cssText = 'position:absolute;inset:0;background:rgba(255,0,0,0.6);'
    wrapper.appendChild(ov)
    void document.body.offsetWidth
    const px = Math.round(thRect.left + Math.min(40, thRect.width / 2))
    const py = Math.round(thRect.top + thRect.height / 2)
    const topWithCt = (document.elementFromPoint(px, py) as HTMLElement | null)?.getAttribute('data-probe') ?? (document.elementFromPoint(px, py) as HTMLElement | null)?.tagName
    scroll.style.containerType = 'normal'
    void document.body.offsetWidth
    const topWithoutCt = (document.elementFromPoint(px, py) as HTMLElement | null)?.getAttribute('data-probe') ?? (document.elementFromPoint(px, py) as HTMLElement | null)?.tagName
    scroll.style.containerType = ''
    ov.remove()
    return { px, py, topWithCt, topWithoutCt }
  })
  console.log('[A-5 overlay z] ' + JSON.stringify(overlay))
  await page.screenshot({ path: path.join(SHOTS, 'A5-journals-rows.png') })
})
