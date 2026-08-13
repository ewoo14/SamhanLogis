import { chromium } from '../../../clients/desktop/node_modules/playwright/index.mjs'
import { resolveQaCredential } from '../../../scripts/lib/qa-credentials.cjs'
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const API_BASE = 'http://127.0.0.1:8080'
const MARKER = 'PR1181-LIVEQA-20260813'
const RELEASE_VERSION = '2026/08/13-118101'
const OLD_VERSION = '2026/08/12-1'
const HIGHER_VERSION = '2026/08/14-1'
const MIN_SUPPORTED_VERSION = '2026/08/01-1'
const SHOT_DIR = new URL('./', import.meta.url)
const executablePath = 'C:/Users/user/AppData/Local/ms-playwright/chromium-1217/chrome-win64/chrome.exe'
const results = {
  marker: MARKER,
  releaseVersion: RELEASE_VERSION,
  createdIds: [],
  apiVersionScenarios: {},
  adminRoundTrip: [],
  webApps: {},
  electron: {},
  cleanup: {},
  console: [],
}

const shot = (name) => fileURLToPath(new URL(name, SHOT_DIR))

function log(message) {
  const line = String(message)
  results.console.push(line)
  console.log(line)
}

function psql(sql) {
  return execFileSync('docker', [
    'exec', 'samhan-postgres', 'psql', '-U', 'samhan', '-d', 'dashboard_db', '-P', 'pager=off', '-Atc', sql,
  ], { encoding: 'utf8' }).trim()
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, options)
  const text = await response.text()
  let body = null
  try { body = JSON.parse(text) } catch { body = text }
  return { status: response.status, body, text }
}

function authHeaders(loginData, json = false) {
  const headers = {
    Authorization: `Bearer ${loginData.token}`,
    'X-User-Id': String(loginData.userId ?? ''),
    'X-User-Role': String(loginData.role ?? 'MASTER'),
  }
  if (json) headers['Content-Type'] = 'application/json'
  return headers
}

async function createRelease(loginData, clientType) {
  const payload = {
    clientType,
    version: RELEASE_VERSION,
    forceLevel: 'MINOR',
    releaseNotes: `${MARKER} ${clientType} 실제 200/reload 검증`,
    releasedAt: '2026-08-13T19:58:00',
    minSupportedVersion: MIN_SUPPORTED_VERSION,
  }
  const created = await api('/app/releases', {
    method: 'POST',
    headers: authHeaders(loginData, true),
    body: JSON.stringify(payload),
  })
  if (created.status >= 400 || !created.body?.data?.id) {
    throw new Error(`${clientType} 릴리스 생성 실패 HTTP ${created.status}: ${created.text}`)
  }
  const id = String(created.body.data.id)
  results.createdIds.push(id)
  log(`CREATED|${clientType}|${id}|published=${created.body.data.isPublished}`)
  return id
}

async function publish(loginData, id) {
  const response = await api(`/app/releases/${id}/publish`, {
    method: 'POST',
    headers: authHeaders(loginData),
  })
  if (response.status >= 400) throw new Error(`publish 실패 ${id}: HTTP ${response.status} ${response.text}`)
  return response
}

async function captureAdmin(browser, loginData) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.on('console', (message) => log(`ADMIN_CONSOLE|${message.type()}|${message.text()}`))
  await page.addInitScript((auth) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ ...auth, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, {
    token: loginData.token ?? '',
    accessToken: loginData.token ?? '',
    userId: loginData.userId ?? '',
    role: loginData.role ?? 'MASTER',
    fullName: loginData.displayName ?? '개발책임자',
  })
  await page.goto('http://127.0.0.1:49181/admin/app-releases', { waitUntil: 'networkidle', timeout: 60_000 })
  const toggle = page.getByTestId(`app-release-publish-toggle-AROLOGIS_DESKTOP-${RELEASE_VERSION}`)
  await toggle.waitFor({ state: 'visible', timeout: 30_000 })
  const row = toggle.locator('xpath=ancestor::tr')
  await page.screenshot({ path: shot('01-admin-test-state.png'), fullPage: true })
  results.adminRoundTrip.push({ phase: 'initial', text: (await row.innerText()).replace(/\s+/g, ' ') })

  for (const phase of ['publish', 'unpublish', 'republish']) {
    await toggle.click()
    const dialog = page.getByTestId('app-release-publish-dialog')
    await dialog.waitFor({ state: 'visible' })
    await page.screenshot({ path: shot(`02-admin-${phase}-confirm.png`), fullPage: true })
    await page.getByTestId('app-release-publish-confirm').click()
    const expectedButton = phase === 'unpublish' ? '배포' : '배포 취소'
    await page.getByTestId('app-release-toast').waitFor({ state: 'visible', timeout: 15_000 })
    await toggle.getByText(expectedButton, { exact: true }).waitFor({ state: 'visible', timeout: 15_000 })
    const stateText = (await row.innerText()).replace(/\s+/g, ' ')
    const toastText = (await page.getByTestId('app-release-toast').innerText()).replace(/\s+/g, ' ')
    results.adminRoundTrip.push({ phase, stateText, toastText })
    log(`ADMIN|${phase}|${stateText}|${toastText}`)
    await page.screenshot({ path: shot(`03-admin-${phase}-done.png`), fullPage: true })
    await page.getByTestId('app-release-toast-close').click()
  }
  await page.close()
}

