import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
/**
 * print-capture-supplement.spec.ts
 *
 * T3/T6/T7 인쇄 뷰 보완 캡처 — 실 슬립 ID + 올바른 /print/statement 라우트.
 * 기존 T3/T6/T7 에서 슬립 API 경로 오류(/api/v1/sales → /api/v1/slips) 로
 * slipId = 'test-slip-id' fallback 이 사용되어 인쇄 페이지가 로드 불가였음.
 * 실 슬립 ID 로 재캡처.
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { expect, test, type Page, type Route } from '@playwright/test'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5175'
const GATEWAY_URL = 'http://localhost:8080'
const ACCOUNTING_SERVICE_URL = 'http://localhost:8087'

const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_USER_NAME = '[DEV-SEED] 개발마스터'
const SALES_USER_ID = 'a0000000-0000-0000-0000-000000000004'
const SALES_USER_NAME = '[DEV-SEED] 개발영업'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
// resolveQaShotsDir 로 감싸 기본 실행이 커밋된 docs/qa/supplier-profile-bank-stamp/screenshots/
// 를 직접 덮어쓰지 않게 한다(기본 _local/ 격리, 2026-07-26 하네스 재수렴 라운드 G2 — 형제
// 파일 supplier-profile-bank-stamp-real-qa.spec.ts 만 이미 보호돼 있었다).
const SCREENSHOT_DIR = resolveQaShotsDir(
  path.resolve(_dirname, '../../../../docs/qa/supplier-profile-bank-stamp/screenshots'),
)

async function capture(page: Page, name: string): Promise<void> {
  const filePath = path.join(SCREENSHOT_DIR, `SUPP-${name}.png`)
  await page.screenshot({ path: filePath, fullPage: false })
  console.log(`[CAPTURE] ${filePath}`)
}

async function proxyToAccounting(route: Route, userId: string, userName: string, role: string): Promise<void> {
  const originalUrl = route.request().url()
  const urlObj = new URL(originalUrl)
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

async function injectAuthStub(page: Page, userId: string, userName: string, role: string): Promise<void> {
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

  const groupId = role === 'MASTER' ? '00000000-0000-0000-0000-000000000100' : '00000000-0000-0000-0000-000000000102'
  await page.addInitScript(
    (payload: { token: string; userId: string; role: string; fullName: string; partnerCode: null; groups: Array<{ id: string; name: string; builtin: boolean }> }) => {
      ;(window as unknown as Record<string, unknown>)['samhanAuth'] = {
        getToken: () => Promise.resolve(payload),
        setToken: (_auth: unknown) => Promise.resolve(),
        clearToken: () => Promise.resolve(),
      }
    },
    { token: realToken ?? 'stub-token', userId, role, fullName: userName, partnerCode: null, groups: [{ id: groupId, name: role === 'MASTER' ? '마스터' : '영업', builtin: true }] },
  )
}

async function setupPermissionStub(page: Page): Promise<void> {
  await page.route('**/permission-matrix/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, code: 'OK', data: { canAccess: true, canUpdate: true, canCreate: true, canDelete: true }, timestamp: new Date().toISOString() }) })
  })
  await page.route('**/accounts/*/permission-summary', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, code: 'OK', data: { pages: [] }, timestamp: new Date().toISOString() }) })
  })
}

// 실 슬립 ID (미리 확인된 값)
const REAL_SLIP_ID = '45d2db99-79c0-4c7d-a391-0d038fb27017'

