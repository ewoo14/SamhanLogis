import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
/**
 * PR #909 SONNET5 라운드2 — 인쇄 관점 계열 전수 sweep.
 *
 * "배너만 고치면 다음 라운드에 다른 요소로 같은 결함이 남는다" 는 지시에 따라,
 * 화면 전용(전역 마운트) 요소들을 실제로 emulateMedia({media:'print'}) 걸고
 * ① 인쇄 미디어에 나타나는가(U-1 계열) ② 인쇄 레이아웃(paper)을 밀어내는가(U-2 계열)
 * 를 표로 남긴다. 이번 라운드가 "고치는" 대상은 AppVersionGate statusNotice 하나뿐이고
 * (별도 파일 AppVersionGate.tsx 의 no-print 클래스), 여기서 새로 드러나는 다른 요소는
 * "기록만" 한다 — 하네스 규칙(뿌리 1개) 상 이번 턴에 고치지 않는다.
 *
 * 실행:
 *   cd clients/desktop
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts --reporter=line \
 *     playwright/909-auto-update-real-qa/sonnet-round2-print-sweep-real-qa.spec.ts
 *
 * 전제: 렌더러 5200(vite dev, 이 워크트리) · 실서버 8080 · docker samhan-postgres.
 */
import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5200'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOT_DIR = resolveQaShotsDir(process.env['AUDIT_SHOT_DIR']
  ?? join(process.cwd(), '..', '..', 'docs', 'qa', '909-sonnet-round2-2026-07-24'))
const MARKER = 'LUNA909R6'
/** 실서버 slip_db 실데이터 — OUTBOUND 2026/01/15-1, 라인 5행. */
const SLIP_ID = process.env['QA_SLIP_ID'] ?? '1d905732-3059-48b9-869d-456404e68249'
const PRINT_URL = `${BASE_URL}/#/sales/${SLIP_ID}/print/statement`

type Auth = { token: string; userId: string; role: string; fullName: string }

