import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 미리보기 표준화 슬라이스1 — 전자서명 결재문서 형식 실 QA 캡처.
 *
 * [[no-fake-data-ever]] [[real-server-check-screenshot]] [[feedback_qa_docker_real_test]]
 *
 * 검증 시나리오:
 *   C1: 입고전표 미리보기 — 출고전표와 통일된 전표 양식. 결재란 없음 + 전표번호 0제거
 *   C2: 견적 인쇄는 종합견적서 에픽에서 재작업(진입 버그 포함) — 슬라이스1 범위 외
 *   C3: 회귀 — 판매전표 미리보기는 작업지시서 양식으로 표시 + 전표번호 0제거 일관
 *
 * 실 시드 데이터 (괄호=저장 원본 전표번호 / 화면은 stripSlipNoZeros 적용값 표시):
 *   - INBOUND CONFIRMED: 1c72f28a-4aae-4f1c-8522-b7e9a921aa0d (2026/04/08-001 → 표시 2026/04/08-1)
 *   - OUTBOUND CONFIRMED: 6ceba0b4-4b3c-437a-9e03-866c9a6b596c (2026/02/18-001 → 표시 2026/02/18-1)
 *
 * 실행:
 *   cd clients/desktop
 *   node_modules/.bin/playwright test \
 *     playwright/print-preview-standardization/print-preview-standardization-real-qa.spec.ts \
 *     --config playwright.real-qa.config.ts --reporter=line
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, expect, type Page } from '@playwright/test'
import * as http from 'http'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GW_URL = 'http://127.0.0.1:8080'

// 실 시드 UUID
const INBOUND_SLIP_ID = '1c72f28a-4aae-4f1c-8522-b7e9a921aa0d'   // INBOUND CONFIRMED 2026/04/08-001
const OUTBOUND_SLIP_ID = '6ceba0b4-4b3c-437a-9e03-866c9a6b596c'  // OUTBOUND CONFIRMED 2026/02/18-001
const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_ROLE = 'MASTER'
const MASTER_DISPLAY_NAME = '[DEV-SEED] 개발마스터'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/print-preview-standardization'))
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true })

let seq = 0
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
    const body = JSON.stringify({ loginId: 'dev_master', password: (process.env.DEV_PASSWORD ?? '') })
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

async function suppressPrint(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.print = () => { console.log('[TEST] window.print() intercepted') }
  })
}

// ────────────────────────────────────────────────────────────────────────────
// C1: 매입 전표 미리보기 — 설정기반 결재란과 실 데이터 확인
// ────────────────────────────────────────────────────────────────────────────
test('C1: 매입 전표 미리보기 — 설정기반 결재란과 실 데이터 확인', async ({ page }) => {
  const token = await fetchRealToken()
  await installRealAuth(page, token)
  await setupApiProxy(page, token)
  await suppressPrint(page)

  const url = hashUrl(`/purchases/${INBOUND_SLIP_ID}/print/purchase`)
  console.log('[NAVIGATE]', url)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(2500)

  await capture(page, 'c1-inbound-slip-form-full')

  const bodyText = await page.locator('body').textContent() ?? ''
  console.log('[BODY SAMPLE]', bodyText.slice(0, 400).replace(/\s+/g, ' '))

  // 1) 매입 전표는 PrintLayout approvalDoc 이 아니라 설정기반 결재란을 렌더한다.
  const approvalDocSection = page.locator('[aria-label="전자서명 결재란"]')
  const approvalDocCount = await approvalDocSection.count()
  const hasApprovalGrid = bodyText.includes('결 재 란')
  console.log('[CHECK] 설정기반 결재란:', hasApprovalGrid)

  // 2) 매입 전표 본문이 실 데이터로 표시되어야 한다.
  const hasDocTitle = bodyText.includes('매 입 전 표') || bodyText.includes('매입 전표')
  console.log('[CHECK] 문서 제목:', hasDocTitle)
  const hasSlipNo = bodyText.includes('2026/04/08-1') || bodyText.includes('2026/04/08')
  console.log('[CHECK] 전표번호 표시:', hasSlipNo)
  const hasCompany = bodyText.includes('삼한공조')
  console.log('[CHECK] 회사명 표시:', hasCompany)
  const hasLineData = bodyText.includes('TEST-MODEL')
  console.log('[CHECK] 품목 실 데이터:', hasLineData)
  const hasTotal = bodyText.includes('합계')
  console.log('[CHECK] 합계 표시:', hasTotal)

  // 핵심 단언: 에러 페이지 false-green 방지 + 입고전표 통일 양식 확인.
  expect(bodyText).not.toContain('불러오지 못')
  expect(approvalDocCount).toBe(0)
  expect(hasApprovalGrid).toBeTruthy()
  expect(hasCompany).toBeTruthy()
  expect(hasDocTitle).toBeTruthy()
  expect(hasSlipNo).toBeTruthy()
  expect(hasLineData).toBeTruthy()
  expect(hasTotal).toBeTruthy()

  // 3) 전표번호 표시는 출고전표와 동일하게 번호부 선행 0을 제거(stripSlipNoZeros)해야 한다.
  //    날짜 영역 0은 보존, 마지막 `-` 뒤 번호부만 001 → 1. 저장 원본(2026/04/08-001)은 화면에 없어야 함.
  expect(bodyText).toContain('2026/04/08-1')
  expect(bodyText).not.toContain('2026/04/08-001')
})

