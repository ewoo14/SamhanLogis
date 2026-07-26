/**
 * PR #910 슬라이스 1 — 앱 식별자 8값 확장 + U-gate 라이브 QA.
 *
 * 실행:
 *   cd clients/desktop
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts --reporter=line `
 *     playwright/910-app-client-identity-real-qa/910-identity-real-qa.spec.ts
 *
 * 전제: 렌더러 5290(vite --config vite.web.config.ts, 이 워크트리) · 실서버 게이트웨이 8080 ·
 * docker samhan-postgres · samhan-dashboard-service(이 브랜치로 재배포됨).
 *
 * 목적:
 * 1) 실 관리자 화면에서 아로로지스 모바일용 CRITICAL 릴리스를 등록·배포한다(A5: 한국어 앱명, enum 원문 비노출).
 * 2) Web·Capacitor(CapacitorCustomPlatform 공식 지원 shim) 런타임에서 CRITICAL 차단 모달의
 *    탈출구 버튼(F-4)이 보이고 실제로 동작하는지 확인한다.
 */
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5290'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOT_DIR = process.env['AUDIT_SHOT_DIR']
  ?? join(process.cwd(), '..', '..', 'docs', 'qa', '910-app-client-identity')

test.use({ viewport: { width: 1440, height: 900 } })

test.beforeAll(() => {
  mkdirSync(SHOT_DIR, { recursive: true })
})

async function loginViaUi(page: Page) {
  await page.goto(`${BASE_URL}/#/login`, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-testid="login-id-input"]').fill('dev_master')
  await page.locator('[data-testid="login-password-input"]').fill(PASSWORD)
  await page.locator('[data-testid="login-submit-button"]').click()
  // 로그인 성공 후 로그인 폼이 사라질 때까지 대기.
  await expect(page.locator('[data-testid="login-submit-button"]')).toHaveCount(0, { timeout: 15_000 })
}

test.describe('U-gate 1 — 실 관리자 화면 등록·배포 (A5)', () => {
  test.setTimeout(120_000)

  test('아로로지스 모바일 CRITICAL 릴리스를 화면에서 등록·배포한다', async ({ page }) => {
    await loginViaUi(page)

    await page.goto(`${BASE_URL}/#/admin/app-releases`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-testid="app-release-admin-page"]')).toBeVisible({ timeout: 15_000 })

    await page.locator('[data-testid="app-release-create-open"]').click()
    await expect(page.locator('[data-testid="app-release-form"]')).toBeVisible()

    const clientSelect = page.locator('[data-testid="app-release-client-type"]')

    // A5 원문 증거 — select 의 옵션 label 전수(한국어)와 value(enum) 를 함께 덤프한다.
    const optionDump = await clientSelect.locator('option').evaluateAll((opts) =>
      opts.map((o) => ({ value: (o as HTMLOptionElement).value, label: o.textContent?.trim() })),
    )
    console.log('■ A5 앱 선택지 (value=enum 원문 / label=화면 표시):', JSON.stringify(optionDump, null, 2))
    // 화면에 노출되는 label 에는 enum 원문(대문자+언더스코어)이 아니라 한국어 앱명이 있어야 한다.
    const arologisOption = optionDump.find((o) => o.value === 'AROLOGIS_MOBILE')
    expect(arologisOption?.label, 'AROLOGIS_MOBILE 옵션의 화면 라벨').toBe('아로로지스 모바일')
    expect(arologisOption?.label).not.toContain('AROLOGIS_MOBILE')

    // 드롭다운을 연 순간(OS 네이티브 팝업) 캡처 시도 — 헤드리스 렌더 여부와 무관하게
    // 선택 직후 화면(닫힌 select 가 한국어 값을 보여주는 상태)도 함께 남긴다.
    await clientSelect.click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: join(SHOT_DIR, '01-앱선택-드롭다운-한국어명.png') })

    await clientSelect.selectOption('AROLOGIS_MOBILE')
    await page.locator('[data-testid="app-release-force-level"]').selectOption('CRITICAL')
    await page.locator('[data-testid="app-release-version"]').fill('2026/07/25-9801')
    await page.locator('[data-testid="app-release-min-supported"]').fill('2026/07/25-9801')
    await page.locator('[data-testid="app-release-notes"]').fill(
      'QA #910 throwaway - U-gate 아로로지스 모바일 긴급 릴리스(CRITICAL 오폭 차단 검증용, soft-delete 로 정리 예정)',
    )
    await page.locator('[data-testid="app-release-released-at"]').fill('2026-07-25T23:45')

    // 선택 직후 상태(한국어 앱명이 select 에 표시됨, enum 원문 미노출) 캡처.
    await page.screenshot({ path: join(SHOT_DIR, '02-등록폼-아로로지스모바일-CRITICAL.png') })

    await page.locator('[data-testid="app-release-save"]').click()
    await expect(page.locator('[data-testid="app-release-toast"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid="app-release-toast"]')).toContainText('저장했습니다')

    const row = page.locator('[data-testid^="app-release-row-AROLOGIS_MOBILE-2026/07/25-9801-"]')
    await expect(row).toBeVisible({ timeout: 10_000 })
    await expect(row).toContainText('아로로지스 모바일')
    await expect(row).not.toContainText('AROLOGIS_MOBILE')

    const publishToggle = page.locator('[data-testid="app-release-publish-toggle-AROLOGIS_MOBILE-2026/07/25-9801"]')
    await publishToggle.click()
    await expect(page.locator('[data-testid="app-release-publish-dialog"]')).toBeVisible()
    await expect(page.locator('[data-testid="app-release-publish-dialog"]')).toContainText('아로로지스 모바일')
    await page.waitForTimeout(500) // 모달 fade/pop 애니메이션(--duration-base) 종료 대기 — 캡처 시점 반투명 방지
    await page.screenshot({ path: join(SHOT_DIR, '03-배포확인모달-한국어명.png') })

    await page.locator('[data-testid="app-release-publish-confirm"]').click()
    await expect(page.locator('[data-testid="app-release-toast"]')).toContainText('배포했습니다', { timeout: 10_000 })
    await expect(row).toContainText('배포됨')
    await page.screenshot({ path: join(SHOT_DIR, '04-배포완료-배포됨배지.png') })
  })
})

