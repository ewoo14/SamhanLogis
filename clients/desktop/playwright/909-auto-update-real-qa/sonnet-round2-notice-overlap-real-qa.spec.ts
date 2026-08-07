import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * PR #909 SONNET5 라운드 fix — OPUS 재수렴 도달가능 1건 재현+검증.
 *
 * 결함: `AppVersionGate` 의 오류 상태 `statusNotice` 가 좌상단(insetInlineStart/insetBlockStart
 * 16,16, zIndex 10000)에 고정되어 있고, 오류 문구(`업데이트 실패: ...`)가 maxWidth 520 에서
 * 2줄(≈70px)로 감기면 사이드바 "홈" NavLink(y 64~101)·페이지 제목(`header-page-title`)과
 * 겹친다. 패키징 앱은 주소창이 없어 "홈" 이 유일한 상시 복귀 경로다(P-1).
 * 또한 오류 상태는 "다시 확인" 버튼만 있고 닫을 수단이 없어 세션 내내 강제로 남는다(P-2).
 *
 * 이 스펙은 실제 로그인 토큰 + 실제 렌더러(5200)를 사용하고, `window.samhanUpdater` 만
 * Electron IPC 가 없는 브라우저 환경을 위해 주입한다(luna-round-real-qa.spec.ts 와 동일 관례).
 */
import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5200'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const MARKER = 'LUNA909R6'
const SHOT_DIR = resolveQaShotsDir(process.env['AUDIT_SHOT_DIR'] ?? join(process.cwd(), '..', '..', 'docs', 'qa', '909-sonnet-round-2026-07-23'))
const RAW_ERROR = 'Cannot find channel latest at https://intranet.example/latest.yml x-secret-header'

type Rect = { x: number; y: number; width: number; height: number }

