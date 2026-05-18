/**
 * SP-09-4 KFTC 오픈뱅킹 입금 매칭 shell — Playwright 스펙
 *
 * 실행 조건:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite --port 5173  (별도 터미널)
 *   npx playwright test playwright/sp-09-4-kftc-shell/sp-09-4-kftc-shell.spec.ts --reporter=line
 *
 * dev server 미가용 시 테스트 FAIL (false green 방지 — SP-09-1/2/3 패턴 일관).
 * 스크린샷 저장: docs/qa/sp-09-4-kftc-shell/screenshots/*.png
 *
 * TC 목록 (5건):
 *   T1 조회 폼 진입 + DRY_RUN 안내 배너 + Phase 11 KFTC 활성화 안내
 *   T2 조회 → 결과 요약 카드 (총/매칭/미매칭) + 테이블 row 표시
 *       + 매칭 거래처코드 / 세금계산서번호 표시
 *   T3 from > to 422 한국어 메시지 + role="alert" banner
 *   T4 row 클릭 → 매칭 상세 modal (자동 분개 미리보기 차변/대변)
 *   T5 권한 가드 — ACCOUNTANT/MANAGER/MASTER 허용 + SALES/WAREHOUSE 차단
 *
 * SP-09-3 회귀 가드 준수:
 *   - false green (|| true / test.skip(!ok) / page.setContent() fallback) 절대 금지
 *   - URL HashRouter 정합: http://localhost:5173/#/accounting/deposit-match
 *   - data-testid 사용 (DepositMatchPage.tsx 계약과 1:1)
 *   - BE/FE shape 1:1 매핑 확인 후 mock 응답 구성
 *     (BE DepositMatchResultDto: depositorName/amount/transactionDate/
 *                                matchedPartnerCode/matchedTaxInvoiceNo/status)
 *
 * BE 계약:
 *   POST /accounting/deposits/fetch-and-match
 *   @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
 *   KftcClient @MockBean (IT 격리 — feedback_it_mockbean_external_clients.md)
 *   DRY_RUN 모드: mock 5건 즉시 반환
 *   422: DEPOSIT_DATE_RANGE_INVALID (from > to)
 *   422: INVALID_INPUT (accountFinNo blank)
 *   502: KFTC_SUBMIT_FAILED (KFTC 모드 placeholder 키 또는 API 오류)
 *
 * FE 계약:
 *   /accounting/deposit-match (HashRouter)
 *   DEPOSIT_MATCH_ROLES = ['ACCOUNTANT', 'MANAGER', 'MASTER']
 *   data-testid: deposit-match-from / deposit-match-to / deposit-match-account-fin-no
 *               deposit-match-submit-btn / deposit-match-reset-btn
 *               deposit-match-summary
 *               deposit-match-table / deposit-match-row-{n}
 *               deposit-match-error
 *               deposit-match-detail-modal (T4 — 상세 modal, Phase 11 확장 예정)
 *               deposit-match-journal-debit / deposit-match-journal-credit
 *
 * UUID 비공개 원칙 (feedback_uuid_no_user_visibility):
 *   journalDraftId UUID 는 화면 텍스트 미노출.
 *   matchedPartnerCode / matchedTaxInvoiceNo (비즈니스 식별자) 만 표시.
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
  '../../../../docs/qa/sp-09-4-kftc-shell/screenshots',
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
// URL 상수 — HashRouter `/#/accounting/deposit-match`
// ---------------------------------------------------------------------------

const DEPOSIT_MATCH_URL_ACCOUNTANT = `${BASE_URL}/#/accounting/deposit-match?mockRole=ACCOUNTANT`
const DEPOSIT_MATCH_URL_MANAGER    = `${BASE_URL}/#/accounting/deposit-match?mockRole=MANAGER`
const DEPOSIT_MATCH_URL_MASTER     = `${BASE_URL}/#/accounting/deposit-match?mockRole=MASTER`
const DEPOSIT_MATCH_URL_SALES      = `${BASE_URL}/#/accounting/deposit-match?mockRole=SALES`
const DEPOSIT_MATCH_URL_WAREHOUSE  = `${BASE_URL}/#/accounting/deposit-match?mockRole=WAREHOUSE`

// ---------------------------------------------------------------------------
// Mock 데이터 — BE DepositMatchResponse record 와 1:1 정합
//
// BE record 필드 (DepositMatchResultDto):
//   depositorName / amount / transactionDate /
//   matchedPartnerCode / matchedTaxInvoiceNo / status
//
// UUID 비공개 원칙: journalDraftId 는 BE 내부용. FE 응답 및 화면에 미노출.
// BE DepositMatchResponse 필드: totalCount / matchedCount / unmatchedCount / results
// ---------------------------------------------------------------------------

function buildDepositMatchResponse(overrides?: Partial<{
  totalCount: number
  matchedCount: number
  unmatchedCount: number
  results: unknown[]
}>) {
  const defaultResults = [
    {
      depositorName: '(주)삼성상사',
      amount: 1100000.00,
      transactionDate: '2026-05-01',
      matchedPartnerCode: 'PARTNER-001',
      matchedTaxInvoiceNo: 'TAX-2026-05-001',
      status: 'MATCHED',
    },
    {
      depositorName: '한국물류(주)',
      amount: 550000.00,
      transactionDate: '2026-05-01',
      matchedPartnerCode: 'PARTNER-002',
      matchedTaxInvoiceNo: null,
      status: 'UNMATCHED',
    },
    {
      depositorName: '대한유통',
      amount: 3300000.00,
      transactionDate: '2026-05-02',
      matchedPartnerCode: 'PARTNER-003',
      matchedTaxInvoiceNo: 'TAX-2026-05-002',
      status: 'MATCHED',
    },
    {
      depositorName: '미래운송',
      amount: 220000.00,
      transactionDate: '2026-05-02',
      matchedPartnerCode: null,
      matchedTaxInvoiceNo: null,
      status: 'UNMATCHED',
    },
    {
      depositorName: '알수없는입금자',
      amount: 99000.00,
      transactionDate: '2026-05-03',
      matchedPartnerCode: null,
      matchedTaxInvoiceNo: null,
      status: 'UNMATCHED',
    },
  ]

  return {
    success: true,
    data: {
      totalCount: 5,
      matchedCount: 2,
      unmatchedCount: 3,
      results: defaultResults,
      ...overrides,
    },
  }
}

/** 422 DEPOSIT_DATE_RANGE_INVALID 에러 응답 */
function buildDateRangeInvalidError() {
  return {
    success: false,
    code: 'DEPOSIT_DATE_RANGE_INVALID',
    message: 'from(2026-05-31)이 to(2026-05-01)보다 늦습니다. 시작일은 종료일보다 이전이어야 합니다.',
    data: null,
    timestamp: '2026-05-18T09:00:00Z',
  }
}

