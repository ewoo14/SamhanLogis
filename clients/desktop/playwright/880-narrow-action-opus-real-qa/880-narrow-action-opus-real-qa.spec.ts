import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #880 좁은 폭 조작 버튼 컬럼 도달 복구 — OPUS 4.8 적대검증 라이브QA (실서버).
 *
 * mock 아님. 실 게이트웨이(:8080) + 실 렌더러(:5310) + 실/throwaway 실데이터.
 * 검증: 6화면 조작 버튼이 ≤768px(768·375) 에서 도달(display≠none, cell secondary)·클릭·실행되고
 *       넓은 폭(1920·1280·769) 무회귀, 조건부(빌트인 잠금·DRAFT only·MASTER only) 보존.
 *
 * throwaway 마커: 전표 slip_no LIKE 'QA880/%', 수금계획/받을어음/발송금지 memo/reason 'QA880-THROWAWAY'.
 * *-real-qa.spec.ts 규칙으로 mock CI 에서 제외된다.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5310'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '880-opus-review-2026-07-24'))

const WIDE = [1920, 1280] as const
const BOUNDARY = 769
const NARROW = [768, 375] as const

type Auth = { token: string; userId: string; role: string; fullName: string }

async function login(page: Page, loginId = 'dev_master'): Promise<Auth> {
  const res = await page.request.post(`${API_BASE}/api/auth/login`, {
    data: { loginId, password: PASSWORD },
  })
  expect(res.ok(), `실서버 로그인 실패(${loginId}) HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return { token: d.token ?? '', userId: d.userId ?? '', role: d.role ?? 'MASTER', fullName: d.displayName ?? '개발책임자' }
}

async function injectAuth(page: Page, auth: Auth) {
  await page.addInitScript((v: Auth) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ ...v, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, auth)
}

async function open(page: Page, path: string, width: number, rootTestId?: string) {
  await page.setViewportSize({ width, height: 900 })
  await page.goto(`${BASE_URL}/#${path}`, { waitUntil: 'domcontentloaded', timeout: 25_000 })
  if (rootTestId) await expect(page.getByTestId(rootTestId)).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('table').first()).toBeVisible({ timeout: 20_000 })
}

function shotName(screen: string, width: number, suffix = ''): string {
  return `${screen}-${width}${suffix ? '-' + suffix : ''}`
}
async function shot(page: Page, name: string) {
  await page.screenshot({ path: join(SHOT_DIR, `${name}.png`), fullPage: true })
}

/** 좁은 폭에서 버튼이 실제로 도달 가능한지: 보이고, display≠none, 조상 td 가 secondary. */
async function assertReachableNarrow(button: Locator, width: number) {
  await expect(button, `${width}px 버튼 존재`).toBeVisible()
  const notHidden = await button.evaluate((el) => {
    const s = getComputedStyle(el)
    let node: HTMLElement | null = el as HTMLElement
    while (node) {
      const ns = getComputedStyle(node)
      if (ns.display === 'none' || ns.visibility === 'hidden') return false
      node = node.parentElement
    }
    return s.display !== 'none'
  })
  expect(notHidden, `${width}px 버튼 및 조상 display≠none`).toBe(true)
  const cell = button.locator('xpath=ancestor::td[1]')
  await expect(cell, `${width}px 조작 td=secondary`).toHaveAttribute('data-mobile-priority', 'secondary')
  // ≤768px 에서 카드 레이아웃(grid)이 실제로 활성 — 이 폭에서 secondary 셀이 렌더된다는 증거.
  const trDisplay = await button.evaluate((el) => {
    const tr = (el as HTMLElement).closest('tr')
    return tr ? getComputedStyle(tr).display : ''
  })
  expect(trDisplay, `${width}px tr 카드(grid) 활성`).toBe('grid')
  const box = await button.boundingBox()
  expect(box && box.width > 0 && box.height > 0, `${width}px 버튼 실측 크기>0`).toBeTruthy()
}

/** 넓은 폭: 카드 레이아웃 비활성(tr=table-row) + 조작 버튼 정상 노출(무회귀). */
async function assertWideNoRegression(button: Locator, width: number) {
  await expect(button.first(), `${width}px 조작버튼 보임`).toBeVisible()
  const trDisplay = await button.first().evaluate((el) => {
    const tr = (el as HTMLElement).closest('tr')
    return tr ? getComputedStyle(tr).display : ''
  })
  expect(trDisplay, `${width}px 카드 비활성(table-row)`).toBe('table-row')
}

async function assertNoBodyHScroll(page: Page, width: number) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  // 소량(<=1px) 반올림 허용, 그 이상은 가로 스크롤 회귀.
  expect(overflow, `${width}px body 가로 오버플로`).toBeLessThanOrEqual(1)
}

test.beforeAll(() => {
  mkdirSync(SHOT_DIR, { recursive: true })
})

