/**
 * PR #909 OPUS 재수렴 라운드 2 — 직전 fix(비차단 알림 `position: fixed` → `static` 앱 흐름 편입)가
 * "가리지 않는 대신 밀어내는" 부작용을 실제로 만들었는지 실서버·실렌더러로 재현한다.
 *
 * 실행:
 *   cd clients/desktop
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts --reporter=line \
 *     playwright/909-auto-update-real-qa/opus-reconv2-inflow-real-qa.spec.ts
 *
 * 전제: 렌더러 5200(vite dev, 이 워크트리) · 실서버 8080 · docker samhan-postgres.
 */
import { expect, test, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5200'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOT_DIR = resolveQaShotsDir(process.env['AUDIT_SHOT_DIR']
  ?? join(process.cwd(), '..', '..', 'docs', 'qa', '909-opus-reconv2-2026-07-24'))
/** 실서버 slip_db 실데이터 — OUTBOUND 2026/01/15-1, 라인 5행. */
const SLIP_ID = process.env['QA_SLIP_ID'] ?? '1d905732-3059-48b9-869d-456404e68249'
const RAW_ERROR = 'Cannot find channel latest at https://intranet.example/latest.yml x-secret-header'

type Auth = { token: string; userId: string; role: string; fullName: string }

async function login(request: import('@playwright/test').APIRequestContext): Promise<Auth> {
  const res = await request.post(`${API_BASE}/api/auth/login`, {
    data: { loginId: 'dev_master', password: PASSWORD },
  })
  expect(res.ok(), `실서버 로그인 실패 HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return {
    token: d.token ?? '',
    userId: d.userId ?? '',
    role: d.role ?? 'MASTER',
    fullName: d.displayName ?? '개발책임자',
  }
}

async function installAuthHarness(page: Page, auth: Auth) {
  await page.addInitScript((v) => {
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

/**
 * 테스트가 상태를 밀어 넣을 수 있는 updater 하네스.
 * mode='error'      — check() 가 원문 오류로 reject (기동 즉시 오류 배너)
 * mode='none'       — check() 가 not-available 로 즉시 정착 (배너 없음 = 양성 대조군)
 * mode='slow'       — checking → available → progressMs 간격으로 downloading 무한 (다운로드 상한 초과 경로)
 */
async function installUpdaterHarness(
  page: Page,
  opts: { mode: 'error' | 'none' | 'slow'; progressMs?: number; rawError?: string },
) {
  await page.addInitScript((o) => {
    type Status = { kind: string; message?: string; version?: string; percent?: number }
    const listeners = new Set<(s: Status) => void>()
    const emit = (s: Status) => { for (const l of listeners) l(s) }
    ;(window as unknown as { __qaEmit: (s: Status) => void }).__qaEmit = emit
    ;(window as unknown as { __qaInstallCalls: number }).__qaInstallCalls = 0
    Object.defineProperty(window, 'samhanUpdater', {
      configurable: true,
      value: {
        onStatus: (l: (s: Status) => void) => { listeners.add(l); return () => listeners.delete(l) },
        check: async () => {
          emit({ kind: 'checking' })
          await new Promise<void>((r) => window.setTimeout(r, 60))
          if (o.mode === 'none') { emit({ kind: 'not-available' }); return }
          if (o.mode === 'error') { throw new Error(o.rawError ?? 'boom') }
          emit({ kind: 'available', version: '9.9.9' })
          let pct = 3
          window.setInterval(() => {
            pct = Math.min(97, pct + 7)
            emit({ kind: 'downloading', percent: pct })
          }, o.progressMs ?? 6000)
        },
        install: async () => {
          ;(window as unknown as { __qaInstallCalls: number }).__qaInstallCalls += 1
        },
        quit: async () => undefined,
      },
    })
  }, opts)
}

/** PDF 바이너리의 페이지 수 — `/Type /Page`(≠ /Pages) 개수. */
function pdfPageCount(buf: Buffer): number {
  const text = buf.toString('latin1')
  const m = text.match(/\/Type\s*\/Page[^s]/g)
  return m ? m.length : 0
}

test.use({ viewport: { width: 1400, height: 900 } })

// ─────────────────────────────────────────────────────────────────────────────
test.describe('P-A 인쇄 출력', () => {
  test.setTimeout(180_000)

  test('업데이트 배너가 A4 인쇄 양식을 밀어내는가 (대조군=배너 없음 / 실험군=배너 있음)', async ({ page, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const auth = await login(request)

    const v = await request.get(`${API_BASE}/app/version?clientType=DESKTOP&currentVersion=0.1.0`, {
      headers: { Authorization: `Bearer ${auth.token}`, 'X-User-Id': auth.userId, 'X-User-Role': auth.role },
    })
    const lvl = v.ok() ? (await v.json()).data?.forceLevel : `NONE(HTTP ${v.status()})`
    console.log(`■ baseline forceLevel=${lvl}`)
    expect(lvl, 'baseline 이 CRITICAL — 비차단(in-flow) 경로 전제가 깨짐').not.toBe('CRITICAL')

    // ── 양성 대조군: 배너 없는 정상 인쇄 ─────────────────────────────────────
    await installAuthHarness(page, auth)
    await installUpdaterHarness(page, { mode: 'none' })
    await page.goto(`${BASE_URL}/#/sales/${SLIP_ID}/print/statement`)

    const paper = page.locator('.paper-a4-portrait')
    await expect(paper, '인쇄 양식이 렌더되지 않음 — 시험 전제가 깨짐').toBeVisible({ timeout: 30000 })
    await expect(page.getByTestId('app-auto-update-status'), '대조군인데 배너가 떠 있음').toHaveCount(0)

    const controlRect = await paper.boundingBox()
    console.log(`■ [대조군] paper box=${JSON.stringify(controlRect)}`)
    await page.emulateMedia({ media: 'print' })
    const controlPdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
    writeFileSync(join(SHOT_DIR, 'A-control-no-banner.pdf'), controlPdf)
    const controlPages = pdfPageCount(controlPdf)
    await page.screenshot({ path: join(SHOT_DIR, 'A1-대조군-배너없음-print미디어.png'), fullPage: true })
    await page.emulateMedia({ media: 'screen' })
    console.log(`■ [대조군] PDF 페이지수=${controlPages}`)

    // ── 실험군: 같은 전표, 업데이트 배너가 떠 있는 상태 ─────────────────────
    const page2 = await page.context().newPage()
    await page2.setViewportSize({ width: 1400, height: 900 })
    await installAuthHarness(page2, auth)
    await installUpdaterHarness(page2, { mode: 'error', rawError: RAW_ERROR })
    await page2.goto(`${BASE_URL}/#/sales/${SLIP_ID}/print/statement`)

    const paper2 = page2.locator('.paper-a4-portrait')
    await expect(paper2, '실험군 인쇄 양식이 렌더되지 않음').toBeVisible({ timeout: 30000 })
    const notice = page2.getByTestId('app-auto-update-status')
    await expect(notice, '실험군인데 배너가 안 뜸 — 시험 전제가 깨짐').toBeVisible({ timeout: 20000 })

    const noticeInfo = await notice.evaluate((el) => {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return {
        position: cs.position,
        hasNoPrintClass: el.classList.contains('no-print'),
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        parentTag: el.parentElement?.tagName ?? null,
        parentId: el.parentElement?.id ?? null,
        nextSiblingClass: (el.nextElementSibling as HTMLElement | null)?.className ?? null,
      }
    })
    console.log(`■ [실험군] 배너 정보 = ${JSON.stringify(noticeInfo)}`)

    const expRect = await paper2.boundingBox()
    console.log(`■ [실험군] paper box=${JSON.stringify(expRect)}`)

    await page2.emulateMedia({ media: 'print' })
    // 인쇄 미디어에서 배너가 실제로 살아 있는지(=출력에 찍히는지) 확증
    const printVisible = await notice.evaluate((el) => {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return { display: cs.display, visibility: cs.visibility, position: cs.position, h: r.height, y: r.y }
    })
    console.log(`■ [실험군] print 미디어에서 배너 = ${JSON.stringify(printVisible)}`)
    const paperPrintRect = await paper2.evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { y: r.y, h: r.height }
    })
    console.log(`■ [실험군] print 미디어 paper y=${paperPrintRect.y} h=${paperPrintRect.h}`)

    const expPdf = await page2.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
    writeFileSync(join(SHOT_DIR, 'A-experiment-with-banner.pdf'), expPdf)
    const expPages = pdfPageCount(expPdf)
    await page2.screenshot({ path: join(SHOT_DIR, 'A2-실험군-배너있음-print미디어.png'), fullPage: true })
    await page2.emulateMedia({ media: 'screen' })
    await page2.screenshot({ path: join(SHOT_DIR, 'A3-실험군-배너있음-화면.png'), fullPage: true })
    console.log(`■ [실험군] PDF 페이지수=${expPages}`)

    console.log(`■■ 결론: 대조군 ${controlPages}p / 실험군 ${expPages}p · paper y ${controlRect?.y} → ${expRect?.y}`)

    // 단언 — U-1: 화면용 알림은 인쇄 미디어에서 완전히 사라진다(no-print, #909 SONNET5 R2 fix).
    // 단언 — U-2: 알림의 유무가 인쇄 페이지 수를 바꾸지 않는다.
    expect(printVisible.display, 'U-1 위반 — 배너가 인쇄 미디어에서 숨겨지지 않는다(no-print 미부여)').toBe('none')
    expect(expPages, `U-2 위반 — 업데이트 배너 때문에 A4 1장 양식이 ${expPages}장으로 늘어남(대조군 ${controlPages}장)`).toBe(controlPages)
  })

  test('뮤테이션 확증 — no-print 클래스를 DOM 에서 제거하면 다시 2장으로 밀린다', async ({ page, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const auth = await login(request)
    await installAuthHarness(page, auth)
    await installUpdaterHarness(page, { mode: 'error', rawError: RAW_ERROR })
    await page.goto(`${BASE_URL}/#/sales/${SLIP_ID}/print/statement`)

    const paper = page.locator('.paper-a4-portrait')
    await expect(paper).toBeVisible({ timeout: 30000 })
    const notice = page.getByTestId('app-auto-update-status')
    await expect(notice).toBeVisible({ timeout: 20000 })

    await page.emulateMedia({ media: 'print' })
    const beforePdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
    const before = pdfPageCount(beforePdf)
    const paperYBefore = await paper.evaluate((el) => el.getBoundingClientRect().y)

    // #909 SONNET5 R2 fix(`className="no-print"`)를 DOM 에서만 되돌려 이 클래스 자체가
    // 원인임을 확증한다 — 제품 소스는 건드리지 않는다(소스 레벨 뮤테이션은 터미널에서 별도 재현).
    await notice.evaluate((el) => {
      el.classList.remove('no-print')
    })
    await page.waitForTimeout(300)
    const paperYAfter = await paper.evaluate((el) => el.getBoundingClientRect().y)
    const afterPdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } })
    writeFileSync(join(SHOT_DIR, 'A-mutation-remove-no-print.pdf'), afterPdf)
    const after = pdfPageCount(afterPdf)
    await page.screenshot({ path: join(SHOT_DIR, 'A4-뮤테이션-no-print제거-print미디어.png'), fullPage: true })
    await page.emulateMedia({ media: 'screen' })

    console.log(`■■ 뮤테이션 대조: no-print 있음 ${before}p (paper y=${paperYBefore}) → no-print 제거 ${after}p (paper y=${paperYAfter})`)
    expect(before, 'no-print 클래스가 있는 현재 코드에서는 1장이어야 이 대조가 성립').toBe(1)
    expect(after, 'no-print 를 제거하면 다시 2장으로 밀려야 원인이 이 클래스임이 확증된다').toBe(2)
  })

  test('계열 전수 — 다른 인쇄 양식도 같은 방식으로 밀린다', async ({ page, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const auth = await login(request)
    const routes: Array<{ label: string; path: string; sel: string }> = [
      { label: '출고전표-작업지시서', path: `/sales/${SLIP_ID}/print/dispatch`, sel: '.dispatch-page' },
      { label: '세금계산서', path: `/sales/${SLIP_ID}/print/invoice`, sel: '.paper' },
    ]
    const summary: string[] = []
    for (const r of routes) {
      // 대조군
      const c = await page.context().newPage()
      await c.setViewportSize({ width: 1400, height: 900 })
      await installAuthHarness(c, auth)
      await installUpdaterHarness(c, { mode: 'none' })
      await c.goto(`${BASE_URL}/#${r.path}`)
      const okC = await c.locator(r.sel).first().waitFor({ state: 'visible', timeout: 25000 }).then(() => true).catch(() => false)
      if (!okC) { console.log(`■ [${r.label}] 대조군 렌더 실패 — 건너뜀`); await c.close(); continue }
      await c.emulateMedia({ media: 'print' })
      const cp = pdfPageCount(await c.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } }))
      await c.close()

      // 실험군
      const e = await page.context().newPage()
      await e.setViewportSize({ width: 1400, height: 900 })
      await installAuthHarness(e, auth)
      await installUpdaterHarness(e, { mode: 'error', rawError: RAW_ERROR })
      await e.goto(`${BASE_URL}/#${r.path}`)
      await e.locator(r.sel).first().waitFor({ state: 'visible', timeout: 25000 })
      await e.getByTestId('app-auto-update-status').waitFor({ state: 'visible', timeout: 20000 })
      await e.emulateMedia({ media: 'print' })
      const ep = pdfPageCount(await e.pdf({ format: 'A4', printBackground: true, margin: { top: '0', bottom: '0', left: '0', right: '0' } }))
      await e.screenshot({ path: join(SHOT_DIR, `A5-${r.label}-배너있음-print미디어.png`), fullPage: true })
      await e.close()

      const line = `${r.label}: 대조군 ${cp}p → 실험군 ${ep}p`
      console.log(`■ ${line}`)
      summary.push(line)
    }
    console.log(`■■ 계열 요약\n   ${summary.join('\n   ')}`)
    expect(summary.every((s) => {
      const m = s.match(/대조군 (\d+)p → 실험군 (\d+)p/)
      return m ? m[1] === m[2] : true
    }), `인쇄 양식 페이지 수가 배너 때문에 늘어남: ${summary.join(' / ')}`).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
