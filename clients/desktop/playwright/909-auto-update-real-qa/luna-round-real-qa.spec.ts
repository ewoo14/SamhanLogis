import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * PR #909 라운드 실서버 QA.
 *
 * 이 스펙은 인증만 주입하는 기존 하네스와 달리 updater 전체를 주입한다.
 * 따라서 AppVersionGate 의 updater effect 가 실제로 check → status → install
 * 경로를 통과했는지를 DOM, 이벤트, 호출 횟수로 함께 확인한다.
 */
import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5200'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const MARKER = 'LUNA909R6'
const SHOT_DIR = resolveQaShotsDir(process.env['AUDIT_SHOT_DIR'] ?? join(process.cwd(), '..', '..', 'docs', 'qa', '909-luna-round-2026-07-23'))
const RAW_ERROR = 'Cannot find channel latest at https://intranet.example/latest.yml x-secret-header'

type Scenario = 'available' | 'not-available' | 'check-error' | 'download-timeout' | 'download-timeout-progress' | 'critical-check-error' | 'dismiss-boundary'

function cleanupThrowaway(): string {
  const sql = [
    `UPDATE app_release SET is_deleted = TRUE, deleted_at = NOW(), deleted_by = '${MARKER}' WHERE release_notes LIKE '${MARKER}%';`,
    `SELECT client_type, version, is_deleted, deleted_by FROM app_release WHERE release_notes LIKE '${MARKER}%' ORDER BY version;`,
  ].join(' ')
  return execFileSync('docker', [
    'exec', 'samhan-postgres', 'psql', '-U', 'samhan', '-d', 'dashboard_db', '-tAc', sql,
  ], { encoding: 'utf8' })
}

async function installHarness(page: import('@playwright/test').Page, scenario: Scenario) {
  await page.addInitScript(({ selectedScenario, rawError }) => {
    type Status = {
      kind: 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'
      version?: string
      percent?: number
      message?: string
    }
    type Audit = {
      scenario: string
      checkCalls: number
      installCalls: number
      quitCalls: number
      events: Status[]
    }

    const listeners = new Set<(status: Status) => void>()
    const audit: Audit = { scenario: selectedScenario, checkCalls: 0, installCalls: 0, quitCalls: 0, events: [] }
    const emit = (status: Status) => {
      audit.events.push(status)
      for (const listener of listeners) listener(status)
    }
    const delay = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => null,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
    Object.defineProperty(window, '__luna909UpdaterAudit', { configurable: true, value: audit })
    Object.defineProperty(window, 'samhanUpdater', {
      configurable: true,
      value: {
        onStatus: (listener: (status: Status) => void) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        check: async () => {
          audit.checkCalls += 1
          emit({ kind: 'checking' })
          if (selectedScenario === 'check-error' || selectedScenario === 'critical-check-error') {
            await delay(120)
            throw new Error(rawError)
          }
          if (selectedScenario === 'dismiss-boundary') {
            await delay(120)
            emit({ kind: 'error' })
            await delay(120)
            emit({ kind: 'downloading', percent: 61 })
            await new Promise<void>((resolve) => {
              Object.defineProperty(window, '__luna909Continue', { configurable: true, value: resolve })
            })
            emit({ kind: 'downloading', percent: 73 })
            await delay(120)
            emit({ kind: 'error' })
            return
          }
          if (selectedScenario === 'download-timeout') {
            await delay(120)
            emit({ kind: 'available', version: '9.9.8' })
            await delay(120)
            emit({ kind: 'downloading', percent: 17 })
            return new Promise<void>(() => {})
          }
          if (selectedScenario === 'download-timeout-progress') {
            await delay(120)
            emit({ kind: 'available', version: '9.9.8' })
            emit({ kind: 'downloading', percent: 1 })
            for (const percent of [11, 21, 31, 41, 51, 61, 71]) {
              await delay(25_000)
              emit({ kind: 'downloading', percent })
            }
            return new Promise<void>(() => {})
          }
          if (selectedScenario === 'not-available') {
            await delay(120)
            emit({ kind: 'not-available' })
            return
          }
          await delay(120)
          emit({ kind: 'available', version: '9.9.8' })
          await delay(120)
          emit({ kind: 'downloading', percent: 42 })
          await delay(120)
          emit({ kind: 'downloading', percent: 88 })
          await delay(120)
          emit({ kind: 'downloaded', version: '9.9.8' })
        },
        install: async () => {
          audit.installCalls += 1
        },
        quit: async () => {
          audit.quitCalls += 1
        },
      },
    })
  }, { selectedScenario: scenario, rawError: RAW_ERROR })
}

test.setTimeout(600_000)
test.use({ viewport: { width: 1400, height: 900 } })

