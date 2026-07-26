import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * ct-mechanism-real-qa.spec.ts — #877 OPUS R3 표면A (기전 확인)
 *
 * `container-type: inline-size` 가 실제로 무엇을 바꾸는지 실 렌더러에서 확정한다.
 *  P1 고정 위치 자손의 containing block / stacking context — `contain:layout` 대조군으로
 *     프로브 감도까지 함께 검증(감도 없는 프로브로 "영향 없음"을 선언하지 않기 위함).
 *  P2 intrinsic sizing(축소-맞춤/flex min-content) 기여도 — 실 DataTable 노드 복제로 측정.
 *  P3 인쇄 미디어(@media print) 에서의 빈 상태/행 있음.
 *  P4 좁은 화면(375px) 행 있음 카드 모드.
 *  P5 실 모달 안 DataTable (flex item · max-width) — 실제 사용자 조작으로 열어서 측정.
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5420'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const SHOTS = resolveQaShotsDir(path.resolve('../../docs/qa/877-opus-r3-a'))
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

test('P0 런타임 — UA/Chromium 버전 + container query 지원', async ({ page }) => {
  await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' })
  const info = await page.evaluate(() => ({
    ua: navigator.userAgent,
    supportsContainerType: CSS.supports('container-type', 'inline-size'),
    supportsCqw: CSS.supports('width', '100cqw'),
  }))
  console.log('[P0] ' + JSON.stringify(info))
})

test('P1 containing block / stacking context — contain:layout 대조군 포함', async ({ page }) => {
  await installAuth(page)
  await page.goto(`${BASE_URL}/#/accounting/journals`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 30_000 })
  await dismissUpdateModal(page)
  await page.waitForSelector('table tbody tr', { timeout: 25_000 })
  await page.waitForTimeout(600)

  const r = await page.evaluate(() => {
    const table = document.querySelector('table') as HTMLElement
    const scroll = table.parentElement as HTMLElement
    const td = table.querySelector('tbody tr td') as HTMLElement

    const fixedProbe = document.createElement('div')
    fixedProbe.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none'
    td.appendChild(fixedProbe)

    const measure = () => {
      void document.body.offsetWidth
      const b = fixedProbe.getBoundingClientRect()
      return { l: Math.round(b.left), t: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }
    }
    const sb = scroll.getBoundingClientRect()
    const scrollBox = { l: Math.round(sb.left), t: Math.round(sb.top), w: Math.round(sb.width), h: Math.round(sb.height) }

    const asShipped = measure()                                  // container-type: inline-size (CSS)
    scroll.style.containerType = 'normal'
    const noCt = measure()                                       // 변경 전
    scroll.style.containerType = ''
    scroll.style.contain = 'layout'                              // 대조군 — 감도 확인
    const containLayout = measure()
    scroll.style.contain = ''
    fixedProbe.remove()

    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      scrollBox,
      asShipped, noCt, containLayout,
      computedContain: getComputedStyle(scroll).contain,
      computedContainerType: getComputedStyle(scroll).containerType,
    }
  })
  console.log('[P1] ' + JSON.stringify(r, null, 2))
})

