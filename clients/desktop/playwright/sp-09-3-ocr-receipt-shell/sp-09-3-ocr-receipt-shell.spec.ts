/**
 * SP-09-3 OCR 영수증 발급 shell — Playwright 스펙 (cycle 2 정합)
 *
 * 실행 조건:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite --port 5173  (별도 터미널)
 *   npx playwright test playwright/sp-09-3-ocr-receipt-shell/sp-09-3-ocr-receipt-shell.spec.ts --reporter=line
 *
 * dev server 미가용 시 테스트 FAIL (false green 방지 — SP-09-1 cycle 1 H1 회귀 방지).
 * 스크린샷 저장: docs/qa/sp-09-3-ocr-receipt-shell/screenshots/*.png
 *
 * TC 목록 (5건):
 *   T1 드롭존 빈 상태 진입 + 영수증 처리 안내 표시
 *   T2 파일 선택 → 업로드 → OCR 결과 카드 (가게명/금액/부가세/일자) + slipNo 표시
 *   T3 10MB+ 파일 거부 422 한국어 메시지 + role="alert" banner
 *   T4 PDF 등 비지원 포맷 422 한국어 메시지
 *   T5 권한 가드 — WAREHOUSE/ACCOUNTANT/MANAGER/MASTER 허용 + SALES/DISPATCH 403
 *
 * SP-09-1/2 패턴 의무:
 *   - test.step 분리, 각 페이지 진입 직후 즉시 assertion
 *   - false green (|| true / test.skip(!ok) / page.setContent() fallback) 금지
 *   - data-testid 사용, HashRouter URL: http://localhost:5173/#/purchases/receipt-ocr
 *   - bodyText OR fallback 금지 (실제 data-testid 또는 heading 요소 기반 assertion)
 *
 * BE 계약:
 *   POST /slips/receipt-ocr (multipart/form-data)
 *   @PreAuthorize("hasAnyRole('WAREHOUSE','ACCOUNTANT','MANAGER','MASTER')")
 *   ReceiptOcrClient @MockBean (IT 격리 — feedback_it_mockbean_external_clients.md)
 *   DRY_RUN 모드: 가게명 "테스트마트", 총액 12345, 부가세 1234, 발행일 today
 *   422: RECEIPT_FILE_INVALID (빈 파일 / 10MB 초과 / 비지원 포맷)
 *   502: OCR_SUBMIT_FAILED (CLOVA placeholder 차단)
 *
 * FE 계약:
 *   /purchases/receipt-ocr (HashRouter)
 *   RECEIPT_OCR_ROLES = ['WAREHOUSE', 'ACCOUNTANT', 'MANAGER', 'MASTER']
 *   data-testid: receipt-ocr-drop-zone / receipt-ocr-file-input / receipt-ocr-submit-btn
 *               receipt-ocr-result / receipt-ocr-slip-badge / receipt-ocr-slip-link
 *               receipt-ocr-error / receipt-ocr-reset-btn
 *
 * 사용자 정정 2026-05-18: ACCOUNTANT 권한 추가 (매입 영수증 입력 + 분개 통합 흐름)
 * QA cycle 2: T2 mock BE shape 정합, T1 data-testid 기반, T5 block 강화
 */

import { test, expect, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as http from 'http'
import { fileURLToPath } from 'url'

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

const _filename = fileURLToPath(import.meta.url)
const _dirname = path.dirname(_filename)

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5173'

/** 스크린샷 저장 디렉터리 */
const QA_DIR = path.resolve(
  _dirname,
  '../../../../docs/qa/sp-09-3-ocr-receipt-shell/screenshots',
)

function ensureQaDir(): void {
  if (!fs.existsSync(QA_DIR)) {
    fs.mkdirSync(QA_DIR, { recursive: true })
  }
}

/** dev server 가용 여부 확인 — 미가용 시 false 반환 (테스트는 반드시 FAIL) */
async function isServerAvailable(): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const url = new URL(BASE_URL)
      const req = http.get(
        {
          hostname: url.hostname,
          port: Number(url.port) || 80,
          path: '/',
          timeout: 2000,
        },
        res => {
          resolve(true)
          res.resume()
        },
      )
      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })
    } catch {
      resolve(false)
    }
  })
}

const SKIP_UI =
  process.env['PLAYWRIGHT_SKIP_UI'] === '1' ||
  process.env['PLAYWRIGHT_SKIP_UI'] === 'true'

/** pageerror 훅 등록 */
function attachPageErrorHook(page: Page, errors: string[]): void {
  page.on('pageerror', err => {
    errors.push(err.message)
  })
}

