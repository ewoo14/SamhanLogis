import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * Phase 2 확장 — 세금계산서 발행번호 0제거 실 QA 캡처.
 *
 * [[no-fake-data-ever]] [[real-server-check-screenshot]] [[feedback_qa_docker_real_test]]
 *
 * 검증 시나리오:
 *   T1: 세금계산서 목록 — 발행번호가 yyyy/MM/dd-N (선행 0 없음) 형식으로 표시
 *       (V39 마이그레이션 운영 적용 + TaxInvoiceNumberService 신규 채번 모두 선행 0 없음)
 *
 * 실 시드 데이터 (V39 마이그레이션 보정 결과, GET /api/v1/accounting/tax-invoices 확인):
 *   - 2026/04/05-1  ISSUED  (주)삼한물류
 *   - 2026/04/15-1  ISSUED  한국통운(주)
 *   - 2026/04/25-1  ISSUED  동방물류(주)
 *   - ... 총 9건 ISSUED, 2건 DRAFT (발행번호 null)
 *
 * 실행:
 *   cd clients/desktop
 *   node_modules/.bin/playwright test \
 *     playwright/slip-no-zero-strip-global/tax-invoice-list-real-qa.spec.ts \
 *     --config playwright.real-qa.config.ts --reporter=line
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, expect, type Page } from '@playwright/test'
import * as http from 'http'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GW_URL = 'http://127.0.0.1:8080'

const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_ROLE = 'MASTER'
const MASTER_DISPLAY_NAME = '[DEV-SEED] 개발마스터'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/slip-no-zero-strip-global'))
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

let seq = 2  // 01/02 는 입고/출고 기존 캡처 — 03부터 시작
async function capture(page: Page, name: string): Promise<string> {
  seq++
  const file = path.join(SCREENSHOT_DIR, `${String(seq).padStart(2, '0')}-${name}.png`)
  await page.screenshot({ path: file, fullPage: true })
  console.log('[CAPTURE]', file)
  return file
}

function hashUrl(p: string): string {
  return `${BASE_URL}/#${p}`
}

async function fetchRealToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ loginId: 'dev_master', password: (resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')) })
    const req = http.request(
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
// T1: 세금계산서 목록 — 발행번호 0제거 화면 캡처
// ────────────────────────────────────────────────────────────────────────────
test('T1: 세금계산서 목록 — 발행번호 yyyy/MM/dd-N 형식 (선행 0 없음) 실 화면 캡처', async ({ page }) => {
  const token = await fetchRealToken()
  await installRealAuth(page, token)
  await setupApiProxy(page, token)

  const url = hashUrl('/accounting/tax-invoices')
  console.log('[NAVIGATE]', url)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(2500)

  // 전체 목록 화면 캡처 (핵심 산출물)
  await capture(page, 'tax-invoice-list-live')

  const bodyText = await page.locator('body').textContent() ?? ''
  console.log('[BODY SAMPLE]', bodyText.slice(0, 500).replace(/\s+/g, ' '))

  // 세금계산서 목록 테이블이 렌더링됐는지 확인
  const tableEl = page.locator('[data-testid="tax-invoice-list-table"]')
  const tableExists = await tableEl.count() > 0
  console.log('[CHECK] 목록 테이블 렌더링:', tableExists)

  // 발행번호가 선행 0 없는 형식으로 표시되는지 확인
  // V39 마이그레이션으로 9건 보정 — 2026/04/05-1 형식이 화면에 있어야 함
  const hasNoZeroPadNo = bodyText.includes('2026/04/05-1') ||
                         bodyText.includes('2026/04/15-1') ||
                         bodyText.includes('2026/05/03-1')
  console.log('[CHECK] 선행 0 없는 발행번호 표시:', hasNoZeroPadNo)

  // 구 zero-pad 형식이 화면에 없어야 함 (V39 보정 완료)
  const hasOldZeroPad = bodyText.includes('-001') || bodyText.includes('-0001')
  console.log('[CHECK] 구 zero-pad 형식 부재:', !hasOldZeroPad)

  // 에러 없이 목록 로드 확인
  const hasError = bodyText.includes('불러오지 못했습니다')
  console.log('[CHECK] 에러 없음:', !hasError)

  // 핵심 단언
  expect(hasError).toBe(false)
  expect(tableExists).toBe(true)
  expect(hasNoZeroPadNo).toBe(true)
  expect(hasOldZeroPad).toBe(false)
})
