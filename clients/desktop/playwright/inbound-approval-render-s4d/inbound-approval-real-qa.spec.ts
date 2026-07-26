import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 슬4d — 매입(입고)전표 인쇄 결재란 설정기반 렌더 + 결재 서명자 이름 자동채움 실 서버 QA.
 *
 * [[no-fake-data-ever]] [[real-server-check-screenshot]] [[per-round-live-qa]] — 실 게이트웨이 :8080, mock off.
 * 검수란(수기 공란) → 설정기반 결재란(작성자/입고자/검수자) 전환 + slip-service 가 user-service
 * /internal/users 로 resolve 한 서명자 이름이 결재란 셀에 자동 표시됨을 실 캡처로 검증.
 *
 * 실 시드 INBOUND(dev_master 로 lifecycle 전환하여 actor=UUID → 이름 resolve):
 *  - A 5b71b7fb (2026/03/18-1, PROCESSING): 입고자(acceptedBy)=개발마스터 자동채움.
 *  - B 1bec002a (2026/04/03-1, COMPLETED): 검수자(inspector)=개발마스터 자동채움.
 * (시드 원본 COMPLETED 전표는 actor 가 비-UUID 사용자명이라 이름 공백 — 본 QA 는 UUID actor 전환분 사용.)
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, expect, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GW_URL = 'http://127.0.0.1:8080'
const INBOUND_RECEIVE_SLIP_ID = '5b71b7fb-b9de-4f63-a414-f31997608892' // 입고자 채움
const INBOUND_INSPECT_SLIP_ID = '1bec002a-92bd-4e76-bbeb-61b15d46166b' // 검수자 채움
const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'

function hashUrl(p: string): string { return `${BASE_URL}/#${p}` }
const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/inbound-approval-render-s4d'))
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
let seq = 0
async function capture(page: Page, name: string): Promise<void> {
  seq++
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${String(seq).padStart(2, '0')}-${name}.png`), fullPage: true })
}
async function fetchRealToken(): Promise<string> {
  const http = await import('http')
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ loginId: 'dev_master', password: 'dev_p05_pass!' })
    const req = http.default.request(
      { hostname: '127.0.0.1', port: 8080, path: '/api/v1/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { let d = ''; res.on('data', (c) => { d += c }); res.on('end', () => { try { resolve(JSON.parse(d).data.token as string) } catch (e) { reject(new Error('token: ' + d)) } }) })
    req.on('error', reject); req.write(body); req.end()
  })
}
async function installRealAuth(page: Page, token: string): Promise<void> {
  await page.addInitScript(({ t, userId }) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => ({ token: t, userId, role: 'MASTER', displayName: '[DEV-SEED] 개발마스터', fullName: '[DEV-SEED] 개발마스터' }),
      setToken: async () => undefined, clearToken: async () => undefined } })
  }, { t: token, userId: MASTER_USER_ID })
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

test('S4D-A: 매입전표 인쇄 결재란 — 입고자 이름 자동채움', async ({ page }) => {
  const token = await fetchRealToken()
  await installRealAuth(page, token)
  await setupApiProxy(page, token)
  await page.goto(hashUrl(`/purchases/${INBOUND_RECEIVE_SLIP_ID}/print/purchase`), { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(3000)
  await capture(page, 'purchase-print-approval-acceptedby')
  const body = (await page.locator('body').textContent()) ?? ''
  expect(body).not.toContain('불러오지 못')
  expect(body).toContain('결 재 란')
  expect(body).toContain('입고인')
  expect(body).toContain('검수인')
  // 입고인(acceptedBy) 이름 자동채움 — slip-service resolve 결과
  expect(body).toContain('개발마스터')
})

test('S4D-B: 매입전표 인쇄 결재란 — 검수자 이름 자동채움 (COMPLETED)', async ({ page }) => {
  const token = await fetchRealToken()
  await installRealAuth(page, token)
  await setupApiProxy(page, token)
  await page.goto(hashUrl(`/purchases/${INBOUND_INSPECT_SLIP_ID}/print/purchase`), { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(3000)
  await capture(page, 'purchase-print-approval-inspector')
  const body = (await page.locator('body').textContent()) ?? ''
  expect(body).not.toContain('불러오지 못')
  expect(body).toContain('결 재 란')
  // 검수자(inspector) 이름 자동채움 — slip-service resolve 결과
  expect(body).toContain('개발마스터')
})
