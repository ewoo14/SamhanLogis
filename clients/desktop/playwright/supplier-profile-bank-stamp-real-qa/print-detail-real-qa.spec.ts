import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * print-detail-real-qa.spec.ts
 *
 * 인쇄 뷰 상세 캡처 — fullPage + 인쇄 영역 텍스트 추출.
 * T3/T7 계좌 푸터 실증 + 인감 img 확인.
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, type Page, type Route } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5175'
const GATEWAY_URL = 'http://localhost:8080'
const ACCOUNTING_SERVICE_URL = 'http://localhost:8087'

const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_USER_NAME = '[DEV-SEED] 개발마스터'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(
  _dirname,
  '../../../../docs/qa/supplier-profile-bank-stamp/screenshots',
))

const REAL_SLIP_ID = '45d2db99-79c0-4c7d-a391-0d038fb27017'

async function captureFullPage(page: Page, name: string): Promise<void> {
  const filePath = path.join(SCREENSHOT_DIR, `DETAIL-${name}.png`)
  await page.screenshot({ path: filePath, fullPage: true })
  console.log(`[CAPTURE] ${filePath}`)
}

async function proxyToAccounting(route: Route, userId: string, userName: string, role: string): Promise<void> {
  const urlObj = new URL(route.request().url())
  const realUrl = `${ACCOUNTING_SERVICE_URL}${urlObj.pathname}${urlObj.search}`
  const hdrs: Record<string, string> = {}
  for (const { name, value } of await route.request().headersArray()) {
    if (name.toLowerCase() !== 'host') hdrs[name] = value
  }
  hdrs['X-User-Id'] = userId
  hdrs['X-User-Name'] = userName
  hdrs['X-User-Role'] = role
  const postData = route.request().postData()
  try {
    const resp = await route.fetch({ url: realUrl, method: route.request().method(), headers: hdrs, body: postData ?? undefined })
    await route.fulfill({ response: resp })
  } catch {
    await route.abort()
  }
}

async function injectAuthStub(page: Page): Promise<void> {
  let realToken: string | null = null
  try {
    const resp = await fetch(`${GATEWAY_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginId: 'dev_master', password: (resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')) }),
    })
    const json = (await resp.json()) as { success: boolean; data?: { token?: string } }
    if (json.success && json.data?.token) realToken = json.data.token
  } catch { /* noop */ }

  await page.addInitScript(
    (payload: { token: string; userId: string; role: string; fullName: string; partnerCode: null; groups: Array<{ id: string; name: string; builtin: boolean }> }) => {
      ;(window as unknown as Record<string, unknown>)['samhanAuth'] = {
        getToken: () => Promise.resolve(payload),
        setToken: (_auth: unknown) => Promise.resolve(),
        clearToken: () => Promise.resolve(),
      }
    },
    {
      token: realToken ?? 'stub',
      userId: MASTER_USER_ID,
      role: 'MASTER',
      fullName: MASTER_USER_NAME,
      partnerCode: null,
      groups: [{ id: '00000000-0000-0000-0000-000000000100', name: '마스터', builtin: true }],
    },
  )
}

test.describe('인쇄 뷰 상세 캡처', () => {
  test('DETAIL-T3: 거래명세서 fullPage + 인쇄 영역 텍스트 실증', async ({ page }) => {
    await injectAuthStub(page)
    await page.route('**/permission-matrix/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, code: 'OK', data: { canAccess: true, canUpdate: true, canCreate: true, canDelete: true }, timestamp: new Date().toISOString() }) })
    })
    await page.route('**/accounts/*/permission-summary', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, code: 'OK', data: { pages: [] }, timestamp: new Date().toISOString() }) })
    })
    await page.route('**/api/v1/accounting/**', async (route) => {
      await proxyToAccounting(route, MASTER_USER_ID, MASTER_USER_NAME, 'MASTER')
    })

    await page.goto(`${BASE_URL}/#/sales/${REAL_SLIP_ID}/print/statement`)
    // 10초 대기 (react-query staleTime 내 API 응답 + 인쇄 렌더링 완료)
    await page.waitForTimeout(10000)

    // 인쇄 영역 찾기 — PrintLayout 이 data-testid="print-area" 또는 class="printArea" 로 마킹 가능
    const printArea = page.locator('[data-testid="print-area"], .print-page, .printPage, .printArea').first()
    const printAreaExists = await printArea.isVisible().catch(() => false)
    console.log(`[DETAIL-T3] print-area 존재: ${printAreaExists}`)

    if (printAreaExists) {
      const printText = await printArea.innerText()
      console.log(`[DETAIL-T3] 인쇄 영역 텍스트:\n${printText}`)
      fs.writeFileSync(path.join(SCREENSHOT_DIR, 'DETAIL-T3-print-area-text.txt'), printText, 'utf-8')
    }

    // 계좌 관련 element 직접 탐색
    const bankNotice = await page.locator('[data-testid="bank-notice"], .bankNotice, .bank-notice').innerText().catch(() => null)
    console.log(`[DETAIL-T3] bankNotice element: ${bankNotice}`)

    // img 태그 모두 확인
    const imgs = page.locator('img')
    const imgCount = await imgs.count()
    console.log(`[DETAIL-T3] img 수: ${imgCount}`)
    for (let i = 0; i < Math.min(imgCount, 5); i++) {
      const src = await imgs.nth(i).getAttribute('src')
      const alt = await imgs.nth(i).getAttribute('alt')
      console.log(`  img[${i}]: alt="${alt}" src="${(src ?? '').slice(0, 60)}"`)
    }

    // stamp img 직접 탐색
    const stampImgs = page.locator('img[alt*="인감"], img[alt*="stamp"]')
    const stampCount = await stampImgs.count()
    console.log(`[DETAIL-T3] 인감 img: ${stampCount}`)

    // fullPage 캡처
    await captureFullPage(page, 'T3-statement-full-page')

    // 전체 body 텍스트에서 예금주 키워드 탐색
    const allText = await page.locator('body').innerText()
    const bankIdx = allText.indexOf('예금주')
    const kbIdx = allText.indexOf('국민은행')
    const ibkIdx = allText.indexOf('기업은행')
    console.log(`[DETAIL-T3] 예금주 index: ${bankIdx}, 국민은행: ${kbIdx}, 기업은행: ${ibkIdx}`)

    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, 'DETAIL-T3-full-body.txt'),
      `bankNotice element: ${bankNotice}\n예금주 idx: ${bankIdx}\n국민은행 idx: ${kbIdx}\n기업은행 idx: ${ibkIdx}\n\nfull body:\n${allText}`,
      'utf-8',
    )
  })
})