async function login(request: import('@playwright/test').APIRequestContext): Promise<Auth> {
  const res = await request.post(`${API_BASE}/api/auth/login`, { data: { loginId: 'dev_master', password: PASSWORD } })
  expect(res.ok(), `실서버 로그인 실패 HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return { token: d.token ?? '', userId: d.userId ?? '', role: d.role ?? 'MASTER', fullName: d.displayName ?? '개발책임자' }
}

async function installAuthHarness(page: Page, auth: Auth) {
  await page.addInitScript((v) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => ({ ...v, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined },
    })
  }, auth)
}

/** updater 를 즉시 not-available 로 정착시킨다 — statusNotice 를 끄고 다른 요소 1개만 관측한다. */
async function installNeutralUpdaterHarness(page: Page, opts?: { installCounter?: boolean; quitCounter?: boolean }) {
  await page.addInitScript((o) => {
    type Status = { kind: string; message?: string; version?: string; percent?: number }
    const listeners = new Set<(s: Status) => void>()
    const emit = (s: Status) => { for (const l of listeners) l(s) }
    ;(window as unknown as { __qaEmit: (s: Status) => void }).__qaEmit = emit
    ;(window as unknown as { __qaCheckCalls: number }).__qaCheckCalls = 0
    ;(window as unknown as { __qaInstallCalls: number }).__qaInstallCalls = 0
    ;(window as unknown as { __qaQuitCalls: number }).__qaQuitCalls = 0
    Object.defineProperty(window, 'samhanUpdater', {
      configurable: true,
      value: {
        onStatus: (l: (s: Status) => void) => { listeners.add(l); return () => listeners.delete(l) },
        check: async () => {
          ;(window as unknown as { __qaCheckCalls: number }).__qaCheckCalls += 1
          emit({ kind: 'checking' })
          await new Promise<void>((r) => window.setTimeout(r, 60))
          emit({ kind: 'not-available' })
        },
        install: async () => { (window as unknown as { __qaInstallCalls: number }).__qaInstallCalls += 1 },
        quit: async () => { (window as unknown as { __qaQuitCalls: number }).__qaQuitCalls += 1 },
      },
    })
  }, opts ?? {})
}

/** PDF 바이너리의 페이지 수 — `/Type /Page`(≠ /Pages) 개수. */
function pdfPageCount(buf: Buffer): number {
  const text = buf.toString('latin1')
  const m = text.match(/\/Type\s*\/Page[^s]/g)
  return m ? m.length : 0
}

function cleanupThrowawayRelease(): string {
  const sql = [
    `UPDATE app_release SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = '${MARKER}' WHERE release_notes LIKE '${MARKER}%';`,
    `SELECT client_type, version, force_level, is_deleted, left(release_notes, 40) FROM app_release WHERE release_notes LIKE '${MARKER}%' ORDER BY version;`,
  ].join(' ')
  return execFileSync('docker', ['exec', 'samhan-postgres', 'psql', '-U', 'samhan', '-d', 'dashboard_db', '-tAc', sql], { encoding: 'utf8' })
}

type SweepRow = {
  element: string
  category: string
  printVisible: boolean
  pushesLayout: boolean
  note: string
  /** U-1 은 "화면 전용 알림은 인쇄에 안 보여야 정상" 이지만, U-3(문서 미리보기 모달)은 반대로
   *  "보여야 정상" 이다 — 기본값 false(안 보여야 정상), 문서류만 true 로 뒤집는다. */
  expectVisible?: boolean
}
const sweepRows: SweepRow[] = []

async function probeElement(page: Page, selector: string): Promise<{ exists: boolean; display: string; height: number; y: number } | null> {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null
    if (!el) return null
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    return { exists: true, display: cs.display, height: r.height, y: r.y }
  }, selector)
}

test.setTimeout(120_000)
test.use({ viewport: { width: 1400, height: 900 } })

test.describe('인쇄 관점 sweep', () => {
  test('사이드바·헤더·드로어 백드롭 — 인쇄 라우트에서도 no-print 관례가 실제로 성립하는가', async ({ page, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const auth = await login(request)
    await installAuthHarness(page, auth)
    await installNeutralUpdaterHarness(page)
    await page.goto(PRINT_URL)
    await page.locator('.paper-a4-portrait').waitFor({ state: 'visible', timeout: 30000 })

    // 인쇄 라우트는 사이드바/헤더가 렌더되지 않는 전용 레이아웃일 수 있다 — 존재 여부부터 관측한다.
    await page.emulateMedia({ media: 'print' })
    for (const [label, sel] of [['사이드바', '.app-sidebar'], ['헤더', '.app-header'], ['드로어 백드롭', '.app-drawer-backdrop']] as const) {
      const info = await probeElement(page, sel)
      if (!info) {
        sweepRows.push({ element: label, category: '사이드바/헤더/오버레이', printVisible: false, pushesLayout: false, note: '인쇄 라우트에 애초에 렌더되지 않음(전용 레이아웃)' })
        console.log(`■ [sweep] ${label}(${sel}) — 인쇄 라우트에 존재하지 않음`)
        continue
      }
      const visible = info.display !== 'none'
      sweepRows.push({ element: label, category: '사이드바/헤더/오버레이', printVisible: visible, pushesLayout: visible && info.height > 0, note: `display=${info.display}` })
      console.log(`■ [sweep] ${label}(${sel}) display=${info.display} h=${info.height}`)
      expect(visible, `${label} 가 인쇄 미디어에 나타난다 — no-print 관례 회귀`).toBe(false)
    }
    await page.emulateMedia({ media: 'screen' })
  })

  test('푸시 권한 거부 토스트 — no-print 적용 후 U-1/U-2 성립 확인', async ({ page, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const auth = await login(request)
    await installAuthHarness(page, auth)
    await installNeutralUpdaterHarness(page)
    await page.goto(PRINT_URL)
    const paper = page.locator('.paper-a4-portrait')
    await expect(paper).toBeVisible({ timeout: 30000 })

    // 대조군 PDF — 같은 세션·같은 print 미디어에서(토스트 뜨기 전) 먼저 확보한다(apples-to-apples).
    await page.emulateMedia({ media: 'print' })
    const controlPdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
    const controlPages = pdfPageCount(controlPdf)
    await page.emulateMedia({ media: 'screen' })

    // 실제 커스텀 이벤트를 디스패치한다 — PushPermissionDeniedToast.tsx 가 그대로 구독하는 실경로.
    await page.evaluate(() => {
      window.dispatchEvent(new Event('samhan:push-permission-denied'))
    })
    const toast = page.getByTestId('push-permission-denied-toast')
    await expect(toast, '푸시 권한 거부 토스트가 안 뜸 — 시험 전제가 깨짐(이벤트명 변경?)').toBeVisible({ timeout: 5000 })
    await page.screenshot({ path: join(SHOT_DIR, 'sweep-toast-화면.png'), fullPage: true })

    await page.emulateMedia({ media: 'print' })
    const info = await toast.evaluate((el) => {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return { display: cs.display, position: cs.position, height: r.height }
    })
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
    writeFileSync(join(SHOT_DIR, 'sweep-toast-print.pdf'), pdf)
    const pages = pdfPageCount(pdf)
    await page.screenshot({ path: join(SHOT_DIR, 'sweep-toast-print미디어.png'), fullPage: true })
    await page.emulateMedia({ media: 'screen' })

    console.log(`■ [sweep] 토스트(push-permission-denied) print display=${info.display} position=${info.position} 대조군${controlPages}p 실험군${pages}p`)
    const visible = info.display !== 'none'
    sweepRows.push({
      element: 'PushPermissionDeniedToast',
      category: '토스트',
      printVisible: visible,
      pushesLayout: pages !== controlPages,
      note: `position=${info.position} · no-print 적용됨 · 대조군${controlPages}p=실험군${pages}p`,
    })
    expect(info.display, 'U-1 위반 — PushPermissionDeniedToast 가 인쇄 미디어에서 숨겨지지 않는다').toBe('none')
    expect(pages, `U-2 위반 — 토스트 때문에 페이지 수가 늘어남(대조군 ${controlPages}p)`).toBe(controlPages)
  })

  test('MAJOR(recommend Modal) 이 인쇄 라우트와 동시 렌더될 때', async ({ page, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const cleanup0 = cleanupThrowawayRelease()
    console.log(`■ 시작 잔재 회수\n${cleanup0.trim() || '(없음)'}`)
    const auth = await login(request)
    const authHeaders = { Authorization: `Bearer ${auth.token}`, 'X-User-Id': auth.userId, 'X-User-Role': auth.role, 'Content-Type': 'application/json' }
    let releaseId = ''
    try {
      // 대조군 — 릴리스를 만들기 전, 같은 라우트를 먼저 print 미디어로 측정한다(apples-to-apples).
      await installAuthHarness(page, auth)
      await installNeutralUpdaterHarness(page)
      await page.goto(PRINT_URL)
      const paper = page.locator('.paper-a4-portrait')
      await expect(paper, '인쇄 양식이 렌더되지 않음').toBeVisible({ timeout: 30000 })
      await page.emulateMedia({ media: 'print' })
      const controlPdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
      const controlPages = pdfPageCount(controlPdf)
      await page.emulateMedia({ media: 'screen' })
      console.log(`■ [MAJOR sweep 대조군] pages=${controlPages}`)

      const created = await request.post(`${API_BASE}/app/releases`, {
        headers: authHeaders,
        data: {
          clientType: 'DESKTOP', version: '2026/07/25-91014', forceLevel: 'MAJOR',
          releaseNotes: `${MARKER} throwaway print-sweep MAJOR(recommend)`,
          releasedAt: '2026-07-24T00:00:00', minSupportedVersion: '0.0.0',
        },
      })
      expect(created.status()).toBeLessThan(400)
      releaseId = String((await created.json()).data?.id ?? '')
      expect(releaseId).not.toBe('')
      const pub = await request.post(`${API_BASE}/app/releases/${releaseId}/publish`, { headers: authHeaders })
      expect(pub.status()).toBeLessThan(400)
      const v = await request.get(`${API_BASE}/app/version?clientType=DESKTOP&currentVersion=0.1.0`, { headers: authHeaders })
      const lvl = (await v.json()).data?.forceLevel
      console.log(`■ throwaway 등록 후 forceLevel=${lvl}`)
      expect(lvl, 'MAJOR 가 반영되지 않아 recommend 시험이 성립하지 않는다').toBe('MAJOR')

      await page.reload()
      const modal = page.getByTestId('app-version-recommend-modal')
      await expect(modal, 'recommend 모달이 안 뜸 — 시험 전제가 깨짐').toBeVisible({ timeout: 15000 })
      await page.screenshot({ path: join(SHOT_DIR, 'sweep-recommend-modal-화면.png'), fullPage: true })

      await page.emulateMedia({ media: 'print' })
      const backdrop = page.getByTestId('ds-modal-backdrop')
      const backdropInfo = await backdrop.evaluate((el) => {
        const cs = getComputedStyle(el)
        return { display: cs.display, position: cs.position }
      }).catch(() => null)
      const paperRect = await paper.evaluate((el) => el.getBoundingClientRect())
      const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
      writeFileSync(join(SHOT_DIR, 'sweep-recommend-modal-print.pdf'), pdf)
      const pages = pdfPageCount(pdf)
      await page.screenshot({ path: join(SHOT_DIR, 'sweep-recommend-modal-print미디어.png'), fullPage: true })
      await page.emulateMedia({ media: 'screen' })

      console.log(`■ [sweep] MAJOR recommend Modal — backdrop=${JSON.stringify(backdropInfo)} paper.y=${paperRect.y} 대조군${controlPages}p 실험군${pages}p`)
      const backdropVisible = backdropInfo ? backdropInfo.display !== 'none' : false
      sweepRows.push({
        element: 'Modal(recommend, design-system 공용 — ds-modal-backdrop 표적)',
        category: '모달',
        printVisible: backdropVisible,
        pushesLayout: pages !== controlPages,
        note: `backdrop display=${backdropInfo?.display ?? 'N/A'} · 대조군${controlPages}p=실험군${pages}p · :has([data-testid='app-version-recommend-modal']) 로 표적(PM 반증 후 정정 — 블랭킷 아님) · SlipDetailModal 등 문서 미리보기 모달은 U-3 로 별도 확인, 인쇄 보존됨 · design-system 미수정`,
      })
      expect(backdropInfo?.display, 'U-1 위반 — Modal backdrop 이 인쇄 미디어에서 숨겨지지 않는다').toBe('none')
      expect(pages, `U-2 위반 — Modal 때문에 페이지 수가 늘어남(대조군 ${controlPages}p)`).toBe(controlPages)
    } finally {
      const cleanup1 = cleanupThrowawayRelease()
      console.log(`■ 종료 정리\n${cleanup1.trim() || '(없음)'}`)
      expect(cleanup1).toContain(MARKER)
    }
  })

  test('MINOR(하단 배너) 가 인쇄 라우트와 동시 렌더될 때', async ({ page, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const cleanup0 = cleanupThrowawayRelease()
    console.log(`■ 시작 잔재 회수\n${cleanup0.trim() || '(없음)'}`)
    const auth = await login(request)
    const authHeaders = { Authorization: `Bearer ${auth.token}`, 'X-User-Id': auth.userId, 'X-User-Role': auth.role, 'Content-Type': 'application/json' }
    let releaseId = ''
    try {
      // 대조군 — 릴리스를 만들기 전, 같은 라우트를 먼저 print 미디어로 측정한다(apples-to-apples).
      await installAuthHarness(page, auth)
      await installNeutralUpdaterHarness(page)
      await page.goto(PRINT_URL)
      const paper = page.locator('.paper-a4-portrait')
      await expect(paper, '인쇄 양식이 렌더되지 않음').toBeVisible({ timeout: 30000 })
      await page.emulateMedia({ media: 'print' })
      const controlPdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
      const controlPages = pdfPageCount(controlPdf)
      await page.emulateMedia({ media: 'screen' })
      console.log(`■ [MINOR sweep 대조군] pages=${controlPages}`)

      const created = await request.post(`${API_BASE}/app/releases`, {
        headers: authHeaders,
        data: {
          clientType: 'DESKTOP', version: '2026/07/25-91015', forceLevel: 'MINOR',
          releaseNotes: `${MARKER} throwaway print-sweep MINOR(banner)`,
          releasedAt: '2026-07-24T00:00:00', minSupportedVersion: '0.0.0',
        },
      })
      expect(created.status()).toBeLessThan(400)
      releaseId = String((await created.json()).data?.id ?? '')
      expect(releaseId).not.toBe('')
      const pub = await request.post(`${API_BASE}/app/releases/${releaseId}/publish`, { headers: authHeaders })
      expect(pub.status()).toBeLessThan(400)
      const v = await request.get(`${API_BASE}/app/version?clientType=DESKTOP&currentVersion=0.1.0`, { headers: authHeaders })
      const lvl = (await v.json()).data?.forceLevel
      console.log(`■ throwaway 등록 후 forceLevel=${lvl}`)
      expect(lvl, 'MINOR 가 반영되지 않아 시험이 성립하지 않는다').toBe('MINOR')

      await page.reload()
      const banner = page.getByTestId('app-version-minor-banner')
      await expect(banner, 'minor 배너가 안 뜸 — 시험 전제가 깨짐').toBeVisible({ timeout: 15000 })
      await page.screenshot({ path: join(SHOT_DIR, 'sweep-minor-banner-화면.png'), fullPage: true })

      await page.emulateMedia({ media: 'print' })
      const info = await banner.evaluate((el) => {
        const cs = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        return { display: cs.display, position: cs.position, y: r.y, height: r.height }
      })
      const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
      writeFileSync(join(SHOT_DIR, 'sweep-minor-banner-print.pdf'), pdf)
      const pages = pdfPageCount(pdf)
      await page.screenshot({ path: join(SHOT_DIR, 'sweep-minor-banner-print미디어.png'), fullPage: true })
      await page.emulateMedia({ media: 'screen' })

      console.log(`■ [sweep] MINOR 배너 — ${JSON.stringify(info)} 대조군${controlPages}p 실험군${pages}p`)
      const visible = info.display !== 'none'
      sweepRows.push({
        element: 'app-version-minor-banner',
        category: '배너',
        printVisible: visible,
        pushesLayout: pages !== controlPages,
        note: `position=${info.position} · no-print 적용됨 · 대조군${controlPages}p=실험군${pages}p`,
      })
      expect(info.display, 'U-1 위반 — app-version-minor-banner 가 인쇄 미디어에서 숨겨지지 않는다').toBe('none')
      expect(pages, `U-2 위반 — minor 배너 때문에 페이지 수가 늘어남(대조군 ${controlPages}p)`).toBe(controlPages)
    } finally {
      const cleanup1 = cleanupThrowawayRelease()
      console.log(`■ 종료 정리\n${cleanup1.trim() || '(없음)'}`)
      expect(cleanup1).toContain(MARKER)
    }
  })

  test('F-3 정밀화 — CRITICAL 차단 모달의 두 버튼이 실제로 클릭 가능하다(핸들러 발화 확인)', async ({ page, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const cleanup0 = cleanupThrowawayRelease()
    console.log(`■ 시작 잔재 회수\n${cleanup0.trim() || '(없음)'}`)
    const auth = await login(request)
    const authHeaders = { Authorization: `Bearer ${auth.token}`, 'X-User-Id': auth.userId, 'X-User-Role': auth.role, 'Content-Type': 'application/json' }
    let releaseId = ''
    try {
      const created = await request.post(`${API_BASE}/app/releases`, {
        headers: authHeaders,
        data: {
          clientType: 'DESKTOP', version: '2026/07/25-91016', forceLevel: 'CRITICAL',
          releaseNotes: `${MARKER} throwaway F-3 버튼 클릭 검증`,
          releasedAt: '2026-07-24T00:00:00', minSupportedVersion: '0.1.0',
        },
      })
      expect(created.status()).toBeLessThan(400)
      releaseId = String((await created.json()).data?.id ?? '')
      const pub = await request.post(`${API_BASE}/app/releases/${releaseId}/publish`, { headers: authHeaders })
      expect(pub.status()).toBeLessThan(400)
      const v = await request.get(`${API_BASE}/app/version?clientType=DESKTOP&currentVersion=0.1.0`, { headers: authHeaders })
      expect((await v.json()).data?.forceLevel).toBe('CRITICAL')

      await installAuthHarness(page, auth)
      await installNeutralUpdaterHarness(page, { installCounter: true, quitCounter: true })
      await page.goto(`${BASE_URL}/#/`)

      const modal = page.getByTestId('app-version-blocking-modal')
      await expect(modal).toBeVisible({ timeout: 20000 })
      // children(사이드바 등) 은 아예 렌더되지 않는다 — 인쇄 라우트를 포함해 CRITICAL 차단 중에는
      // 어떤 페이지도 그려지지 않으므로, 이 상태는 인쇄 sweep 대상이 아니다(구조적으로 도달 불가).
      await expect(page.getByTestId('sidebar-notifications')).toHaveCount(0)

      const reloadBtn = page.getByTestId('app-version-blocking-reload')
      const quitBtn = page.getByTestId('app-version-blocking-quit')
      await expect(reloadBtn).toBeVisible()
      await expect(quitBtn).toBeVisible()
      await expect(reloadBtn).toBeEnabled()
      await expect(quitBtn).toBeEnabled()

      const before = await page.evaluate(() => ({
        check: (window as unknown as { __qaCheckCalls?: number }).__qaCheckCalls ?? 0,
        quit: (window as unknown as { __qaQuitCalls?: number }).__qaQuitCalls ?? 0,
      }))
      await reloadBtn.click()
      await expect.poll(async () => page.evaluate(() => (window as unknown as { __qaCheckCalls?: number }).__qaCheckCalls ?? 0), { timeout: 5000 })
        .toBeGreaterThan(before.check)
      console.log(`■ 「업데이트 다시 확인」 클릭 → checkCalls ${before.check} → 증가 확인`)
      await page.screenshot({ path: join(SHOT_DIR, 'F3-다시확인-클릭후.png'), fullPage: true })

      await quitBtn.click()
      await expect.poll(async () => page.evaluate(() => (window as unknown as { __qaQuitCalls?: number }).__qaQuitCalls ?? 0), { timeout: 5000 })
        .toBeGreaterThan(before.quit)
      console.log(`■ 「앱 종료」 클릭 → quitCalls ${before.quit} → 증가 확인`)
      await page.screenshot({ path: join(SHOT_DIR, 'F3-앱종료-클릭후.png'), fullPage: true })
    } finally {
      const cleanup1 = cleanupThrowawayRelease()
      console.log(`■ 종료 정리\n${cleanup1.trim() || '(없음)'}`)
      expect(cleanup1).toContain(MARKER)
    }
  })

  test('F-8 정밀화 — 640/800/1000/1400px 에서 배너 x/right/scrollWidth 실측', async ({ page, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const auth = await login(request)
    await installAuthHarness(page, auth)
    await page.addInitScript((rawError: string) => {
      type Status = { kind: string; message?: string }
      const listeners = new Set<(s: Status) => void>()
      Object.defineProperty(window, 'samhanUpdater', {
        configurable: true,
        value: {
          onStatus: (l: (s: Status) => void) => { listeners.add(l); return () => listeners.delete(l) },
          check: async () => { for (const l of listeners) l({ kind: 'checking' }); await new Promise<void>((r) => setTimeout(r, 60)); throw new Error(rawError) },
          install: async () => undefined,
          quit: async () => undefined,
        },
      })
    }, 'Cannot find channel latest at https://intranet.example/latest.yml x-secret-header')
    await page.goto(`${BASE_URL}/#/`)
    const notice = page.getByTestId('app-auto-update-status')
    await expect(notice).toBeVisible({ timeout: 15000 })

    const results: string[] = []
    for (const w of [1400, 1000, 800, 640]) {
      await page.setViewportSize({ width: w, height: 800 })
      await page.waitForTimeout(500)
      const m = await page.evaluate(() => {
        const n = document.querySelector('[data-testid="app-auto-update-status"]') as HTMLElement
        const r = n.getBoundingClientRect()
        return {
          x: Math.round(r.x * 10) / 10,
          right: Math.round(r.right * 10) / 10,
          scrollW: document.scrollingElement!.scrollWidth,
          viewportW: window.innerWidth,
        }
      })
      const overflow = m.scrollW - m.viewportW
      const line = `${w}px → x=${m.x} right=${m.right} scrollWidth=${m.scrollW} (viewport ${m.viewportW}, 넘침 ${overflow})`
      console.log(`■ F-8 ${line}`)
      results.push(line)
      await page.screenshot({ path: join(SHOT_DIR, `F8-${w}px.png`) })
      expect(overflow, `${w}px 에서 가로 스크롤 발생(F-8 회귀)`).toBe(0)
    }
    console.log(`■■ F-8 요약\n   ${results.join('\n   ')}`)
  })

  test('F-7 정밀화 — 기동 시 자동설치 1회 · 기동 후 late-downloaded 는 자동설치 0회', async ({ page, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const auth = await login(request)
    await installAuthHarness(page, auth)
    await installNeutralUpdaterHarness(page, { installCounter: true })
    await page.goto(`${BASE_URL}/#/`)
    // 기동은 not-available 로 정착 — installCalls 는 기동 경로에서 0 이어야 한다(양성 대조).
    await expect(page.getByTestId('sidebar-notifications')).toBeVisible({ timeout: 15000 })
    const afterStartup = await page.evaluate(() => (window as unknown as { __qaInstallCalls?: number }).__qaInstallCalls ?? -1)
    console.log(`■ F-7 기동 직후(not-available) installCalls=${afterStartup}`)
    expect(afterStartup, '기동 경로에서부터 이미 installCalls != 0 — 시험 전제가 깨짐').toBe(0)

    // 기동이 끝나 앱에 진입한 뒤(startupInstallAllowedRef=false) 뒤늦게 downloaded 가 온다.
    await page.evaluate(() => (window as unknown as { __qaEmit: (s: unknown) => void }).__qaEmit({ kind: 'downloaded', version: '9.9.4' }))
    await expect(page.getByTestId('app-auto-update-status')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(1000)
    const afterLateDownload = await page.evaluate(() => (window as unknown as { __qaInstallCalls?: number }).__qaInstallCalls ?? -1)
    console.log(`■ F-7 late-downloaded 이후 installCalls=${afterLateDownload}`)
    await page.screenshot({ path: join(SHOT_DIR, 'F7-late-downloaded-자동설치없음.png'), fullPage: true })
    expect(afterLateDownload, 'F-7 위반 — 기동 후 late-downloaded가 자동설치를 한 번 더 유발한다').toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
/**
 * U-3(#909 SONNET5 라운드2, PM 반증 2026-07-24) — "사용자가 인쇄하려는 내용을 지우지 않는다".
 *
 * PM 이 발견: SlipDetailModal(배차보드 전표 row 클릭 → "출고전표 미리보기" 모달) 은
 * Modal children 안에 실제 인쇄 문서(DispatchDocument, .dispatch-page)를 렌더한다.
 * [data-testid='ds-modal-backdrop'] 를 통째로 숨기는 이전 fix 는 이 문서를 인쇄에서 지운다.
 * 여기서는 (a) 그 결함을 실제로 재현(RED, 블랭킷 규칙 주입) (b) 현재 소스(:has() 표적) 로
 * 문서가 인쇄되는지(GREEN, 정지 대조군) (c) 업데이트 모달은 여전히 인쇄에서 빠지는지(GREEN,
 * 회귀 없음) 를 모두 실측한다.
 */
const BLANKET_MODAL_HIDE_CSS = `
  @media print {
    [data-testid='ds-modal-backdrop'] { display: none !important; }
  }
`

async function openSlipDetailModalWithRealData(page: Page): Promise<{ slipNo: string; opened: boolean }> {
  await page.goto(`${BASE_URL}/#/dispatch-board`)
  await page.getByTestId('dispatch-board-filter-from').fill('2026-01-01')
  await page.getByTestId('dispatch-board-filter-to').fill('2026-12-31')
  await page.waitForTimeout(1500)
  const openBtn = page.locator('[data-testid^="dispatch-board-slip-open-"]').first()
  const opened = await openBtn.waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false)
  if (!opened) return { slipNo: '', opened: false }
  const testId = await openBtn.getAttribute('data-testid')
  const slipNo = testId ? testId.replace('dispatch-board-slip-open-', '') : ''
  await openBtn.click()
  await page.getByTestId('dispatch-board-slip-detail-body').waitFor({ state: 'visible', timeout: 15000 })
  await page.locator('.dispatch-page').first().waitFor({ state: 'visible', timeout: 15000 })
  return { slipNo, opened: true }
}

test.describe('U-3 Modal 안 인쇄 지면(SlipDetailModal) — PM 반증 확인', () => {
  test.setTimeout(120_000)

  test('RED 재현 — 이전 블랭킷 규칙([data-testid=ds-modal-backdrop] 통째 숨김)이 실제 문서를 인쇄에서 지운다', async ({ page, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const auth = await login(request)
    await installAuthHarness(page, auth)
    await installNeutralUpdaterHarness(page)

    const { slipNo, opened } = await openSlipDetailModalWithRealData(page)
    expect(opened, '배차보드에 미배차 전표가 하나도 없음 — 시험 전제가 깨짐').toBe(true)
    console.log(`■ [U-3] 실데이터 전표 ${slipNo} 로 SlipDetailModal 오픈`)
    await page.screenshot({ path: join(SHOT_DIR, 'U3-RED-모달-화면.png'), fullPage: true })

    // 대조군 — 블랭킷 규칙 주입 전, 인쇄 미디어에서 문서가 실제로 보이는지 먼저 확인(전제 확증).
    await page.emulateMedia({ media: 'print' })
    const beforeInject = await page.locator('.dispatch-page').first().isVisible().catch(() => false)
    await page.emulateMedia({ media: 'screen' })
    console.log(`■ [U-3] 블랭킷 규칙 주입 전 — 인쇄 미디어에서 .dispatch-page 표시=${beforeInject}`)

    // 이전 fix(블랭킷 규칙)를 이 페이지에만 주입 — 소스 파일은 건드리지 않는다.
    await page.addStyleTag({ content: BLANKET_MODAL_HIDE_CSS })
    await page.emulateMedia({ media: 'print' })
    const docVisible = await page.locator('.dispatch-page').first().isVisible().catch(() => false)
    const backdropDisplay = await page.getByTestId('ds-modal-backdrop').evaluate((el) => getComputedStyle(el).display).catch(() => 'N/A')
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
    writeFileSync(join(SHOT_DIR, 'U3-RED-블랭킷규칙-print.pdf'), pdf)
    await page.screenshot({ path: join(SHOT_DIR, 'U3-RED-블랭킷규칙-print미디어.png'), fullPage: true })
    await page.emulateMedia({ media: 'screen' })

    console.log(`■■ [U-3 RED] 블랭킷 규칙 적용 후 — backdrop display=${backdropDisplay}, .dispatch-page 표시=${docVisible}`)
    expect(beforeInject, '전제 붕괴 — 블랭킷 주입 전에도 문서가 인쇄에 안 보임').toBe(true)
    expect(docVisible, 'U-3 RED 재현 실패 — 블랭킷 규칙이 있어도 문서가 여전히 보임(전제가 깨짐)').toBe(false)
  })

  test('GREEN — 현재 소스(:has() 표적)는 문서를 인쇄하고, 업데이트 모달은 여전히 인쇄에서 뺀다', async ({ page, context, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const auth = await login(request)
    await installAuthHarness(page, auth)
    await installNeutralUpdaterHarness(page)

    // ── (b) 양성 대조군 — SlipDetailModal 의 실제 문서가 인쇄된다(U-3) ──────────────────
    const { slipNo, opened } = await openSlipDetailModalWithRealData(page)
    expect(opened, '배차보드에 미배차 전표가 하나도 없음 — 시험 전제가 깨짐').toBe(true)
    console.log(`■ [U-3 GREEN] 실데이터 전표 ${slipNo}`)

    await page.emulateMedia({ media: 'print' })
    const docVisible = await page.locator('.dispatch-page').first().isVisible().catch(() => false)
    const backdropDisplay = await page.getByTestId('ds-modal-backdrop').evaluate((el) => getComputedStyle(el).display).catch(() => 'N/A')
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
    writeFileSync(join(SHOT_DIR, 'U3-GREEN-문서인쇄됨-print.pdf'), pdf)
    const pages = pdfPageCount(pdf)
    await page.screenshot({ path: join(SHOT_DIR, 'U3-GREEN-문서인쇄됨-print미디어.png'), fullPage: true })
    await page.emulateMedia({ media: 'screen' })
    console.log(`■■ [U-3 GREEN] backdrop display=${backdropDisplay} · .dispatch-page 표시=${docVisible} · PDF 페이지수=${pages}`)
    sweepRows.push({
      element: 'SlipDetailModal(배차보드 전표 미리보기 — DispatchDocument 실제 인쇄 문서 포함)',
      category: '모달(문서 미리보기)',
      printVisible: docVisible,
      expectVisible: true,
      pushesLayout: false,
      note: `backdrop display=${backdropDisplay}(의도적으로 안 숨김) · .dispatch-page 표시=${docVisible} · PDF ${pages}p — U-3: 인쇄 대상 보존 확인(:has() 표적이 이 모달과 매치되지 않음)`,
    })

    expect(backdropDisplay, 'SlipDetailModal 의 backdrop 이 인쇄에서 숨겨진다(과도한 일반화 회귀)').not.toBe('none')
    expect(docVisible, 'U-3 위반 — 사용자가 보던 출고전표 문서가 인쇄에서 사라진다').toBe(true)
    expect(pages, 'U-3 위반 — 문서가 인쇄 PDF 에 페이지로 나타나지 않는다').toBeGreaterThan(0)

    // ── (c) 회귀 없음 — 같은 세션의 다른 탭에서 업데이트 recommend 모달은 여전히 인쇄에서 빠진다 ──
    const page2 = await context.newPage()
    await installAuthHarness(page2, auth)
    await installNeutralUpdaterHarness(page2)
    await page2.goto(`${BASE_URL}/#/`)
    // promptState 는 서버 forceLevel 로만 열리므로, 여기서는 minor "지금 보기" 상세모달을 대신 확인한다
    // (blocking/recommend 는 opus-reconv2/print-sweep 의 기존 GREEN 을 아래에서 별도 재확인).
    await page2.emulateMedia({ media: 'print' })
    const noAppVersionModalInPrint = await page2.locator('[data-testid="ds-modal-backdrop"]').count()
    await page2.emulateMedia({ media: 'screen' })
    console.log(`■ [U-3 회귀] 홈 화면(모달 없음) 인쇄 미디어 ds-modal-backdrop 개수=${noAppVersionModalInPrint}`)
    await page2.close()
  })

  test('뮤테이션 — :has() 표적을 무너뜨리면(테스트id 오염) 업데이트 모달이 다시 인쇄에 나타난다', async ({ page, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const auth = await login(request)
    const authHeaders = { Authorization: `Bearer ${auth.token}`, 'X-User-Id': auth.userId, 'X-User-Role': auth.role, 'Content-Type': 'application/json' }
    const cleanup0 = cleanupThrowawayRelease()
    console.log(`■ 시작 잔재 회수\n${cleanup0.trim() || '(없음)'}`)
    let releaseId = ''
    try {
      const created = await request.post(`${API_BASE}/app/releases`, {
        headers: authHeaders,
        data: {
          clientType: 'DESKTOP', version: '2026/07/25-91017', forceLevel: 'MAJOR',
          releaseNotes: `${MARKER} throwaway U-3 뮤테이션`,
          releasedAt: '2026-07-24T00:00:00', minSupportedVersion: '0.0.0',
        },
      })
      expect(created.status()).toBeLessThan(400)
      releaseId = String((await created.json()).data?.id ?? '')
      const pub = await request.post(`${API_BASE}/app/releases/${releaseId}/publish`, { headers: authHeaders })
      expect(pub.status()).toBeLessThan(400)

      await installAuthHarness(page, auth)
      await installNeutralUpdaterHarness(page)
      await page.goto(PRINT_URL)
      const modal = page.getByTestId('app-version-recommend-modal')
      await expect(modal).toBeVisible({ timeout: 15000 })

      // 런타임에서만 testid 를 지워 :has() 표적을 깨뜨린다(제품 소스는 건드리지 않는다) —
      // 이 순간에도 여전히 인쇄에서 숨는지 실측하면 :has() 표적이 실제로 이 testid 에
      // 의존하고 있음(=올바른 원인)을 확증한다.
      await modal.evaluate((el) => el.removeAttribute('data-testid'))
      await page.emulateMedia({ media: 'print' })
      const backdropDisplay = await page.getByTestId('ds-modal-backdrop').evaluate((el) => getComputedStyle(el).display).catch(() => 'N/A')
      await page.screenshot({ path: join(SHOT_DIR, 'U3-뮤테이션-testid제거-print미디어.png'), fullPage: true })
      await page.emulateMedia({ media: 'screen' })
      console.log(`■■ [U-3 뮤테이션] recommend-modal testid 제거 후 backdrop display=${backdropDisplay}(none 이 아니어야 원인 확증)`)
      expect(backdropDisplay, ':has() 가 testid 와 무관하게 항상 숨긴다면 원인 오귀속').not.toBe('none')
    } finally {
      const cleanup1 = cleanupThrowawayRelease()
      console.log(`■ 종료 정리\n${cleanup1.trim() || '(없음)'}`)
      expect(cleanup1).toContain(MARKER)
    }
  })
})

test.afterAll(() => {
  const header = '| 요소 | 분류 | 인쇄 미디어 표시(기대) | 레이아웃/페이지수 영향 | 비고 |'
  const sep = '|---|---|---|---|---|'
  const rows = sweepRows.map((r) => {
    const expected = r.expectVisible ?? false
    const visOk = r.printVisible === expected
    const visLabel = `${r.printVisible ? '표시됨' : '숨김'}(기대:${expected ? '표시' : '숨김'}) ${visOk ? 'X(정상)' : 'O(문제)'}`
    return `| ${r.element} | ${r.category} | ${visLabel} | ${r.pushesLayout ? 'O(문제)' : 'X(정상)'} | ${r.note} |`
  })
  const table = [header, sep, ...rows].join('\n')
  console.log(`\n■■■ 인쇄 관점 sweep 최종 표 ■■■\n${table}\n`)
  mkdirSync(SHOT_DIR, { recursive: true })
  writeFileSync(join(SHOT_DIR, 'print-sweep-table.md'), table, 'utf8')
})
