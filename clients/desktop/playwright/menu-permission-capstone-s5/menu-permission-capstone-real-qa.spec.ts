import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 슬5 capstone — 메뉴↔권한설정 정합 라이브 UI 증명.
 *
 * [[no-fake-data-ever]] [[real-server-check-screenshot]] — 실 게이트웨이 :8080, mock off.
 * ① 권한설정 매트릭스 MASTER 렌더 ② 결재라인 설정 MASTER 렌더 ③ MANAGER 라우트 가드 차단.
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, expect, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GW_URL = 'http://127.0.0.1:8080'

const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MANAGER_USER_ID = 'a0000000-0000-0000-0000-000000000003'

function hashUrl(p: string): string { return `${BASE_URL}/#${p}` }
const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/menu-permission-capstone-s5'))
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
let seq = 0
async function capture(page: Page, name: string): Promise<void> {
  seq++
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${String(seq).padStart(2, '0')}-${name}.png`), fullPage: true })
}
async function fetchRealToken(loginId: string): Promise<string> {
  const http = await import('http')
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ loginId, password: 'dev_p05_pass!' })
    const req = http.default.request(
      { hostname: '127.0.0.1', port: 8080, path: '/api/v1/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { let d = ''; res.on('data', (c) => { d += c }); res.on('end', () => { try { resolve(JSON.parse(d).data.token as string) } catch (e) { reject(new Error('token: ' + d)) } }) })
    req.on('error', reject); req.write(body); req.end()
  })
}
async function installRealAuth(
  page: Page,
  token: string,
  userId: string,
  role: 'MASTER' | 'MANAGER',
  displayName: string,
): Promise<void> {
  await page.addInitScript(({ t, userId, role, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => ({ token: t, userId, role, displayName, fullName: displayName }),
      setToken: async () => undefined, clearToken: async () => undefined } })
  }, { t: token, userId, role, displayName })
}
async function setupApiProxy(page: Page, token: string): Promise<void> {
  await page.route(/:8080\//, async (route) => {
    const u = new URL(route.request().url())
    if (u.pathname.endsWith('/collab/stream') || u.pathname.endsWith('/notifications/stream')) { await route.abort(); return }
    const headers: Record<string, string> = {}
    for (const { name, value } of await route.request().headersArray()) { if (name.toLowerCase() !== 'host') headers[name] = value }
    headers['Authorization'] = `Bearer ${token}`
    try { await route.fulfill({ response: await route.fetch({ url: `${GW_URL}${u.pathname}${u.search}`, method: route.request().method(), headers, body: route.request().postData() ?? undefined }) }) }
    catch (err) { await route.abort() }
  })
}

test('S5-A: 권한설정 매트릭스 페이지 렌더(MASTER)', async ({ page }) => {
  const token = await fetchRealToken('dev_master')
  await installRealAuth(page, token, MASTER_USER_ID, 'MASTER', '[DEV-SEED] 개발마스터')
  await setupApiProxy(page, token)
  await page.goto(hashUrl('/admin/permission-matrix'), { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(3000)
  await capture(page, 'permission-matrix-master')
  const body = (await page.locator('body').textContent()) ?? ''
  expect(body).not.toContain('불러오지 못')
  expect(body).not.toContain('403')
  expect(body).not.toContain('권한이 없')
  expect(body).toContain('권한설정')
  expect(body).toContain('accounting.accounts')
  expect(body).toContain('조회')
})

test('S5-B: 결재라인 설정 메뉴 페이지 렌더(MASTER)', async ({ page }) => {
  const token = await fetchRealToken('dev_master')
  await installRealAuth(page, token, MASTER_USER_ID, 'MASTER', '[DEV-SEED] 개발마스터')
  await setupApiProxy(page, token)
  await page.goto(hashUrl('/admin/approval-line-config'), { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(3000)
  await capture(page, 'approval-line-config-master')
  const body = (await page.locator('body').textContent()) ?? ''
  expect(body).not.toContain('불러오지 못')
  expect(body).not.toContain('403')
  expect(body).not.toContain('권한이 없')
  expect(body).toContain('결재라인 설정')
  expect(body).toContain('문서 종류')
  expect(body).toContain('역할')
  expect(body).toContain('결재자')
})

test('S5-C: 비-MASTER 권한설정 라우트 가드 차단(MANAGER)', async ({ page }) => {
  const token = await fetchRealToken('dev_manager')
  await installRealAuth(page, token, MANAGER_USER_ID, 'MANAGER', '[DEV-SEED] 개발매니저')
  await setupApiProxy(page, token)
  await page.goto(hashUrl('/admin/permission-matrix'), { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(3000)
  await capture(page, 'permission-matrix-manager-blocked')
  const body = (await page.locator('body').textContent()) ?? ''
  expect(page.url()).toBe(hashUrl('/'))
  expect(body).not.toContain('권한설정')
  expect(body).not.toContain('accounting.accounts')
})