test.describe('U-gate 2 — B·C 불영향 실측 (API, 실 게이트웨이)', () => {
  test.setTimeout(60_000)

  test('AROLOGIS_MOBILE 만 CRITICAL, SAMHAN_MOBILE·SAMHAN_MOBILE_STAFF·DESKTOP 은 불변', async ({ request }) => {
    const current = '2026/07/25-9800'

    const arologis = await request.get(`${API_BASE}/app/version?clientType=AROLOGIS_MOBILE&currentVersion=${encodeURIComponent(current)}`)
    const arologisBody = await arologis.json()
    console.log('■ AROLOGIS_MOBILE 판정:', JSON.stringify(arologisBody))
    expect(arologisBody.data?.forceLevel, 'AROLOGIS_MOBILE 은 CRITICAL 로 차단되어야 한다').toBe('CRITICAL')

    const samhan = await request.get(`${API_BASE}/app/version?clientType=SAMHAN_MOBILE&currentVersion=${encodeURIComponent(current)}`)
    const samhanBody = await samhan.json()
    console.log('■ SAMHAN_MOBILE 판정 (불영향 기대):', JSON.stringify(samhanBody))
    expect(samhanBody.data?.forceLevel, 'SAMHAN_MOBILE 은 영향받지 않아야 한다(NONE)').toBe('NONE')

    const staff = await request.get(`${API_BASE}/app/version?clientType=SAMHAN_MOBILE_STAFF&currentVersion=${encodeURIComponent(current)}`)
    const staffBody = await staff.json()
    console.log('■ SAMHAN_MOBILE_STAFF 판정 (불영향 기대):', JSON.stringify(staffBody))
    expect(staffBody.data?.forceLevel, 'SAMHAN_MOBILE_STAFF 는 영향받지 않아야 한다(NONE)').toBe('NONE')

    const desktop = await request.get(`${API_BASE}/app/version?clientType=DESKTOP&currentVersion=${encodeURIComponent(current)}`)
    const desktopBody = await desktop.json()
    console.log('■ DESKTOP 판정 (A3 — 기존 데스크톱 정책 불변 기대):', JSON.stringify(desktopBody))
    expect(desktopBody.data?.forceLevel, 'DESKTOP 판정은 AROLOGIS_MOBILE 등록에 영향받지 않아야 한다').toBe('NONE')
  })

  test('A4 — 옛 MOBILE 식별자는 차단되지 않고 canonical DESKTOP 정책을 legacy fallback 으로 받는다', async ({ request }) => {
    const current = '2026/07/25-9800'
    const res = await request.get(`${API_BASE}/app/version?clientType=MOBILE&currentVersion=${encodeURIComponent(current)}`)
    const body = await res.json()
    console.log('■ legacy MOBILE 판정 (canonical DESKTOP 우선 조회, A4 fail-open):', JSON.stringify(body))
    expect(body.data?.forceLevel, 'legacy MOBILE 클라이언트가 AROLOGIS_MOBILE CRITICAL 에 차단되면 안 된다').not.toBe('CRITICAL')
    // DESKTOP throwaway baseline 과 동일 정책(NONE, 동일 최신버전)을 받아야 canonical 우선 확인 가능.
    expect(body.data?.latestVersion).toBe(current)
    expect(body.data?.forceLevel).toBe('NONE')
  })

  test('가비지 clientType 은 여전히 400 으로 거부된다 (enum 계약 회귀)', async ({ request }) => {
    const res = await request.get(`${API_BASE}/app/version?clientType=NOT_A_REAL_TYPE&currentVersion=2026/07/25-9800`)
    expect(res.status()).toBe(400)
  })
})

