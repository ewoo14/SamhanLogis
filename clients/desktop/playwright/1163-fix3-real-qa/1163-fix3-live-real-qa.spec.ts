// PR #1174 fix3 — 격리 PostgreSQL + 격리 서비스의 6개 실제 UI 표면 검증.
// 이 파일은 mock fallback을 사용하지 않는다. 화면이 비어 있거나 route가 없으면 실패한다.
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import { expect, test, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_BASE = process.env['REAL_QA_RENDERER_BASE_URL'] ?? 'http://127.0.0.1:56349'
const API_BASE = process.env['REAL_QA_ISOLATED_API_BASE_URL'] ?? ''
if (!API_BASE || new URL(API_BASE).port === '8080') {
  throw new Error('공유 API 로그인은 금지됩니다. REAL_QA_ISOLATED_API_BASE_URL에 격리 게이트웨이를 지정하십시오.')
}
const SHOTS = resolveQaShotsDir(path.resolve(
  HERE,
  '../../../../docs/qa/2026-08-12-1163-fix3-real-qa/screenshots',
))

const UUID_RE = /(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\{(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})\}|urn:uuid:(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})|[0-9a-f]{32}|[0-9a-f]{8})/i

function skeleton(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\p{M}\p{Cf}]+/gu, '')
    .replace(/[‐‑‒–—―−﹘﹣－]/gu, '-')
    .replace(/[：]/gu, ':')
    .toLowerCase()
}

async function visibleSurface(page: Page, name: string, shot: string) {
  const text = await page.locator('body').innerText()
  const attributes = await page.locator('[title], [aria-label]').evaluateAll((nodes) =>
    nodes.flatMap((node) => [node.getAttribute('title'), node.getAttribute('aria-label')].filter(Boolean)),
  )
  const surface = `${text}\n${attributes.join('\n')}`
  expect(skeleton(surface), `${name}: 화면/접근성 라벨에 UUID 변형이 남음`).not.toMatch(UUID_RE)
  fs.mkdirSync(SHOTS, { recursive: true })
  await page.screenshot({ path: path.join(SHOTS, shot), fullPage: true })
  console.log(`REAL_QA_SCREEN ${name}=UUID_0`)
}

async function login(page: Page) {
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: {
      loginId: 'dev_master',
      password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'),
    },
  })
  expect(response.ok(), `격리 로그인 실패: HTTP ${response.status()}`).toBeTruthy()
  const body = await response.json()
  const session = body.data ?? {}
  expect(session.token, '격리 로그인 token 누락').toBeTruthy()
  await page.addInitScript(({ token, userId, role, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, userId, role, fullName: displayName }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, session)
  return session as { token: string; userId: string; role: string; displayName: string }
}

