import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * mascot-center-probe-real-qa.spec.ts
 *
 * 개발책임자 지적 — 빈 상태 마스코트(삼한이)가 표 가운데가 아니라 우측으로 쏠려 보인다.
 * 추정하지 않고 실 DOM 의 기하를 측정한다. (읽기 전용 · 쓰기 없음)
 *
 * 🚨 SONNET5 R2 — RED-first 전환. 종전에는 geom 을 로그만 찍고 단언이 없었다
 * (관찰용 스캐폴드). 원인은 이미 PM 실측으로 확정됐다 — 빈 상태가 "보이는 창"이
 * 아니라 "가로 스크롤로 감춰진 부분까지 포함한 표 전체 폭"의 중앙에 놓인다.
 *
 * 불변식:
 *   I-A1 — 표에 가로 스크롤이 있어도 빈 상태 문구/마스코트가 "보이는 창"(스크롤
 *          컨테이너의 clientWidth) 기준 중앙에 보인다 — scrollLeft=0(최초 진입) 뿐
 *          아니라 사용자가 실제로 스크롤한 뒤에도 유지된다.
 *   I-A2 — 빈 상태 문구가 가로 스크롤 없이는 볼 수 없는 위치(보이는 창 밖)로
 *          밀려나지 않는다 — 문구 전체가 보이는 창의 [left, left+clientWidth] 안에 있다.
 *
 * mascot 셀렉터 버그 수정: 원본은 `td.querySelector('svg')` 를 썼으나 실제 마스코트는
 * `<img>` (samhani-static.png) 다 — svg 는 이 트리에 없어 mascot 측정치가 항상 null 이었다.
 *
 * 🚨 뮤테이션 실측 메모 — `position:sticky; left:0` 을 제거하고 `width:100cqw` 만
 * 남긴 뮤턴트를 scrollLeft=0 에서만 측정했을 때는 **GREEN 이 나왔다**(정적 배치의
 * 시작 좌표가 우연히 스크롤 창의 좌측 경계와 같아서 sticky 유무가 구별되지 않음).
 * 그래서 이 스펙은 scrollLeft=0 측정에 더해 **스크롤을 최대치로 이동시킨 뒤 재측정**
 * 하는 2 차 단언을 추가한다 — sticky 가 없으면 이 2 차 측정에서만 어긋난다.
 */
import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5420'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const SHOTS = resolveQaShotsDir(path.resolve('../../docs/qa/877-pm-cgate'))
fs.mkdirSync(SHOTS, { recursive: true })

interface Box { left: number; right: number; width: number; center: number }
interface Geom {
  error?: string
  table: Box | null
  wrapper: Box | null
  wrapperScrollWidth: number | null
  wrapperClientWidth: number | null
  tableScrollWidth: number | null
  td: Box | null
  tdColSpan: string | null | undefined
  headerCells: number
  mascot: Box | null
  label: Box | null
  scrollLeftApplied: number
}

async function measureGeom(page: Page, scrollTo: 'start' | 'end'): Promise<Geom> {
  return page.evaluate((pos) => {
    const label = Array.from(document.querySelectorAll('*')).find(
      (el) => el.children.length === 0 && el.textContent?.trim() === '입출금 거래가 없습니다',
    ) as HTMLElement | undefined
    if (!label) return { error: 'label not found' } as unknown as ReturnType<typeof Object>
    const td = label.closest('td') as HTMLElement | null
    const table = label.closest('table') as HTMLElement | null
    const wrapper = table?.parentElement as HTMLElement | null

    // 스크롤 이동(측정 직전) — I-A1 이 스크롤 위치와 무관하게 성립하는지 검증하기 위함.
    if (wrapper) {
      wrapper.scrollLeft = pos === 'end' ? wrapper.scrollWidth - wrapper.clientWidth : 0
    }

    const mascotImg = td?.querySelector('img') as HTMLImageElement | null
    const box = (el: Element | null | undefined) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      return { left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), center: Math.round(r.left + r.width / 2) }
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
      headerCells: document.querySelectorAll('table thead th').length,
      mascot: box(mascotImg),
      label: box(label),
      scrollLeftApplied: wrapper?.scrollLeft ?? -1,
    }
  }, scrollTo) as Geom
}

