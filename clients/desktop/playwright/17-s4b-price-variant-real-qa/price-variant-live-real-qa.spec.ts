import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #17 단가변동 S4b — `/sales/estimate-config` 실서버 GUI QA (mock OFF).
 *
 * 실 게이트웨이(:8080) → 재빌드 product-service(V·· price-change-schedule)·auth-service(V86
 * products.price-schedule 권한) → 실 Postgres. dc-config-service(estimate-config 상단 폼 담당)는
 * 이 QA 세션에서 `docker compose up -d dc-config-service` 로 기동(기존 스택에 미포함 상태였음 —
 * 정직 기록). 합성/fixture 없음.
 *
 * 권한 확인(실 DB 조회, group_page_permissions):
 *  - dev_master  : sales.estimate-config(전권) + products.price-schedule(전권)
 *  - dev_accountant("회계원" 그룹): products.price-schedule(VIEW+UPDATE) 만, sales.estimate-config 없음
 *  - dev_sales("영업원" 그룹): 둘 다 없음(네거티브)
 *
 * ⚠️ 정직 기록(과업 브리프 대비 불일치) — 과업 설명은 dev_manager 가 "sales.estimate-config +
 * products.price-schedule 둘 다" 보유한다고 전제했으나, 실 DB 조회 결과 "매니저" 권한그룹
 * (group_id 00000000-0000-0000-0000-000000000101) 의 group_page_permissions 에는
 * `sales.estimate-config` 행이 전혀 없다(products.price-schedule 만 VIEW+UPDATE). legacy
 * role_page_permissions 테이블의 V58 시드(role_code=MANAGER)는 이 화면의 실제 권한 판정
 * 경로(권한그룹 기반 group_page_permissions)에 반영된 적이 없는 것으로 보인다 — #17 S4b 범위
 * 밖의 기존 갭으로 판단, 본 QA 는 수정하지 않고 사실만 보고한다(따라서 dev_manager 는 현재
 * dev_accountant 와 동일하게 "단가변동 섹션만" 보게 된다).
 *
 * 단계별 캡처(docs/qa/17-s4b-price-variant/):
 *  01 dev_master 상단(옵션 기본값)+하단(카테고리별 단가변동 4행) 동시노출
 *  02 dev_master 홈멀티 토글 저장 전(대조)
 *  03 dev_master 홈멀티 "변동단가 기본값" ON + 날짜변경 PUT 왕복 저장 후 반영
 *  04 dev_accountant 사이드바 "견적 가격 설정" 링크 노출(Option A 에도 진입 가능해야 함)
 *  05 dev_accountant H1 옵션A — estimate-config 폼 미표시, 단가변동 섹션만
 *  06 dev_sales 사이드바 링크 부재(네거티브)
 *  07 dev_sales 직접 URL 진입 시 홈 redirect(네거티브)
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5195'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/17-s4b-price-variant'))
fs.mkdirSync(SHOTS, { recursive: true })