test('P2 intrinsic sizing 기여도 — 실 DataTable 노드 복제 측정', async ({ page }) => {
  await installAuth(page)
  // bank-transactions = 열 폭 합(1654) > 보이는 창(1116) 인 실 표
  await page.goto(`${BASE_URL}/#/accounting/bank-transactions`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 30_000 })
  await dismissUpdateModal(page)
  await page.waitForSelector('table', { timeout: 25_000 })
  await page.waitForTimeout(1200)

  const r = await page.evaluate(() => {
    const table = document.querySelector('table') as HTMLElement
    const wrapper = (table.parentElement as HTMLElement).parentElement as HTMLElement
    const clone = wrapper.cloneNode(true) as HTMLElement
    const cloneScroll = clone.querySelector('table')!.parentElement as HTMLElement

    const host = document.createElement('div')
    host.style.cssText = 'position:absolute;top:0;left:0;visibility:hidden;'
    const box = document.createElement('div')
    host.appendChild(box)
    box.appendChild(clone)
    document.body.appendChild(host)

    const w = () => { void document.body.offsetWidth; return Math.round(box.getBoundingClientRect().width) }
    const setCt = (v: string) => { cloneScroll.style.containerType = v }

    const out: Record<string, { ct: number; noCt: number }> = {}
    const scenarios: Array<[string, string]> = [
      ['width:max-content', 'width:max-content'],
      ['width:fit-content', 'width:fit-content'],
      ['display:inline-block(auto)', 'display:inline-block'],
      ['float:left(auto)', 'float:left'],
      ['position:absolute(auto)', 'position:absolute'],
      ['flex-item(row,min-width:auto,600px container)', '__flex__'],
    ]
    for (const [label, css] of scenarios) {
      if (css === '__flex__') {
        host.style.cssText = 'position:absolute;top:0;left:0;visibility:hidden;width:600px;display:flex;'
        box.style.cssText = 'flex:0 1 auto;'
      } else {
        host.style.cssText = 'position:absolute;top:0;left:0;visibility:hidden;width:600px;'
        box.style.cssText = css
      }
      setCt('')
      const ct = w()
      setCt('normal')
      const noCt = w()
      out[label] = { ct, noCt }
    }
    const realTableWidth = Math.round(table.getBoundingClientRect().width)
    host.remove()
    return { realTableWidth, out }
  })
  console.log('[P2] ' + JSON.stringify(r, null, 2))
})

test('P3 인쇄 미디어 — 빈 상태 / 행 있음', async ({ page }) => {
  await installAuth(page)
  await page.goto(`${BASE_URL}/#/accounting/bank-transactions`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 30_000 })
  await dismissUpdateModal(page)
  await page.waitForSelector('table', { timeout: 25_000 })
  await page.waitForTimeout(1000)

  const screen = await page.evaluate(() => {
    const t = document.querySelector('table') as HTMLElement
    const s = t.parentElement as HTMLElement
    return { table: Math.round(t.getBoundingClientRect().width), scrollClientW: s.clientWidth, scrollScrollW: s.scrollWidth, docScrollW: document.documentElement.scrollWidth }
  })
  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(400)
  const printed = await page.evaluate(() => {
    const t = document.querySelector('table') as HTMLElement
    const s = t.parentElement as HTMLElement
    const sticky = document.querySelector('[class*="emptyCellSticky"]') as HTMLElement | null
    return {
      table: Math.round(t.getBoundingClientRect().width),
      scrollClientW: s.clientWidth, scrollScrollW: s.scrollWidth,
      scrollOverflow: getComputedStyle(s).overflow,
      containerType: getComputedStyle(s).containerType,
      docScrollW: document.documentElement.scrollWidth,
      sticky: sticky ? { w: Math.round(sticky.getBoundingClientRect().width), pos: getComputedStyle(sticky).position } : null,
    }
  })
  await page.screenshot({ path: path.join(SHOTS, 'P3-01-print-bank-transactions.png'), fullPage: false })
  console.log('[P3 화면] ' + JSON.stringify(screen))
  console.log('[P3 인쇄] ' + JSON.stringify(printed))

  // 빈 표 인쇄
  await page.emulateMedia({ media: 'screen' })
  await page.goto(`${BASE_URL}/#/accounting/reports/collection-plans`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page.emulateMedia({ media: 'print' })
  await page.waitForTimeout(400)
  const emptyPrint = await page.evaluate(() => {
    const sticky = document.querySelector('[class*="emptyCellSticky"]') as HTMLElement | null
    const t = document.querySelector('table') as HTMLElement | null
    const s = t?.parentElement as HTMLElement | null
    return {
      sticky: sticky ? { w: Math.round(sticky.getBoundingClientRect().width), left: Math.round(sticky.getBoundingClientRect().left), pos: getComputedStyle(sticky).position, cssW: getComputedStyle(sticky).width } : null,
      table: t ? Math.round(t.getBoundingClientRect().width) : null,
      scrollClientW: s?.clientWidth ?? null,
      docScrollW: document.documentElement.scrollWidth, docClientW: document.documentElement.clientWidth,
    }
  })
  console.log('[P3 빈표 인쇄] ' + JSON.stringify(emptyPrint))
  await page.screenshot({ path: path.join(SHOTS, 'P3-02-print-empty-table.png'), fullPage: false })
  await page.emulateMedia({ media: 'screen' })
})