test.describe('인쇄 뷰 보완 캡처 (실 슬립 ID)', () => {

  test('SUPP-T3: 거래명세서 인쇄 — 실 슬립 ID 계좌 푸터 + 공급자정보 반영', async ({ page }) => {
    await injectAuthStub(page, MASTER_USER_ID, MASTER_USER_NAME, 'MASTER')
    await setupPermissionStub(page)
    await page.route('**/api/v1/accounting/**', async (route) => {
      await proxyToAccounting(route, MASTER_USER_ID, MASTER_USER_NAME, 'MASTER')
    })

    await page.goto(`${BASE_URL}/#/sales/${REAL_SLIP_ID}/print/statement`)
    await page.waitForTimeout(5000)
    await capture(page, 'T3-statement-real-slip')

    const bodyText = await page.locator('body').innerText()
    const hasTel = bodyText.includes('02-3461') || bodyText.includes('3461')
    const hasBankInfo = bodyText.includes('국민은행') || bodyText.includes('기업은행') || bodyText.includes('계좌') || bodyText.includes('예금주')
    const hasCompanyName = bodyText.includes('삼한') || bodyText.includes('공조')

    console.log(`[SUPP-T3] 공급자명 포함: ${hasCompanyName}`)
    console.log(`[SUPP-T3] TEL 포함: ${hasTel}`)
    console.log(`[SUPP-T3] 계좌정보 포함: ${hasBankInfo}`)
    console.log(`[SUPP-T3] body 앞 500자:\n${bodyText.slice(0, 500)}`)

    // 결과 기록
    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, 'SUPP-T3-print-body-text.txt'),
      `hasCompanyName: ${hasCompanyName}\nhasTel: ${hasTel}\nhasBankInfo: ${hasBankInfo}\n\nbody:\n${bodyText.slice(0, 1000)}`,
      'utf-8',
    )
  })

  test('SUPP-T3b: 출고전표 인쇄 — DispatchView', async ({ page }) => {
    await injectAuthStub(page, MASTER_USER_ID, MASTER_USER_NAME, 'MASTER')
    await setupPermissionStub(page)
    await page.route('**/api/v1/accounting/**', async (route) => {
      await proxyToAccounting(route, MASTER_USER_ID, MASTER_USER_NAME, 'MASTER')
    })

    await page.goto(`${BASE_URL}/#/sales/${REAL_SLIP_ID}/print/dispatch`)
    await page.waitForTimeout(5000)
    await capture(page, 'T3b-sales-slip-dispatch-real-slip')

    const bodyText = await page.locator('body').innerText()
    const hasCompanyName = bodyText.includes('삼한') || bodyText.includes('공조')
    const hasBankInfo = bodyText.includes('국민은행') || bodyText.includes('기업은행') || bodyText.includes('계좌')
    const hasStamp = await page.locator('img[alt="인감"], img[data-testid="stamp-overlay"]').count()

    console.log(`[SUPP-T3b] 공급자명: ${hasCompanyName}`)
    console.log(`[SUPP-T3b] 계좌정보: ${hasBankInfo}`)
    console.log(`[SUPP-T3b] 인감 img 수: ${hasStamp}`)
    console.log(`[SUPP-T3b] body 앞 500자:\n${bodyText.slice(0, 500)}`)

    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, 'SUPP-T3b-sales-slip-dispatch-body-text.txt'),
      `hasCompanyName: ${hasCompanyName}\nhasBankInfo: ${hasBankInfo}\nstampImgCount: ${hasStamp}\n\nbody:\n${bodyText.slice(0, 1500)}`,
      'utf-8',
    )
  })

  test('SUPP-T7: exposed 토글 후 인쇄 — 실 슬립 ID 사용', async ({ page }) => {
    // T7 에서 DB 에 exposed=false(국민은행) 복원된 상태이므로 현 DB 상태 그대로 인쇄 확인
    await injectAuthStub(page, MASTER_USER_ID, MASTER_USER_NAME, 'MASTER')
    await setupPermissionStub(page)
    await page.route('**/api/v1/accounting/**', async (route) => {
      await proxyToAccounting(route, MASTER_USER_ID, MASTER_USER_NAME, 'MASTER')
    })

    await page.goto(`${BASE_URL}/#/sales/${REAL_SLIP_ID}/print/statement`)
    await page.waitForTimeout(5000)
    await capture(page, 'T7-statement-real-slip-current')

    const bodyText = await page.locator('body').innerText()
    console.log(`[SUPP-T7] 국민은행 포함: ${bodyText.includes('국민은행')}`)
    console.log(`[SUPP-T7] 기업은행 포함: ${bodyText.includes('기업은행')}`)

    fs.writeFileSync(
      path.join(SCREENSHOT_DIR, 'SUPP-T7-print-body.txt'),
      `KB bank: ${bodyText.includes('국민은행')}\nIBK bank: ${bodyText.includes('기업은행')}\n\nbody:\n${bodyText.slice(0, 1000)}`,
      'utf-8',
    )
  })

  test('SUPP-T9: SALES role 출고전표 인쇄 접근', async ({ page }) => {
    await injectAuthStub(page, SALES_USER_ID, SALES_USER_NAME, 'SALES')
    await page.route('**/permission-matrix/**', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, code: 'OK', data: { canAccess: true, canUpdate: false, canCreate: false, canDelete: false }, timestamp: new Date().toISOString() }) })
    })
    await page.route('**/accounts/*/permission-summary', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, code: 'OK', data: { pages: [] }, timestamp: new Date().toISOString() }) })
    })
    await page.route('**/api/v1/accounting/**', async (route) => {
      await proxyToAccounting(route, SALES_USER_ID, SALES_USER_NAME, 'SALES')
    })

    await page.goto(`${BASE_URL}/#/sales/${REAL_SLIP_ID}/print/dispatch`)
    await page.waitForTimeout(5000)
    await capture(page, 'T9-sales-slip-dispatch-print')

    const bodyText = await page.locator('body').innerText()
    const hasBankInfo = bodyText.includes('국민은행') || bodyText.includes('기업은행') || bodyText.includes('계좌')
    console.log(`[SUPP-T9] SALES 인쇄 페이지 계좌 표시: ${hasBankInfo}`)
    console.log(`[SUPP-T9] body 앞 300자: ${bodyText.slice(0, 300)}`)
  })
})