let shotNo = 0
async function capture(page: Page, name: string, fullPage = false): Promise<void> {
  shotNo++
  await page.screenshot({
    path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`),
    fullPage,
  })
}

interface LoginResult { token: string; role: string; userId: string; displayName: string }

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId, password: PASSWORD } })
  expect(res.ok(), `로그인 실패(${loginId}): HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return { token: d.token ?? '', role: d.role ?? '', userId: d.userId ?? '', displayName: d.displayName ?? loginId }
}

async function installAuthStub(page: Page, login: LoginResult): Promise<void> {
  await page.addInitScript(
    ({ tok, r, uid, name }: { tok: string; r: string; uid: string; name: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token: tok, userId: uid, role: r, fullName: name, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    { tok: login.token, r: login.role, uid: login.userId, name: login.displayName },
  )
}

async function openAppShell(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/#/`)
  await page.waitForSelector('[data-testid="sidebar-notifications"]', { timeout: 30000 })
  await page.waitForTimeout(500)
}

/**
 * 사이드바 "판매" 카테고리는 아코디언(기본 접힘, children 은 열렸을 때만 마운트) — 실사용자가
 * 그룹을 펼쳐야 하위 NavLink 가 보인다. 진짜 노출/부재 판정을 위해 명시적으로 펼친다.
 */
async function expandSalesSidebarCategory(page: Page): Promise<void> {
  const toggle = page.getByTestId('sidebar-category-toggle-판매')
  await expect(toggle).toBeVisible({ timeout: 15000 })
  const expanded = await toggle.getAttribute('aria-expanded')
  if (expanded !== 'true') {
    await toggle.click()
    await page.waitForTimeout(400)
  }
}

async function openEstimateConfig(page: Page): Promise<void> {
  await page.goto(`${BASE_URL}/#/sales/estimate-config`)
  await page.waitForSelector('[data-testid="sidebar-notifications"]', { timeout: 30000 })
  await page.waitForTimeout(800)
}

test.describe.serial('#17 S4b 단가변동 — /sales/estimate-config 실 GUI', () => {
  test('01~03 dev_master — 옵션기본값+단가변동 동시노출, 홈멀티 PUT 왕복', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1400 } })
    const page = await ctx.newPage()
    const login = await realLogin(page, 'dev_master')
    await installAuthStub(page, login)

    // 재실행 안전성 — 이전 QA 라운드가 이미 homemulti 를 토글했을 수 있으므로, UI 상호작용 전에
    // 기준값(defaultPreChange=false, 2026-04-01 시드값)으로 리셋한다(직접 API 셋업 호출 —
    // 검증 자체는 전부 아래 실 UI 로 수행).
    const resetRes = await page.request.put(
      `${API_BASE}/api/v1/products/admin/price-change-schedule/homemulti`,
      {
        headers: { Authorization: `Bearer ${login.token}` },
        data: { effectiveDate: '2026-04-01', defaultPreChange: false },
      },
    )
    expect(resetRes.ok(), `홈멀티 기준값 리셋 실패: HTTP ${resetRes.status()}`).toBeTruthy()

    await openEstimateConfig(page)

    // 상단 "견적 가격 설정"(옵션 기본값) 노출 확인 — canViewEstimateConfig=true 경로.
    await expect(page.getByRole('heading', { name: '옵션 기본값' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByLabel('홈멀티 공통 DC율')).toBeVisible()

    // 하단 "카테고리별 단가변동" 4행 동시 노출.
    const scheduleSection = page.getByRole('region', { name: '카테고리별 단가변동' })
    await expect(scheduleSection).toBeVisible()
    const categories = ['homemulti', 'singleSets', 'commercialMulti', 'oldProducts'] as const
    for (const cat of categories) {
      await expect(page.getByTestId(`price-schedule-row-${cat}`)).toBeVisible()
    }
    // 구형(oldProducts)=날짜만("대상 아님"), 나머지 3종=날짜+토글.
    await expect(page.getByTestId('price-schedule-toggle-homemulti')).toBeVisible()
    await expect(page.getByTestId('price-schedule-toggle-singleSets')).toBeVisible()
    await expect(page.getByTestId('price-schedule-toggle-commercialMulti')).toBeVisible()
    await expect(page.getByTestId('price-schedule-toggle-oldProducts')).toHaveCount(0)
    await expect(
      page.getByTestId('price-schedule-row-oldProducts').getByText('대상 아님'),
    ).toBeVisible()

    await capture(page, 'master-both-sections-visible', true)

    // 홈멀티 행 — 저장 전 상태(대조용) 확대 캡처.
    const homeRow = page.getByTestId('price-schedule-row-homemulti')
    await homeRow.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    const toggleBefore = page.getByTestId('price-schedule-toggle-homemulti')
    await expect(toggleBefore).not.toBeChecked()
    await capture(page, 'master-homemulti-before-toggle')

    // "변동단가 기본값" 토글 ON + 적용일 변경 → 저장(PUT 왕복).
    await toggleBefore.check()
    const dateInput = page.getByLabel('홈멀티 적용일')
    await dateInput.fill('2026-08-01')
    const saveBtn = page.getByTestId('price-schedule-save-homemulti')
    await expect(saveBtn).toBeEnabled()

    const [putResp] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/api/v1/products/admin/price-change-schedule/homemulti') && r.request().method() === 'PUT',
        { timeout: 15000 },
      ),
      saveBtn.click(),
    ])
    expect(putResp.ok(), `홈멀티 PUT 실패: HTTP ${putResp.status()}`).toBeTruthy()
    const putBody = await putResp.json()
    expect(putBody.data?.defaultPreChange, 'PUT 응답 defaultPreChange').toBe(true)
    expect(putBody.data?.effectiveDate, 'PUT 응답 effectiveDate').toBe('2026-08-01')

    // 저장 성공 후 값 반영(재조회) — dirty 배경 해제 + 체크 유지 + 날짜 유지.
    await expect(page.getByTestId('price-schedule-toggle-homemulti')).toBeChecked({ timeout: 10000 })
    await expect(page.getByLabel('홈멀티 적용일')).toHaveValue('2026-08-01')
    await homeRow.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(400)
    await capture(page, 'master-homemulti-after-save-put-roundtrip')

    await ctx.close()
  })

  test('04~05 dev_accountant — Option A: 단가변동 섹션만(estimate-config 폼 미표시)', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1400 } })
    const page = await ctx.newPage()
    const login = await realLogin(page, 'dev_accountant')
    await installAuthStub(page, login)

    const requestUrls: string[] = []
    page.on('request', (req) => requestUrls.push(req.url()))

    // 사이드바 "견적 가격 설정" 링크 노출 확인(products.price-schedule VIEW 만으로도 OR 판정 진입).
    // "판매" 카테고리는 기본 접힘 아코디언이므로 명시적으로 펼친 뒤 확인한다.
    await openAppShell(page)
    await expandSalesSidebarCategory(page)
    const sidebarLink = page.getByTestId('sidebar-sales-estimate-config')
    await expect(sidebarLink).toBeVisible({ timeout: 15000 })
    await sidebarLink.scrollIntoViewIfNeeded()
    await capture(page, 'accountant-sidebar-link-visible')

    await sidebarLink.click()
    await page.waitForSelector('[data-testid="price-schedule-row-homemulti"]', { timeout: 15000 })
    await page.waitForTimeout(600)

    // estimateConfig 폼("옵션 기본값"/상단 "견적 가격 설정") 미표시 확인.
    await expect(page.getByRole('heading', { name: '옵션 기본값' })).toHaveCount(0)
    await expect(page.getByLabel('홈멀티 공통 DC율')).toHaveCount(0)

    // "카테고리별 단가변동" 섹션만 표시.
    await expect(page.getByRole('region', { name: '카테고리별 단가변동' })).toBeVisible()
    await expect(page.getByTestId('price-schedule-row-homemulti')).toBeVisible()

    // GET /api/v1/estimate-config 미발생 확인 (query enabled=canViewEstimateConfig=false).
    const estimateConfigCalls = requestUrls.filter((u) => u.includes('/api/v1/estimate-config'))
    expect(estimateConfigCalls, `estimate-config GET 미발생 기대, 실제: ${JSON.stringify(estimateConfigCalls)}`).toHaveLength(0)

    await capture(page, 'accountant-price-schedule-section-only', true)

    await ctx.close()
  })

  test('06~07 dev_sales — 네거티브: 사이드바 링크 부재 + 직접진입 홈 redirect', async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1400 } })
    const page = await ctx.newPage()
    const login = await realLogin(page, 'dev_sales')
    await installAuthStub(page, login)

    await openAppShell(page)
    // dev_sales 는 sales.slip.list/estimates.list/partner-order.list/partner-dc-config(VIEW) 를
    // 보유해 "판매" 카테고리 자체는 노출된다(showSales=true) — 펼친 상태에서도 "견적 가격 설정"
    // 링크만 없어야 진짜 네거티브(카테고리 전체 비노출로 인한 위양성 아님).
    await expandSalesSidebarCategory(page)
    await expect(page.getByTestId('sidebar-sales-estimate-config')).toHaveCount(0)
    await page.getByTestId('sidebar-category-toggle-판매').scrollIntoViewIfNeeded()
    await capture(page, 'sales-sidebar-no-estimate-config-link')

    // 직접 URL 진입 → PermissionGuard 가 홈으로 redirect.
    await page.goto(`${BASE_URL}/#/sales/estimate-config`)
    await page.waitForSelector('[data-testid="sidebar-notifications"]', { timeout: 30000 })
    await expect
      .poll(() => page.url(), { timeout: 15000 })
      .toBe(`${BASE_URL}/#/`)
    await expect(page.getByRole('region', { name: '카테고리별 단가변동' })).toHaveCount(0)
    await page.waitForTimeout(300)
    await capture(page, 'sales-direct-nav-redirected-home')

    await ctx.close()
  })
})