test('PR #909 라운드 — 실제 updater 6개 기동 경로', async ({ browser, request }) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const cleanupAtStart = cleanupThrowaway()
  console.log(`■ 시작 잔재 회수 SQL 출력\n${cleanupAtStart.trim() || '(잔재 없음)'}`)

  const login = await request.post(`${API_BASE}/api/auth/login`, {
    data: { loginId: 'dev_master', password: PASSWORD },
  })
  expect(login.ok(), `실서버 로그인 실패: HTTP ${login.status()}`).toBeTruthy()
  const loginData = (await login.json()).data ?? {}
  const auth = {
    Authorization: `Bearer ${loginData.token}`,
    'X-User-Id': loginData.userId,
    'X-User-Role': loginData.role ?? 'MASTER',
  }
  const jsonAuth = { ...auth, 'Content-Type': 'application/json' }
  const releaseBody = {
    clientType: 'DESKTOP',
    version: '2026/07/25-91012',
    forceLevel: 'MINOR',
    releaseNotes: `${MARKER} throwaway 자동업데이트 실서버 검증용`,
    releasedAt: '2026-07-23T00:00:00',
    minSupportedVersion: '0.0.0',
  }
  let releaseId = ''

  const created = await request.post(`${API_BASE}/app/releases`, { headers: jsonAuth, data: releaseBody })
  expect(created.status(), `throwaway 릴리스 등록 실패 HTTP ${created.status()}`).toBeLessThan(400)
  releaseId = String((await created.json()).data?.id ?? '')
  expect(releaseId).not.toBe('')
  const published = await request.post(`${API_BASE}/app/releases/${releaseId}/publish`, { headers: auth })
  expect(published.status(), `throwaway 릴리스 publish 실패 HTTP ${published.status()}`).toBeLessThan(400)

  const runScenario = async (name: string, scenario: Scenario, screenshot: string, critical = false) => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
    const page = await context.newPage()
    await installHarness(page, scenario)
    page.on('request', (req) => {
      if (req.url().includes('/app/version')) console.log(`▶ ${name} /app/version 요청 ${req.url()}`)
    })
    page.on('response', async (res) => {
      if (res.url().includes('/app/version')) {
        const body = await res.text().catch(() => '')
        console.log(`◀ ${name} /app/version 응답 ${res.status()} ${body.slice(0, 240)}`)
      }
    })
    await page.goto(`${BASE_URL}/#/login`)
    const splash = page.getByTestId('app-update-startup-splash')
    const loginInput = page.getByTestId('login-id-input')
    const modal = page.getByTestId('app-version-blocking-modal')
    const status = page.getByTestId('app-auto-update-status')
    await expect(splash, `${name}: updater 확인 스플래시가 보이지 않음`).toBeVisible({ timeout: 10000 })
    await page.screenshot({ path: join(SHOT_DIR, `${screenshot}-01-확인중.png`), fullPage: true })

    if (scenario === 'dismiss-boundary') {
      await expect(status, `${name}: downloading 상태 알림이 보이지 않음`).toContainText('61%', { timeout: 10000 })
      await expect(page.getByTestId('app-auto-update-dismiss'), `${name}: downloading 상태에 닫기 버튼이 없음(P-1)`).toBeVisible()
      await page.screenshot({ path: join(SHOT_DIR, `${screenshot}-01-downloading61-닫기.png`), fullPage: true })
      await page.getByTestId('app-auto-update-dismiss').click()
      await expect(status, `${name}: 닫은 알림이 즉시 사라지지 않음`).toHaveCount(0)
      await page.evaluate(() => (window as Window & { __luna909Continue?: () => void }).__luna909Continue?.())
      await page.waitForTimeout(80)
      await expect(status, `${name}: 같은 kind 진행률 갱신으로 알림이 재등장함(P-2)`).toHaveCount(0)
      await expect(status, `${name}: kind 변경(error) 후 새 알림이 재등장하지 않음(P-3)`).toContainText('업데이트 실패', { timeout: 5000 })
      await page.screenshot({ path: join(SHOT_DIR, `${screenshot}-02-error-kind변경-재등장.png`), fullPage: true })
    } else if (scenario === 'available') {
      await expect.poll(async () => page.evaluate(() => (window as Window & { __luna909UpdaterAudit?: { installCalls: number } }).__luna909UpdaterAudit?.installCalls ?? 0), {
        timeout: 10000,
        message: `${name}: 자동 설치 호출이 발생하지 않음`,
      }).toBe(1)
      // 실제 quitAndInstall 은 프로세스를 종료하므로, 재시작 직전에는
      // 로그인으로 넘어가지 않고 설치 안내 스플래시가 남아 있어야 한다.
      await expect(splash).toBeVisible()
      await expect(loginInput).toHaveCount(0)
      const audit = await page.evaluate(() => (window as Window & { __luna909UpdaterAudit?: unknown }).__luna909UpdaterAudit)
      console.log(`■ ${name} updater 관측 ${JSON.stringify(audit)}`)
      await page.screenshot({ path: join(SHOT_DIR, `${screenshot}-02-자동설치-재시작직전.png`), fullPage: true })
    } else if (scenario === 'not-available') {
      await expect(splash).toHaveCount(0)
      await expect(loginInput).toBeVisible()
      const audit = await page.evaluate(() => (window as Window & { __luna909UpdaterAudit?: unknown }).__luna909UpdaterAudit)
      console.log(`■ ${name} updater 관측 ${JSON.stringify(audit)}`)
      await page.screenshot({ path: join(SHOT_DIR, `${screenshot}-02-로그인도달.png`), fullPage: true })
    } else if (scenario === 'check-error' || scenario === 'critical-check-error') {
      await expect.poll(async () => page.getByTestId('app-auto-update-status').innerText().catch(() => ''), {
        timeout: 10000,
      }).toContain('인터넷 연결을 확인한 뒤 다시 실행해 주세요')
      const body = await page.locator('body').innerText()
      expect(body).not.toContain('intranet.example')
      expect(body).not.toContain('latest.yml')
      if (critical) {
        await expect(modal).toBeVisible()
        await expect(loginInput).toHaveCount(0)
        await expect(page.getByTestId('app-version-blocking-reload')).toBeVisible()
        await expect(page.getByTestId('app-version-blocking-quit')).toBeVisible()
      } else {
        await expect(loginInput).toBeVisible()
      }
      const audit = await page.evaluate(() => (window as Window & { __luna909UpdaterAudit?: unknown }).__luna909UpdaterAudit)
      console.log(`■ ${name} updater 관측 ${JSON.stringify(audit)}`)
      await page.screenshot({ path: join(SHOT_DIR, `${screenshot}-02-실패후-상태.png`), fullPage: true })
    } else {
      const expectedProgress = scenario === 'download-timeout-progress' ? '다운로드하는 중입니다. 1%' : '다운로드하는 중입니다. 17%'
      await expect(splash).toContainText(expectedProgress)
      await page.screenshot({ path: join(SHOT_DIR, `${screenshot}-02-다운로드진행.png`), fullPage: true })
      await page.waitForTimeout(180_500)
      await expect(splash, `${name}: 확인 상한 초과 후에도 스플래시가 남음`).toHaveCount(0)
      await expect(loginInput, `${name}: 다운로드 상한 초과 후 로그인에 도달하지 않음`).toBeVisible()
      const body = await page.locator('body').innerText()
      expect(body).toContain('다운로드 시간이 제한을 초과했습니다')
      expect(body).not.toContain('latest.yml')
      const audit = await page.evaluate(() => (window as Window & { __luna909UpdaterAudit?: unknown }).__luna909UpdaterAudit)
      console.log(`■ ${name} updater 관측 ${JSON.stringify(audit)}`)
      await page.screenshot({ path: join(SHOT_DIR, `${screenshot}-03-상한초과-로그인.png`), fullPage: true })
    }
    await context.close()
  }

  try {
    await runScenario('업데이트 있음', 'available', '01-업데이트있음')
    await runScenario('업데이트 없음', 'not-available', '02-업데이트없음')
    await runScenario('닫기 경계·진행률 불변·오류 재등장', 'dismiss-boundary', '03-닫기경계')
    await runScenario('확인 실패·오프라인', 'check-error', '04-확인실패')
    await runScenario('다운로드 지연·무진행', 'download-timeout', '05-다운로드지연-무진행')
    await runScenario('다운로드 지연·진행중', 'download-timeout-progress', '06-다운로드지연-진행중')

    const criticalUpdate = await request.put(`${API_BASE}/app/releases/${releaseId}`, {
      headers: jsonAuth,
      data: { ...releaseBody, forceLevel: 'CRITICAL', minSupportedVersion: '0.1.0' },
    })
    expect(criticalUpdate.status(), `CRITICAL 전환 실패 HTTP ${criticalUpdate.status()}`).toBeLessThan(400)
    const serverVersion = await request.get(`${API_BASE}/app/version?clientType=DESKTOP&currentVersion=0.1.0`)
    const serverVersionBody = await serverVersion.json()
    console.log(`■ CRITICAL 전환 후 서버 응답 ${JSON.stringify(serverVersionBody.data ?? serverVersionBody)}`)
    expect(serverVersionBody.data?.forceLevel).toBe('CRITICAL')
    await runScenario('CRITICAL + 확인 실패', 'critical-check-error', '07-CRITICAL실패', true)
  } finally {
    const cleanupOutput = cleanupThrowaway()
    console.log(`■ 종료 정리 SQL 출력\n${cleanupOutput.trim() || '(잔재 없음)'}`)
    expect(cleanupOutput).toContain(MARKER)
  }
})
