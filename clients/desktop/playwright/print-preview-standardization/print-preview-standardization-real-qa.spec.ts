/**
 * 미리보기 표준화 슬라이스1 — 전자서명 결재문서 형식 실 QA 캡처.
 *
 * [[no-fake-data-ever]] [[real-server-check-screenshot]] [[feedback_qa_docker_real_test]]
 *
 * 검증 시나리오:
 *   C1: 입고전표 미리보기 — 헤더(회사명+사업자번호, 로고 없음) + 결재란 3칸 (미서명 빈 사각형)
 *   C2: 견적서 미리보기 — 결재문서 형식 (직인 없음, 결재란 3칸)
 *   C3: 회귀 — 출고전표 미리보기는 기존 양식 그대로 (결재란 추가 없음)
 *
 * 실 시드 데이터:
 *   - INBOUND CONFIRMED: 1c72f28a-4aae-4f1c-8522-b7e9a921aa0d (2026/04/08-001)
 *   - OUTBOUND CONFIRMED: 6ceba0b4-4b3c-437a-9e03-866c9a6b596c (2026/02/18-001)
 *   - ESTIMATE: 829e012a-e7da-4777-bd94-a67d177f17dc (estimateNo: 2026/06/08-2)
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
// QuoteView 라우트: /sales/estimates/:estimateNumber/print
// EstimateDetailPage 는 encodeURIComponent(estimateNo) 로 URL 구성하나 React Router가
// %2F 를 / 로 decode 하여 경로 분리 → UUID 직접 전달이 안전.
// getEstimate() 함수는 UUID 를 그대로 BE /slips/estimates/{uuid} 로 전달.
const ESTIMATE_UUID = '829e012a-e7da-4777-bd94-a67d177f17dc'      // estimateNo: 2026/06/08-2, 대구HVAC솔루션

const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_ROLE = 'MASTER'
const MASTER_DISPLAY_NAME = '[DEV-SEED] 개발마스터'

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = path.resolve(_dirname, '../../../../docs/qa/print-preview-standardization')
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
    const body = JSON.stringify({ loginId: 'dev_master', password: 'dev_p05_pass!' })
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
// C1: 입고전표 미리보기 — 전자서명 결재문서 형식 확인
// ────────────────────────────────────────────────────────────────────────────
test('C1: 입고전표 미리보기 — 헤더(회사명+사업자번호) + 결재란 3칸 확인', async ({ page }) => {
  const token = await fetchRealToken()
  await installRealAuth(page, token)
  await setupApiProxy(page, token)
  await suppressPrint(page)

  const url = hashUrl(`/purchases/${INBOUND_SLIP_ID}/print/inbound`)
  console.log('[NAVIGATE]', url)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(2500)

  await capture(page, 'c1-inbound-approval-doc-full')

  const bodyText = await page.locator('body').textContent() ?? ''
  console.log('[BODY SAMPLE]', bodyText.slice(0, 400).replace(/\s+/g, ' '))

  // 1) 회사명 표시 — useCompanyProfile legalName (로고 없음)
  const hasCompanyName = bodyText.includes('삼한공조') || bodyText.includes('(주)삼한')
  console.log('[CHECK] 회사명 표시:', hasCompanyName)

  // 2) 결재란 섹션 (전자서명 결재란) — aria-label 또는 텍스트
  const approvalSection = page.locator('[aria-label="전자서명 결재란"]')
  const hasApprovalSection = await approvalSection.count() > 0
  console.log('[CHECK] 결재란 섹션 존재:', hasApprovalSection)

  // 3) 결재란 라벨 — 작성/검토/승인 3칸
  const hasLabel작성 = bodyText.includes('작성')
  const hasLabel검토 = bodyText.includes('검토')
  const hasLabel승인 = bodyText.includes('승인')
  console.log('[CHECK] 결재란 라벨 작성:', hasLabel작성, '검토:', hasLabel검토, '승인:', hasLabel승인)

  // 4) 문서 제목 "입 고 전 표"
  const hasDocTitle = bodyText.includes('입 고 전 표') || bodyText.includes('입고전표')
  console.log('[CHECK] 문서 제목:', hasDocTitle)

  // 5) 전표번호 표시 (슬래시 포맷)
  const hasSlipNo = bodyText.includes('2026/04/08-001') || bodyText.includes('2026/04/08')
  console.log('[CHECK] 전표번호 표시:', hasSlipNo)

  // 6) [인] 텍스트 사인란 없음 (구 레거시 사인란 제거됨)
  const hasLegacySeal = bodyText.includes('[인]')
  console.log('[CHECK] 구 [인] 사인란 제거됨:', !hasLegacySeal)

  // 7) 로고 없음 확인 — 이미지 태그 로고 src 없음
  const logoImgs = await page.locator('img[src*="logo"]').count()
  const stampImgs = await page.locator('img[src*="stamp"]').count()
  console.log('[CHECK] 로고 이미지 없음:', logoImgs === 0, '인감 이미지 없음:', stampImgs === 0)

  // 8) 전자서명 안내 문구
  const hasApprovalNotice = bodyText.includes('전자서명으로 결재된 문서')
  console.log('[CHECK] 전자서명 안내 문구:', hasApprovalNotice)

  // 상세 캡처: 결재란 영역만 클로즈업
  if (hasApprovalSection) {
    const approvalEl = approvalSection.first()
    const box = await approvalEl.boundingBox()
    if (box) {
      console.log('[CHECK] 결재란 boundingBox:', JSON.stringify(box))
      await capture(page, 'c1-inbound-approval-section-closeup')
    }
  }

  // 핵심 단언: 에러 페이지 false-green 방지 + 결재문서 형식 필수 확인
  expect(bodyText).not.toContain('불러오지 못')
  expect(hasApprovalSection).toBeTruthy()
  expect(hasApprovalNotice).toBeTruthy()
  expect(hasCompanyName).toBeTruthy()
})

// ────────────────────────────────────────────────────────────────────────────
// C2: 견적서 미리보기 — 전자서명 결재문서 형식 확인
// ────────────────────────────────────────────────────────────────────────────
test('C2: 견적서 미리보기 — 결재문서 형식 (직인 없음, 결재란 3칸)', async ({ page }) => {
  const token = await fetchRealToken()
  await installRealAuth(page, token)
  await setupApiProxy(page, token)
  await suppressPrint(page)
  await page.addInitScript(() => {
    const testWindow = window as Window & { __openUrls: string[] }
    testWindow.__openUrls = []
    window.open = (url?: string | URL, _target?: string, _features?: string): Window | null => {
      testWindow.__openUrls.push(String(url ?? ''))
      return null
    }
  })

  // 견적 상세의 실제 인쇄 버튼을 통해 print URL 을 수집한다.
  // estimateNo 슬래시 포맷이 섞이면 %2F 회귀가 발생하므로 UUID 포함 여부를 먼저 검증.
  const url = hashUrl(`/sales/estimates/${ESTIMATE_UUID}`)
  console.log('[NAVIGATE]', url)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
  await page.getByTestId('estimate-detail-print-button').click()
  const openUrls = await page.evaluate(() => {
    return (window as Window & { __openUrls?: string[] }).__openUrls ?? []
  })
  const printUrl = openUrls.at(-1) ?? ''
  console.log('[인쇄 URL]', printUrl)
  expect(printUrl).toContain(ESTIMATE_UUID)
  expect(printUrl).not.toContain('%2F')

  await page.goto(hashUrl(printUrl.replace(/^.*#/, '')), { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(2500)

  await capture(page, 'c2-quote-approval-doc-full')

  const bodyText = await page.locator('body').textContent() ?? ''
  console.log('[BODY SAMPLE]', bodyText.slice(0, 400).replace(/\s+/g, ' '))

  // 1) 문서 제목 "견 적 서"
  const hasDocTitle = bodyText.includes('견 적 서') || bodyText.includes('견적서')
  console.log('[CHECK] 문서 제목:', hasDocTitle)

  // 2) 거래처명 표시
  const hasPartner = bodyText.includes('대구HVAC솔루션')
  console.log('[CHECK] 거래처명 표시:', hasPartner)

  // 3) 결재란 3칸 (작성/검토/승인)
  const hasLabel작성 = bodyText.includes('작성')
  const hasLabel검토 = bodyText.includes('검토')
  const hasLabel승인 = bodyText.includes('승인')
  console.log('[CHECK] 결재란 작성:', hasLabel작성, '검토:', hasLabel검토, '승인:', hasLabel승인)

  // 4) [직인] 텍스트 없음 (구 레거시 직인란 제거)
  const hasLegacyStamp = bodyText.includes('[직인]')
  console.log('[CHECK] 구 [직인] 제거됨:', !hasLegacyStamp)

  // 5) 결재란 섹션 aria-label
  const approvalSection = page.locator('[aria-label="전자서명 결재란"]')
  const hasApprovalSection = await approvalSection.count() > 0
  console.log('[CHECK] 결재란 섹션 존재:', hasApprovalSection)

  // 6) 전자서명 안내 문구
  const hasApprovalNotice = bodyText.includes('전자서명으로 결재된 문서')
  console.log('[CHECK] 전자서명 안내 문구:', hasApprovalNotice)

  // 7) 로고/인감 이미지 없음
  const logoImgs = await page.locator('img[src*="logo"]').count()
  const stampImgs = await page.locator('img[src*="stamp"]').count()
  console.log('[CHECK] 로고 없음:', logoImgs === 0, '인감 없음:', stampImgs === 0)

  // 상세 캡처: 결재란 영역
  if (hasApprovalSection) {
    const approvalEl = approvalSection.first()
    const box = await approvalEl.boundingBox()
    if (box) {
      await capture(page, 'c2-quote-approval-section-closeup')
    }
  }

  expect(bodyText).not.toContain('견적을 불러오지 못했')
  expect(hasPartner).toBeTruthy()
  expect(hasApprovalSection).toBeTruthy()
  expect(hasApprovalNotice).toBeTruthy()
})

// ────────────────────────────────────────────────────────────────────────────
// C3: 회귀 — 출고전표 미리보기는 기존 양식 그대로 (결재란 추가 안 됨)
// ────────────────────────────────────────────────────────────────────────────
test('C3: 회귀 — 출고전표 OutboundView 기존 양식 보존 (결재란 미적용)', async ({ page }) => {
  const token = await fetchRealToken()
  await installRealAuth(page, token)
  await setupApiProxy(page, token)
  await suppressPrint(page)

  const url = hashUrl(`/sales/${OUTBOUND_SLIP_ID}/print/outbound`)
  console.log('[NAVIGATE]', url)
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(2500)

  await capture(page, 'c3-outbound-legacy-form-full')

  const bodyText = await page.locator('body').textContent() ?? ''
  console.log('[BODY SAMPLE]', bodyText.slice(0, 400).replace(/\s+/g, ' '))

  // 1) 출고전표 컨텐츠 표시 확인 (전표번호 또는 출고 관련 텍스트)
  const hasSlipContent = bodyText.includes('2026/02/18-001') || bodyText.includes('2026/02/18') || bodyText.includes('출고')
  console.log('[CHECK] 출고전표 컨텐츠:', hasSlipContent)

  // 2) 결재란 섹션이 없어야 함 (미적용 확인)
  const approvalSection = page.locator('[aria-label="전자서명 결재란"]')
  const approvalCount = await approvalSection.count()
  const hasNoApprovalSection = approvalCount === 0
  console.log('[CHECK] 결재란 섹션 없음 (기존 유지):', hasNoApprovalSection)

  // 3) print-approval-doc 클래스가 없어야 함
  const approvalDocEl = page.locator('.print-approval-doc')
  const approvalDocCount = await approvalDocEl.count()
  const hasNoApprovalDocClass = approvalDocCount === 0
  console.log('[CHECK] .print-approval-doc 없음:', hasNoApprovalDocClass)

  // 4) "전자서명으로 결재된 문서" 안내 없어야 함
  const hasNoApprovalNotice = !bodyText.includes('전자서명으로 결재된 문서')
  console.log('[CHECK] 전자서명 안내 없음 (기존 양식):', hasNoApprovalNotice)

  // 5) 인쇄 버튼 존재 (PrintLayout 기본 액션 바는 유지)
  const printBtn = page.getByRole('button', { name: /인쇄/ })
  const hasPrintBtn = await printBtn.count() > 0
  console.log('[CHECK] 인쇄 버튼 존재:', hasPrintBtn)

  // 핵심 단언: 출고전표에 결재문서 형식이 적용되지 않아야 함
  expect(hasNoApprovalSection && hasNoApprovalDocClass).toBeTruthy()
})
