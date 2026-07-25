/**
 * PR #909 OPUS 재수렴 라운드 3 (적대 probe) — 닫기 무효화 fix(fe83eb911) 를 실제로 조작해
 * 도달가능 결함 0 을 확인하고, "닫기 버튼을 모든 상태에 추가 + dismiss reset 의존성 [kind]"
 * 이 만든 새 표면(차단 우회 / 필요한 재표시 누락 / 영구 침묵)을 적대적으로 캔다.
 *
 * 실행:
 *   cd clients/desktop
 *   AUDIT_BASE_URL=http://127.0.0.1:5260 API_BASE=http://localhost:8080 \
 *   AUDIT_SHOT_DIR=.../909-opus-reconv3-2026-07-24 \
 *   node_modules/.bin/playwright test --config=playwright.real-qa.config.ts --reporter=line \
 *     playwright/909-auto-update-real-qa/opus-reconv3-probe-real-qa.spec.ts
 *
 * 전제: 렌더러 5260(vite dev, 이 워크트리 SHA fe83eb911) · 실서버 8080 · docker samhan-postgres.
 * throwaway 릴리스는 마커 OPUS909R7 로만 만들고 종료 시 soft-delete 로 원상복구한다.
 */
import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5260'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const MARKER = 'OPUS909R7'
const SHOT_DIR = process.env['AUDIT_SHOT_DIR'] ?? join(process.cwd(), '..', '..', 'docs', 'qa', '909-opus-reconv3-2026-07-24')
const RAW_ERROR = 'Cannot find channel latest at https://intranet.example/latest.yml x-secret-header'

type Auth = { token: string; userId: string; role: string; fullName: string }

function cleanupThrowaway(): string {
  const sql = [
    `UPDATE app_release SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = '${MARKER}' WHERE release_notes LIKE '${MARKER}%';`,
    `SELECT client_type, version, force_level, is_deleted, deleted_by FROM app_release WHERE release_notes LIKE '${MARKER}%' ORDER BY version;`,
  ].join(' ')
  return execFileSync('docker', [
    'exec', 'samhan-postgres', 'psql', '-U', 'samhan', '-d', 'dashboard_db', '-tAc', sql,
  ], { encoding: 'utf8' })
}