function rectOverlap(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return false
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function cleanupThrowaway(): string {
  const sql = [
    `UPDATE app_release SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = '${MARKER}' WHERE release_notes LIKE '${MARKER}%';`,
    `SELECT client_type, version, is_deleted, deleted_by FROM app_release WHERE release_notes LIKE '${MARKER}%' ORDER BY version;`,
  ].join(' ')
  return execFileSync('docker', [
    'exec', 'samhan-postgres', 'psql', '-U', 'samhan', '-d', 'dashboard_db', '-tAc', sql,
  ], { encoding: 'utf8' })
}

async function installAuthHarness(
  page: import('@playwright/test').Page,
  v: { token: string; userId: string; role: string; fullName: string },
) {
  await page.addInitScript((auth) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ ...auth, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, v)
}

/** check() 가 항상 원문 오류로 reject 하는 최소 updater 하네스 — B5(원문 비노출) 회귀도 겸사겸사 확인한다. */
async function installErrorUpdaterHarness(page: import('@playwright/test').Page) {
  await page.addInitScript((rawError) => {
    type Status = { kind: string; message?: string }
    const listeners = new Set<(status: Status) => void>()
    Object.defineProperty(window, 'samhanUpdater', {
      configurable: true,
      value: {
        onStatus: (listener: (status: Status) => void) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        check: async () => {
          for (const l of listeners) l({ kind: 'checking' })
          await new Promise<void>((resolve) => window.setTimeout(resolve, 80))
          throw new Error(rawError)
        },
        install: async () => undefined,
        quit: async () => undefined,
      },
    })
  }, RAW_ERROR)
}

test.setTimeout(120_000)
test.use({ viewport: { width: 1400, height: 900 } })

test('P-1/P-2/P-3 — 오류 배너가 홈 클릭·페이지 제목을 막지 않고 닫을 수 있다', async ({ page, request }) => {
  mkdirSync(SHOT_DIR, { recursive: true })

  const login = await request.post(`${API_BASE}/api/auth/login`, { data: { loginId: 'dev_master', password: PASSWORD } })
  expect(login.ok(), `실서버 로그인 실패: HTTP ${login.status()}`).toBeTruthy()
  const d = (await login.json()).data ?? {}
  const auth = { Authorization: `Bearer ${d.token}`, 'X-User-Id': d.userId, 'X-User-Role': d.role ?? 'MASTER' }

  // 사전 확인 — baseline 이 이미 CRITICAL 이면(다른 트랙 잔재) 이 시험의 전제(children 렌더)가 깨진다.
  const baseline = await request.get(`${API_BASE}/app/version?clientType=DESKTOP&currentVersion=0.1.0`, { headers: auth })
  const baselineLevel = baseline.ok() ? (await baseline.json()).data?.forceLevel : `NONE(HTTP ${baseline.status()})`
  console.log(`■ baseline forceLevel=${baselineLevel}`)
  expect(baselineLevel, 'baseline 이 이미 CRITICAL — 다른 트랙 잔재로 시험 전제가 깨짐').not.toBe('CRITICAL')

  await installAuthHarness(page, { token: d.token ?? '', userId: d.userId ?? '', role: d.role ?? 'MASTER', fullName: d.displayName ?? '개발책임자' })
  await installErrorUpdaterHarness(page)

  await page.goto(`${BASE_URL}/#/notifications`)
  await expect(page.getByTestId('sidebar-notifications'), '사이드바가 렌더되지 않음 — 시험 전제가 깨짐').toBeVisible({ timeout: 15000 })
  await expect(page.getByTestId('header-page-title'), '페이지 제목이 렌더되지 않음 — 시험 전제가 깨짐').toBeVisible()

  const notice = page.getByTestId('app-auto-update-status')
  await expect(notice, '오류 배너가 나타나지 않음 — 시험 전제가 깨짐').toBeVisible({ timeout: 10000 })
  await expect(notice).toContainText('업데이트 실패')
  await page.screenshot({ path: join(SHOT_DIR, '01-오류배너-표시.png'), fullPage: true })

  // ── F-1 회귀: 화면에 feed URL/원문이 노출되지 않는다 ──
  const bodyText = await page.locator('body').innerText()
  expect(bodyText, 'B5 위반 — latest.yml 노출').not.toContain('latest.yml')
  expect(bodyText, 'B5 위반 — intranet.example 노출').not.toContain('intranet.example')

  // ── P-1 ①: 페이지 제목과 배너가 겹치지 않는다 ──
  const titleBox = await page.getByTestId('header-page-title').boundingBox()
  const noticeBoxBefore = await notice.boundingBox()
  console.log(`■ 페이지 제목 box=${JSON.stringify(titleBox)} 배너 box=${JSON.stringify(noticeBoxBefore)}`)
  expect(rectOverlap(titleBox, noticeBoxBefore), '페이지 제목과 오류 배너가 겹친다(P-1)').toBe(false)

  // ── P-1 ②: 홈 링크 중심에서 elementsFromPoint 최상단이 배너가 아니다 + 실제 클릭이 통한다 ──
  const homeLink = page.getByRole('link', { name: '홈', exact: true })
  const hb = await homeLink.boundingBox()
  expect(hb, '홈 링크 bounding box 를 못 얻음 — 시험 전제가 깨짐').not.toBeNull()
  const cx = hb!.x + hb!.width / 2
  const cy = hb!.y + hb!.height / 2
  const hit = await page.evaluate(
    ({ x, y }) =>
      document.elementsFromPoint(x, y).map((e) => ({
        tag: e.tagName,
        testid: (e as HTMLElement).dataset ? (e as HTMLElement).dataset['testid'] ?? null : null,
      })),
    { x: cx, y: cy },
  )
  console.log(`■ 홈 링크 중심(${cx}, ${cy}) elementsFromPoint = ${JSON.stringify(hit)}`)
  expect(hit[0]?.testid, `홈 링크 위에 다른 요소가 최상단 — ${JSON.stringify(hit)}`).not.toBe('app-auto-update-status')

  await homeLink.click({ timeout: 5000 })
  const homeRoute = await page.evaluate(() => ({ pathname: location.pathname, hash: location.hash, href: location.href }))
  console.log(`■ 실제 클릭 후 URL = ${page.url()} · route=${JSON.stringify(homeRoute)}`)
  expect(homeRoute.pathname, '실제 클릭이 홈 route로 이동시키지 못함(P-1)').toBe('/')
  expect(homeRoute.hash, '홈 route가 /#/로 이동하지 못함(P-1)').toBe('#/')
  await page.screenshot({ path: join(SHOT_DIR, '02-홈클릭-성공.png'), fullPage: true })

  // ── P-2: 알림을 치울 수 있다 ──
  const dismissBtn = page.getByTestId('app-auto-update-dismiss')
  await expect(dismissBtn, '오류 배너에 닫기 수단이 없음(P-2)').toBeVisible({ timeout: 5000 })

  // ── P-3: 닫기 전에 실패 사실이 온전히 읽혔다(치우는 행위 자체가 조용한 자동소멸이 아니라
  //     사용자가 읽은 뒤의 명시적 조작이었음을 문구로 확증) ──
  const noticeTextBeforeDismiss = await notice.innerText()
  expect(noticeTextBeforeDismiss, '닫기 전 배너 문구가 실패를 알리지 않음(P-3)').toContain('업데이트 실패')

  await dismissBtn.click()
  await expect(notice, '닫기를 눌렀는데도 배너가 남아있음(P-2)').toHaveCount(0)
  await page.screenshot({ path: join(SHOT_DIR, '03-배너-닫힘.png'), fullPage: true })
})

test('F-3 회귀 울타리 — CRITICAL 차단 모달은 이 fix 이후에도 계속 앱을 덮는다', async ({ page, request }) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const cleanupAtStart = cleanupThrowaway()
  console.log(`■ 시작 잔재 회수 SQL 출력\n${cleanupAtStart.trim() || '(잔재 없음)'}`)

  const login = await request.post(`${API_BASE}/api/auth/login`, { data: { loginId: 'dev_master', password: PASSWORD } })
  expect(login.ok(), `실서버 로그인 실패: HTTP ${login.status()}`).toBeTruthy()
  const d = (await login.json()).data ?? {}
  const auth = { Authorization: `Bearer ${d.token}`, 'X-User-Id': d.userId, 'X-User-Role': d.role ?? 'MASTER' }
  const jsonAuth = { ...auth, 'Content-Type': 'application/json' }

  let releaseId = ''
  try {
    const body = {
      clientType: 'DESKTOP',
      version: '2026/07/25-91018',
      forceLevel: 'CRITICAL',
      releaseNotes: `${MARKER} throwaway 자동업데이트 실서버 검증용(F-3 회귀)`,
      releasedAt: '2026-07-23T00:00:00',
      minSupportedVersion: '0.1.0',
    }
    const created = await request.post(`${API_BASE}/app/releases`, { headers: jsonAuth, data: body })
    expect(created.status(), `throwaway 릴리스 등록 실패 HTTP ${created.status()}`).toBeLessThan(400)
    releaseId = String((await created.json()).data?.id ?? '')
    expect(releaseId).not.toBe('')
    const published = await request.post(`${API_BASE}/app/releases/${releaseId}/publish`, { headers: auth })
    expect(published.status(), `publish 실패 HTTP ${published.status()}`).toBeLessThan(400)

    const v = await request.get(`${API_BASE}/app/version?clientType=DESKTOP&currentVersion=0.1.0`, { headers: auth })
    const lvl = (await v.json()).data?.forceLevel
    console.log(`■ throwaway 등록 후 forceLevel=${lvl}`)
    expect(lvl, 'CRITICAL 이 반영되지 않아 이 시험이 성립하지 않는다').toBe('CRITICAL')

    await installAuthHarness(page, { token: d.token ?? '', userId: d.userId ?? '', role: d.role ?? 'MASTER', fullName: d.displayName ?? '개발책임자' })
    await installErrorUpdaterHarness(page)
    await page.goto(`${BASE_URL}/#/`)

    const modal = page.getByTestId('app-version-blocking-modal')
    await expect(modal, 'CRITICAL 인데 차단 모달이 안 뜬다 — F-3 회귀').toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('sidebar-notifications'), 'CRITICAL 인데 children(사이드바)이 그려진다').toHaveCount(0)
    await page.screenshot({ path: join(SHOT_DIR, '04-CRITICAL-차단.png'), fullPage: true })

    // Esc·배경 클릭으로도 안 닫힌다 — 이번 fix 가 statusNotice 를 건드렸을 뿐 Modal 자체를 건드리지 않았음을 재확인.
    await page.keyboard.press('Escape')
    await expect(modal, 'Escape 로 차단이 풀린다 — F-3 회귀').toBeVisible()
    await page.mouse.click(5, 5)
    await expect(modal, '배경 클릭으로 차단이 풀린다 — F-3 회귀').toBeVisible()

    // 차단 중에도 오류 상태 텍스트(app-auto-update-status)는 별도로 계속 보인다(기존 계약 유지).
    await expect(page.getByTestId('app-auto-update-status')).toContainText('업데이트 실패')
    await page.screenshot({ path: join(SHOT_DIR, '05-CRITICAL-Esc배경클릭후에도-차단유지.png'), fullPage: true })
  } finally {
    const cleanupOutput = cleanupThrowaway()
    console.log(`■ 종료 정리 SQL 출력\n${cleanupOutput.trim() || '(잔재 없음)'}`)
    expect(cleanupOutput).toContain(MARKER)
  }
})