async function captureWebApp(browser, name, url, expectedClientType) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage()
  const appResult = { requests: [], responses: [], console: [], loadCountBefore: 0, loadCountAfter: 0 }
  results.webApps[name] = appResult
  await page.addInitScript(() => {
    const current = Number(sessionStorage.getItem('__pr1181_load_count') || '0')
    sessionStorage.setItem('__pr1181_load_count', String(current + 1))
  })
  page.on('request', (request) => {
    if (request.url().includes('/app/version')) appResult.requests.push(request.url())
  })
  page.on('response', async (response) => {
    if (response.url().includes('/app/version')) {
      appResult.responses.push({ status: response.status(), body: await response.text().catch(() => '') })
    }
  })
  page.on('console', (message) => appResult.console.push(`${message.type()}: ${message.text()}`))
  page.on('dialog', async (dialog) => { await dialog.accept() })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90_000 })
  const notice = page.getByTestId('web-version-notice')
  await notice.waitFor({ state: 'visible', timeout: 45_000 })
  const requestUrl = appResult.requests.find((value) => value.includes(`clientType=${expectedClientType}`))
  if (!requestUrl) throw new Error(`${name}: ${expectedClientType} /app/version 요청 없음: ${JSON.stringify(appResult.requests)}`)
  appResult.noticeTextBefore = (await notice.innerText()).replace(/\s+/g, ' ')
  appResult.loadCountBefore = await page.evaluate(() => Number(sessionStorage.getItem('__pr1181_load_count') || '0'))
  await page.screenshot({ path: shot(`10-web-${name}-reload-required.png`), fullPage: true })
  await page.getByTestId('web-version-reload').click()
  const unsaved = page.getByTestId('web-version-unsaved-confirm')
  if (await unsaved.count()) await page.getByTestId('web-version-confirm-reload').click()
  await page.waitForFunction(() => Number(sessionStorage.getItem('__pr1181_load_count') || '0') >= 2, null, { timeout: 45_000 })
  await notice.waitFor({ state: 'visible', timeout: 45_000 })
  appResult.loadCountAfter = await page.evaluate(() => Number(sessionStorage.getItem('__pr1181_load_count') || '0'))
  appResult.noticeTextAfter = (await notice.innerText()).replace(/\s+/g, ' ')
  await page.screenshot({ path: shot(`11-web-${name}-after-actual-reload.png`), fullPage: true })
  log(`WEB|${name}|load=${appResult.loadCountBefore}->${appResult.loadCountAfter}|${appResult.noticeTextBefore}`)
  await context.close()
}

async function captureElectron(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const electronResult = { requests: [], responses: [] }
  results.electron = electronResult
  await page.addInitScript(() => {
    const listeners = new Set()
    const audit = { checkCalls: 0, installCalls: 0, quitCalls: 0, emitted: [] }
    const emit = (status) => {
      audit.emitted.push(status)
      for (const listener of listeners) listener(status)
    }
    Object.defineProperty(window, '__pr1181UpdaterAudit', { configurable: true, value: audit })
    Object.defineProperty(window, 'arologisAuth', {
      configurable: true,
      value: { getToken: async () => null, setToken: async () => undefined, clearToken: async () => undefined },
    })
    Object.defineProperty(window, 'arologisUpdater', {
      configurable: true,
      value: {
        onStatus(listener) { listeners.add(listener); return () => listeners.delete(listener) },
        async check() {
          audit.checkCalls += 1
          emit({ kind: 'checking' })
          window.setTimeout(() => emit({ kind: 'available', version: '2026/08/13-118101' }), 1200)
          window.setTimeout(() => emit({ kind: 'downloading', percent: 67 }), 2200)
          window.setTimeout(() => emit({ kind: 'downloaded', version: '2026/08/13-118101' }), 4200)
        },
        async install() { audit.installCalls += 1 },
        async quit() { audit.quitCalls += 1 },
      },
    })
  })
  page.on('request', (request) => {
    if (request.url().includes('/app/version')) electronResult.requests.push(request.url())
  })
  page.on('response', async (response) => {
    if (response.url().includes('/app/version')) electronResult.responses.push({ status: response.status(), body: await response.text().catch(() => '') })
  })
  await page.goto('http://127.0.0.1:49185/#/login', { waitUntil: 'domcontentloaded', timeout: 60_000 })
  const banner = page.getByTestId('app-version-minor-banner')
  await banner.waitFor({ state: 'visible', timeout: 30_000 })
  electronResult.bannerText = (await banner.innerText()).replace(/\s+/g, ' ')
  electronResult.dismissLabel = await banner.getByRole('button').innerText()
  electronResult.hasLaterButton = await banner.getByRole('button', { name: '나중에' }).count()
  await page.screenshot({ path: shot('20-electron-banner-안내닫기.png'), fullPage: true })
  await banner.getByRole('button', { name: '안내 닫기' }).click()
  await banner.waitFor({ state: 'detached' })
  electronResult.bannerAfterDismissCount = await banner.count()
  await page.screenshot({ path: shot('21-electron-after-안내닫기.png'), fullPage: true })
  await page.waitForFunction(() => window.__pr1181UpdaterAudit?.installCalls === 1, null, { timeout: 15_000 })
  electronResult.updaterAudit = await page.evaluate(() => window.__pr1181UpdaterAudit)
  electronResult.statusText = await page.getByTestId('app-auto-update-status').innerText().catch(() => '')
  await page.screenshot({ path: shot('22-electron-downloaded-auto-install.png'), fullPage: true })
  log(`ELECTRON|banner=${electronResult.bannerText}|dismissed=${electronResult.bannerAfterDismissCount}|audit=${JSON.stringify(electronResult.updaterAudit)}`)
  await page.close()
}