// ---------------------------------------------------------------------------
// TC-T1 ~ TC-T5
// ---------------------------------------------------------------------------

test.describe('SP-09-4 KFTC 오픈뱅킹 입금 매칭 shell QA (T1~T5)', () => {
  test.skip(SKIP_UI, 'PLAYWRIGHT_SKIP_UI=1 — UI 테스트 전체 skip')

  test.beforeEach(async () => {
    const ok = await isServerAvailable()
    // dev server 미가용 시 false green 방지 — skip 이 아닌 FAIL
    expect(
      ok,
      `dev server 미접근: ${BASE_URL} — VITE_MOCK_MODE=1 npx vite --port 5173 실행 후 재시도`,
    ).toBe(true)
  })

  // -------------------------------------------------------------------------
  /**
   * T1: 조회 폼 진입 + DRY_RUN 안내 + Phase 11 KFTC 안내
   *
   * 검증 항목:
   *   - /#/accounting/deposit-match (HashRouter) 진입 정상
   *   - h3 제목 "KFTC 오픈뱅킹 입금 매칭" 텍스트 표시
   *   - data-testid="deposit-match-from" 시작일 입력 필드 표시
   *   - data-testid="deposit-match-to" 종료일 입력 필드 표시
   *   - data-testid="deposit-match-account-fin-no" 계좌 핀번호 입력 필드 표시
   *   - data-testid="deposit-match-submit-btn" 제출 버튼 표시 (활성화)
   *   - DRY_RUN 안내 배너 — "처리 방식: DRY_RUN (sandbox)" 텍스트 포함 섹션
   *   - Phase 11 KFTC 활성화 안내 — "Phase 11" + "KFTC" 텍스트 포함
   *   - pageerror 없음
   *
   * FE 계약 근거:
   *   DepositMatchPage — submitMethod 고정 DRY_RUN (shell 단계)
   *   안내 배너: "처리 방식: DRY_RUN (sandbox)"
   *   "Phase 11 sandbox 연동 완료 후 KFTC 오픈뱅킹 모드가 활성화됩니다."
   */
  test('T1: 조회 폼 진입 + DRY_RUN 안내 배너 + Phase 11 KFTC 안내 표시', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    ensureQaDir()

    // ── step 1: deposit-match 페이지 진입 (ACCOUNTANT 권한)
    await test.step('/#/accounting/deposit-match ACCOUNTANT 권한 진입', async () => {
      await page.goto(DEPOSIT_MATCH_URL_ACCOUNTANT, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      // h3 제목 표시 확인 — data-testid fallback 금지, 실제 heading 기반
      const pageHeading = page.locator('h3')
      await expect(
        pageHeading,
        'KFTC 입금 매칭 페이지 h3 제목 미표시 — 실제 화면 진입 실패',
      ).toBeVisible({ timeout: 5000 })

      const headingText = (await pageHeading.first().textContent()) ?? ''
      expect(
        headingText.includes('KFTC') || headingText.includes('입금'),
        `h3 제목이 KFTC/입금 관련 텍스트를 포함하지 않음 — headingText="${headingText}"`,
      ).toBe(true)
    })

    // ── step 2: 조회 폼 입력 필드 확인 (data-testid 기반)
    await test.step('조회 폼 — 날짜 범위 + 계좌 핀번호 입력 필드 표시 확인', async () => {
      const fromInput = page.locator('[data-testid="deposit-match-from"]')
      await expect(fromInput, '시작일 입력 필드 미표시 — data-testid="deposit-match-from" 없음').toBeVisible({ timeout: 5000 })

      const toInput = page.locator('[data-testid="deposit-match-to"]')
      await expect(toInput, '종료일 입력 필드 미표시 — data-testid="deposit-match-to" 없음').toBeVisible({ timeout: 5000 })

      const accountFinNoInput = page.locator('[data-testid="deposit-match-account-fin-no"]')
      await expect(
        accountFinNoInput,
        '계좌 핀번호 입력 필드 미표시 — data-testid="deposit-match-account-fin-no" 없음',
      ).toBeVisible({ timeout: 5000 })
    })

    // ── step 3: 제출 버튼 표시 확인
    await test.step('입금 매칭 조회 버튼 표시 확인 (초기 활성화)', async () => {
      const submitBtn = page.locator('[data-testid="deposit-match-submit-btn"]')
      await expect(
        submitBtn,
        '입금 매칭 조회 버튼 미표시 — data-testid="deposit-match-submit-btn" 없음',
      ).toBeVisible({ timeout: 5000 })

      // 초기 상태에서 활성화 (OCR 업로드와 다르게 날짜 default 값 있음)
      const isEnabled = await submitBtn.isEnabled()
      expect(
        isEnabled,
        '입금 매칭 조회 버튼이 초기 비활성화 상태 — 날짜 default 값 설정 후 활성화 필요',
      ).toBe(true)
    })

    // ── step 4: DRY_RUN 안내 배너 표시 확인
    await test.step('DRY_RUN 처리 방식 안내 배너 표시 확인', async () => {
      // "처리 방식: DRY_RUN (sandbox)" 텍스트를 포함하는 요소 확인
      const dryRunBanner = page.locator('div, section').filter({ hasText: 'DRY_RUN' }).first()
      await expect(
        dryRunBanner,
        'DRY_RUN 안내 배너 미표시 — "처리 방식: DRY_RUN (sandbox)" 텍스트 포함 요소 없음',
      ).toBeVisible({ timeout: 5000 })
    })

    // ── step 5: Phase 11 KFTC 활성화 안내 표시 확인
    await test.step('Phase 11 KFTC 오픈뱅킹 모드 활성화 안내 표시 확인', async () => {
      // "Phase 11" 또는 "KFTC 오픈뱅킹 모드" 텍스트 포함 요소 확인
      const phase11Notice = page.locator('div, p').filter({ hasText: 'Phase 11' }).first()
      await expect(
        phase11Notice,
        'Phase 11 KFTC 활성화 안내 미표시 — "Phase 11" 텍스트 포함 요소 없음. DRY_RUN 배너에 Phase 11 안내가 포함되어야 함.',
      ).toBeVisible({ timeout: 5000 })

      const phase11Text = (await phase11Notice.textContent()) ?? ''
      expect(
        phase11Text.includes('KFTC') || phase11Text.includes('활성'),
        `Phase 11 안내가 KFTC/활성 키워드를 포함하지 않음 — phase11Text="${phase11Text}"`,
      ).toBe(true)
    })

    await page.screenshot({
      path: path.join(QA_DIR, 'T1-deposit-match-form-dry-run-notice.png'),
      fullPage: true,
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T2: 조회 → 결과 요약 카드 (총/매칭/미매칭) + 테이블 row 표시
   *     + 매칭 거래처코드 / 세금계산서번호 표시
   *
   * 검증 항목:
   *   - /accounting/deposits/fetch-and-match API mock 등록
   *     (BE DepositMatchResponse: totalCount=5 / matchedCount=2 / unmatchedCount=3)
   *   - 계좌 핀번호 입력 후 조회 실행
   *   - data-testid="deposit-match-summary" 요약 카드 섹션 표시
   *   - 전체 5 / 매칭 2 / 미매칭 3 카운트 표시 (locator 기반)
   *   - data-testid="deposit-match-table" 테이블 표시
   *   - data-testid="deposit-match-row-1" ~ row-5 표시 (5건)
   *   - MATCHED row (row-1): matchedPartnerCode "PARTNER-001" 텍스트
   *   - MATCHED row (row-1): matchedTaxInvoiceNo "TAX-2026-05-001" 텍스트
   *   - UUID 텍스트 미노출 (journalDraftId UUID 는 화면 미표시)
   *   - pageerror 없음
   *
   * BE 계약 근거 (BE/FE shape 1:1 정합):
   *   DepositMatchResultDto: depositorName/amount/transactionDate/
   *                          matchedPartnerCode/matchedTaxInvoiceNo/status
   *   journalDraftId 는 BE 내부용 — 응답 DTO 미포함 (UUID 비공개 원칙)
   */
  test('T2: 조회 → 결과 요약 카드 (총/매칭/미매칭) + 테이블 row + 거래처코드/세금계산서번호 표시', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    ensureQaDir()

    // ── step 1: fetch-and-match API mock 등록 (BE DepositMatchResponse 1:1)
    await test.step('/accounting/deposits/fetch-and-match DRY_RUN 응답 mock 등록', async () => {
      await page.route('**/accounting/deposits/fetch-and-match**', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildDepositMatchResponse()),
        })
      })
    })

    // ── step 2: 페이지 진입 (ACCOUNTANT 권한)
    await test.step('/#/accounting/deposit-match ACCOUNTANT 권한 진입', async () => {
      await page.goto(DEPOSIT_MATCH_URL_ACCOUNTANT, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const pageHeading = page.locator('h3, h2, h1').first()
      await expect(pageHeading, 'KFTC 입금 매칭 페이지 제목 미표시 — 실제 화면 진입 실패').toBeVisible({ timeout: 5000 })
    })

    // ── step 3: 계좌 핀번호 입력 + 조회 실행
    await test.step('계좌 핀번호 입력 + 입금 매칭 조회 버튼 클릭', async () => {
      const accountFinNoInput = page.locator('[data-testid="deposit-match-account-fin-no"]')
      await expect(accountFinNoInput, 'deposit-match-account-fin-no 미존재').toBeAttached({ timeout: 5000 })
      await accountFinNoInput.fill('DRY-FIN-0001')

      const submitBtn = page.locator('[data-testid="deposit-match-submit-btn"]')
      await submitBtn.click()
    })

    // ── step 4: 결과 요약 카드 표시 확인 (이벤트 기반 wait)
    await test.step('결과 요약 카드 — deposit-match-summary 표시 확인', async () => {
      const summarySection = page.locator('[data-testid="deposit-match-summary"]')
      await expect(
        summarySection,
        '입금 매칭 결과 요약 카드 미표시 — data-testid="deposit-match-summary" 없음. API mock 호출 실패 가능성.',
      ).toBeVisible({ timeout: 8000 })

      await page.screenshot({
        path: path.join(QA_DIR, 'T2-deposit-match-summary-cards.png'),
        fullPage: true,
      })
    })

    // ── step 5: 요약 카운트 검증 (전체 5 / 매칭 2 / 미매칭 3)
    await test.step('요약 카드 — 전체 5건 / 매칭 2건 / 미매칭 3건 카운트 표시', async () => {
      const summarySection = page.locator('[data-testid="deposit-match-summary"]')

      // 전체 5건 텍스트 확인
      await expect(
        summarySection.getByText('5', { exact: false }),
        '요약 카드 전체 5건 미표시 — totalCount=5 표시 필요',
      ).toBeVisible({ timeout: 5000 })

      // 매칭 2건 텍스트 확인
      await expect(
        summarySection.getByText('2', { exact: false }),
        '요약 카드 매칭 2건 미표시 — matchedCount=2 표시 필요',
      ).toBeVisible({ timeout: 5000 })

      // 미매칭 3건 텍스트 확인
      await expect(
        summarySection.getByText('3', { exact: false }),
        '요약 카드 미매칭 3건 미표시 — unmatchedCount=3 표시 필요',
      ).toBeVisible({ timeout: 5000 })
    })

    // ── step 6: 결과 테이블 row 5건 표시 확인
    await test.step('결과 테이블 — deposit-match-table + row 5건 표시 확인', async () => {
      const table = page.locator('[data-testid="deposit-match-table"]')
      await expect(
        table,
        '입금 매칭 결과 테이블 미표시 — data-testid="deposit-match-table" 없음',
      ).toBeVisible({ timeout: 5000 })

      // row-1 ~ row-5 표시 확인
      for (let i = 1; i <= 5; i++) {
        const row = page.locator(`[data-testid="deposit-match-row-${i}"]`)
        await expect(
          row,
          `row-${i} 미표시 — data-testid="deposit-match-row-${i}" 없음. 5건 mock 중 ${i}번째 row 누락.`,
        ).toBeVisible({ timeout: 5000 })
      }
    })

    // ── step 7: MATCHED row-1 — 매칭 거래처코드 + 세금계산서번호 표시 확인
    await test.step('MATCHED row-1 — matchedPartnerCode "PARTNER-001" + matchedTaxInvoiceNo "TAX-2026-05-001" 표시', async () => {
      const row1 = page.locator('[data-testid="deposit-match-row-1"]')
      await expect(row1, 'row-1 미표시').toBeVisible({ timeout: 5000 })

      // matchedPartnerCode 표시 확인 (비즈니스 식별자 — UUID 비공개 원칙 준수)
      await expect(
        row1.getByText('PARTNER-001', { exact: false }),
        'row-1 매칭 거래처코드 "PARTNER-001" 미표시 — matchedPartnerCode 비즈니스 식별자 표시 필요',
      ).toBeVisible({ timeout: 5000 })

      // matchedTaxInvoiceNo 표시 확인 (비즈니스 식별자)
      await expect(
        row1.getByText('TAX-2026-05-001', { exact: false }),
        'row-1 매칭 세금계산서번호 "TAX-2026-05-001" 미표시 — matchedTaxInvoiceNo 비즈니스 식별자 표시 필요',
      ).toBeVisible({ timeout: 5000 })

      await page.screenshot({
        path: path.join(QA_DIR, 'T2-deposit-match-table-rows.png'),
        fullPage: true,
      })
    })

    // ── step 8: UUID 비공개 원칙 검증 — journalDraftId UUID 텍스트 미노출
    await test.step('UUID 비공개 — journalDraftId UUID 텍스트 미노출 확인', async () => {
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
        `UUID 텍스트 노출 위반 (UUID 비공개 원칙 — journalDraftId UUID 는 내부 전용): ${visibleUuids.join(', ')}`,
      ).toHaveLength(0)
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T3: from > to 422 한국어 메시지 + role="alert" banner
   *
   * 검증 항목:
   *   - FE 클라이언트 사이드 — from > to 시 즉시 한국어 에러 표시
   *     ("시작일은 종료일보다 이전이어야 합니다." — FE handleSubmit 검증)
   *   - role="alert" 에러 배너 또는 data-testid="deposit-match-error" 표시
   *   - 한국어 에러 메시지 포함 ("시작일" 또는 "이전" 또는 "날짜" 키워드)
   *   - API mock 422 DEPOSIT_DATE_RANGE_INVALID 응답 + BE 한국어 에러 메시지 표시
   *   - pageerror 없음
   *
   * BE 계약 근거:
   *   DepositMatchService.fetchAndMatch() — from.isAfter(to) → DEPOSIT_DATE_RANGE_INVALID 422
   *   FE handleSubmit() — from > to → setFormError("시작일은 종료일보다 이전이어야 합니다.")
   */
  test('T3: from > to 422 한국어 메시지 + role="alert" banner', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    ensureQaDir()

    // ── step 1: fetch-and-match API mock 422 등록 (BE 서버 사이드 검증 시나리오)
    await test.step('/accounting/deposits/fetch-and-match 422 DEPOSIT_DATE_RANGE_INVALID mock 등록', async () => {
      await page.route('**/accounting/deposits/fetch-and-match**', async route => {
        await route.fulfill({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify(buildDateRangeInvalidError()),
        })
      })
    })

    // ── step 2: 페이지 진입
    await test.step('/#/accounting/deposit-match ACCOUNTANT 권한 진입', async () => {
      await page.goto(DEPOSIT_MATCH_URL_ACCOUNTANT, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const pageHeading = page.locator('h3, h2, h1').first()
      await expect(pageHeading, 'KFTC 입금 매칭 페이지 미로드 — 제목 없음').toBeVisible({ timeout: 5000 })
    })

    // ── step 3: from > to 설정 + 계좌 핀번호 입력 후 조회
    await test.step('from > to 날짜 설정 (2026-05-31 > 2026-05-01) + 조회 실행', async () => {
      const fromInput = page.locator('[data-testid="deposit-match-from"]')
      const toInput   = page.locator('[data-testid="deposit-match-to"]')

      await expect(fromInput, 'deposit-match-from 미존재').toBeAttached({ timeout: 5000 })
      await expect(toInput,   'deposit-match-to 미존재').toBeAttached({ timeout: 5000 })

      // from = 2026-05-31 (종료일보다 늦은 날짜)
      await fromInput.fill('2026-05-31')
      // to = 2026-05-01 (시작일보다 이른 날짜)
      await toInput.fill('2026-05-01')

      const accountFinNoInput = page.locator('[data-testid="deposit-match-account-fin-no"]')
      await accountFinNoInput.fill('TEST-FIN-001')

      const submitBtn = page.locator('[data-testid="deposit-match-submit-btn"]')
      await submitBtn.click()
      await page.waitForTimeout(800)
    })

    // ── step 4: FE 클라이언트 사이드 에러 or 서버 422 에러 확인
    await test.step('from > to 에러 — role="alert" 또는 deposit-match-error 표시 확인', async () => {
      // data-testid="deposit-match-error" 우선 확인
      const depositError = page.locator('[data-testid="deposit-match-error"]')
      const depositErrorVisible = await depositError.isVisible()

      if (!depositErrorVisible) {
        // fallback: role="alert" 확인
        const alertBanner = page.locator('[role="alert"]').first()
        await expect(
          alertBanner,
          'from > to 에러 시 role="alert" 에러 배너 미표시 — deposit-match-error 또는 role="alert" 필요',
        ).toBeVisible({ timeout: 5000 })
      } else {
        await expect(
          depositError,
          'deposit-match-error 요소가 존재하지만 미표시',
        ).toBeVisible({ timeout: 5000 })
      }

      // 한국어 에러 메시지 키워드 확인
      const bodyText = (await page.textContent('body')) ?? ''
      expect(
        bodyText.includes('시작일') ||
        bodyText.includes('이전') ||
        bodyText.includes('날짜') ||
        bodyText.includes('from') ||
        bodyText.includes('범위'),
        `날짜 범위 한국어 에러 메시지 미표시 — "시작일"/"이전"/"날짜"/"from"/"범위" 키워드 없음. bodyText 일부: "${bodyText.slice(0, 200)}"`,
      ).toBe(true)

      await page.screenshot({
        path: path.join(QA_DIR, 'T3-from-gt-to-422-alert.png'),
        fullPage: true,
      })
    })

    // ── step 5: 에러 상태에서 요약 카드 미표시 확인 (오염 방지)
    await test.step('에러 상태에서 결과 요약 카드 미표시 확인', async () => {
      const summarySection = page.locator('[data-testid="deposit-match-summary"]')
      const summaryVisible = await summarySection.isVisible()
      expect(
        summaryVisible,
        '422 에러 상태에서 결과 요약 카드가 표시됨 — 에러 시 요약 카드 미표시 필요',
      ).toBe(false)
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T4: row 클릭 → 매칭 상세 modal (자동 분개 미리보기 차변/대변)
   *
   * 검증 항목:
   *   - MATCHED row 클릭 시 매칭 상세 modal 표시
   *   - modal: data-testid="deposit-match-detail-modal" 표시
   *   - modal 내 분개 미리보기 차변 (보통예금 103) 표시
   *   - modal 내 분개 미리보기 대변 (외상매출금 110) 표시
   *   - modal 내 거래처 코드 "PARTNER-001" 표시
   *   - modal 내 세금계산서번호 "TAX-2026-05-001" 표시
   *   - modal UUID 미노출 (journalDraftId UUID 텍스트 없음)
   *   - pageerror 없음
   *
   * BE 계약 근거:
   *   DepositMatchService.createJournalDraft():
   *     차변: 보통예금 103 (ACCOUNT_CODE_DEPOSIT)
   *     대변: 외상매출금 110 (ACCOUNT_CODE_RECEIVABLE)
   *   journalDraftId UUID 는 서비스 내부용 — FE 화면 미노출 (UUID 비공개 원칙)
   *
   * FE 계약 근거 (Phase 11 확장 예정):
   *   deposit-match-detail-modal: MATCHED row 클릭 시 표시
   *   deposit-match-journal-debit: 차변 라인 (보통예금 103)
   *   deposit-match-journal-credit: 대변 라인 (외상매출금 110)
   *
   * NOTE: 현 shell 단계에서 DepositMatchPage 는 row 클릭 modal 을 미구현.
   *       T4 는 Phase 11 에서 구현될 기능의 사전 계약 검증 테스트.
   *       테스트 FAIL = 기능 미구현 RED 상태 (정상) — false green 금지.
   */
  test('T4: MATCHED row 클릭 → 매칭 상세 modal (자동 분개 미리보기 차변/대변)', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    ensureQaDir()

    // ── step 1: fetch-and-match API mock 등록
    await test.step('/accounting/deposits/fetch-and-match DRY_RUN 응답 mock 등록', async () => {
      await page.route('**/accounting/deposits/fetch-and-match**', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildDepositMatchResponse()),
        })
      })
    })

    // ── step 2: 페이지 진입
    await test.step('/#/accounting/deposit-match ACCOUNTANT 권한 진입', async () => {
      await page.goto(DEPOSIT_MATCH_URL_ACCOUNTANT, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const pageHeading = page.locator('h3, h2, h1').first()
      await expect(pageHeading, 'KFTC 입금 매칭 페이지 미로드').toBeVisible({ timeout: 5000 })
    })

    // ── step 3: 계좌 핀번호 입력 + 조회
    await test.step('계좌 핀번호 입력 + 조회 실행', async () => {
      const accountFinNoInput = page.locator('[data-testid="deposit-match-account-fin-no"]')
      await accountFinNoInput.fill('DRY-FIN-0001')

      const submitBtn = page.locator('[data-testid="deposit-match-submit-btn"]')
      await submitBtn.click()

      // 결과 테이블 대기
      const table = page.locator('[data-testid="deposit-match-table"]')
      await expect(
        table,
        '결과 테이블 미표시 — 조회 후 deposit-match-table 없음',
      ).toBeVisible({ timeout: 8000 })
    })

    // ── step 4: MATCHED row-1 클릭 → 상세 modal 표시 확인
    await test.step('MATCHED row-1 클릭 → 매칭 상세 modal 표시 확인', async () => {
      const row1 = page.locator('[data-testid="deposit-match-row-1"]')
      await expect(row1, 'deposit-match-row-1 미표시').toBeVisible({ timeout: 5000 })

      await row1.click()
      await page.waitForTimeout(500)

      // modal 표시 확인 (Phase 11 구현 예정 — 현 shell 에서 FAIL = RED 정상)
      const detailModal = page.locator('[data-testid="deposit-match-detail-modal"]')
      await expect(
        detailModal,
        'MATCHED row 클릭 시 매칭 상세 modal 미표시 — data-testid="deposit-match-detail-modal" 없음. Phase 11 구현 예정.',
      ).toBeVisible({ timeout: 5000 })

      await page.screenshot({
        path: path.join(QA_DIR, 'T4-deposit-match-detail-modal.png'),
        fullPage: true,
      })
    })

    // ── step 5: modal 내 분개 미리보기 차변 확인 (보통예금 103)
    await test.step('modal 분개 미리보기 — 차변 보통예금(103) 표시', async () => {
      const detailModal = page.locator('[data-testid="deposit-match-detail-modal"]')
      await expect(detailModal, '분개 미리보기 modal 미표시').toBeVisible({ timeout: 5000 })

      // 차변 라인 확인 — 계정코드 103 또는 "보통예금" 텍스트
      const debitLine = page.locator('[data-testid="deposit-match-journal-debit"]')
      await expect(
        debitLine,
        '분개 미리보기 차변 라인 미표시 — data-testid="deposit-match-journal-debit" 없음. 차변: 보통예금(103) 표시 필요.',
      ).toBeVisible({ timeout: 5000 })

      const debitText = (await debitLine.textContent()) ?? ''
      expect(
        debitText.includes('103') || debitText.includes('보통예금') || debitText.includes('차변'),
        `분개 차변 라인에 "103"/"보통예금"/"차변" 키워드 없음 — debitText="${debitText}"`,
      ).toBe(true)
    })

    // ── step 6: modal 내 분개 미리보기 대변 확인 (외상매출금 110)
    await test.step('modal 분개 미리보기 — 대변 외상매출금(110) 표시', async () => {
      const creditLine = page.locator('[data-testid="deposit-match-journal-credit"]')
      await expect(
        creditLine,
        '분개 미리보기 대변 라인 미표시 — data-testid="deposit-match-journal-credit" 없음. 대변: 외상매출금(110) 표시 필요.',
      ).toBeVisible({ timeout: 5000 })

      const creditText = (await creditLine.textContent()) ?? ''
      expect(
        creditText.includes('110') || creditText.includes('외상매출금') || creditText.includes('대변'),
        `분개 대변 라인에 "110"/"외상매출금"/"대변" 키워드 없음 — creditText="${creditText}"`,
      ).toBe(true)
    })

    // ── step 7: modal 내 비즈니스 식별자 표시 확인
    await test.step('modal — 거래처코드 "PARTNER-001" + 세금계산서번호 "TAX-2026-05-001" 표시', async () => {
      const detailModal = page.locator('[data-testid="deposit-match-detail-modal"]')

      await expect(
        detailModal.getByText('PARTNER-001', { exact: false }),
        'modal 내 매칭 거래처코드 "PARTNER-001" 미표시',
      ).toBeVisible({ timeout: 5000 })

      await expect(
        detailModal.getByText('TAX-2026-05-001', { exact: false }),
        'modal 내 매칭 세금계산서번호 "TAX-2026-05-001" 미표시',
      ).toBeVisible({ timeout: 5000 })
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T5: 권한 가드 — ACCOUNTANT/MANAGER/MASTER 허용 + SALES/WAREHOUSE 차단
   *
   * 검증 항목:
   *   - ACCOUNTANT: deposit-match-submit-btn 표시 (접근 허용)
   *   - MANAGER: deposit-match-submit-btn 표시 (접근 허용)
   *   - MASTER: deposit-match-submit-btn 표시 (접근 허용)
   *   - SALES: 접근 차단 — deposit-match-submit-btn 미표시 또는 403/redirect
   *   - WAREHOUSE: 접근 차단 — deposit-match-submit-btn 미표시 또는 403/redirect
   *   - pageerror 없음
   *
   * BE 권한 근거:
   *   DepositMatchController: @PreAuthorize("hasAnyRole('ACCOUNTANT','MANAGER','MASTER')")
   * FE 권한 근거:
   *   DEPOSIT_MATCH_ROLES = ['ACCOUNTANT', 'MANAGER', 'MASTER']
   *   <RoleGuard allow={DEPOSIT_MATCH_ROLES}> (routes/index.tsx)
   */
  test('T5: 권한 가드 — ACCOUNTANT/MANAGER/MASTER 허용, SALES/WAREHOUSE 차단', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    ensureQaDir()

    // ── step 1: ACCOUNTANT 권한 — 접근 허용 + 조회 버튼 표시
    await test.step('ACCOUNTANT 권한 — deposit-match-submit-btn 표시 (허용)', async () => {
      await page.goto(DEPOSIT_MATCH_URL_ACCOUNTANT, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1000)

      const submitBtn = page.locator('[data-testid="deposit-match-submit-btn"]')
      await expect(
        submitBtn,
        'ACCOUNTANT 권한 KFTC 입금 매칭 접근 차단됨 (허용이어야 함) — deposit-match-submit-btn 미표시',
      ).toBeVisible({ timeout: 5000 })

      await page.screenshot({
        path: path.join(QA_DIR, 'T5-role-guard-accountant-allowed.png'),
        fullPage: true,
      })
    })

    // ── step 2: MANAGER 권한 — 접근 허용
    await test.step('MANAGER 권한 — 접근 허용 확인', async () => {
      await page.goto(DEPOSIT_MATCH_URL_MANAGER, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1000)

      const submitBtn = page.locator('[data-testid="deposit-match-submit-btn"]')
      await expect(
        submitBtn,
        'MANAGER 권한 KFTC 입금 매칭 접근 차단됨 (허용이어야 함) — deposit-match-submit-btn 미표시',
      ).toBeVisible({ timeout: 5000 })
    })

    // ── step 3: MASTER 권한 — 접근 허용
    await test.step('MASTER 권한 — 접근 허용 확인', async () => {
      await page.goto(DEPOSIT_MATCH_URL_MASTER, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1000)

      const submitBtn = page.locator('[data-testid="deposit-match-submit-btn"]')
      await expect(
        submitBtn,
        'MASTER 권한 KFTC 입금 매칭 접근 차단됨 (허용이어야 함) — deposit-match-submit-btn 미표시',
      ).toBeVisible({ timeout: 5000 })
    })

    // ── step 4: SALES 권한 — 접근 차단 (403 또는 조회 버튼 미표시)
    await test.step('SALES 권한 — KFTC 입금 매칭 접근 차단 (RoleGuard)', async () => {
      await page.goto(DEPOSIT_MATCH_URL_SALES, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1000)

      // deposit-match-submit-btn 미표시 확인 (RoleGuard 차단)
      const submitBtn = page.locator('[data-testid="deposit-match-submit-btn"]')
      const submitBtnVisible = (await submitBtn.count()) > 0 && await submitBtn.isVisible()

      const bodyText = (await page.textContent('body')) ?? ''
      const salesBlocked =
        !submitBtnVisible ||
        bodyText.includes('권한') ||
        bodyText.includes('접근') ||
        bodyText.includes('403') ||
        bodyText.includes('Forbidden') ||
        page.url().includes('/login') ||
        page.url().includes('/unauthorized') ||
        page.url().includes('/forbidden')

      await page.screenshot({
        path: path.join(QA_DIR, 'T5-role-guard-sales-403.png'),
        fullPage: true,
      })

      expect(
        salesBlocked,
        'SALES 권한 KFTC 입금 매칭 접근 차단 미작동 — deposit-match-submit-btn 미표시 또는 403/redirect 필요. DEPOSIT_MATCH_ROLES = ["ACCOUNTANT","MANAGER","MASTER"]',
      ).toBe(true)
    })

    // ── step 5: WAREHOUSE 권한 — 접근 차단
    await test.step('WAREHOUSE 권한 — KFTC 입금 매칭 접근 차단 (RoleGuard)', async () => {
      await page.goto(DEPOSIT_MATCH_URL_WAREHOUSE, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1000)

      const submitBtn = page.locator('[data-testid="deposit-match-submit-btn"]')
      const submitBtnVisible = (await submitBtn.count()) > 0 && await submitBtn.isVisible()

      const bodyText = (await page.textContent('body')) ?? ''
      const warehouseBlocked =
        !submitBtnVisible ||
        bodyText.includes('권한') ||
        bodyText.includes('접근') ||
        bodyText.includes('403') ||
        bodyText.includes('Forbidden') ||
        page.url().includes('/login') ||
        page.url().includes('/unauthorized') ||
        page.url().includes('/forbidden')

      await page.screenshot({
        path: path.join(QA_DIR, 'T5-role-guard-warehouse-403.png'),
        fullPage: true,
      })

      expect(
        warehouseBlocked,
        'WAREHOUSE 권한 KFTC 입금 매칭 접근 차단 미작동 — deposit-match-submit-btn 미표시 또는 403/redirect 필요. DEPOSIT_MATCH_ROLES = ["ACCOUNTANT","MANAGER","MASTER"]',
      ).toBe(true)
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })
})
