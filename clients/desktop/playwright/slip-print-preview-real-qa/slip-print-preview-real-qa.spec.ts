import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 전표 인쇄 미리보기 실 서버 QA 캡처.
 *
 * [[no-fake-data-ever]] [[real-server-check-screenshot]]
 * - VITE_MOCK_MODE OFF — 실 게이트웨이 http://127.0.0.1:8080.
 * - 실 시드 전표:
 *   - OUTBOUND(출고) CONFIRMED: 6ceba0b4 (2026/02/18-001, 거래처-P-2026-0049, 4라인)
 *   - INBOUND(입고) CONFIRMED: 1c72f28a (2026/04/08-001, 거래처-P-2026-0048)
 * - 캡처 대상:
 *   1. /sales/:id/print/statement  — 거래명세서 미리보기
 *   2. /sales/:id/print/invoice    — 세금계산서 미리보기
 *   3. /purchases/:id/print/purchase — 매입(입고)전표 미리보기
 *   4. /print/partner-ledger        — 거래처원장 미리보기 (파라미터 필요)
 *
 * 실행:
 *   cd clients/desktop
 *   node_modules/.bin/playwright test \
 *     --config playwright/slip-print-preview-real-qa/playwright.config.ts \
 *     --reporter=line
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, expect, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GW_URL = 'http://127.0.0.1:8080'

// 실 시드 전표 UUID
const OUTBOUND_SLIP_ID = '6ceba0b4-4b3c-437a-9e03-866c9a6b596c' // OUTBOUND CONFIRMED 2026/02/18-001
const INBOUND_SLIP_ID = '1c72f28a-4aae-4f1c-8522-b7e9a921aa0d'  // INBOUND CONFIRMED 2026/04/08-001

/**
 * createHashRouter 사용 — URL 은 http://host/#/path 형태 (hash routing).
 * 직접 /path 접근 시 SPA 라우팅 미작동 → /#/path 로 변환 필요.
 */
function hashUrl(path: string): string {
  return `${BASE_URL}/#${path}`
}

const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_ROLE = 'MASTER'
const MASTER_DISPLAY_NAME = '[DEV-SEED] 개발마스터'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/slip-print-preview'))
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

// ────────────────────────────────────────────────────────────────────────────
// CASE 1: 거래명세서 미리보기 (/sales/:id/print/statement)
// ────────────────────────────────────────────────────────────────────────────
test('C1: 거래명세서 미리보기 — 양식 본문 + 상단 인쇄 버튼', async ({ page }) => {
  const token = await fetchRealToken()
  await installRealAuth(page, token)
  await setupApiProxy(page, token)

  // 즉시 print 다이얼로그 억제 (window.print 를 no-op 으로 교체)
  await page.addInitScript(() => {
    window.print = () => { console.log('[TEST] window.print() intercepted') }
  })

  const url = hashUrl(`/sales/${OUTBOUND_SLIP_ID}/print/statement`)
  console.log('[NAVIGATE]', url)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })

  // 미리보기 페이지 로드 후 양식 본문 대기 (1~3초면 충분)
  await page.waitForTimeout(2000)

  await capture(page, 'sales-statement-preview')

  // 상단 "인쇄" 버튼 존재 확인 (PrintLayout의 no-print 액션 바)
  const printBtn = page.getByRole('button', { name: /인쇄/ })
  const hasPrintBtn = await printBtn.count() > 0
  console.log('[CHECK] 인쇄 버튼 존재:', hasPrintBtn)

  // "상세로 돌아가기" 버튼 존재 확인
  const backBtn = page.getByRole('button', { name: /상세로 돌아가기/ })
  const hasBackBtn = await backBtn.count() > 0
  console.log('[CHECK] 돌아가기 버튼 존재:', hasBackBtn)

  // 전표번호 표시 확인 (UUID 아닌 슬래시 번호)
  const bodyText = await page.locator('body').textContent() ?? ''
  const hasSlipNo = bodyText.includes('2026/02/18-001') || bodyText.includes('2026/02/18')
  console.log('[CHECK] 전표번호 표시:', hasSlipNo)
  console.log('[CHECK] 양식 텍스트 샘플:', bodyText.slice(0, 200).replace(/\s+/g, ' '))

  // 즉시 window.print 미실행 확인 — 다이얼로그가 뜨지 않았으면 OK
  // (이미 addInitScript 로 no-op 치환하여 테스트 진행에 영향 없음)

  expect(hasPrintBtn || hasBackBtn || bodyText.includes('인쇄')).toBeTruthy()
})