async function login(request: import('@playwright/test').APIRequestContext): Promise<Auth> {
  const res = await request.post(`${API_BASE}/api/auth/login`, { data: { loginId: 'dev_master', password: PASSWORD } })
  expect(res.ok(), `실서버 로그인 실패 HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return { token: d.token ?? '', userId: d.userId ?? '', role: d.role ?? 'MASTER', fullName: d.displayName ?? '개발책임자' }
}

async function installAuth(page: Page, auth: Auth) {
  await page.addInitScript((v) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => ({ ...v, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined },
    })
  }, auth)
}

type Script = 'error' | 'idle' | 'progress-hang'

/** __qaEmit 로 임의 상태를 밀어 넣을 수 있는 updater 하네스 + check 호출/설치 호출 계측. */
async function installUpdater(page: Page, opts: { script: Script; rawError?: string }) {
  await page.addInitScript((o) => {
    type Status = { kind: string; message?: string; version?: string; percent?: number }
    const listeners = new Set<(s: Status) => void>()
    const audit = { checkCalls: 0, installCalls: 0, quitCalls: 0, events: [] as Status[] }
    const emit = (s: Status) => { audit.events.push(s); for (const l of listeners) l(s) }
    ;(window as unknown as { __qaEmit: (s: Status) => void }).__qaEmit = emit
    ;(window as unknown as { __qaAudit: typeof audit }).__qaAudit = audit
    const delay = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms))
    Object.defineProperty(window, 'samhanUpdater', {
      configurable: true,
      value: {
        onStatus: (l: (s: Status) => void) => { listeners.add(l); return () => listeners.delete(l) },
        check: async () => {
          audit.checkCalls += 1
          emit({ kind: 'checking' })
          if (o.script === 'error') { await delay(80); throw new Error(o.rawError ?? 'boom') }
          if (o.script === 'idle') { return }
          if (o.script === 'progress-hang') {
            await delay(80); emit({ kind: 'available', version: '9.9.8' })
            await delay(80); emit({ kind: 'downloading', percent: 17 })
            return new Promise<void>(() => {})
          }
        },
        install: async () => { audit.installCalls += 1 },
        quit: async () => { audit.quitCalls += 1 },
      },
    })
  }, opts)
}

const emit = (page: Page, s: Record<string, unknown>) =>
  page.evaluate((v) => (window as unknown as { __qaEmit: (x: unknown) => void }).__qaEmit(v), s)
const audit = (page: Page) =>
  page.evaluate(() => (window as unknown as { __qaAudit: { checkCalls: number; installCalls: number; events: unknown[] } }).__qaAudit)
const shellY = (page: Page) => page.locator('.app-shell').evaluate((el) => el.getBoundingClientRect().y)

test.use({ viewport: { width: 1400, height: 900 } })

// ─────────────────────────────────────────────────────────────────────────────
test.describe('Q1/Q2/Q3 — 닫기 상태 경계(모든 상태 닫힘 · 동일 kind 침묵 · kind 변경 재등장)', () => {
  test.setTimeout(120_000)

  test('error/downloading 양쪽 닫힘 · P-2 동일 kind 침묵 · P-3 kind 변경 재등장', async ({ page, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const auth = await login(request)
    await installAuth(page, auth)
    await installUpdater(page, { script: 'error', rawError: RAW_ERROR })

    await page.goto(`${BASE_URL}/#/notifications`)
    await expect(page.getByTestId('sidebar-notifications'), '앱 셸 미렌더 — 전제 실패').toBeVisible({ timeout: 20000 })
    const notice = page.getByTestId('app-auto-update-status')
    const dismiss = page.getByTestId('app-auto-update-dismiss')

    // Q1-a — error 상태에서 닫기 존재 + 실제 닫힘
    await expect(notice, 'error 알림 미표시').toBeVisible({ timeout: 10000 })
    await expect(notice).toContainText('업데이트 실패')
    await expect(dismiss, 'Q1 위반 — error 상태에 닫기 버튼 없음').toBeVisible()
    await page.screenshot({ path: join(SHOT_DIR, 'P1-01-error-닫기존재.png'), fullPage: true })
    await dismiss.click()
    await expect(notice, 'Q1 위반 — error 상태에서 닫기가 안 먹음').toHaveCount(0)

    // Q1-b — downloading 상태에서도 닫기 존재 + 실제 닫힘 (kind 변경 error→downloading 로 재등장)
    await emit(page, { kind: 'downloading', percent: 61 })
    await expect(notice, 'P-3 — error→downloading kind 변경에 재등장 안 함').toBeVisible({ timeout: 5000 })
    await expect(notice).toContainText('61%')
    await expect(dismiss, 'Q1 위반 — downloading 상태에 닫기 버튼 없음').toBeVisible()
    await page.screenshot({ path: join(SHOT_DIR, 'P1-02-downloading61-닫기존재.png'), fullPage: true })
    const yBeforeDismiss = await shellY(page)
    await dismiss.click()
    await expect(notice, 'Q1 위반 — downloading 상태에서 닫기가 안 먹음').toHaveCount(0)
    const yAfterDismiss = await shellY(page)

    // Q2/P-2 — 같은 downloading 세션의 진행률 갱신은 닫힌 알림을 되살리지 않는다
    await emit(page, { kind: 'downloading', percent: 88 })
    await page.waitForTimeout(400)
    await expect(notice, 'P-2 위반 — 동일 kind 진행률 갱신에서 닫힌 알림이 되살아남').toHaveCount(0)
    const yAfterProgress = await shellY(page)
    console.log(`■ P-2 shell.y: 닫기전 ${yBeforeDismiss} → 닫은직후 ${yAfterDismiss} → 진행률갱신후 ${yAfterProgress} (닫힌 뒤 진행률 갱신에도 셸 복귀 유지)`)
    await page.screenshot({ path: join(SHOT_DIR, 'P1-03-동일kind-진행률-여전히닫힘.png'), fullPage: true })

    // Q3/P-3 — kind 변경(downloading→error) 은 새 이벤트라 재등장(영구 침묵 아님)
    await emit(page, { kind: 'error' })
    await expect(notice, 'P-3 위반 — downloading→error kind 변경인데 재등장 안 함(영구 침묵)').toBeVisible({ timeout: 5000 })
    await expect(notice).toContainText('업데이트 실패')
    const afterText = (await notice.innerText()).replace(/\s+/g, ' ').trim()
    console.log(`■ P-3 kind 변경 후 재등장 문구="${afterText}"`)
    await page.screenshot({ path: join(SHOT_DIR, 'P1-04-kind변경-error-재등장.png'), fullPage: true })

    // Q3-보강 — kind 변경(error→downloaded) 도 재등장 (다운로드 완료라는 새 사실을 놓치지 않는다)
    await page.getByTestId('app-auto-update-dismiss').click()
    await expect(notice).toHaveCount(0)
    await emit(page, { kind: 'downloaded', version: '9.9.8' })
    await expect(notice, 'P-3 위반 — error→downloaded 새 사실인데 재등장 안 함').toBeVisible({ timeout: 5000 })
    await expect(notice).toContainText('다운로드')
    await page.screenshot({ path: join(SHOT_DIR, 'P1-05-kind변경-downloaded-재등장.png'), fullPage: true })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
test.describe('Q6 — [kind] 의존성이 "실제로 새 알림인데 재표시를 놓치는" 경로가 도달가능한가', () => {
  test.setTimeout(120_000)

  test('동일 kind 연속(available v1→v2)은 합성상 침묵하나, 실 경로엔 항상 checking 이 껴 재표시된다', async ({ page, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const auth = await login(request)
    await installAuth(page, auth)
    await installUpdater(page, { script: 'error', rawError: RAW_ERROR }) // 우선 settle

    await page.goto(`${BASE_URL}/#/notifications`)
    await expect(page.getByTestId('sidebar-notifications')).toBeVisible({ timeout: 20000 })
    const notice = page.getByTestId('app-auto-update-status')
    await expect(notice).toBeVisible({ timeout: 10000 })

    // available v9.9.8 로 만든 뒤 닫는다
    await emit(page, { kind: 'available', version: '9.9.8' })
    await expect(notice).toContainText('9.9.8')
    await page.getByTestId('app-auto-update-dismiss').click()
    await expect(notice).toHaveCount(0)

    // ── (합성) 같은 kind 'available' 로 다른 버전(9.9.9) 을 곧바로 밀면 침묵하는가?
    //    이는 실 updater 가 절대 만들지 않는 순서(check 없이 available 두 번)다.
    await emit(page, { kind: 'available', version: '9.9.9' })
    await page.waitForTimeout(500)
    const silentCount = await notice.count()
    console.log(`■ (합성·비도달) available→dismiss→available(다른버전) 재등장 여부 count=${silentCount}`)
    await page.screenshot({ path: join(SHOT_DIR, 'P2-01-합성-동일kind-available-침묵.png'), fullPage: true })

    // ── (실 경로) 실제 updater 는 새 확인마다 checking 을 먼저 낸다 → kind 변경 → 재표시된다.
    //    checkForUpdate() 를 타는 "다시 확인" 버튼이 없으니(닫힘) checking 을 직접 주입해 실 순서 재현.
    await emit(page, { kind: 'checking' })
    await emit(page, { kind: 'available', version: '9.9.9' })
    await expect(notice, '실 경로(checking 개입)에서도 재표시 안 됨 — 영구 침묵이면 결함').toBeVisible({ timeout: 5000 })
    await expect(notice).toContainText('9.9.9')
    console.log('■ 실 경로(checking→available) 에서는 정상 재표시됨 → [kind] 경계는 도달가능 결함 아님')
    await page.screenshot({ path: join(SHOT_DIR, 'P2-02-실경로-checking개입-재표시.png'), fullPage: true })
  })

  test('닫기가 표시 중인 동안 "다시 확인"(모든 상태 노출) 이 실제 재확인을 태운다', async ({ page, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const auth = await login(request)
    await installAuth(page, auth)
    await installUpdater(page, { script: 'error', rawError: RAW_ERROR })

    await page.goto(`${BASE_URL}/#/notifications`)
    await expect(page.getByTestId('sidebar-notifications')).toBeVisible({ timeout: 20000 })
    const notice = page.getByTestId('app-auto-update-status')
    await expect(notice).toBeVisible({ timeout: 10000 })

    // downloading 상태에서 "다시 확인" 이 노출되고(모든 상태) 클릭 시 checkForUpdate 를 태우는가
    await emit(page, { kind: 'downloading', percent: 50 })
    await expect(notice).toContainText('50%')
    const before = await audit(page)
    await page.getByRole('button', { name: '다시 확인', exact: true }).click()
    await expect(notice, '다시 확인 후 checking 으로 전이 안 됨').toContainText('확인하는 중', { timeout: 5000 })
    const after = await audit(page)
    console.log(`■ downloading 중 "다시 확인" checkCalls ${before.checkCalls} → ${after.checkCalls}`)
    expect(after.checkCalls, '"다시 확인" 이 재확인을 태우지 않음').toBeGreaterThan(before.checkCalls)
    // 재확인은 error(mode error) 로 귀결 → 알림은 계속 살아 있고 닫기도 유지(무한 침묵/크래시 없음)
    await expect(notice).toContainText('업데이트 실패', { timeout: 5000 })
    await expect(page.getByTestId('app-auto-update-dismiss')).toBeVisible()
    await page.screenshot({ path: join(SHOT_DIR, 'P2-03-다시확인-재확인-태움.png'), fullPage: true })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
test.describe('F-6/F-7 — 진행률 17/42/88 · 기동 자동설치 1회 · late 0회', () => {
  test.setTimeout(120_000)

  test('진행률 스플래시 17→42→88 · downloaded 시 자동설치 정확히 1회', async ({ page, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const auth = await login(request)
    await installAuth(page, auth)
    await installUpdater(page, { script: 'idle' }) // 스스로 settle 안 함 → 스플래시 유지, 수동 구동

    await page.goto(`${BASE_URL}/#/login`)
    const splash = page.getByTestId('app-update-startup-splash')
    await expect(splash, '기동 스플래시 미표시').toBeVisible({ timeout: 15000 })

    await emit(page, { kind: 'available', version: '9.9.8' })
    await emit(page, { kind: 'downloading', percent: 17 })
    await expect(splash, 'F-6 — 17% 미표시').toContainText('17%', { timeout: 5000 })
    await page.screenshot({ path: join(SHOT_DIR, 'F6-01-17pct.png'), fullPage: true })
    await emit(page, { kind: 'downloading', percent: 42 })
    await expect(splash, 'F-6 — 42% 미표시').toContainText('42%', { timeout: 5000 })
    await page.screenshot({ path: join(SHOT_DIR, 'F6-02-42pct.png'), fullPage: true })
    await emit(page, { kind: 'downloading', percent: 88 })
    await expect(splash, 'F-6 — 88% 미표시').toContainText('88%', { timeout: 5000 })
    await page.screenshot({ path: join(SHOT_DIR, 'F6-03-88pct.png'), fullPage: true })

    await emit(page, { kind: 'downloaded', version: '9.9.8' })
    await expect
      .poll(async () => (await audit(page)).installCalls, { timeout: 8000, message: 'F-7 — 기동 자동설치가 호출되지 않음' })
      .toBe(1)
    await expect(splash, '설치·재시작 안내로 전이 안 됨').toContainText('설치', { timeout: 5000 })
    await expect(page.getByTestId('login-id-input'), '자동설치(재시작) 직전인데 로그인이 노출됨').toHaveCount(0)
    const a = await audit(page)
    console.log(`■ F-7 early installCalls=${a.installCalls} · events=${JSON.stringify(a.events)}`)
    await page.screenshot({ path: join(SHOT_DIR, 'F7-01-자동설치-1회.png'), fullPage: true })
  })

  test('기동 정착 이후 늦게 도착한 downloaded 는 자동설치하지 않는다(late 0회)', async ({ page, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const auth = await login(request)
    await installAuth(page, auth)
    await installUpdater(page, { script: 'idle' })

    await page.goto(`${BASE_URL}/#/login`)
    await expect(page.getByTestId('app-update-startup-splash')).toBeVisible({ timeout: 15000 })

    // not-available 로 정착 → 로그인 도달(기동 완료)
    await emit(page, { kind: 'not-available' })
    await expect(page.getByTestId('login-id-input'), '정착 후 로그인 미도달').toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(800) // startupInstallAllowedRef=false 로 굳는 시간

    // 이제 늦게 downloaded 도착 → 자동설치 금지
    await emit(page, { kind: 'downloaded', version: '9.9.9' })
    await page.waitForTimeout(1500)
    const a = await audit(page)
    console.log(`■ F-7 late installCalls=${a.installCalls} (0 이어야 함) · events=${JSON.stringify(a.events)}`)
    expect(a.installCalls, 'late 위반 — 정착 이후 downloaded 가 자동설치를 태움').toBe(0)
    // 늦은 downloaded 는 배너로 "다음 기동 때 설치" 안내만 (강제 재시작 없음)
    await expect(page.getByTestId('app-auto-update-status')).toContainText('다운로드', { timeout: 5000 })
    await page.screenshot({ path: join(SHOT_DIR, 'F7-02-late-자동설치0.png'), fullPage: true })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
test.describe('F-5 — 무진행 다운로드 상한(180s) 초과 후 로그인 도달·원문 비노출', () => {
  test.setTimeout(300_000)

  test('available 후 진행 없이 180초 → 스플래시 소멸·로그인·"제한 초과" 문구·feed URL 비노출', async ({ page, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const auth = await login(request)
    await installAuth(page, auth)
    await installUpdater(page, { script: 'progress-hang' })

    await page.goto(`${BASE_URL}/#/login`)
    const splash = page.getByTestId('app-update-startup-splash')
    await expect(splash).toBeVisible({ timeout: 15000 })
    await expect(splash, 'F-6 — 17% 진행 미표시').toContainText('17%', { timeout: 10000 })
    await page.screenshot({ path: join(SHOT_DIR, 'F5-01-무진행-17pct.png'), fullPage: true })

    await expect(splash, '180초 상한 후에도 스플래시가 남음').toHaveCount(0, { timeout: 200_000 })
    await expect(page.getByTestId('login-id-input'), '180초 상한 후 로그인 미도달').toBeVisible({ timeout: 10_000 })
    const body = await page.locator('body').innerText()
    expect(body, '상한 초과 안내 문구 없음').toContain('다운로드 시간이 제한을 초과했습니다')
    expect(body, 'feed URL 원문 노출').not.toContain('latest.yml')
    expect(body, 'intranet 원문 노출').not.toContain('intranet.example')
    console.log('■ F-5 무진행 180초 → 로그인 도달·제한 초과 안내·원문 비노출 GREEN')
    await page.screenshot({ path: join(SHOT_DIR, 'F5-02-상한초과-로그인.png'), fullPage: true })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
test.describe('F-3/Q6 — CRITICAL 차단 중 statusNotice 닫기가 차단을 우회하지 않는다', () => {
  test.setTimeout(180_000)

  test('CRITICAL 차단모달 + statusNotice(닫기 포함) 공존 · 닫기는 배너만 없앨 뿐 차단 유지', async ({ page, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const cleanup0 = cleanupThrowaway()
    console.log(`■ 시작 잔재 회수\n${cleanup0.trim() || '(잔재 없음)'}`)
    const auth = await login(request)
    const jsonAuth = { Authorization: `Bearer ${auth.token}`, 'X-User-Id': auth.userId, 'X-User-Role': auth.role, 'Content-Type': 'application/json' }
    const authH = { Authorization: `Bearer ${auth.token}`, 'X-User-Id': auth.userId, 'X-User-Role': auth.role }

    let releaseId = ''
    try {
      const created = await request.post(`${API_BASE}/app/releases`, {
        headers: jsonAuth,
        data: {
          clientType: 'DESKTOP', version: '2026/07/25-91013', forceLevel: 'CRITICAL',
          releaseNotes: `${MARKER} throwaway CRITICAL 차단-우회 검증`,
          releasedAt: '2026-07-23T00:00:00', minSupportedVersion: '0.1.0',
        },
      })
      expect(created.status(), `릴리스 등록 실패 HTTP ${created.status()}`).toBeLessThan(400)
      releaseId = String((await created.json()).data?.id ?? '')
      expect(releaseId).not.toBe('')
      const pub = await request.post(`${API_BASE}/app/releases/${releaseId}/publish`, { headers: authH })
      expect(pub.status(), `publish 실패 HTTP ${pub.status()}`).toBeLessThan(400)
      const v = await request.get(`${API_BASE}/app/version?clientType=DESKTOP&currentVersion=0.1.0`, { headers: authH })
      expect((await v.json()).data?.forceLevel, '서버 CRITICAL 미반영').toBe('CRITICAL')

      await installAuth(page, auth)
      await installUpdater(page, { script: 'error', rawError: RAW_ERROR }) // statusNotice 를 error 로 띄운다
      await page.goto(`${BASE_URL}/#/`)

      const modal = page.getByTestId('app-version-blocking-modal')
      const notice = page.getByTestId('app-auto-update-status')
      const dismiss = page.getByTestId('app-auto-update-dismiss')

      await expect(modal, 'CRITICAL 인데 차단모달 미표시(F-3 회귀)').toBeVisible({ timeout: 20000 })
      await expect(page.getByTestId('sidebar-notifications'), 'CRITICAL 인데 children(사이드바)이 렌더됨').toHaveCount(0)
      await expect(notice, '차단 중 statusNotice 미표시').toBeVisible({ timeout: 10000 })
      await expect(dismiss, '차단 중 statusNotice 에 닫기 없음').toBeVisible()
      await expect(page.getByTestId('app-version-blocking-reload')).toBeVisible()
      await expect(page.getByTestId('app-version-blocking-quit')).toBeVisible()

      // z-order 실측 — 닫기가 실제로 최상단에서 클릭되는지 / 모달 뒤에 가려지는지
      const z = await page.evaluate(() => {
        const n = document.querySelector('[data-testid="app-auto-update-status"]') as HTMLElement | null
        const b = document.querySelector('[data-testid="ds-modal-backdrop"]') as HTMLElement | null
        const d = document.querySelector('[data-testid="app-auto-update-dismiss"]') as HTMLElement | null
        const r = d?.getBoundingClientRect()
        const top = r ? (document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) as HTMLElement | null) : null
        return {
          noticeZ: n ? getComputedStyle(n).zIndex : null,
          noticePos: n ? getComputedStyle(n).position : null,
          backdropZ: b ? getComputedStyle(b).zIndex : null,
          topAtDismiss: top ? `${top.tagName}.${(top.className || '').toString().slice(0, 30)}` : null,
        }
      })
      console.log(`■ CRITICAL z-order = ${JSON.stringify(z)}`)
      await page.screenshot({ path: join(SHOT_DIR, 'F3-01-CRITICAL-차단+배너닫기.png'), fullPage: true })

      // 🔑 닫기를 눌러도(설령 클릭이 통해도) 차단은 유지되어야 한다 — 배너만 사라진다.
      const dismissClickable = z.topAtDismiss?.includes('app-auto-update-dismiss') ?? false
      if (dismissClickable) {
        await dismiss.click()
        await expect(notice, '닫기 클릭 후 statusNotice 는 사라진다').toHaveCount(0)
      } else {
        // 모달 backdrop 이 위라 닫기가 클릭 불가 → 우회 자체가 불가능. 강제로 hidden 확인만.
        console.log('■ 닫기 버튼이 모달 backdrop 뒤에 있어 사용자 클릭 도달 불가 — 우회 경로 없음')
      }
      await expect(modal, '🚨 우회 — statusNotice 닫기 후 차단모달이 사라짐').toBeVisible()
      await expect(page.getByTestId('sidebar-notifications'), '🚨 우회 — 닫기 후 children(앱)이 노출됨').toHaveCount(0)

      // Esc·배경클릭으로도 차단 유지
      await page.keyboard.press('Escape')
      await expect(modal, 'Escape 로 차단 풀림').toBeVisible()
      await page.mouse.click(5, 5)
      await expect(modal, '배경클릭으로 차단 풀림').toBeVisible()

      // "업데이트 다시 확인"(모달 버튼) 클릭해도 차단 유지(재확인만 태움)
      await page.getByTestId('app-version-blocking-reload').click()
      await expect(modal, '모달 다시확인 후 차단 풀림').toBeVisible()
      await expect(page.getByTestId('sidebar-notifications')).toHaveCount(0)
      await page.screenshot({ path: join(SHOT_DIR, 'F3-02-닫기·Esc·배경·재확인-후에도-차단유지.png'), fullPage: true })
    } finally {
      const out = cleanupThrowaway()
      console.log(`■ 종료 정리 SQL\n${out.trim() || '(잔재 없음)'}`)
      expect(out).toContain(MARKER)
    }
  })
})