test.describe('F-4 — Web/Capacitor 런타임 탈출구 실증', () => {
  test.setTimeout(60_000)

  test('Web 런타임 — CRITICAL 차단 모달에 페이지 새로고침 버튼이 보이고 실제로 새로고침된다', async ({ page }) => {
    // Electron preload·Capacitor 브릿지 전혀 없는 순수 브라우저 = Web 런타임(VITE_APP_VERSION=9800, DESKTOP 정책).
    // AROLOGIS CRITICAL 등록과 무관하게 DESKTOP 자체를 CRITICAL 로 만들어 이 런타임의 차단 화면을 재현한다.
    await bumpDesktopToCritical()
    try {
      await page.goto(`${BASE_URL}/#/login`, { waitUntil: 'domcontentloaded' })
      const modal = page.locator('[data-testid="app-version-blocking-modal"]')
      await expect(modal).toBeVisible({ timeout: 15_000 })

      const reloadButton = page.locator('[data-testid="app-version-blocking-reload"]')
      await expect(reloadButton).toBeVisible()
      await expect(reloadButton).toHaveText('페이지 새로고침')
      await expect(page.locator('[data-testid="app-version-blocking-quit"]')).toHaveCount(0)
      await page.screenshot({ path: join(SHOT_DIR, '05-Web런타임-차단모달-페이지새로고침.png') })

      // 새로고침이 실제로 일어나는지 — 새 document 로드를 기다리며 클릭.
      const navigationPromise = page.waitForEvent('load', { timeout: 15_000 })
      await reloadButton.click()
      await navigationPromise
      // 새로고침 후에도 CRITICAL 이 유지되므로 모달이 다시 뜬다(리로드 자체가 실제로 실행됐다는 증거).
      await expect(page.locator('[data-testid="app-version-blocking-modal"]')).toBeVisible({ timeout: 15_000 })
      await page.screenshot({ path: join(SHOT_DIR, '06-Web런타임-새로고침후-재확인.png') })
    } finally {
      await restoreDesktopBaseline()
    }
  })

  test('Capacitor 런타임(CapacitorCustomPlatform 공식 shim) — 앱 다시 불러오기 버튼이 보이고 실제로 동작한다', async ({ page }) => {
    await bumpDesktopToCritical()
    try {
      // @capacitor/core 는 win.CapacitorCustomPlatform 이 설정되면 getPlatform()이 그 이름을 반환하고
      // (web 이 아니므로) isNativePlatform()=true 가 된다. registerPlugin 은 pluginHeader(진짜 네이티브
      // 등록)가 없으면 platform 문자열로 jsImplementations 를 찾고, custom platform 이면서 미존재 시
      // 'web' 구현으로 자동 폴백한다(@capacitor/core dist/index.js loadPluginImplementation) — 이는
      // Capacitor 가 공식적으로 지원하는 커스텀 플랫폼 테스트 메커니즘이라 Preferences 플러그인도 실제
      // web(localStorage) 구현으로 정상 동작한다. 즉 "가짜 데이터"가 아니라 실제 앱 코드 경로다.
      await page.addInitScript(() => {
        ;(window as unknown as { CapacitorCustomPlatform: { name: string } }).CapacitorCustomPlatform = { name: 'android' }
      })
      await page.goto(`${BASE_URL}/#/login`, { waitUntil: 'domcontentloaded' })

      const isCapacitor = await page.evaluate(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = window as any
        return Boolean(w.Capacitor?.isNativePlatform?.())
      })
      console.log('■ isCapacitorPlatform (window.Capacitor.isNativePlatform()):', isCapacitor)
      expect(isCapacitor, 'CapacitorCustomPlatform shim 이 isNativePlatform=true 를 만들어야 한다').toBe(true)

      const modal = page.locator('[data-testid="app-version-blocking-modal"]')
      await expect(modal).toBeVisible({ timeout: 15_000 })

      const reloadButton = page.locator('[data-testid="app-version-blocking-reload"]')
      await expect(reloadButton).toBeVisible()
      await expect(reloadButton).toHaveText('앱 다시 불러오기')
      await expect(page.locator('[data-testid="app-version-blocking-quit"]')).toHaveCount(0)
      await page.screenshot({ path: join(SHOT_DIR, '07-Capacitor런타임-차단모달-앱다시불러오기.png') })

      const navigationPromise = page.waitForEvent('load', { timeout: 15_000 })
      await reloadButton.click()
      await navigationPromise
      await expect(page.locator('[data-testid="app-version-blocking-modal"]')).toBeVisible({ timeout: 15_000 })
      await page.screenshot({ path: join(SHOT_DIR, '08-Capacitor런타임-새로고침후-재확인.png') })
    } finally {
      await restoreDesktopBaseline()
    }
  })
})