// ────────────────────────────────────────────────────────────────────────────
// C2: 견적 인쇄는 종합견적서 에픽에서 재작업(진입 버그 포함) — 슬라이스1 범위 외.
// ────────────────────────────────────────────────────────────────────────────
// C3: 회귀 — 판매전표 미리보기는 작업지시서 양식으로 표시 + 전표번호 0제거 일관
// ────────────────────────────────────────────────────────────────────────────
test('C3: 회귀 — 판매전표 DispatchView 양식 표시 + 전표번호 0제거', async ({ page }) => {
  const token = await fetchRealToken()
  await installRealAuth(page, token)
  await setupApiProxy(page, token)
  await suppressPrint(page)

  const url = hashUrl(`/sales/${OUTBOUND_SLIP_ID}/print/dispatch`)
  console.log('[NAVIGATE]', url)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(2500)

  await capture(page, 'c3-sales-slip-dispatch-form-full')

  const bodyText = await page.locator('body').textContent() ?? ''
  console.log('[BODY SAMPLE]', bodyText.slice(0, 400).replace(/\s+/g, ' '))

  // 1) 판매전표 컨텐츠 표시 확인 (전표번호 또는 판매전표 화면명)
  //    화면 표시 전표번호는 stripSlipNoZeros 적용값(2026/02/18-1) — 저장 원본의 선행 0(-001)은 아님.
  const hasSlipContent = bodyText.includes('2026/02/18-1') || bodyText.includes('2026/02/18') || bodyText.includes('판매전표')
  console.log('[CHECK] 판매전표 컨텐츠:', hasSlipContent)

  // 2) 결재란 섹션이 없어야 함 (미적용 확인)
  const approvalSection = page.locator('[aria-label="전자서명 결재란"]')
  const approvalCount = await approvalSection.count()
  const hasNoApprovalSection = approvalCount === 0
  console.log('[CHECK] 전자서명 결재란 섹션 없음:', hasNoApprovalSection)

  // 3) print-approval-doc 클래스가 없어야 함
  const approvalDocEl = page.locator('.print-approval-doc')
  const approvalDocCount = await approvalDocEl.count()
  const hasNoApprovalDocClass = approvalDocCount === 0
  console.log('[CHECK] .print-approval-doc 없음:', hasNoApprovalDocClass)

  // 4) "전자서명으로 결재된 문서" 안내 없어야 함
  const hasNoApprovalNotice = !bodyText.includes('전자서명으로 결재된 문서')
  console.log('[CHECK] 전자서명 안내 없음:', hasNoApprovalNotice)

  // 5) 인쇄 버튼 존재 (PrintLayout 기본 액션 바는 유지)
  const printBtn = page.getByRole('button', { name: /인쇄/ })
  const hasPrintBtn = await printBtn.count() > 0
  console.log('[CHECK] 인쇄 버튼 존재:', hasPrintBtn)

  // 선행 단언: 판매전표 실 데이터가 로드되어야 함 — 에러/빈화면이 전자서명 결재문서 미적용 회귀검증을
  // false-green 으로 통과하는 것을 방지(데이터가 안 떠도 결재란이 없으니 PASS 되던 갭 차단).
  expect(bodyText).not.toContain('불러오지 못')
  expect(hasSlipContent).toBeTruthy()

  // 핵심 단언 1: 판매전표에 전자서명 결재문서 형식이 적용되지 않아야 함
  expect(hasNoApprovalSection && hasNoApprovalDocClass).toBeTruthy()

  // 핵심 단언 2: 전표번호 0제거(stripSlipNoZeros)가 입고전표와 일관되게 판매전표에도 적용 —
  //             2026/02/18-001(저장 원본) → 2026/02/18-1(표시).
  expect(bodyText).toContain('2026/02/18-1')
})