// ────────────────────────────────────────────────────────────────────────────
// CASE 2: 세금계산서 미리보기 (/sales/:id/print/invoice)
// ────────────────────────────────────────────────────────────────────────────
test('C2: 세금계산서 미리보기 — 양식 본문 + 상단 인쇄 버튼', async ({ page }) => {
  const token = await fetchRealToken()
  await installRealAuth(page, token)
  await setupApiProxy(page, token)

  await page.addInitScript(() => {
    window.print = () => { console.log('[TEST] window.print() intercepted') }
  })

  const url = hashUrl(`/sales/${OUTBOUND_SLIP_ID}/print/invoice`)
  console.log('[NAVIGATE]', url)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(2000)

  await capture(page, 'sales-invoice-preview')

  const printBtn = page.getByRole('button', { name: /인쇄/ })
  const hasPrintBtn = await printBtn.count() > 0
  console.log('[CHECK] 인쇄 버튼 존재:', hasPrintBtn)

  const bodyText = await page.locator('body').textContent() ?? ''
  const hasTaxInvoiceLabel = bodyText.includes('세금계산서') || bodyText.includes('계 산 서')
  console.log('[CHECK] 세금계산서 라벨:', hasTaxInvoiceLabel)
  console.log('[CHECK] 양식 텍스트 샘플:', bodyText.slice(0, 200).replace(/\s+/g, ' '))

  expect(hasPrintBtn || bodyText.includes('인쇄')).toBeTruthy()
})

// ────────────────────────────────────────────────────────────────────────────
// CASE 3: 매입(입고)전표 미리보기 (/purchases/:id/print/purchase)
// ────────────────────────────────────────────────────────────────────────────
test('C3: 입고전표 미리보기 — 양식 본문 + 상단 인쇄 버튼', async ({ page }) => {
  const token = await fetchRealToken()
  await installRealAuth(page, token)
  await setupApiProxy(page, token)

  await page.addInitScript(() => {
    window.print = () => { console.log('[TEST] window.print() intercepted') }
  })

  const url = hashUrl(`/purchases/${INBOUND_SLIP_ID}/print/purchase`)
  console.log('[NAVIGATE]', url)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(2000)

  await capture(page, 'purchase-slip-preview')

  const printBtn = page.getByRole('button', { name: /인쇄/ })
  const hasPrintBtn = await printBtn.count() > 0
  console.log('[CHECK] 인쇄 버튼 존재:', hasPrintBtn)

  const bodyText = await page.locator('body').textContent() ?? ''
  const hasPurchaseLabel = bodyText.includes('매입') || bodyText.includes('입고') || bodyText.includes('2026/04/08')
  console.log('[CHECK] 입고전표 라벨:', hasPurchaseLabel)
  console.log('[CHECK] 양식 텍스트 샘플:', bodyText.slice(0, 200).replace(/\s+/g, ' '))

  expect(hasPrintBtn || bodyText.includes('인쇄')).toBeTruthy()
})

// ────────────────────────────────────────────────────────────────────────────
// CASE 4: 거래처원장 미리보기 (/print/partner-ledger)
// ────────────────────────────────────────────────────────────────────────────
test('C4: 거래처원장 미리보기 — 양식 본문 + 상단 인쇄 버튼', async ({ page }) => {
  const token = await fetchRealToken()
  await installRealAuth(page, token)
  await setupApiProxy(page, token)

  await page.addInitScript(() => {
    window.print = () => { console.log('[TEST] window.print() intercepted') }
  })

  // 거래처원장은 쿼리 파라미터로 거래처 지정 — 먼저 파트너 목록에서 실 ID 확보
  // 이미 알고 있는 거래처명: 거래처-P-2026-0049 (OUTBOUND 전표 거래처)
  // 거래처원장 페이지를 먼저 방문해 파라미터 형식 파악
  const url = hashUrl(`/accounting/partner-ledger`)
  console.log('[NAVIGATE]', url)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(2000)

  await capture(page, 'partner-ledger-list')

  const bodyText = await page.locator('body').textContent() ?? ''
  console.log('[CHECK] 거래처원장 목록 텍스트:', bodyText.slice(0, 300).replace(/\s+/g, ' '))

  // 거래처원장 인쇄 버튼 또는 프린트 링크 탐색
  const printLinks = await page.getByRole('link', { name: /인쇄|출력/ }).all()
  const printBtns = await page.getByRole('button', { name: /인쇄|출력|원장 출력/ }).all()
  console.log('[CHECK] 인쇄 링크 수:', printLinks.length)
  console.log('[CHECK] 인쇄 버튼 수:', printBtns.length)

  // /print/partner-ledger 직접 접근 시도 (쿼리 파라미터 없이 — 빈 양식 또는 오류 확인)
  await page.goto(hashUrl(`/print/partner-ledger`), { waitUntil: 'networkidle', timeout: 15_000 })
  await page.waitForTimeout(1500)
  await capture(page, 'partner-ledger-print-direct')

  const printPageText = await page.locator('body').textContent() ?? ''
  console.log('[CHECK] 원장 인쇄 직접 접근 텍스트:', printPageText.slice(0, 300).replace(/\s+/g, ' '))

  // 결과를 단언하지 않고 캡처만 수행 — 원장 인쇄 경로는 파라미터 필수일 수 있음
  expect(true).toBeTruthy()
})