test.describe('P-B 다운로드 상한 초과 이후', () => {
  test.setTimeout(330_000)

  test('닫기가 다음 진행률 틱에 무효화되고 앱이 계속 밀린다', async ({ page, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const auth = await login(request)
    await installAuthHarness(page, auth)
    await installUpdaterHarness(page, { mode: 'slow', progressMs: 6000 })

    // 알림 DOM 의 모든 변화를 시각(ms) 과 함께 기록한다 — "닫기가 몇 초 동안 존재했는가" 실측용.
    await page.addInitScript(() => {
      const log: Array<{ t: number; text: string; dismiss: boolean }> = []
      ;(window as unknown as { __noticeLog: typeof log }).__noticeLog = log
      const t0 = Date.now()
      const snap = () => {
        const el = document.querySelector('[data-testid="app-auto-update-status"]') as HTMLElement | null
        const text = el ? (el.innerText || '').replace(/\s+/g, ' ').trim() : '(없음)'
        const dismiss = !!document.querySelector('[data-testid="app-auto-update-dismiss"]')
        const last = log[log.length - 1]
        if (!last || last.text !== text || last.dismiss !== dismiss) {
          log.push({ t: Date.now() - t0, text, dismiss })
        }
      }
      const start = () => {
        new MutationObserver(snap).observe(document.body, { childList: true, subtree: true, characterData: true })
        window.setInterval(snap, 50)
      }
      if (document.body) start()
      else document.addEventListener('DOMContentLoaded', start)
    })

    await page.goto(`${BASE_URL}/#/notifications`)
    await expect(page.getByTestId('app-update-startup-splash'), '기동 스플래시가 안 뜸').toBeVisible({ timeout: 20000 })
    await page.screenshot({ path: join(SHOT_DIR, 'B1-다운로드중-스플래시.png') })

    // 180초 다운로드 상한 → 로그인/앱 진입 허용
    const notice = page.getByTestId('app-auto-update-status')
    await expect(page.getByTestId('sidebar-notifications'), '180초 상한 후에도 앱이 열리지 않음').toBeVisible({ timeout: 240_000 })
    await expect(notice, '앱 진입 후 배너가 없음').toBeVisible({ timeout: 10_000 })
    await page.screenshot({ path: join(SHOT_DIR, 'B2-상한초과-앱진입.png'), fullPage: true })

    const afterEntry = await page.evaluate(() => ({
      text: (document.querySelector('[data-testid="app-auto-update-status"]') as HTMLElement)?.innerText.replace(/\s+/g, ' ').trim(),
      dismissCount: document.querySelectorAll('[data-testid="app-auto-update-dismiss"]').length,
      shellY: (document.querySelector('.app-shell') as HTMLElement).getBoundingClientRect().y,
      docH: document.scrollingElement!.scrollHeight,
      viewH: window.innerHeight,
    }))
    console.log(`■ 앱 진입 직후 = ${JSON.stringify(afterEntry)}`)

    // 25초 동안 사용자는 아무 것도 안 한다 — 배너가 사라지는가? 닫을 수단이 생기는가?
    await page.waitForTimeout(25_000)
    const after25 = await page.evaluate(() => ({
      count: document.querySelectorAll('[data-testid="app-auto-update-status"]').length,
      text: (document.querySelector('[data-testid="app-auto-update-status"]') as HTMLElement)?.innerText.replace(/\s+/g, ' ').trim(),
      dismissCount: document.querySelectorAll('[data-testid="app-auto-update-dismiss"]').length,
      shellY: (document.querySelector('.app-shell') as HTMLElement).getBoundingClientRect().y,
    }))
    console.log(`■ 25초 무조작 후 = ${JSON.stringify(after25)}`)
    await page.screenshot({ path: join(SHOT_DIR, 'B3-25초무조작-여전히-닫을수단없음.png'), fullPage: true })

    // 라우트를 옮겨도 유지되는가
    await page.locator('nav a[href="#/"]').first().click()
    await page.waitForTimeout(1500)
    const afterNav = await page.evaluate(() => ({
      url: location.hash,
      count: document.querySelectorAll('[data-testid="app-auto-update-status"]').length,
      shellY: (document.querySelector('.app-shell') as HTMLElement).getBoundingClientRect().y,
    }))
    console.log(`■ 홈 이동 후 = ${JSON.stringify(afterNav)}`)
    await page.screenshot({ path: join(SHOT_DIR, 'B4-홈이동후-배너유지.png'), fullPage: true })

    // 닫기가 존재했던 구간 실측
    const log = await page.evaluate(() => (window as unknown as { __noticeLog: Array<{ t: number; text: string; dismiss: boolean }> }).__noticeLog)
    const dismissWindows = log.filter((e) => e.dismiss)
    console.log('■ 알림 상태 타임라인(ms, 텍스트, 닫기존재):')
    for (const e of log) console.log(`   ${e.t}ms | dismiss=${e.dismiss} | ${e.text}`)
    let dismissLifeMs = 0
    for (let i = 0; i < log.length; i += 1) {
      if (!log[i]!.dismiss) continue
      const end = log[i + 1]?.t ?? log[log.length - 1]!.t
      dismissLifeMs += end - log[i]!.t
    }
    console.log(`■ "닫기" 버튼이 DOM 에 존재했던 총 시간 = ${dismissLifeMs}ms (구간 ${dismissWindows.length}개)`)

    expect(after25.count, '다운로드 상한 초과 후 배너가 스스로 사라지지 않는다').toBe(0)
    expect(after25.dismissCount, '남아있는 배너에 닫을 수단이 없다').toBeGreaterThan(0)
    expect(after25.shellY, '앱 셸이 계속 아래로 밀린 채 유지된다').toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
test.describe('P-C 세로 공간 압박', () => {
  test.setTimeout(180_000)

  test('배너가 뜬 상태에서 화면 하단 요소가 뷰포트 밖으로 밀리는가', async ({ page, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const auth = await login(request)

    // 대조군 — 배너 없음
    await installAuthHarness(page, auth)
    await installUpdaterHarness(page, { mode: 'none' })
    await page.goto(`${BASE_URL}/#/admin/permission-matrix`)
    await expect(page.getByTestId('sidebar-notifications')).toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(3000)
    const control = await page.evaluate(() => {
      const table = document.querySelector('[data-testid="permission-matrix-table"]') as HTMLElement | null
      const r = table?.getBoundingClientRect()
      return {
        docH: document.scrollingElement!.scrollHeight,
        viewH: window.innerHeight,
        tableBottom: r ? r.bottom : null,
        tableTop: r ? r.y : null,
        shellY: (document.querySelector('.app-shell') as HTMLElement | null)?.getBoundingClientRect().y ?? null,
      }
    })
    console.log(`■ [대조군] ${JSON.stringify(control)}`)
    await page.screenshot({ path: join(SHOT_DIR, 'C1-대조군-권한매트릭스.png') })

    // 실험군 — 오류 배너
    const page2 = await page.context().newPage()
    await page2.setViewportSize({ width: 1400, height: 900 })
    await installAuthHarness(page2, auth)
    await installUpdaterHarness(page2, { mode: 'error', rawError: RAW_ERROR })
    await page2.goto(`${BASE_URL}/#/admin/permission-matrix`)
    await expect(page2.getByTestId('app-auto-update-status')).toBeVisible({ timeout: 20000 })
    await page2.waitForTimeout(3000)
    const exp = await page2.evaluate(() => {
      const table = document.querySelector('[data-testid="permission-matrix-table"]') as HTMLElement | null
      const r = table?.getBoundingClientRect()
      const n = document.querySelector('[data-testid="app-auto-update-status"]') as HTMLElement | null
      const nr = n?.getBoundingClientRect()
      return {
        docH: document.scrollingElement!.scrollHeight,
        viewH: window.innerHeight,
        tableBottom: r ? r.bottom : null,
        tableTop: r ? r.y : null,
        shellY: (document.querySelector('.app-shell') as HTMLElement | null)?.getBoundingClientRect().y ?? null,
        bannerH: nr ? nr.height : null,
        bannerMB: n ? getComputedStyle(n).marginBlockEnd : null,
      }
    })
    console.log(`■ [실험군] ${JSON.stringify(exp)}`)
    await page2.screenshot({ path: join(SHOT_DIR, 'C2-실험군-권한매트릭스-배너.png') })

    // 좁은 창(800px) — 문구가 감기면 밀림이 커진다
    await page2.setViewportSize({ width: 800, height: 700 })
    await page2.waitForTimeout(1500)
    const narrow = await page2.evaluate(() => {
      const n = document.querySelector('[data-testid="app-auto-update-status"]') as HTMLElement | null
      const nr = n?.getBoundingClientRect()
      const table = document.querySelector('[data-testid="permission-matrix-table"]') as HTMLElement | null
      const r = table?.getBoundingClientRect()
      return {
        bannerH: nr ? nr.height : null,
        bannerRight: nr ? nr.right : null,
        scrollW: document.scrollingElement!.scrollWidth,
        viewH: window.innerHeight,
        tableBottom: r ? r.bottom : null,
        docH: document.scrollingElement!.scrollHeight,
      }
    })
    console.log(`■ [실험군 800px] ${JSON.stringify(narrow)}`)
    await page2.screenshot({ path: join(SHOT_DIR, 'C3-실험군-800px-배너.png') })

    // #909 SONNET5 라운드2 — stale 단언 정정(PM 지시).
    // 이전: expect(exp.shellY).toBe(control.shellY) — "안 밀린다" 를 요구했으나, in-flow(static)
    // 배너가 화면에서 앱 셸을 배너 높이만큼 미는 것은 OPUS 재수렴 라운드가 "화면상 62px 밀림 —
    // 스크롤로 도달 가능" 이라며 **도달 불가로 판정해 수용한 설계**다(2026-07-24 커밋
    // 5348c2ba0 진단 기록). fixed 로 되돌리면 R-2(다른 토스트 가림, 겹침면적 0)가 재발한다 —
    // 즉 "밀린다"가 정상 동작이고, "안 밀린다"고 단언하는 쪽이 틀렸다. 수용된 설계를 문서화하도록
    // "배너 높이(+margin)만큼만 밀린다"로 정정한다 — 0 이 되거나 배너 높이와 무관하게 더 밀리면
    // 회귀로 잡는다.
    const bannerMarginPx = exp.bannerMB ? parseFloat(exp.bannerMB) : 0
    const expectedShellY = (control.shellY ?? 0) + (exp.bannerH ?? 0) + bannerMarginPx
    console.log(`■ [수용된 설계 확인] control.shellY=${control.shellY} + bannerH=${exp.bannerH} + bannerMB=${bannerMarginPx} = ${expectedShellY} (실측 exp.shellY=${exp.shellY})`)
    expect(
      exp.shellY,
      `배너가 뜨면 앱 셸이 정확히 배너 높이(+margin)만큼만 밀려야 한다(수용된 설계) — 기대 ${expectedShellY}, 실측 ${exp.shellY}`,
    ).toBe(expectedShellY)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
test.describe('P-D 직전 라운드 지적 재확인 + 레이아웃 튐', () => {
  test.setTimeout(180_000)

  test('R-1 닫기 후 후속 상태 재등장 · R-2 다른 알림과 충돌 · 배너 소멸 시 좌표 이동', async ({ page, request }) => {
    mkdirSync(SHOT_DIR, { recursive: true })
    const auth = await login(request)
    await installAuthHarness(page, auth)
    await installUpdaterHarness(page, { mode: 'error', rawError: RAW_ERROR })

    // 권한그룹 생성만 500 으로 되돌린다 — 실 DB 에 아무 것도 쓰지 않는다.
    await page.route('**/admin/permission-groups', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 500, contentType: 'application/json', body: '{"success":false}' })
        return
      }
      await route.continue()
    })

    await page.goto(`${BASE_URL}/#/`)
    const hrToggle = page.getByTestId('sidebar-category-toggle-인사')
    await expect(hrToggle, '인사 메뉴가 렌더되지 않음 — 권한 로딩 전제 실패').toBeVisible({ timeout: 20000 })
    await hrToggle.click()
    const groupManageLink = page.getByTestId('sidebar-hr-permission-groups-manage')
    await expect(groupManageLink, '권한그룹 관리 메뉴가 렌더되지 않음 — 실 권한 전제 실패').toBeVisible({ timeout: 20000 })
    await groupManageLink.click()
    await expect(page).toHaveURL(/permission-groups\/manage/, { timeout: 10000 })
    const notice = page.getByTestId('app-auto-update-status')
    await expect(notice).toBeVisible({ timeout: 20000 })
    await expect(page.getByTestId('perm-group-add-btn')).toBeVisible({ timeout: 20000 })

    // ── R-2: 실제 권한 토스트를 실제 조작으로 띄우고 겹침을 잰다 ───────────────
    await page.getByTestId('perm-group-add-btn').click()
    await page.getByTestId('perm-group-form-name').fill(`OPUS-RECONV2-${Date.now()}`)
    await page.getByTestId('perm-group-form-submit').click()
    const toast = page.locator('[role="alert"]').filter({ hasText: '오류가 발생했습니다' }).first()
    await expect(toast, '권한 토스트가 안 뜸 — R-2 시험 전제가 깨짐').toBeVisible({ timeout: 15000 })

    const boxes = await page.evaluate(() => {
      const n = document.querySelector('[data-testid="app-auto-update-status"]') as HTMLElement | null
      const alerts = Array.from(document.querySelectorAll('[role="alert"]')) as HTMLElement[]
      const t = alerts.find((a) => a.innerText.includes('오류가 발생했습니다')) ?? null
      const r = (el: HTMLElement | null) => (el ? (({ x, y, width, height }) => ({ x, y, width, height }))(el.getBoundingClientRect()) : null)
      return { notice: r(n), toast: r(t), noticePos: n ? getComputedStyle(n).position : null, toastPos: t ? getComputedStyle(t).position : null }
    })
    const ov = (() => {
      const a = boxes.notice, b = boxes.toast
      if (!a || !b) return null
      const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
      const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
      return w * h
    })()
    console.log(`■ R-2 업데이트배너=${JSON.stringify(boxes.notice)}(${boxes.noticePos}) 권한토스트=${JSON.stringify(boxes.toast)}(${boxes.toastPos}) 겹침면적=${ov}`)
    await page.screenshot({ path: join(SHOT_DIR, 'D1-R2-업데이트배너-권한토스트-동시.png'), fullPage: true })

    // ── 모달이 열려 있는 동안 배너가 조작 가능한가 (직전 fix 가 zIndex 10000 을 제거했다) ──
    const zprobe = await page.evaluate(() => {
      const n = document.querySelector('[data-testid="app-auto-update-status"]') as HTMLElement | null
      const b = document.querySelector('[data-testid="ds-modal-backdrop"]') as HTMLElement | null
      const d = document.querySelector('[data-testid="app-auto-update-dismiss"]') as HTMLElement | null
      const r = d?.getBoundingClientRect()
      const top = r ? (document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) as HTMLElement | null) : null
      return {
        modalOpen: !!b,
        noticeZ: n ? getComputedStyle(n).zIndex : null,
        backdropZ: b ? getComputedStyle(b).zIndex : null,
        topAtDismiss: top ? `${top.tagName}.${top.className}`.slice(0, 60) : null,
      }
    })
    console.log(`■ 모달 열림 중 z-order = ${JSON.stringify(zprobe)}`)
    await page.screenshot({ path: join(SHOT_DIR, 'D1b-모달열림중-배너-덮임.png'), fullPage: true })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)

    // ── R-1: 닫은 뒤 후속 상태가 다시 보이는가 ────────────────────────────────
    await page.getByTestId('app-auto-update-dismiss').click()
    await expect(notice, '닫기가 안 먹음').toHaveCount(0)
    const shellDismissed = await page.locator('.app-shell').evaluate((el) => el.getBoundingClientRect().y)
    await page.screenshot({ path: join(SHOT_DIR, 'D2-R1-닫힘.png'), fullPage: true })

    await page.evaluate(() => (window as unknown as { __qaEmit: (s: unknown) => void }).__qaEmit({ kind: 'downloading', percent: 42 }))
    await expect(notice, 'P-3 위반 — error→downloading 상태 경계에서 알림이 재등장하지 않음').toBeVisible({ timeout: 5000 })
    await page.getByTestId('app-auto-update-dismiss').click()
    await expect(notice).toHaveCount(0)

    await page.evaluate(() => (window as unknown as { __qaEmit: (s: unknown) => void }).__qaEmit({ kind: 'downloading', percent: 73 }))
    await expect(notice, 'P-2 위반 — 같은 downloading 세션의 진행률 갱신에서 닫힌 알림이 되살아남').toHaveCount(0, { timeout: 5000 })
    const shellSameKind = await page.locator('.app-shell').evaluate((el) => el.getBoundingClientRect().y)
    console.log(`■ P-2 동일 kind 진행률 갱신 후 알림 없음 · shell.y ${shellDismissed} → ${shellSameKind}`)
    await page.screenshot({ path: join(SHOT_DIR, 'D3-P2-동일kind-진행률-닫힘.png'), fullPage: true })

    await page.evaluate(() => (window as unknown as { __qaEmit: (s: unknown) => void }).__qaEmit({ kind: 'error' }))
    await expect(notice, 'P-3 위반 — downloading→error 새 이벤트인데 닫힌 알림이 재등장하지 않음').toBeVisible({ timeout: 5000 })
    const afterText = (await notice.innerText()).replace(/\s+/g, ' ').trim()
    const shellBack = await page.locator('.app-shell').evaluate((el) => el.getBoundingClientRect().y)
    console.log(`■ P-3 kind 변경 후 알림 재등장 text="${afterText}" · shell.y ${shellSameKind} → ${shellBack}`)
    await page.screenshot({ path: join(SHOT_DIR, 'D3-P3-kind변경-오류-재등장.png'), fullPage: true })

    // ── 배너 소멸/재등장이 클릭 대상 좌표를 얼마나 움직이는가 ─────────────────
    const probeY = 500
    const before = await page.evaluate((y) => {
      const el = document.elementFromPoint(700, y) as HTMLElement | null
      return { tag: el?.tagName ?? null, text: (el?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 40) }
    }, probeY)
    await page.evaluate(() => (window as unknown as { __qaEmit: (s: unknown) => void }).__qaEmit({ kind: 'not-available' }))
    await expect(notice, 'not-available 인데 배너가 안 사라짐').toHaveCount(0, { timeout: 5000 })
    const shellGone = await page.locator('.app-shell').evaluate((el) => el.getBoundingClientRect().y)
    const after = await page.evaluate((y) => {
      const el = document.elementFromPoint(700, y) as HTMLElement | null
      return { tag: el?.tagName ?? null, text: (el?.innerText ?? '').replace(/\s+/g, ' ').slice(0, 40) }
    }, probeY)
    console.log(`■ 배너 소멸 시 shell.y ${shellBack} → ${shellGone} · (700,${probeY}) 요소 "${before.text}"(${before.tag}) → "${after.text}"(${after.tag})`)
    await page.screenshot({ path: join(SHOT_DIR, 'D4-배너소멸-레이아웃-튐.png'), fullPage: true })

    // ── 좁은 창에서 문구가 감기는가 ──────────────────────────────────────────
    await page.evaluate(() => (window as unknown as { __qaEmit: (s: unknown) => void }).__qaEmit({ kind: 'downloaded', version: '9.9.9' }))
    await expect(notice).toBeVisible({ timeout: 5000 })
    for (const w of [1400, 1000, 800, 640]) {
      await page.setViewportSize({ width: w, height: 800 })
      await page.waitForTimeout(600)
      const m = await page.evaluate(() => {
        const n = document.querySelector('[data-testid="app-auto-update-status"]') as HTMLElement
        const r = n.getBoundingClientRect()
        return {
          h: Math.round(r.height * 10) / 10,
          right: Math.round(r.right * 10) / 10,
          shellY: Math.round((document.querySelector('.app-shell') as HTMLElement).getBoundingClientRect().y * 10) / 10,
          scrollW: document.scrollingElement!.scrollWidth,
          text: n.innerText.replace(/\s+/g, ' ').trim(),
        }
      })
      console.log(`■ ${w}px → 배너높이 ${m.h} · right ${m.right} · scrollW ${m.scrollW} · shell.y ${m.shellY} · "${m.text}"`)
      await page.screenshot({ path: join(SHOT_DIR, `D5-${w}px-배너.png`) })
    }

    expect(ov, 'R-2 미해소 — 업데이트 배너와 권한 토스트가 겹친다').toBe(0)
  })
})