function assertCentered(g: Geom, scenario: string) {
  if (g.error) throw new Error(`[GEOM/${scenario}] 빈 상태 라벨을 찾지 못했다: ${g.error}`)
  if (!g.wrapper || g.wrapperClientWidth === null || !g.label) {
    throw new Error(`[GEOM/${scenario}] 필수 측정치 누락: ${JSON.stringify(g)}`)
  }

  // 가로 스크롤이 실제로 존재하는 시나리오인지 먼저 확인 — 이 스펙은 "표가
  // 보이는 창보다 넓다"를 전제로 한다 (I-A1 은 바로 이 케이스의 불변식).
  const hasHorizontalScroll = (g.tableScrollWidth ?? 0) > g.wrapperClientWidth + 1
  expect(hasHorizontalScroll, `[${scenario}] 이 페이지의 표에 가로 스크롤이 없다 — I-A1 전제 불충족(다른 표로 재측정 필요)`).toBe(true)

  const TOLERANCE = 4 // px — devicePixelRatio 반올림 여유
  const visibleLeft = g.wrapper.left
  const visibleRight = g.wrapper.left + g.wrapperClientWidth
  const visibleCenter = g.wrapper.left + g.wrapperClientWidth / 2

  // I-A1 — 문구 중심이 "보이는 창" 중심과 일치한다(표 전체 폭 중심이 아니라).
  expect(
    Math.abs(g.label.center - visibleCenter),
    `[${scenario}] I-A1 위반 — 문구 중심(${g.label.center})이 보이는 창 중심(${visibleCenter})에서 ${Math.abs(g.label.center - visibleCenter)}px 벗어남 (scrollLeft=${g.scrollLeftApplied})`,
  ).toBeLessThanOrEqual(TOLERANCE)

  // I-A1 — 마스코트 이미지 중심도 동일하게 보이는 창 중심과 일치한다.
  expect(g.mascot, `[${scenario}] 마스코트 <img> 를 찾지 못함(셀렉터 회귀)`).not.toBeNull()
  if (g.mascot) {
    expect(
      Math.abs(g.mascot.center - visibleCenter),
      `[${scenario}] I-A1 위반 — 마스코트 중심(${g.mascot.center})이 보이는 창 중심(${visibleCenter})에서 ${Math.abs(g.mascot.center - visibleCenter)}px 벗어남 (scrollLeft=${g.scrollLeftApplied})`,
    ).toBeLessThanOrEqual(TOLERANCE)
  }

  // I-A2 — 문구 전체가 "보이는 창" 안에 있다(스크롤 없이 볼 수 없는 위치로 밀려나지 않는다).
  expect(g.label.left, `[${scenario}] I-A2 위반 — 문구 좌측이 보이는 창 좌측보다 왼쪽으로 밀려남`).toBeGreaterThanOrEqual(visibleLeft - TOLERANCE)
  expect(g.label.right, `[${scenario}] I-A2 위반 — 문구 우측이 보이는 창 우측 밖으로 밀려남`).toBeLessThanOrEqual(visibleRight + TOLERANCE)

  // 셀 병합 자체는 항상 정상이어야 한다(PM 실측 — 회귀 가드).
  expect(Number(g.tdColSpan)).toBe(g.headerCells)
}

test('빈 상태 마스코트 기하 측정 — scrollLeft=0(최초 진입)', async ({ page, request }) => {
  const res = await request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password: (resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')) },
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

  const geomStart = await measureGeom(page, 'start')
  console.log('[GEOM/start] ' + JSON.stringify(geomStart, null, 2))
  await page.screenshot({ path: path.join(SHOTS, '90-mascot-center-probe.png'), fullPage: false })
  assertCentered(geomStart, 'scrollLeft=0')

  // 실제로 오른쪽 끝까지 스크롤한 뒤에도 "보이는 창" 중앙을 유지하는지 검증한다.
  // (뮤테이션 실측 — sticky 없이 width 만 캡핑한 버전은 scrollLeft=0 에서는 우연히
  // GREEN 이 나오지만 이 2 차 측정에서 반드시 어긋난다.)
  const geomEnd = await measureGeom(page, 'end')
  console.log('[GEOM/end] ' + JSON.stringify(geomEnd, null, 2))
  await page.screenshot({ path: path.join(SHOTS, '91-mascot-center-probe-scrolled.png'), fullPage: false })
  assertCentered(geomEnd, 'scrollLeft=max')
})