test('P4 375px 카드 모드 — 행 있음 CT ON/OFF', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await installAuth(page)
  await page.goto(`${BASE_URL}/#/accounting/journals`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)
  await dismissUpdateModal(page)
  await page.waitForSelector('table', { timeout: 25_000 }).catch(() => undefined)
  await page.waitForTimeout(1500)
  const r = await page.evaluate(() => {
    const t = document.querySelector('table') as HTMLElement | null
    if (!t) return { error: 'table 없음' }
    const s = t.parentElement as HTMLElement
    const snap = () => { void document.body.offsetWidth; return {
      table: Math.round(t.getBoundingClientRect().width),
      firstRowH: Math.round((t.querySelector('tbody tr') as HTMLElement | null)?.getBoundingClientRect().height ?? 0),
      docScrollW: document.documentElement.scrollWidth,
      docScrollH: document.documentElement.scrollHeight,
      scrollOverflowX: getComputedStyle(s).overflowX,
    } }
    const ct = snap()
    s.style.containerType = 'normal'
    const noCt = snap()
    s.style.containerType = ''
    return { ct, noCt, rows: t.querySelectorAll('tbody tr').length }
  })
  console.log('[P4] ' + JSON.stringify(r, null, 2))
  await page.screenshot({ path: path.join(SHOTS, 'P4-01-narrow-375-rows.png'), fullPage: false })
})

test('P5 모달 안 DataTable — 실 조작으로 열어 flex item 폭 측정', async ({ page }) => {
  await installAuth(page)
  await page.goto(`${BASE_URL}/#/accounting/funds-status`, { waitUntil: 'domcontentloaded' }).catch(() => undefined)
  await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 30_000 })
  await dismissUpdateModal(page)
  await page.waitForTimeout(2500)
  await page.screenshot({ path: path.join(SHOTS, 'P5-00-funds-status.png') })

  // 증가 상세 링크(있으면) 클릭 → 모달
  const link = page.locator('[data-testid*="funds"] a, button', { hasText: /상세|증가/ })
  const cnt = await link.count().catch(() => 0)
  console.log('[P5] 후보 버튼 수=' + cnt)
  if (cnt > 0) {
    await link.first().click({ timeout: 5000 }).catch(() => undefined)
    await page.waitForTimeout(1500)
  }
  const r = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement | null
    if (!dialog) return { error: 'dialog 없음' }
    const t = dialog.querySelector('table') as HTMLElement | null
    if (!t) return { error: 'dialog 안 table 없음' }
    const s = t.parentElement as HTMLElement
    const snap = () => { void document.body.offsetWidth; return {
      dialog: Math.round(dialog.getBoundingClientRect().width),
      table: Math.round(t.getBoundingClientRect().width),
      scrollClientW: s.clientWidth, scrollScrollW: s.scrollWidth,
      docScrollW: document.documentElement.scrollWidth,
    } }
    const ct = snap()
    s.style.containerType = 'normal'
    const noCt = snap()
    s.style.containerType = ''
    return { ct, noCt }
  })
  console.log('[P5] ' + JSON.stringify(r, null, 2))
  await page.screenshot({ path: path.join(SHOTS, 'P5-01-modal-datatable.png') })
})