// ── 화면별 정의 ────────────────────────────────────────────────────────────
type ScreenDef = {
  id: string
  path: string
  rootTestId?: string
  prep?: (page: Page) => Promise<void>
  narrowButton: (page: Page) => Locator
}

async function slipPrep(page: Page) {
  const root = page.getByTestId(page.url().includes('purchase') ? 'purchase-accounting-slip-page' : 'sales-accounting-slip-page')
  const dates = root.locator('input[type="date"]')
  await dates.nth(0).fill('2026-05-01')
  await dates.nth(1).fill('2026-05-31')
  await expect(root.locator('table')).toContainText('QA880', { timeout: 15_000 })
}

const SCREENS: ScreenDef[] = [
  {
    id: 'collection-plans',
    path: '/accounting/reports/collection-plans',
    narrowButton: (page) => page.locator('table').first().getByRole('button', { name: '연체', exact: true }).first(),
  },
  {
    id: 'notes-receivable',
    path: '/accounting/reports/notes-receivable',
    narrowButton: (page) => page.locator('table').first().getByRole('button', { name: '추심', exact: true }).first(),
  },
  {
    id: 'permission-groups',
    path: '/admin/permission-groups/manage',
    rootTestId: 'perm-group-manage-table',
    narrowButton: (page) => page.getByTestId('perm-group-edit-개발자'),
  },
  {
    id: 'purchase-slips',
    path: '/accounting/purchase-slips',
    rootTestId: 'purchase-accounting-slip-page',
    prep: slipPrep,
    narrowButton: (page) => page.getByTestId('purchase-accounting-slip-page').locator('table')
      .getByRole('row').filter({ hasText: 'QA880/2026/05/15-1' }).getByRole('button', { name: '전기', exact: true }),
  },
  {
    id: 'sales-slips',
    path: '/accounting/sales-slips',
    rootTestId: 'sales-accounting-slip-page',
    prep: slipPrep,
    narrowButton: (page) => page.getByTestId('sales-accounting-slip-page').locator('table')
      .getByRole('row').filter({ hasText: 'QA880/2026/05/16-1' }).getByRole('button', { name: '전기', exact: true }),
  },
  {
    id: 'blocked-partners',
    path: '/admin/blocked-partners',
    rootTestId: 'admin-blocked-table',
    narrowButton: (page) => page.getByTestId('admin-blocked-unblock-P0-6-C002'),
  },
]

// ── 1) 넓은 폭 무회귀 + 경계 + 좁은 폭 도달 스크린샷/단언 ────────────────────
for (const s of SCREENS) {
  test(`${s.id} — 넓은폭 무회귀·경계·좁은폭 도달`, async ({ page }) => {
    const auth = await login(page)
    await injectAuth(page, auth)

    for (const w of WIDE) {
      await open(page, s.path, w, s.rootTestId)
      if (s.prep) await s.prep(page)
      await shot(page, shotName(s.id, w))
      // 넓은 폭 무회귀: 카드 레이아웃 비활성 + 조작 버튼 정상 노출.
      await assertWideNoRegression(s.narrowButton(page), w)
    }

    await open(page, s.path, BOUNDARY, s.rootTestId)
    if (s.prep) await s.prep(page)
    await shot(page, shotName(s.id, BOUNDARY))
    // 769px = 브레이크포인트 바로 위: 여전히 데스크톱 테이블(카드 OFF), 버튼 정상.
    await assertWideNoRegression(s.narrowButton(page), BOUNDARY)

    for (const w of NARROW) {
      await open(page, s.path, w, s.rootTestId)
      if (s.prep) await s.prep(page)
      await shot(page, shotName(s.id, w))
      await assertReachableNarrow(s.narrowButton(page).first(), w)
      await assertNoBodyHScroll(page, w)
    }
  })
}

// ── 2) 조건부 렌더 보존 (실데이터) ──────────────────────────────────────────
test('권한그룹 — 빌트인(마스터) 개명/삭제 좁은 폭에서도 비활성 보존', async ({ page }) => {
  const auth = await login(page)
  await injectAuth(page, auth)
  for (const w of [768, 375]) {
    await open(page, '/admin/permission-groups/manage', w, 'perm-group-manage-table')
    const edit = page.getByTestId('perm-group-edit-master')
    const del = page.getByTestId('perm-group-delete-master')
    await expect(edit, `${w}px 빌트인 개명 보임`).toBeVisible()
    await expect(edit, `${w}px 빌트인 개명 비활성`).toBeDisabled()
    await expect(del, `${w}px 빌트인 삭제 비활성`).toBeDisabled()
    await shot(page, `permission-groups-${w}-builtin-lock`)
  }
})

