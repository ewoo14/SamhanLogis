/**
 * mascot-center-probe-real-qa.spec.ts
 *
 * 개발책임자 지적 — 빈 상태 마스코트(삼한이)가 표 가운데가 아니라 우측으로 쏠려 보인다.
 * 추정하지 않고 실 DOM 의 기하를 측정한다. (읽기 전용 · 쓰기 없음)
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5420'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const SHOTS = path.resolve('../../docs/qa/877-pm-cgate')
fs.mkdirSync(SHOTS, { recursive: true })

test('빈 상태 마스코트 기하 측정', async ({ page, request }) => {
  const res = await request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password: 'dev_p05_pass!' },
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

  await page.goto(`${BASE_URL}/#/accounting/bank-transactions`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('MASTER').first()).toBeVisible({ timeout: 25_000 })
  for (const label of ['닫기', '확인']) {
    const b = page.getByRole('button', { name: label })
    if (await b.count().catch(() => 0)) await b.first().click().catch(() => undefined)
  }
  await expect(page.getByText('입출금 거래가 없습니다')).toBeVisible({ timeout: 20_000 })
  await page.getByText('입출금 거래가 없습니다').scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)

  const geom = await page.evaluate(() => {
    const label = Array.from(document.querySelectorAll('*')).find(
      (el) => el.children.length === 0 && el.textContent?.trim() === '입출금 거래가 없습니다',
    ) as HTMLElement | undefined
    if (!label) return { error: 'label not found' }
    const td = label.closest('td') as HTMLElement | null
    const table = label.closest('table') as HTMLElement | null
    const wrapper = table?.parentElement as HTMLElement | null
    const svg = td?.querySelector('svg') as SVGElement | null
    const box = (el: Element | null | undefined) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), center: Math.round(r.left + r.width / 2) }
    }
    // td 바로 아래 컨테이너 체인
    const chain: Array<Record<string, unknown>> = []
    let cur: HTMLElement | null = label
    while (cur && cur !== td) {
      const cs = getComputedStyle(cur)
      chain.push({
        tag: cur.tagName.toLowerCase(),
        cls: cur.className?.toString().slice(0, 60),
        display: cs.display,
        alignItems: cs.alignItems,
        justifyContent: cs.justifyContent,
        margin: `${cs.marginLeft} / ${cs.marginRight}`,
        textAlign: cs.textAlign,
        width: Math.round(cur.getBoundingClientRect().width),
        left: Math.round(cur.getBoundingClientRect().left),
      })
      cur = cur.parentElement
    }
    const tdStyle = td ? getComputedStyle(td) : null
    return {
      table: box(table),
      wrapper: box(wrapper),
      wrapperScrollWidth: wrapper ? Math.round(wrapper.scrollWidth) : null,
      wrapperClientWidth: wrapper ? Math.round(wrapper.clientWidth) : null,
      tableScrollWidth: table ? Math.round(table.scrollWidth) : null,
      td: box(td),
      tdColSpan: td?.getAttribute('colspan'),
      tdDisplay: tdStyle?.display,
      tdTextAlign: tdStyle?.textAlign,
      tdPadding: tdStyle ? `${tdStyle.paddingLeft} / ${tdStyle.paddingRight}` : null,
      headerCells: document.querySelectorAll('table thead th').length,
      mascot: box(svg),
      label: box(label),
      chainFromLabelUpToTd: chain,
    }
  })

  console.log('[GEOM] ' + JSON.stringify(geom, null, 2))
  await page.screenshot({ path: path.join(SHOTS, '90-mascot-center-probe.png'), fullPage: false })
})
