import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 슬2 V65 — 출고자/검수자 라벨 실 서버 QA 캡처 (결재정보 카드 + 인쇄 결재란).
 *
 * [[no-fake-data-ever]] [[real-server-check-screenshot]] — 실 게이트웨이 :8080, mock off.
 * 실 시드 OUTBOUND: 14b220c2 (2026/06/19-1).
 * ※ 결재라인 설정 페이지(/admin/approval-line-config)는 PermissionGuard(admin.approval-line-config)
 *   + 본 standalone QA-env 의 admin 권한 미해석(403)으로 라이브 렌더 불가 → config UI 는 mock 캡처 별도.
 *   단계 추가/삭제/CREATOR 거부/authorize 동작은 실 Testcontainers IT(ApprovalLineConfigControllerIT·
 *   ApprovalLineAuthorizeControllerIT)가 실 Postgres 로 증명.
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, expect, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GW_URL = 'http://127.0.0.1:8080'
const OUTBOUND_SLIP_ID = '14b220c2-ce04-411c-a1cd-21fc0ff9bc6a'
const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_ROLE = 'MASTER'
const MASTER_DISPLAY_NAME = '[DEV-SEED] 개발마스터'

function hashUrl(p: string): string { return `${BASE_URL}/#${p}` }

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/dynamic-approval-step-crud-s2'))
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })
let seq = 0
async function capture(page: Page, name: string): Promise<void> {
  seq++
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${String(seq).padStart(2, '0')}-${name}.png`), fullPage: true })
}

async function fetchRealToken(): Promise<string> {
  const http = await import('http')
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ loginId: 'dev_master', password: (process.env.DEV_PASSWORD ?? '') })
    const req = http.default.request(
      { hostname: '127.0.0.1', port: 8080, path: '/api/v1/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { let d = ''; res.on('data', (c) => { d += c }); res.on('end', () => { try { resolve(JSON.parse(d).data.token as string) } catch (e) { reject(new Error('token: ' + d)) } }) },
    )
    req.on('error', reject); req.write(body); req.end()
  })
}
async function installRealAuth(page: Page, token: string): Promise<void> {
  await page.addInitScript(({ t, userId, role, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => ({ token: t, userId, role, displayName, fullName: displayName }),
      setToken: async () => undefined, clearToken: async () => undefined } })
  }, { t: token, userId: MASTER_USER_ID, role: MASTER_ROLE, displayName: MASTER_DISPLAY_NAME })
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
async function boot(page: Page): Promise<void> {
  const token = await fetchRealToken(); await installRealAuth(page, token); await setupApiProxy(page, token)
}

test('S2-V65-1: 판매전표 상세 결재정보 — 출고자/검수자', async ({ page }) => {
  await boot(page)
  await page.goto(hashUrl(`/sales/${OUTBOUND_SLIP_ID}`), { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(2500)
  await capture(page, 'detail-approval-info')
  const body = (await page.locator('body').textContent()) ?? ''
  expect(body).not.toContain('불러오지 못')
  expect(body).toContain('출고자')
  expect(body).toContain('검수자')
  expect(body).not.toContain('출고인')
})

test('S2-V65-2: 판매전표 인쇄 결재란 — 출고자/검수자', async ({ page }) => {
  await boot(page)
  await page.goto(hashUrl(`/sales/${OUTBOUND_SLIP_ID}/print/dispatch`), { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(2500)
  await capture(page, 'print-approval-block')
  const body = (await page.locator('body').textContent()) ?? ''
  expect(body).toContain('출고자')
  expect(body).toContain('검수자')
})