// ── DESKTOP 임시 CRITICAL 승격/원복 헬퍼 ──────────────────────────────────────
// F-4 는 Electron/Web/Capacitor 세 런타임이 전부 DESKTOP 식별자를 쓰므로,
// AROLOGIS_MOBILE 을 건드리지 않고 DESKTOP throwaway baseline 만 잠깐 CRITICAL 로 올렸다 내린다.
let desktopReleaseId: string | null = null

async function findDesktopReleaseId(): Promise<string> {
  if (desktopReleaseId) return desktopReleaseId
  const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: 'dev_master', password: PASSWORD }),
  })
  const loginJson = await loginRes.json()
  const token = loginJson.data.token as string
  const listRes = await fetch(`${API_BASE}/app/releases?clientType=DESKTOP`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const listJson = await listRes.json()
  const target = (listJson.data as Array<{ id: string; version: string }>).find(
    (r) => r.version === '2026/07/25-9800',
  )
  if (!target) throw new Error('DESKTOP throwaway baseline(2026/07/25-9800) 릴리스를 찾지 못했습니다.')
  desktopReleaseId = target.id
  return desktopReleaseId
}

async function updateDesktopRelease(forceLevel: 'MINOR' | 'CRITICAL', minSupportedVersion: string) {
  const id = await findDesktopReleaseId()
  const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: 'dev_master', password: PASSWORD }),
  })
  const loginJson = await loginRes.json()
  const token = loginJson.data.token as string
  const res = await fetch(`${API_BASE}/app/releases/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientType: 'DESKTOP',
      version: '2026/07/25-9800',
      minSupportedVersion,
      forceLevel,
      releaseNotes: 'QA throwaway test',
      releasedAt: '2026-07-25T23:40:00',
    }),
  })
  if (!res.ok) {
    throw new Error(`DESKTOP throwaway 갱신 실패 HTTP ${res.status}: ${await res.text()}`)
  }
}

async function bumpDesktopToCritical() {
  // minSupportedVersion 을 currentVersion(9800) 보다 미래로 올려 강제 CRITICAL 을 만든다.
  await updateDesktopRelease('CRITICAL', '2026/07/25-9801')
}

async function restoreDesktopBaseline() {
  await updateDesktopRelease('MINOR', '2026/07/25-9800')
}