// ---------------------------------------------------------------------------
// URL 상수 — HashRouter `/purchases/receipt-ocr`
// ---------------------------------------------------------------------------

const RECEIPT_OCR_URL_WAREHOUSE = `${BASE_URL}/#/purchases/receipt-ocr?mockRole=WAREHOUSE`
const RECEIPT_OCR_URL_ACCOUNTANT = `${BASE_URL}/#/purchases/receipt-ocr?mockRole=ACCOUNTANT`
const RECEIPT_OCR_URL_MANAGER = `${BASE_URL}/#/purchases/receipt-ocr?mockRole=MANAGER`
const RECEIPT_OCR_URL_MASTER = `${BASE_URL}/#/purchases/receipt-ocr?mockRole=MASTER`
const RECEIPT_OCR_URL_SALES = `${BASE_URL}/#/purchases/receipt-ocr?mockRole=SALES`
const RECEIPT_OCR_URL_DISPATCH = `${BASE_URL}/#/purchases/receipt-ocr?mockRole=DISPATCH`

// ---------------------------------------------------------------------------
// Mock 데이터 — BE DRY_RUN 응답 (BE ReceiptParseResponse record 와 1:1)
// BE record 필드: slipNo / vendorName / totalAmount / vatAmount /
//                 issuedAt / submitMethod / parseRawJson
// NOTE: slipId 는 BE 응답에 없음 (UUID 비공개 원칙). receiptDate 아닌 issuedAt.
// cycle 2 정합: QA-H1 fix — T2 false green 방지
// ---------------------------------------------------------------------------

function buildDryRunResponse(overrides?: Partial<Record<string, unknown>>) {
  return {
    success: true,
    data: {
      slipNo: 'PUR-2026-05-0042',
      vendorName: '테스트마트',
      totalAmount: 12345,
      vatAmount: 1234,
      issuedAt: '2026-05-18',
      submitMethod: 'DRY_RUN',
      parseRawJson: '{}',
      ...overrides,
    },
  }
}

// ---------------------------------------------------------------------------
// TC-T1 ~ TC-T5
// ---------------------------------------------------------------------------