test('전표 — DRAFT 만 전기 버튼, POSTED 는 없음 (좁은 폭 375·조건 보존)', async ({ page }) => {
  const auth = await login(page)
  await injectAuth(page, auth)
  for (const kind of ['purchase', 'sales'] as const) {
    const root = kind === 'purchase' ? 'purchase-accounting-slip-page' : 'sales-accounting-slip-page'
    const draftNo = kind === 'purchase' ? 'QA880/2026/05/15-1' : 'QA880/2026/05/16-1'
    const postedNo = kind === 'purchase' ? 'QA880/2026/05/15-2' : 'QA880/2026/05/16-2'
    await open(page, `/accounting/${kind}-slips`, 375, root)
    await slipPrep(page)
    const table = page.getByTestId(root).locator('table')
    const draftRow = table.getByRole('row').filter({ hasText: draftNo })
    const postedRow = table.getByRole('row').filter({ hasText: postedNo })
    await expect(draftRow.getByRole('button', { name: '전기', exact: true }), `${kind} DRAFT 전기 있음`).toBeVisible()
    await expect(postedRow.getByRole('button', { name: '전기', exact: true }), `${kind} POSTED 전기 없음`).toHaveCount(0)
    await shot(page, `${kind}-slips-375-draft-vs-posted`)
  }
})

test('발송금지 — 비 MASTER(dev_manager 실계정) 는 좁은 폭에서도 해제 버튼 없이 "MASTER 전용"', async ({ page }) => {
  // 실서버 권한: canBulkManage=canAccess('partners.block.bulk','create').
  // dev_manager 실 토큰의 partners.block.bulk=[] (CREATE 없음) → 조건 분기 실검증.
  const auth = await login(page, 'dev_manager')
  await injectAuth(page, auth)
  await open(page, '/admin/blocked-partners', 375, 'admin-blocked-table')
  const unblock = page.getByTestId('admin-blocked-unblock-P0-6-C002')
  await expect(unblock, 'MANAGER 해제버튼 없음').toHaveCount(0)
  await expect(page.getByTestId('admin-blocked-table'), 'MASTER 전용 텍스트').toContainText('MASTER 전용')
  await shot(page, 'blocked-partners-375-manager-master-only')
})

// ── 3) 좁은 폭(375) 실제 클릭·실행 ─────────────────────────────────────────
test('수금계획 375 — 연체 클릭 → 상태 전이 실행', async ({ page }) => {
  const auth = await login(page)
  await injectAuth(page, auth)
  await open(page, '/accounting/reports/collection-plans', 375)
  const btn = page.locator('table').first().getByRole('button', { name: '연체', exact: true }).first()
  await assertReachableNarrow(btn, 375)
  await btn.click()
  await expect(page.locator('table tbody tr').first(), '연체 전이 반영').toContainText('연체', { timeout: 10_000 })
  await shot(page, 'collection-plans-375-after-click')
})

test('권한그룹 375 — 개명 클릭 → 편집 폼 오픈', async ({ page }) => {
  const auth = await login(page)
  await injectAuth(page, auth)
  await open(page, '/admin/permission-groups/manage', 375, 'perm-group-manage-table')
  const btn = page.getByTestId('perm-group-edit-개발자')
  await assertReachableNarrow(btn, 375)
  await btn.click()
  await expect(page.getByTestId('perm-group-form-name'), '개명 폼 값').toHaveValue('개발자', { timeout: 10_000 })
  await shot(page, 'permission-groups-375-after-click')
})

test('발송금지 375 — 차단 해제 클릭 → 확인 모달', async ({ page }) => {
  const auth = await login(page)
  await injectAuth(page, auth)
  await open(page, '/admin/blocked-partners', 375, 'admin-blocked-table')
  const btn = page.getByTestId('admin-blocked-unblock-P0-6-C002')
  await assertReachableNarrow(btn, 375)
  await btn.click()
  await expect(page.getByRole('heading', { name: '차단 해제 확인' }), '해제 확인 모달').toBeVisible({ timeout: 10_000 })
  await shot(page, 'blocked-partners-375-after-click')
})

test('매출전표 375 — DRAFT 전기 클릭 → post 요청 발화(도달·클릭 실행)', async ({ page }) => {
  const auth = await login(page)
  await injectAuth(page, auth)
  await open(page, '/accounting/sales-slips', 375, 'sales-accounting-slip-page')
  await slipPrep(page)
  const table = page.getByTestId('sales-accounting-slip-page').locator('table')
  const btn = table.getByRole('row').filter({ hasText: 'QA880/2026/05/16-1' }).getByRole('button', { name: '전기', exact: true })
  await assertReachableNarrow(btn, 375)
  const reqP = page.waitForRequest((r) => r.url().includes('/sales-slips/') && r.url().includes('/post'), { timeout: 10_000 })
  await btn.click()
  const req = await reqP
  expect(req.method(), 'post 요청 메서드').toBe('POST')
  await shot(page, 'sales-slips-375-after-click')
})
