import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * §7 그룹웨어 결재 확장 — 결재유형 템플릿 빌더 + 동적 폼 + 첨부 실 서버 QA 스크린샷.
 *
 * [[no-fake-data-ever]] [[real-server-check-screenshot]]
 * - VITE_MOCK_MODE OFF — 실 게이트웨이 :8080 (page.route 프록시 + 실 JWT, dev_master).
 * - 결재유형 관리(/groupware/approval-templates) — V5 시드 지출결의서/휴가신청서 + 필드 빌더.
 * - 결재 작성(/groupware/approvals/new) — 지출결의서 선택 → 동적 필드 입력 + 전표 참조 첨부 → 생성.
 * - 상세 — 동적 fieldValues 렌더 + 첨부 링크 + approvalNo 슬래시.
 *
 * 실행: vite :5175(mock off);
 *   node_modules/.bin/playwright test --config playwright/groupware-approval-collab-real-qa/playwright.config.ts groupware-approval-templates-qa.spec.ts
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, expect, type Page } from '@playwright/test'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GW_URL = 'http://127.0.0.1:8080'
const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_ROLE = 'MASTER'
const MASTER_DISPLAY_NAME = '[DEV-SEED] 개발마스터'
/** 결재자 검색어 — 실 시드 조직도에 다수 존재하는 일반 성씨. */
const APPROVER_SEARCH_QUERY = '김'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/groupware-approval-templates'))
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

let n = 0
async function capture(page: Page, name: string): Promise<void> {
  n++
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${String(n).padStart(2, '0')}-${name}.png`), fullPage: false })
}

async function fetchRealToken(): Promise<string> {
  const http = await import('http')
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ loginId: 'dev_master', password: 'dev_p05_pass!' })
    const req = http.default.request(
      { hostname: '127.0.0.1', port: 8080, path: '/api/v1/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
      (res) => { let d = ''; res.on('data', (c) => { d += c }); res.on('end', () => {
        try { resolve(JSON.parse(d).data.token as string) } catch (e) { reject(new Error('token: ' + d)) } }) },
    )
    req.on('error', reject); req.write(body); req.end()
  })
}

async function installRealAuth(page: Page, token: string): Promise<void> {
  await page.addInitScript(({ t, userId, role, displayName }: { t: string; userId: string; role: string; displayName: string }) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => ({ token: t, userId, role, displayName, fullName: displayName }),
      setToken: async () => undefined, clearToken: async () => undefined } })
  }, { t: token, userId: MASTER_USER_ID, role: MASTER_ROLE, displayName: MASTER_DISPLAY_NAME })
}

async function setupApiProxy(page: Page, token: string): Promise<void> {
  await page.route(/:8080\//, async (route) => {
    const u = new URL(route.request().url())
    if (u.pathname.endsWith('/collab/stream')) { await route.abort(); return }
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
    } catch (err) { console.error('[PROXY]', realUrl, err); await route.abort() }
  })
}

async function gotoAndSettle(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {})
  await page.waitForTimeout(1_500)
}

test.describe('§7 그룹웨어 결재 확장 실 QA — 템플릿 빌더 + 동적 폼 + 첨부', () => {
  let realToken = ''
  test.beforeAll(async () => { realToken = await fetchRealToken() })

  test('결재유형 관리 → 결재 작성(동적 필드 + 전표 첨부) → 상세 렌더', async ({ page }) => {
    await installRealAuth(page, realToken)
    await setupApiProxy(page, realToken)

    // 1) 결재유형 관리 — V5 시드(지출결의서/휴가신청서) + 필드 빌더
    await gotoAndSettle(page, `${BASE_URL}/#/groupware/approval-templates?mockRole=MASTER`)
    await capture(page, 'template-admin')

    // 2) 결재 작성 — 유형 선택 → 동적 필드
    await gotoAndSettle(page, `${BASE_URL}/#/groupware/approvals/new?mockRole=MASTER`)
    await page.getByTestId('groupware-approval-create-template').selectOption({ label: '지출결의서' })
    await page.waitForTimeout(600)
    await page.getByTestId('groupware-approval-create-title').fill('실서버 QA — 6월 택배비 지출결의')
    await page.getByTestId('approver-search-input').fill(APPROVER_SEARCH_QUERY)
    await page.waitForTimeout(1_200) // debounce + approver-search 응답 대기
    await page.getByRole('listbox', { name: '결재자 검색 결과' }).getByRole('option').first().click({ timeout: 10_000 })
    await expect(page.getByTestId('approver-chip')).toHaveCount(1)
    // 동적 필드 (지출결의서: expenseItem/amount/account/spentAt/memo)
    await page.getByTestId('dynamic-approval-field-expenseItem').fill('택배비(6월)')
    await page.getByTestId('dynamic-approval-field-amount').fill('30000')
    await page.getByTestId('dynamic-approval-field-account').selectOption({ label: '복리후생비' }).catch(() => {})
    await page.getByTestId('dynamic-approval-field-spentAt').fill('2026-06-14')
    await page.getByTestId('dynamic-approval-field-memo').fill('실서버 QA — 동적 필드 입력 검증').catch(() => {})
    await page.waitForTimeout(300)
    await capture(page, 'create-dynamic-fields')

    // 3) 문서 참조 첨부 (다중) — 유형 선택 → 번호/키워드 자동완성 → 선택
    //   3a) 분개장(accounting) — "2027" 부분입력 → 실 분개 자동완성
    await page.getByRole('button', { name: '문서 참조 추가' }).click()
    await page.waitForTimeout(400)
    await page.getByTestId('doc-ref-type-select').first().selectOption({ label: '분개장' })
    await page.getByTestId('doc-ref-search-input').first().fill('2027')
    await page.waitForTimeout(1_200) // debounce + accounting 검색
    await page.getByTestId('doc-ref-search-option').first().scrollIntoViewIfNeeded().catch(() => {})
    await capture(page, 'doc-autocomplete-journal')
    await page.getByTestId('doc-ref-search-option').first().click()
    await page.waitForTimeout(500)
    //   3b) 출고전표(slip) — 두 번째 문서 참조(다중 동적)
    await page.getByRole('button', { name: '문서 참조 추가' }).click()
    await page.waitForTimeout(400)
    await page.getByTestId('doc-ref-type-select').nth(1).selectOption({ label: '출고전표' })
    await page.getByTestId('doc-ref-search-input').nth(1).fill('2026/06/08')
    await page.waitForTimeout(1_200)
    await page.getByTestId('doc-ref-search-option').first().click()
    await page.waitForTimeout(400)
    await capture(page, 'create-with-attachment')

    // 4) 생성 → 상세 이동
    await page.getByTestId('groupware-approval-create-submit').click()
    await page.waitForTimeout(2_000)
    await expect(page.getByTestId('groupware-approval-detail-no')).toBeVisible({ timeout: 10_000 })
    await capture(page, 'detail-after-create')

    // 5) 상세 — 동적 필드 + 첨부 렌더 (하단)
    await page.getByTestId('groupware-approval-collaboration-panel').scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(400)
    await capture(page, 'detail-fields-attachments')
  })
})