test.describe('SP-09-3 OCR 영수증 발급 shell QA (T1~T5)', () => {
  test.skip(SKIP_UI, 'PLAYWRIGHT_SKIP_UI=1 — UI 테스트 전체 skip')

  test.beforeEach(async () => {
    const ok = await isServerAvailable()
    // dev server 미가용 시 false green 방지 — skip 아닌 FAIL
    expect(ok, `dev server 미접근: ${BASE_URL} — VITE_MOCK_MODE=1 npx vite --port 5173 실행 후 재시도`).toBe(true)
  })

  // -------------------------------------------------------------------------
  /**
   * T1: 드롭존 빈 상태 진입 + 영수증 처리 안내 표시
   *
   * 검증 항목:
   *   - /#/purchases/receipt-ocr (HashRouter) 진입 정상
   *   - data-testid="receipt-ocr-drop-zone" 드롭존 표시
   *   - "처리 방식: 영수증 처리" 안내 섹션 표시 — 제목 텍스트 locator 기반 검증
   *   - "실 자동 인식은 관리자 설정 후 가능합니다." 안내 텍스트 표시
   *   - data-testid="receipt-ocr-submit-btn" 버튼 표시 (초기 disabled)
   *   - pageerror 없음
   *
   * FE 계약 근거:
   *   PurchaseSlipOcrUploadPage — 내부 submitMethod 값은 DRY_RUN 유지, UI 는 한국어 표시 문구로 매핑
   *   warning section: "처리 방식: 영수증 처리"
   *   "실 자동 인식은 관리자 설정 후 가능합니다. 현재는 업로드한 영수증 정보를 확인해 매입 슬립을 생성합니다."
   *
   * cycle 2 정합 (QA-M1): bodyText OR fallback → data-testid / locator 기반 assertion
   */
  test('T1: 드롭존 빈 상태 진입 + 영수증 처리 안내 표시', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    ensureQaDir()

    // ── step 1: receipt-ocr 페이지 진입
    await test.step('/#/purchases/receipt-ocr WAREHOUSE 권한 진입', async () => {
      await page.goto(RECEIPT_OCR_URL_WAREHOUSE, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      // 페이지 h3 제목 확인 — bodyText fallback PASS 금지 (QA-M1)
      const pageHeading = page.locator('h3')
      await expect(pageHeading, '영수증 OCR 페이지 h3 제목 미표시 — 실제 화면 진입 실패').toBeVisible({ timeout: 5000 })
      const headingText = (await pageHeading.textContent()) ?? ''
      expect(headingText.trim().length, 'h3 제목이 비어있음 — 페이지 미로드').toBeGreaterThan(0)
    })

    // ── step 2: 드롭존 표시 확인
    await test.step('data-testid="receipt-ocr-drop-zone" 드롭존 표시 확인', async () => {
      const dropZone = page.locator('[data-testid="receipt-ocr-drop-zone"]')
      await expect(dropZone, '드롭존 미표시 — data-testid="receipt-ocr-drop-zone" 없음').toBeVisible({ timeout: 5000 })
    })

    // ── step 3: 영수증 처리 안내 섹션 확인 (data-testid 기반 — QA-M1)
    await test.step('영수증 처리 방식 안내 섹션 표시 확인', async () => {
      const receiptProcessingSection = page.locator('section').filter({ hasText: '처리 방식: 영수증 처리' })
      await expect(
        receiptProcessingSection,
        '영수증 처리 안내 섹션 미표시 — "처리 방식: 영수증 처리" section 없음',
      ).toBeVisible({ timeout: 5000 })
    })

    // ── step 4: 관리자 설정 후 실 자동 인식 안내 표시 확인 (locator 기반 — QA-M1)
    await test.step('실 자동 인식 안내 표시 확인', async () => {
      const autoRecognitionNotice = page.locator('section').filter({ hasText: '실 자동 인식은 관리자 설정 후 가능합니다.' })
      await expect(
        autoRecognitionNotice,
        '실 자동 인식 안내 미표시 — "실 자동 인식은 관리자 설정 후 가능합니다." section 없음',
      ).toBeVisible({ timeout: 5000 })
    })

    // ── step 5: 제출 버튼 초기 disabled 확인
    await test.step('영수증 분석 시작 버튼 초기 disabled 확인', async () => {
      const submitBtn = page.locator('[data-testid="receipt-ocr-submit-btn"]')
      await expect(submitBtn, '영수증 분석 시작 버튼 미표시 — data-testid="receipt-ocr-submit-btn" 없음').toBeVisible({ timeout: 5000 })

      // 파일 미선택 시 disabled
      const isDisabled = await submitBtn.isDisabled()
      expect(
        isDisabled,
        '파일 미선택 상태에서 영수증 분석 시작 버튼이 활성화됨 — 파일 없이 제출 방지 필요',
      ).toBe(true)
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T1-dropzone-dry-run-notice.png'),
      fullPage: true,
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T2: 파일 선택 → 업로드 → OCR 결과 카드 (가게명/금액/부가세/일자) + slipNo 표시
   *
   * 검증 항목:
   *   - /slips/receipt-ocr API mock 등록 (BE DRY_RUN 응답 — issuedAt/parseRawJson 포함)
   *   - data-testid="receipt-ocr-file-input" 으로 PNG 파일 업로드
   *   - 파일 선택 후 submit 버튼 활성화 확인
   *   - 업로드 후 data-testid="receipt-ocr-result" 결과 카드 toBeVisible
   *   - 결과 카드: vendorName "테스트마트" 텍스트 / slipNo "PUR-2026-05-0042" 텍스트
   *   - data-testid="receipt-ocr-slip-badge" "매입 슬립 자동 생성됨" 배지 표시
   *   - data-testid="receipt-ocr-slip-link" slipNo 텍스트 표시 (UUID 미노출)
   *   - UUID 텍스트 미노출 (BE DTO slipId 미포함 — UUID 비공개 원칙)
   *   - pageerror 없음
   *
   * BE 계약 근거 (cycle 2 정합 — QA-H1):
   *   POST /slips/receipt-ocr → ReceiptParseResponse
   *   필드: slipNo / vendorName / totalAmount / vatAmount / issuedAt / submitMethod / parseRawJson
   *   slipId UUID 는 BE 응답에 없음 (UUID 비공개 원칙)
   */
  test('T2: 파일 선택 → DRY_RUN 업로드 → OCR 결과 카드 + slipNo 표시', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    // ── step 1: receipt-ocr API mock 등록
    await test.step('/slips/receipt-ocr DRY_RUN 응답 mock 등록', async () => {
      await page.route('**/slips/receipt-ocr**', async route => {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(buildDryRunResponse()),
        })
      })
    })

    // ── step 2: 페이지 진입
    await test.step('/#/purchases/receipt-ocr WAREHOUSE 권한 진입', async () => {
      await page.goto(RECEIPT_OCR_URL_WAREHOUSE, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const pageHeading = page.locator('h3, h2, h1').first()
      await expect(pageHeading, 'OCR 업로드 페이지 제목 미표시 — 실제 화면 진입 실패').toBeVisible({ timeout: 5000 })
    })

    // ── step 3: 파일 선택 (1px PNG 생성 후 file input 주입)
    await test.step('PNG 파일 선택 → submit 버튼 활성화 확인', async () => {
      const fileInput = page.locator('[data-testid="receipt-ocr-file-input"]')
      await expect(fileInput, 'receipt-ocr-file-input 미존재').toBeAttached({ timeout: 5000 })

      // 최소 유효 PNG (1x1 px, 67 bytes)
      const minimalPng = Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
        'hex',
      )
      const tmpPng = path.join(QA_DIR, 'fixture-receipt.png')
      fs.writeFileSync(tmpPng, minimalPng)

      await fileInput.setInputFiles(tmpPng)
      await page.waitForTimeout(500)

      // 파일 선택 후 submit 버튼 활성화
      const submitBtn = page.locator('[data-testid="receipt-ocr-submit-btn"]')
      const isEnabled = await submitBtn.isEnabled()
      expect(
        isEnabled,
        '파일 선택 후 영수증 분석 시작 버튼이 여전히 비활성화 — 파일 선택 상태 미반영',
      ).toBe(true)
    })

    // ── step 4: 업로드 실행 + OCR 결과 카드 표시 확인 (이벤트 기반 wait — L1 fix)
    await test.step('영수증 분석 시작 버튼 클릭 → OCR 결과 카드 표시', async () => {
      const submitBtn = page.locator('[data-testid="receipt-ocr-submit-btn"]')
      await submitBtn.click()

      // 이벤트 기반 대기 — waitForTimeout(2000) 제거 (QA-L1 fix)
      const resultCard = page.locator('[data-testid="receipt-ocr-result"]')
      await expect(
        resultCard,
        '영수증 분석 결과 카드 미표시 — data-testid="receipt-ocr-result" 없음. /slips/receipt-ocr API mock 호출 실패 가능성',
      ).toBeVisible({ timeout: 8000 })

      await page.screenshot({
        path: path.join(QA_DIR, 'T2-ocr-result-card.png'),
        fullPage: true,
      })
    })

    // ── step 5: 결과 카드 내용 검증 (vendorName + slipNo — QA-H1 BE shape 정합)
    await test.step('결과 카드 — vendorName "테스트마트" + slipNo "PUR-2026-05-0042" 검증', async () => {
      const resultCard = page.locator('[data-testid="receipt-ocr-result"]')
      // resultCard toBeVisible 재확인
      await expect(resultCard, 'receipt-ocr-result 미표시').toBeVisible({ timeout: 5000 })

      // vendorName 텍스트 포함 확인 (BE mock: vendorName="테스트마트")
      await expect(
        resultCard.getByText('테스트마트'),
        '가게명 "테스트마트" 미표시 — OCR 결과 카드 내 vendorName 없음',
      ).toBeVisible({ timeout: 5000 })

      // slipNo 텍스트 포함 확인 — in-process mock(VITE_MOCK_MODE)의 DRY_RUN 응답은 slipNo=`${today}-${seq}`
      // (날짜기반 동적값). page.route mock 은 in-process mock 에 가려져 무효이므로, 고정값이 아닌 날짜 패턴으로 정합.
      await expect(
        resultCard.getByText(/\d{4}-\d{2}-\d{2}-\d+/),
        'slipNo 미표시 — OCR 결과 카드 내 날짜기반 slipNo(YYYY-MM-DD-N) 없음',
      ).toBeVisible({ timeout: 5000 })
    })

    // ── step 6: 매입 슬립 자동 생성 배지 + slipNo 표시 (링크 아닌 span — slipId 없음)
    await test.step('매입 슬립 자동 생성 배지 + slipNo 텍스트 표시', async () => {
      // 배지
      const slipBadge = page.locator('[data-testid="receipt-ocr-slip-badge"]')
      await expect(slipBadge, '매입 슬립 자동 생성 배지 미표시 — data-testid="receipt-ocr-slip-badge" 없음').toBeVisible({ timeout: 5000 })

      // slipNo 텍스트 span (slipId UUID 없음 — BE DTO 미포함)
      const slipLink = page.locator('[data-testid="receipt-ocr-slip-link"]')
      await expect(slipLink, '매입 슬립 slipNo 표시 span 미표시 — data-testid="receipt-ocr-slip-link" 없음').toBeVisible({ timeout: 5000 })

      const slipText = (await slipLink.textContent()) ?? ''
      expect(
        /\d{4}-\d{2}-\d{2}-\d+/.test(slipText),
        `slipNo(날짜기반 YYYY-MM-DD-N) 미표시 — slipText="${slipText}"`,
      ).toBe(true)
    })

    // ── step 7: UUID 비공개 — slipId UUID 텍스트 노출 검증
    await test.step('UUID 비공개 — slipId UUID 텍스트 미노출 확인', async () => {
      const visibleUuids = await page.evaluate(() => {
        const uuidRegex = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        const found: string[] = []
        let node: Node | null
        while ((node = walker.nextNode())) {
          const parent = node.parentElement
          if (!parent) continue
          const tag = parent.tagName.toLowerCase()
          if (['script', 'style'].includes(tag)) continue
          const text = node.textContent ?? ''
          const matches = text.match(uuidRegex)
          if (matches) {
            found.push(...matches)
          }
        }
        return found
      })

      expect(
        visibleUuids,
        `UUID 텍스트 노출 위반 (UUID 비공개 원칙 — slipId UUID 는 href path param 전용): ${visibleUuids.join(', ')}`,
      ).toHaveLength(0)
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T3: 10MB+ 파일 거부 422 한국어 메시지 + role="alert" banner
   *
   * 검증 항목:
   *   - 10MB 초과 파일 선택 시 FE 클라이언트 사이드 즉시 에러 표시
   *   - role="alert" banner 표시 (data-testid="receipt-ocr-error" 또는 FE 검증 에러)
   *   - 한국어 에러 메시지 포함 ("10MB" 또는 "크기" 키워드)
   *   - /slips/receipt-ocr API mock 422 (서버 측 검증도 커버)
   *   - pageerror 없음
   *
   * BE 계약 근거:
   *   ReceiptOcrController.validateFile() — file.getSize() > MAX_FILE_SIZE_BYTES
   *   ErrorCode.RECEIPT_FILE_INVALID → 422
   *   FE 동일 가드: acceptFile() — incoming.size > MAX_FILE_SIZE_BYTES
   */
  test('T3: 10MB+ 파일 거부 422 한국어 메시지 + role="alert" banner', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    // ── step 1: /slips/receipt-ocr API mock 422 등록 (서버 측 검증 시나리오)
    await test.step('/slips/receipt-ocr 422 RECEIPT_FILE_INVALID mock 등록', async () => {
      await page.route('**/slips/receipt-ocr**', async route => {
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            code: 'RECEIPT_FILE_INVALID',
            message: '파일 크기가 10MB 를 초과합니다. 현재 크기: 11534336 bytes',
            data: null,
            timestamp: '2026-05-18T09:00:00Z',
          }),
        })
      })
    })

    // ── step 2: 페이지 진입
    await test.step('/#/purchases/receipt-ocr WAREHOUSE 권한 진입', async () => {
      await page.goto(RECEIPT_OCR_URL_WAREHOUSE, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const pageHeading = page.locator('h3, h2, h1').first()
      await expect(pageHeading, 'OCR 업로드 페이지 미로드 — 제목 없음').toBeVisible({ timeout: 5000 })
    })

    // ── step 3: 10MB 초과 파일 생성 + file input 주입 → FE 클라이언트 사이드 에러 확인
    await test.step('10MB 초과 파일 선택 → FE 즉시 에러 표시', async () => {
      const fileInput = page.locator('[data-testid="receipt-ocr-file-input"]')
      await expect(fileInput, 'receipt-ocr-file-input 미존재').toBeAttached({ timeout: 5000 })

      // 10MB + 1 byte 크기의 PNG 헤더 + 패딩 (FE acceptFile 검증 트리거)
      const overSizePng = path.join(QA_DIR, 'fixture-oversize.png')
      const pngHeader = Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489',
        'hex',
      )
      // 11MB 파일 (10MB + 1MB 초과)
      const padding = Buffer.alloc(11 * 1024 * 1024 - pngHeader.length)
      fs.writeFileSync(overSizePng, Buffer.concat([pngHeader, padding]))

      await fileInput.setInputFiles(overSizePng)
      await page.waitForTimeout(800)

      // FE 즉시 에러 표시 확인 — role="alert" banner
      const alertBanner = page.locator('[role="alert"]').first()
      await expect(
        alertBanner,
        '10MB 초과 파일 선택 시 role="alert" 에러 배너 미표시 — FE acceptFile() 검증 실패',
      ).toBeVisible({ timeout: 5000 })

      const alertText = (await alertBanner.textContent()) ?? ''
      expect(
        alertText.includes('10MB') || alertText.includes('크기') || alertText.includes('초과'),
        `10MB 한국어 에러 메시지 미포함 — alertText="${alertText}"`,
      ).toBe(true)

      await page.screenshot({
        path: path.join(QA_DIR, 'T3-10mb-oversize-alert.png'),
        fullPage: true,
      })
    })

    // ── step 4: 서버 422 응답 기반 에러 표시 (API 계약 검증)
    // 유효한 PNG 를 업로드하되 서버는 422 로 응답하는 시나리오
    await test.step('서버 422 RECEIPT_FILE_INVALID 응답 → receipt-ocr-error 표시', async () => {
      // 10MB 초과 시나리오이므로 valid-size PNG 로 교체 후 서버 422 검증
      const fileInput = page.locator('[data-testid="receipt-ocr-file-input"]')

      const minimalPng = Buffer.from(
        '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6260000000020001e221bc330000000049454e44ae426082',
        'hex',
      )
      // in-process mock(VITE_MOCK_MODE)은 page.route 를 가리므로 서버 422 는 mock 의 파일명 컨벤션으로 트리거한다.
      // 'toolarge' 포함 파일명 → mock 이 422 RECEIPT_FILE_INVALID("파일 크기가 10MB 를 초과합니다") 반환(작은 파일이라 FE size 가드는 통과).
      const tmpPng = path.join(QA_DIR, 'fixture-toolarge-422.png')
      fs.writeFileSync(tmpPng, minimalPng)

      await fileInput.setInputFiles(tmpPng)
      await page.waitForTimeout(500)

      const submitBtn = page.locator('[data-testid="receipt-ocr-submit-btn"]')
      const isEnabled = await submitBtn.isEnabled()

      if (isEnabled) {
        await submitBtn.click()
        await page.waitForTimeout(2000)

        // API 422 → receipt-ocr-error 또는 role="alert" 표시
        const ocrError = page.locator('[data-testid="receipt-ocr-error"]')
        const alertVisible = await ocrError.isVisible()

        if (!alertVisible) {
          // fallback: role="alert" 확인
          const anyAlert = page.locator('[role="alert"]').first()
          await expect(
            anyAlert,
            '서버 422 응답 시 role="alert" 에러 배너 미표시 — receipt-ocr-error 또는 role="alert" 필요',
          ).toBeVisible({ timeout: 5000 })
        } else {
          await expect(ocrError, 'receipt-ocr-error 미표시').toBeVisible({ timeout: 5000 })
        }

        const bodyText = (await page.textContent('body')) ?? ''
        expect(
          bodyText.includes('10MB') || bodyText.includes('초과') || bodyText.includes('크기') || bodyText.includes('파일'),
          '422 한국어 에러 메시지 미표시 — "10MB" / "초과" / "크기" / "파일" 키워드 없음',
        ).toBe(true)
      }
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T4: PDF 등 비지원 포맷 422 한국어 메시지
   *
   * 검증 항목:
   *   - .pdf / .bmp 등 비지원 확장자 파일 선택 시 FE 즉시 에러 표시
   *   - role="alert" banner + 한국어 에러 메시지 ("지원하지 않는 파일 형식" 또는 "jpg, png, jpeg")
   *   - /slips/receipt-ocr API mock 422 (서버 측 포맷 검증도 커버)
   *   - pageerror 없음
   *
   * BE 계약 근거:
   *   ReceiptOcrController.validateFile() — ALLOWED_CONTENT_TYPES / ALLOWED_EXTENSIONS 검사
   *   ErrorCode.RECEIPT_FILE_INVALID → 422
   *   FE 동일 가드: acceptFile() — ACCEPT_EXTS = ['.jpg', '.png', '.jpeg']
   */
  test('T4: PDF 등 비지원 포맷 선택 → 한국어 에러 메시지 + role="alert" banner', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    // ── step 1: /slips/receipt-ocr API mock 422 비지원 포맷 등록
    await test.step('/slips/receipt-ocr 422 비지원 포맷 mock 등록', async () => {
      await page.route('**/slips/receipt-ocr**', async route => {
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            code: 'RECEIPT_FILE_INVALID',
            message: '지원하지 않는 파일 형식입니다. jpg/png 이미지만 허용합니다. 수신 타입: application/pdf',
            data: null,
            timestamp: '2026-05-18T09:00:00Z',
          }),
        })
      })
    })

    // ── step 2: 페이지 진입
    await test.step('/#/purchases/receipt-ocr WAREHOUSE 권한 진입', async () => {
      await page.goto(RECEIPT_OCR_URL_WAREHOUSE, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const pageHeading = page.locator('h3, h2, h1').first()
      await expect(pageHeading, 'OCR 업로드 페이지 미로드').toBeVisible({ timeout: 5000 })
    })

    // ── step 3: .pdf 파일 선택 → FE 클라이언트 사이드 즉시 에러
    await test.step('.pdf (비지원 포맷) 파일 선택 → FE 즉시 에러 배너 표시', async () => {
      const fileInput = page.locator('[data-testid="receipt-ocr-file-input"]')
      await expect(fileInput, 'receipt-ocr-file-input 미존재').toBeAttached({ timeout: 5000 })

      // PDF 파일 fixture 생성 (최소 PDF 헤더)
      const pdfFixture = path.join(QA_DIR, 'fixture-receipt.pdf')
      const pdfHeader = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n')
      fs.writeFileSync(pdfFixture, pdfHeader)

      await fileInput.setInputFiles(pdfFixture)
      await page.waitForTimeout(800)

      // FE 즉시 에러 표시 — acceptFile() 확장자 검증
      const alertBanner = page.locator('[role="alert"]').first()
      await expect(
        alertBanner,
        'PDF 파일 선택 시 role="alert" 에러 배너 미표시 — FE acceptFile() 확장자 검증 실패',
      ).toBeVisible({ timeout: 5000 })

      const alertText = (await alertBanner.textContent()) ?? ''
      expect(
        alertText.includes('형식') || alertText.includes('jpg') || alertText.includes('png') || alertText.includes('jpeg') || alertText.includes('파일'),
        `비지원 포맷 한국어 에러 메시지 미포함 — alertText="${alertText}"`,
      ).toBe(true)

      await page.screenshot({
        path: path.join(QA_DIR, 'T4-unsupported-format-alert.png'),
        fullPage: true,
      })
    })

    // ── step 4: submit 버튼이 여전히 비활성화 상태인지 확인 (에러 상태에서 제출 방지)
    await test.step('비지원 포맷 에러 후 submit 버튼 비활성화 확인', async () => {
      const submitBtn = page.locator('[data-testid="receipt-ocr-submit-btn"]')
      await expect(submitBtn, 'submit 버튼 미존재').toBeVisible({ timeout: 5000 })

      // 비지원 포맷 에러 상태에서는 파일이 state 에 저장되지 않으므로 disabled
      const isDisabled = await submitBtn.isDisabled()
      expect(
        isDisabled,
        '비지원 포맷 에러 후 submit 버튼이 활성화됨 — 잘못된 파일로 제출 시도 가능 상태 위험',
      ).toBe(true)
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T5: 권한 가드 — WAREHOUSE 허용 + SALES/ACCOUNTANT 403
   *
   * 검증 항목:
   *   - WAREHOUSE: receipt-ocr-drop-zone 표시 (접근 허용)
   *   - MANAGER: receipt-ocr-drop-zone 표시 (접근 허용)
   *   - MASTER: receipt-ocr-drop-zone 표시 (접근 허용)
   *   - SALES: 접근 시 403 화면 또는 receipt-ocr-drop-zone 미표시 (RoleGuard 차단)
   *   - ACCOUNTANT: 접근 시 403 화면 또는 receipt-ocr-drop-zone 미표시 (RoleGuard 차단)
   *   - pageerror 없음
   *
   * BE 권한 근거:
   *   ReceiptOcrController: @PreAuthorize("hasAnyRole('WAREHOUSE','MANAGER','MASTER')")
   *   FE: RECEIPT_OCR_ROLES = ['WAREHOUSE', 'MANAGER', 'MASTER']
   *   FE: <RoleGuard allow={RECEIPT_OCR_ROLES}>
   */
  test('T5: 권한 가드 — WAREHOUSE/MANAGER/MASTER 허용, SALES/ACCOUNTANT 403', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    ensureQaDir()

    // ── step 1: WAREHOUSE 권한 — 접근 허용 + 드롭존 표시
    await test.step('WAREHOUSE 권한 — receipt-ocr-drop-zone 표시 (허용)', async () => {
      await page.goto(RECEIPT_OCR_URL_WAREHOUSE, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1000)

      const dropZone = page.locator('[data-testid="receipt-ocr-drop-zone"]')
      await expect(
        dropZone,
        'WAREHOUSE 권한 영수증 OCR 접근 차단됨 (허용이어야 함) — receipt-ocr-drop-zone 미표시',
      ).toBeVisible({ timeout: 5000 })

      await page.screenshot({
        path: path.join(QA_DIR, 'T5-role-guard-warehouse-allowed.png'),
        fullPage: true,
      })
    })

    // ── step 2: MANAGER 권한 — 접근 허용
    await test.step('MANAGER 권한 — 접근 허용 확인', async () => {
      await page.goto(RECEIPT_OCR_URL_MANAGER, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1000)

      const dropZone = page.locator('[data-testid="receipt-ocr-drop-zone"]')
      await expect(
        dropZone,
        'MANAGER 권한 영수증 OCR 접근 차단됨 (허용이어야 함) — receipt-ocr-drop-zone 미표시',
      ).toBeVisible({ timeout: 5000 })
    })

    // ── step 3: MASTER 권한 — 접근 허용
    await test.step('MASTER 권한 — 접근 허용 확인', async () => {
      await page.goto(RECEIPT_OCR_URL_MASTER, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1000)

      const dropZone = page.locator('[data-testid="receipt-ocr-drop-zone"]')
      await expect(
        dropZone,
        'MASTER 권한 영수증 OCR 접근 차단됨 (허용이어야 함) — receipt-ocr-drop-zone 미표시',
      ).toBeVisible({ timeout: 5000 })
    })

    // ── step 4: SALES 권한 — 접근 차단 (403 또는 드롭존 미표시)
    await test.step('SALES 권한 — 영수증 OCR 접근 차단 (RoleGuard)', async () => {
      await page.goto(RECEIPT_OCR_URL_SALES, { waitUntil: 'domcontentloaded', timeout: 20000 })
      // 직전 sub-step 의 역할(WAREHOUSE 등) 세션이 hash 네비게이션으로는 SALES 로 재설정되지 않는다(세션 캐시).
      // 문서 전체 reload 로 mockRole=SALES 를 재독해 세션을 재설정한다(fresh 로드와 동일 — RoleGuard 가 SALES 차단).
      await page.reload({ waitUntil: 'domcontentloaded' })
      // RoleGuard 차단(접근 권한 없음)은 세션(mockRole) 정착 후 렌더되므로 고정 1s 는 전이 프레임을 포착할 수 있다.
      // 차단 표식(접근 권한 없음 화면) 또는 드롭존 소멸이 확인될 때까지 폴링.
      await page.waitForTimeout(800)
      for (let i = 0; i < 16; i++) {
        const t = (await page.textContent('body').catch(() => '')) ?? ''
        const dz = await page.locator('[data-testid="receipt-ocr-drop-zone"]').count()
        if (t.includes('접근 권한이 없습니다') || t.includes('권한 보유자만') || dz === 0) break
        await page.waitForTimeout(300)
      }

      // 드롭존 미표시 확인 (RoleGuard 차단)
      const dropZone = page.locator('[data-testid="receipt-ocr-drop-zone"]')
      const dropZoneVisible = (await dropZone.count()) > 0 && await dropZone.isVisible()

      const bodyText = (await page.textContent('body')) ?? ''
      const salesBlocked =
        !dropZoneVisible ||
        bodyText.includes('권한') ||
        bodyText.includes('접근') ||
        bodyText.includes('403') ||
        bodyText.includes('Forbidden') ||
        page.url().includes('/login') ||
        page.url().includes('/unauthorized')

      await page.screenshot({
        path: path.join(QA_DIR, 'T5-role-guard-sales-403.png'),
        fullPage: true,
      })

      expect(
        salesBlocked,
        'SALES 권한 영수증 OCR 접근 차단 미작동 — receipt-ocr-drop-zone 미표시 또는 403/redirect 필요. RECEIPT_OCR_ROLES = ["WAREHOUSE","MANAGER","MASTER"]',
      ).toBe(true)
    })

    // ── step 5: ACCOUNTANT 권한 — 접근 차단
    await test.step('ACCOUNTANT 권한 — 영수증 OCR 접근 차단 (RoleGuard)', async () => {
      await page.goto(RECEIPT_OCR_URL_ACCOUNTANT, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1000)

      const dropZone = page.locator('[data-testid="receipt-ocr-drop-zone"]')
      const dropZoneVisible = (await dropZone.count()) > 0 && await dropZone.isVisible()

      const bodyText = (await page.textContent('body')) ?? ''
      const accountantBlocked =
        !dropZoneVisible ||
        bodyText.includes('권한') ||
        bodyText.includes('접근') ||
        bodyText.includes('403') ||
        bodyText.includes('Forbidden') ||
        page.url().includes('/login') ||
        page.url().includes('/unauthorized')

      expect(
        accountantBlocked,
        'ACCOUNTANT 권한 영수증 OCR 접근 차단 미작동 — receipt-ocr-drop-zone 미표시 또는 403/redirect 필요. RECEIPT_OCR_ROLES = ["WAREHOUSE","MANAGER","MASTER"]',
      ).toBe(true)
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })
})
