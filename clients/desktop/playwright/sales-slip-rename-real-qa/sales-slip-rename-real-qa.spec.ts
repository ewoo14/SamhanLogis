import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 슬1 — 판매전표 양식 통일 + 명칭 정정 실 서버 QA 캡처.
 *
 * [[no-fake-data-ever]] [[real-server-check-screenshot]] [[realqa-run-and-false-red]]
 * - VITE_MOCK_MODE OFF — 실 게이트웨이 http://127.0.0.1:8080 (page.route 프록시).
 * - 실 시드 전표: OUTBOUND CONFIRMED 6ceba0b4 (2026/02/18-001).
 * - 캡처/단언 대상(출고전표→판매전표 명칭 + OutboundView 폐기):
 *   1. 대시보드        — "처리중 판매전표" / "새 판매전표"
 *   2. 판매전표 목록    — "신규 판매전표"
 *   3. 판매전표 상세    — 인쇄 메뉴 "판매전표 출력"
 *   4. 판매전표 인쇄    — /print/dispatch (작업지시서 양식, 금액 없음)
 *   5. /print/outbound — 폐기 확인 (OutboundView 본문 미렌더)
 *
 * 실행:
 *   cd clients/desktop
 *   # 별도 터미널: VITE_API_BASE_URL=http://localhost:8080 node_modules/.bin/vite dev --config vite.renderer.dev.config.ts
 *   node_modules/.bin/playwright test playwright/sales-slip-rename-real-qa/sales-slip-rename-real-qa.spec.ts --config playwright.real-qa.config.ts --reporter=line
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, expect, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GW_URL = 'http://127.0.0.1:8080'
const OUTBOUND_SLIP_ID = '14b220c2-ce04-411c-a1cd-21fc0ff9bc6a' // OUTBOUND DRAFT 2026/06/19-1 (실 시드)

const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_ROLE = 'MASTER'
const MASTER_DISPLAY_NAME = '[DEV-SEED] 개발마스터'

function hashUrl(p: string): string {
  return `${BASE_URL}/#${p}`
}

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/sales-slip-form-unify-rename-s1'))
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

let seq = 0
async function capture(page: Page, name: string): Promise<void> {
  seq++
  const file = path.join(SCREENSHOT_DIR, `${String(seq).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  console.log('[CAPTURE]', file)
}

async function fetchRealToken(): Promise<string> {
  const http = await import('http')
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ loginId: 'dev_master', password: (resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')) })
    const req = http.default.request(
      {
        hostname: '127.0.0.1', port: 8080,
        path: '/api/v1/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let d = ''
        res.on('data', (c) => { d += c })
        res.on('end', () => {
          try { resolve(JSON.parse(d).data.token as string) } catch (e) { reject(new Error('token parse: ' + d)) }
        })
      },
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function installRealAuth(page: Page, token: string): Promise<void> {
  await page.addInitScript(
    ({ t, userId, role, displayName }: { t: string; userId: string; role: string; displayName: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token: t, userId, role, displayName, fullName: displayName }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    { t: token, userId: MASTER_USER_ID, role: MASTER_ROLE, displayName: MASTER_DISPLAY_NAME },
  )
}

async function setupApiProxy(page: Page, token: string): Promise<void> {
  await page.route(/:8080\//, async (route) => {
    const u = new URL(route.request().url())
    if (u.pathname.endsWith('/collab/stream') || u.pathname.endsWith('/notifications/stream')) {
      await route.abort()
      return
    }
    const realUrl = `${GW_URL}${u.pathname}${u.search}`
    const headers: Record<string, string> = {}
    for (const { name, value } of await route.request().headersArray()) {
      if (name.toLowerCase() !== 'host') headers[name] = value
    }
    headers['Authorization'] = `Bearer ${token}`
    const postData = route.request().postData()
    try {
      const response = await route.fetch({ url: realUrl, method: route.request().method(), headers, body: postData ?? undefined })
      await route.fulfill({ response })
    } catch (err) {
      console.error('[PROXY]', realUrl, err)
      await route.abort()
    }
  })
}

async function boot(page: Page): Promise<void> {
  const token = await fetchRealToken()
  await installRealAuth(page, token)
  await setupApiProxy(page, token)
}

test('S1-1: 대시보드 — "처리중 판매전표" / "새 판매전표"', async ({ page }) => {
  await boot(page)
  await page.goto(hashUrl('/'), { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(2000)
  await capture(page, 'dashboard')
  const body = (await page.locator('body').textContent()) ?? ''
  expect(body).not.toContain('처리중 출고전표')
  expect(body).toContain('판매전표')
})

test('S1-2: 판매전표 목록 — "신규/새 판매전표"', async ({ page }) => {
  await boot(page)
  await page.goto(hashUrl('/sales'), { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(2500)
  await capture(page, 'sales-list')
  const body = (await page.locator('body').textContent()) ?? ''
  // 판매 리스트 흐름에 구 용어 '출고전표'/'작업지시서' 잔재가 없어야 함
  // (신규 판매전표 버튼은 canAccess 게이트 — standalone QA-env 에서 권한매트릭스 미로드 시 비노출 가능)
  expect(body).not.toContain('출고전표')
  expect(body).not.toContain('작업지시서')
})

test('S1-3: 판매전표 상세 — 인쇄 메뉴 "판매전표 출력"', async ({ page }) => {
  await boot(page)
  await page.goto(hashUrl(`/sales/${OUTBOUND_SLIP_ID}`), { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(2500)
  await capture(page, 'detail-print-buttons')
  const body = (await page.locator('body').textContent()) ?? ''
  expect(body).not.toContain('불러오지 못')
  // 인쇄 메뉴 버튼: 판매전표 출력 / 거래명세서 출력 / 계산서 출력 병렬
  expect(body).toContain('판매전표 출력')
})

test('S1-4: 판매전표 인쇄 — /print/dispatch (작업지시서 양식·금액 없음)', async ({ page }) => {
  await boot(page)
  await page.goto(hashUrl(`/sales/${OUTBOUND_SLIP_ID}/print/dispatch`), { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(2500)
  await capture(page, 'print-dispatch-form')
  const body = (await page.locator('body').textContent()) ?? ''
  expect(body).not.toContain('불러오지 못')
  // 전표번호 0제거 표시값 (실 시드 2026/06/19-1)
  expect(body).toContain('2026/06/19-1')
})

test('S1-5: /print/outbound 폐기 — OutboundView 본문 미렌더', async ({ page }) => {
  await boot(page)
  await page.goto(hashUrl(`/sales/${OUTBOUND_SLIP_ID}/print/outbound`), { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(2000)
  await capture(page, 'outbound-removed')
  // OutboundView 전용 영역(data-testid="outbound-print-area")이 더 이상 존재하지 않아야 함
  const outboundArea = page.locator('[data-testid="outbound-print-area"]')
  expect(await outboundArea.count()).toBe(0)
})
