import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * ct-route-sweep-real-qa.spec.ts — #877 OPUS R3 표면A 광범위 스윕
 *
 * DataTable 소비 화면을 실서버로 순회하며 `.scroll{container-type:inline-size}` 을
 * 인라인으로 껐다 켠 전/후 기하를 비교한다. 차이가 0 이 아니면 그 화면이 이 CSS 한 줄의
 * 영향을 받는 화면이다. 아울러 각 DataTable 의 조상 체인이 "내용 기반 폭"(축소-맞춤 /
 * flex·grid item)인지 함께 기록한다 — P2 에서 확인된 붕괴(2px) 조건에 해당하는지 판정용.
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5420'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const OUT = resolveQaShotsDir(path.resolve('../../docs/qa/877-opus-r3-a'))
fs.mkdirSync(OUT, { recursive: true })

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

const ROUTES = [
  '/notifications', '/groupware/approvals', '/groupware/approval-templates',
  '/warehouses', '/sales/slips', '/sales/link-dispatch', '/sales/estimates',
  '/sales/partner-orders', '/sales/order-approvals', '/purchases/slips',
  '/inventory/stock-balance', '/transfers', '/accounting/accounts',
  '/accounting/journals', '/accounting/balances', '/accounting/reports/income-statement/monthly',
  '/accounting/reports/notes-receivable', '/accounting/reports/collection-plans',
  '/accounting/bank-card-admin', '/accounting/bank-transactions',
  '/accounting/reports/journal-status', '/accounting/reports/account-statement',
  '/accounting/funds/status', '/dispatch-board/history',
  '/arologis/admin/auto-dispatch', '/arologis/admin/manual-dispatch', '/warehouse/closing',
  '/accounting/sales-slips', '/accounting/purchase-slips', '/accounting/daily-closing',
  '/accounting/ledgers', '/accounting/period-close', '/sales/closing',
  '/accounting/tax-invoices', '/accounting/tax-invoices/batch', '/accounting/tax-invoices/inbound',
  '/admin/partners', '/products/catalog', '/products/estimate-items', '/products/classifications',
  '/admin/permission-groups/manage', '/admin/app-notices', '/admin/activity-logs',
  '/admin/app-releases', '/warehouse/inbound-inspections', '/warehouse/audit',
  '/accounting/reports/partner-aging', '/accounting/deposit-mappings', '/admin/users',
]

test('SWEEP — DataTable 소비 화면 전수 container-type ON/OFF 기하 비교', async ({ page }) => {
  test.setTimeout(15 * 60 * 1000)
  await installAuth(page)
  await page.goto(`${BASE_URL}/#/accounting/journals`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 40_000 })
  for (const label of ['닫기', '확인']) {
    const b = page.getByRole('button', { name: label })
    if (await b.count().catch(() => 0)) await b.first().click({ timeout: 2000 }).catch(() => undefined)
  }

  const report: Record<string, unknown> = {}
  for (const route of ROUTES) {
    await page.goto(`${BASE_URL}/#${route}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2600)
    const r = await page.evaluate(() => {
      const tables = Array.from(document.querySelectorAll('table'))
      const dts = tables
        .map((t) => ({ t, s: t.parentElement as HTMLElement }))
        .filter((x) => x.s && getComputedStyle(x.s).containerType === 'inline-size')
      if (dts.length === 0) return { dataTables: 0 }
      const snap = () => {
        void document.body.offsetWidth
        return {
          doc: document.documentElement.scrollWidth,
          items: dts.map(({ t, s }) => {
            const w = s.parentElement as HTMLElement
            return [Math.round(t.getBoundingClientRect().width), s.clientWidth, s.scrollWidth, Math.round(w.getBoundingClientRect().width), Math.round(t.getBoundingClientRect().height)]
          }),
        }
      }
      const on = snap()
      dts.forEach(({ s }) => { s.style.containerType = 'normal' })
      const off = snap()
      dts.forEach(({ s }) => { s.style.containerType = '' })

      // 조상 체인 위험 패턴(내용 기반 폭) 탐지
      const risky: string[] = []
      dts.forEach(({ s }, idx) => {
        let el: HTMLElement | null = s.parentElement as HTMLElement
        let depth = 0
        while (el && el !== document.body && depth < 25) {
          const cs = getComputedStyle(el)
          const parent = el.parentElement
          const pcs = parent ? getComputedStyle(parent) : null
          const isFlexItem = Boolean(pcs && /flex/.test(pcs.display))
          const isGridItem = Boolean(pcs && /grid/.test(pcs.display))
          const shrinkToFit = cs.float !== 'none' || /inline-block|inline-flex|inline-grid|table-cell/.test(cs.display) || (cs.position === 'absolute' && cs.width === 'auto') || /fit-content|max-content|min-content/.test(cs.width)
          if (shrinkToFit) risky.push(`dt${idx}: 축소맞춤 조상 <${el.tagName.toLowerCase()} class="${el.className}"> display=${cs.display} float=${cs.float} pos=${cs.position} w=${cs.width}`)
          if (isFlexItem && cs.flexBasis === 'auto' && cs.width === 'auto' && pcs && /row/.test(pcs.flexDirection)) risky.push(`dt${idx}: flex-item(basis auto, width auto, row) <${el.tagName.toLowerCase()} class="${el.className}">`)
          if (isGridItem && pcs) {
            const tpl = pcs.gridTemplateColumns
            if (/auto|min-content|max-content/.test(tpl)) risky.push(`dt${idx}: grid-item(track=${tpl}) <${el.tagName.toLowerCase()} class="${el.className}">`)
          }
          el = el.parentElement
          depth++
        }
      })
      return { dataTables: dts.length, on, off, risky, rows: dts.map(({ t }) => t.querySelectorAll('tbody tr').length) }
    })
    const changed = r.dataTables > 0 && JSON.stringify(r.on) !== JSON.stringify(r.off)
    report[route] = r
    console.log(`[SWEEP] ${route} tables=${r.dataTables} rows=${JSON.stringify((r as { rows?: number[] }).rows ?? [])} CHANGED=${changed}${changed ? ' ON=' + JSON.stringify(r.on) + ' OFF=' + JSON.stringify(r.off) : ''}${(r as { risky?: string[] }).risky?.length ? ' RISKY=' + JSON.stringify((r as { risky?: string[] }).risky) : ''}`)
  }
  fs.writeFileSync(path.join(OUT, 'sweep.json'), JSON.stringify(report, null, 2), 'utf-8')
})