async function gotoRoute(page: Page, route: string) {
  // build:web 는 BrowserRouter를 사용한다. 정적 http.server는 history fallback이
  // 없으므로 앱셸을 먼저 연 뒤 pushState로 실제 라우터 경로를 전환한다.
  await page.goto(APP_BASE, { waitUntil: 'domcontentloaded' })
  await page.evaluate((target) => {
    window.history.pushState({}, '', target)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, route)
}

test('PR #1174 fix3 — 격리 real-QA 6화면 UUID 노출 0', async ({ page }) => {
  const session = await login(page)
  const headers = { Authorization: `Bearer ${session.token}` }

  // 1. 창고 이력 — 실제 감사행이 있는 창고만 선택한다.
  const warehouseResponse = await page.request.get(`${API_BASE}/inventory/warehouses/search`, {
    headers,
    params: { page: 0, size: 20 },
  })
  expect(warehouseResponse.ok(), `격리 창고 목록 실패: HTTP ${warehouseResponse.status()}`).toBeTruthy()
  const warehouseBody = await warehouseResponse.json()
  const warehouses = warehouseBody.data?.items ?? []
  let warehouse: { id: string; code: string } | undefined
  const warehouseCandidates = [...warehouses].sort((left: { code: string }, right: { code: string }) =>
    (left.code === 'WH-FIX3' ? -1 : 0) - (right.code === 'WH-FIX3' ? -1 : 0),
  )
  for (const candidate of warehouseCandidates) {
    const audit = await page.request.get(`${API_BASE}/inventory/warehouses/${candidate.id}/audit-logs`, { headers })
    if (audit.ok() && (await audit.json()).data?.length > 0) {
      warehouse = candidate
      break
    }
  }
  expect(warehouse, '실 창고 이력이 없어 빈 화면을 성공 처리하지 않음').toBeTruthy()
  await gotoRoute(page, '/admin/warehouses')
  await page.waitForTimeout(2_000)
  await page.getByTestId(`admin-warehouses-edit-${warehouse!.code}`).click()
  await page.getByTestId('edit-warehouse-audit-toggle').click()
  await expect(page.getByTestId('edit-warehouse-audit-panel')).toBeVisible({ timeout: 15_000 })
  await visibleSurface(page, '창고 이력', '01-warehouse-history.png')

  // 2~3. 홈택스 저장 이력 / 제외 거래처.
  await gotoRoute(page, '/accounting/hometax-export')
  await page.getByTestId('hometax-export-tab-history').click()
  await expect(page.getByTestId('hometax-export-tab-content')).toBeVisible()
  await visibleSurface(page, '홈택스 이력', '02-hometax-history.png')
  await page.getByTestId('hometax-export-tab-exclusions').click()
  await expect(page.getByTestId('hometax-export-tab-content')).toBeVisible()
  await visibleSurface(page, '홈택스 제외 목록', '03-hometax-exclusions.png')

  // 4. 협업 이력 — 실 분개를 API로 식별하고 상세 화면은 UI로 연다.
  const journals = await page.request.get(`${API_BASE}/accounting/journals`, {
    headers,
    params: { page: 0, size: 20 },
  })
  expect(journals.ok(), `격리 분개 목록 실패: HTTP ${journals.status()}`).toBeTruthy()
  const journalBody = await journals.json()
  const journal = journalBody.data?.content?.[0]
  expect(journal?.id, '실 분개가 없어 협업 이력을 빈 화면으로 성공 처리하지 않음').toBeTruthy()
  await gotoRoute(page, `/accounting/journals/${journal.id}`)
  await expect(page.getByTestId('journal-collaboration-panel')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('journal-collab-edit-history-panel')).toBeVisible({ timeout: 20_000 })
  await visibleSurface(page, '협업 이력', '04-collaboration-history.png')

  // 5. 권한 변경 로그 — 실제 사용자 행의 이력 modal을 연다.
  await gotoRoute(page, '/admin/users')
  await expect(page.getByTestId('admin-users-table')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('admin-user-role-history').first().click()
  // wrapper testid는 portal 컨테이너라 레이아웃 크기가 0일 수 있다. 실제 Modal
  // surface(role=dialog)를 기준으로 화면 노출을 판정한다.
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 15_000 })
  await visibleSurface(page, '권한 변경 로그', '05-permission-change-history.png')

  // 6. 삭제 배지 — 삭제행이 실 데이터에 있는지 먼저 확인하고 화면에서 검사한다.
  const partners = await page.request.get(`${API_BASE}/admin/partners/search`, {
    headers,
    params: { includeDeleted: true, page: 0, size: 20 },
  })
  expect(partners.ok(), `격리 거래처 목록 실패: HTTP ${partners.status()}`).toBeTruthy()
  const partnerBody = await partners.json()
  const deletedPartner = (partnerBody.data?.items ?? []).find((item: { isDeleted?: boolean }) => item.isDeleted)
  expect(deletedPartner?.partnerCode, '실 삭제 거래처가 없어 삭제 배지를 빈 화면으로 성공 처리하지 않음').toBeTruthy()
  await gotoRoute(page, '/admin/partners')
  await expect(page.getByTestId(`admin-partners-row-${deletedPartner.partnerCode}-deleted-badge`)).toBeVisible({ timeout: 20_000 })
  await visibleSurface(page, '삭제 배지', '06-deleted-badge.png')

  console.log('REAL_QA_FIX3 six_screens=PASS uuid_exposure=0')
})