const browser = await chromium.launch({ headless: true, executablePath })
try {
  const password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  const login = await api('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ loginId: 'dev_master', password }),
  })
  if (login.status >= 400 || !login.body?.data?.token) throw new Error(`로그인 실패 HTTP ${login.status}: ${login.text}`)
  const loginData = login.body.data
  log(`LOGIN|HTTP ${login.status}|role=${loginData.role}|userId=${loginData.userId}`)

  const ids = {}
  for (const clientType of ['SAMHAN_ORDER_WEB', 'SAMHAN_ESTIMATE_WEB', 'SAMHAN_MOBILE_PUBLIC_WEB', 'AROLOGIS_DESKTOP']) {
    ids[clientType] = await createRelease(loginData, clientType)
  }
  for (const clientType of ['SAMHAN_ORDER_WEB', 'SAMHAN_ESTIMATE_WEB', 'SAMHAN_MOBILE_PUBLIC_WEB']) {
    await publish(loginData, ids[clientType])
  }
  results.afterInsertRaw = psql(`select count(*) || '|' || count(*) filter (where is_published and not is_deleted) from app_release; select id::text || '|' || client_type || '|' || version || '|' || is_published || '|' || is_deleted from app_release where id in (${results.createdIds.map((id) => `'${id}'::uuid`).join(',')}) order by client_type;`)
  log(`AFTER_INSERT_RAW\n${results.afterInsertRaw}`)

  await captureAdmin(browser, loginData)

  for (const [name, currentVersion] of [['latest', RELEASE_VERSION], ['old', OLD_VERSION], ['higher', HIGHER_VERSION]]) {
    const response = await api(`/app/version?clientType=AROLOGIS_DESKTOP&currentVersion=${encodeURIComponent(currentVersion)}`)
    results.apiVersionScenarios[name] = { currentVersion, status: response.status, body: response.body, raw: response.text }
    log(`APP_VERSION|${name}|current=${currentVersion}|HTTP ${response.status}|${response.text}`)
  }

  await captureWebApp(browser, 'order', 'http://127.0.0.1:49182/', 'SAMHAN_ORDER_WEB')
  await captureWebApp(browser, 'estimate', 'http://127.0.0.1:49184/', 'SAMHAN_ESTIMATE_WEB')
  await captureWebApp(browser, 'mobile-public', 'http://127.0.0.1:49183/?token=PR1181-LIVEQA', 'SAMHAN_MOBILE_PUBLIC_WEB')
  await captureElectron(browser)
} catch (error) {
  results.error = error instanceof Error ? `${error.stack ?? error.message}` : String(error)
  console.error(results.error)
  process.exitCode = 1
} finally {
  await browser.close()
  if (results.createdIds.length) {
    const idList = results.createdIds.map((id) => `'${id}'::uuid`).join(',')
    results.cleanup.beforeDeleteRaw = psql(`select id::text || '|' || client_type || '|' || version || '|' || is_published || '|' || is_deleted from app_release where id in (${idList}) order by client_type;`)
    results.cleanup.deleteRaw = psql(`delete from app_release where id in (${idList}) and release_notes like '${MARKER}%'; select count(*) from app_release where id in (${idList});`)
  }
  results.cleanup.finalRaw = psql("select count(*) || '|' || count(*) filter (where is_published and not is_deleted) || '|' || coalesce(max(created_at)::text,'NULL') from app_release;")
  log(`CLEANUP_BEFORE\n${results.cleanup.beforeDeleteRaw ?? '(no ids)'}`)
  log(`CLEANUP_DELETE\n${results.cleanup.deleteRaw ?? '(no ids)'}`)
  log(`CLEANUP_FINAL|${results.cleanup.finalRaw}`)
  writeFileSync(new URL('results.json', SHOT_DIR), JSON.stringify(results, null, 2), 'utf8')
}
