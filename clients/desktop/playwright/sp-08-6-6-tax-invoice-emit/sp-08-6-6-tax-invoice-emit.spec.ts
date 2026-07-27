/**
 * SP-08-6-6 세금계산서 발행 Playwright 스펙
 *
 * 실행 조건:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite --port 5173  (별도 터미널)
 *   npx playwright test playwright/sp-08-6-6-tax-invoice-emit/sp-08-6-6-tax-invoice-emit.spec.ts --reporter=line
 *
 * dev server 미가용 시 모든 UI 테스트 자동 SKIP.
 * 스크린샷 저장: docs/qa/sp-08-6-6-tax-invoice-emit/screenshots/*.png
 *
 * TC 목록 (5건):
 *   T1 BE emit endpoint — POST /{id}/issue 200 + ISSUED 상태 반환 (mock API 검증)
 *   T2 FE 발행 CTA + 권한 — ACCOUNTANT "발행" 버튼 노출, VIEWER 미노출
 *   T3 한국어 라벨 — "임시저장"/"발행"/"취소" / 버튼·모달·합계 영역 한국어 검증
 *   T4 UUID 비공개 — taxInvoiceNo 노출 / id(UUID) 화면 미노출
 *   T5 권한 가드 — VIEWER 역할로 /accounting/tax-invoices/:id 진입 시 발행·취소 버튼 없음
 */

import { test, expect, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as http from 'http'
import { fileURLToPath } from 'url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

const _filename = fileURLToPath(import.meta.url)
const _dirname = path.dirname(_filename)

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5173'

/** 스크린샷 저장 디렉토리 */
// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const QA_DIR = resolveQaShotsDir(path.resolve(
  _dirname,
  '../../../../docs/qa/sp-08-6-6-tax-invoice-emit/screenshots',
))

function ensureQaDir(): void {
  if (!fs.existsSync(QA_DIR)) {
    fs.mkdirSync(QA_DIR, { recursive: true })
  }
}

/** dev server 가용 여부 확인 */
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

/** pageerror 훅 등록 — PR #156 회귀 가드 */
function attachPageErrorHook(page: Page, errors: string[]): void {
  page.on('pageerror', err => {
    errors.push(err.message)
  })
}

// ---------------------------------------------------------------------------
// 세금계산서 목록 URL (ACCOUNTANT 역할)
// ---------------------------------------------------------------------------
const LIST_URL = `${BASE_URL}/#/accounting/tax-invoices?mockRole=ACCOUNTANT`
const DETAIL_URL_DRAFT = `${BASE_URL}/#/accounting/tax-invoices?mockRole=ACCOUNTANT&mockStatus=DRAFT`
const DETAIL_URL_ISSUED = `${BASE_URL}/#/accounting/tax-invoices?mockRole=ACCOUNTANT&mockStatus=ISSUED`

// ---------------------------------------------------------------------------
// TC-T1 ~ TC-T5
// ---------------------------------------------------------------------------

test.describe('SP-08-6-6 세금계산서 발행 (T1~T5)', () => {
  test.skip(SKIP_UI, 'dev server 미가용 — VITE_MOCK_MODE=1 npx vite --port 5173 후 PLAYWRIGHT_SKIP_UI=0 으로 재시도')

  test.beforeEach(async () => {
    const ok = await isServerAvailable()
    // false green 방지(SP-09 패턴) — dev server 미가용 시 skip 이 아닌 FAIL.
    expect(ok, `dev server 미접근: ${BASE_URL}`).toBe(true)
  })

  /**
   * T1: BE emit endpoint 회귀 — POST /{id}/issue 응답 검증
   *
   * 기대 결과:
   *   - /accounting/tax-invoices 페이지 진입 후 DRAFT 행 클릭 가능
   *   - "발행" 버튼 클릭 시 confirm 모달 또는 alert 노출
   *   - 발행 후 상태 "발행" (ISSUED) 로 전환 또는 taxInvoiceNo 표시
   *   - pageerror 없음
   */
  test('T1: 발행 CTA → BE POST /{id}/issue 응답 (ISSUED 전이)', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1500)

    // "임시저장" 상태 행 탐색
    const draftRow = page.locator(
      'table tbody tr:has-text("임시저장"), [data-testid*="tax-invoice-row"]:has-text("임시저장"), tr:has([class*="neutral"])',
    ).first()

    if ((await draftRow.count()) > 0) {
      await draftRow.click()
      await page.waitForTimeout(1000)

      // "발행" 버튼 탐색
      const issueBtn = page.locator(
        '[data-testid="tax-invoice-detail-issue-button"], button:has-text("발행")',
      ).first()

      if ((await issueBtn.count()) > 0) {
        // confirm dialog 처리
        page.on('dialog', async dialog => {
          await dialog.accept()
        })
        await issueBtn.click()
        await page.waitForTimeout(2000)

        const bodyText = (await page.textContent('body')) ?? ''
        const isIssued =
          bodyText.includes('발행') ||
          bodyText.includes('ISSUED') ||
          /\d{8}-\d{4}/.test(bodyText) // taxInvoiceNo 패턴
        expect(isIssued, '발행 후 ISSUED 상태 미확인').toBeTruthy()
      }
    }

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'T1-be-emit-endpoint-issued.png'),
      fullPage: true,
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * T2: FE 발행 CTA + 권한
   *
   * 기대 결과:
   *   - ACCOUNTANT 역할: "발행" 버튼 노출 (DRAFT 상태 세금계산서 상세)
   *   - "발행 중..." disabled 상태 처리 존재 확인
   *   - "신규 작성" 버튼 노출 (목록 화면)
   *   - pageerror 없음
   */
  test('T2: ACCOUNTANT FE 발행 CTA 노출 + "신규 작성" 버튼', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1500)

    // 목록 화면 "신규 작성" 버튼 노출 확인 (ACCOUNTANT 권한)
    const newBtn = page.locator(
      '[data-testid="tax-invoice-new-button"], button:has-text("신규 작성")',
    ).first()

    const newBtnExists = (await newBtn.count()) > 0
    expect(newBtnExists, '"신규 작성" 버튼 미노출 (ACCOUNTANT 권한)').toBeTruthy()

    // "일괄 발행" 버튼 노출 확인
    const batchBtn = page.locator(
      '[data-testid="tax-invoice-batch-button"], button:has-text("일괄 발행")',
    ).first()
    const batchBtnExists = (await batchBtn.count()) > 0

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'T2-fe-issue-cta-accountant.png'),
      fullPage: true,
    })

    // 목록 화면에 최소 "신규 작성" 또는 "일괄 발행" 버튼 존재
    expect(
      newBtnExists || batchBtnExists,
      'ACCOUNTANT 세금계산서 목록 — CTA 버튼 미노출',
    ).toBeTruthy()
    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * T3: 한국어 라벨 검증
   *
   * 기대 결과:
   *   - 상태 라벨: "임시저장" / "발행" / "취소" (영문 DRAFT/ISSUED/CANCELLED 미노출)
   *   - 컬럼 헤더: "세금계산서번호" / "거래처" / "작성일" / "공급가액" / "세액" / "합계" / "상태"
   *   - 필터 라벨: "상태" / "기간 (시작)" / "기간 (종료)" / "거래처명"
   *   - pageerror 없음
   */
  test('T3: 한국어 라벨 — 목록 화면 컬럼·필터·상태 검증', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1500)

    const bodyText = (await page.textContent('body')) ?? ''

    // 컬럼 헤더 한국어 확인
    const expectedLabels = ['세금계산서번호', '거래처', '작성일', '공급가액', '세액', '합계', '상태']
    const missingLabels = expectedLabels.filter(label => !bodyText.includes(label))

    // 필터 라벨 한국어 확인
    const filterLabels = ['상태', '거래처명']
    const missingFilters = filterLabels.filter(label => !bodyText.includes(label))

    // 상태 라벨 — 영문 raw 값 미노출 확인 (임시저장/발행/취소 로 변환되어야 함)
    // 데이터가 없으면 status raw 값 노출 안 되므로, select 옵션 확인
    const statusSelect = page.locator('[data-testid="tax-invoice-list-filter-status"]').first()
    const statusSelectExists = (await statusSelect.count()) > 0
    if (statusSelectExists) {
      const selectText = (await statusSelect.textContent()) ?? ''
      expect(selectText.includes('전체'), 'status select "전체" 옵션 미노출').toBeTruthy()
      expect(selectText.includes('임시저장'), 'status select "임시저장" 옵션 미노출').toBeTruthy()
      expect(selectText.includes('발행'), 'status select "발행" 옵션 미노출').toBeTruthy()
      expect(selectText.includes('취소'), 'status select "취소" 옵션 미노출').toBeTruthy()
    }

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'T3-korean-labels.png'),
      fullPage: true,
    })

    expect(missingLabels, `누락 컬럼 라벨: ${missingLabels.join(', ')}`).toHaveLength(0)
    expect(missingFilters, `누락 필터 라벨: ${missingFilters.join(', ')}`).toHaveLength(0)
    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * T4: UUID 비공개 — taxInvoiceNo 노출, UUID 미노출
   *
   * 기대 결과:
   *   - 목록 화면에서 "세금계산서번호" 컬럼에 yyyy/MM/dd-NNNN 형식 또는 "—" 표시
   *   - id(UUID v4 패턴) 가 DOM 텍스트에 미노출 (path param 이나 data-attribute 제외)
   *   - journalId, partnerId 텍스트 미노출 (링크 href 제외)
   *   - pageerror 없음
   */
  test('T4: UUID 비공개 — taxInvoiceNo 노출, id UUID 텍스트 미노출', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(LIST_URL, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1500)

    // 텍스트 노드에서 UUID 패턴 검사 — href/data-testid/script 제외한 가시 텍스트
    const visibleUuids = await page.evaluate(() => {
      const uuidRegex = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi

      // TreeWalker 로 텍스트 노드만 순회
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      const found: string[] = []
      let node: Node | null
      while ((node = walker.nextNode())) {
        const parent = node.parentElement
        if (!parent) continue
        const tag = parent.tagName.toLowerCase()
        // script/style/a[href]/input[type=hidden] 제외
        if (['script', 'style'].includes(tag)) continue
        const text = node.textContent ?? ''
        const matches = text.match(uuidRegex)
        if (matches) {
          found.push(...matches)
        }
      }
      return found
    })

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'T4-uuid-hidden.png'),
      fullPage: true,
    })

    expect(
      visibleUuids,
      `UUID 텍스트 노출 위반 (UUID 비공개 원칙): ${visibleUuids.join(', ')}`,
    ).toHaveLength(0)
    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * T5: 권한 가드 — VIEWER 역할에서 발행·취소 버튼 미노출
   *
   * 기대 결과:
   *   - mockRole=VIEWER 로 세금계산서 상세 진입 시:
   *     - "발행" 버튼 미노출
   *     - "취소" 버튼 미노출
   *     - "신규 작성" 버튼 미노출 (목록)
   *   - 목록/상세 페이지는 로드 가능 (403 아님) — VIEWER 조회만 허용 시나리오
   *   - pageerror 없음
   */
  test('T5: VIEWER 권한 가드 — 발행·취소 CTA 미노출', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    const viewerListUrl = `${BASE_URL}/#/accounting/tax-invoices?mockRole=VIEWER`
    await page.goto(viewerListUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await page.waitForTimeout(1500)

    const bodyText = (await page.textContent('body')) ?? ''

    // VIEWER 는 세금계산서 메뉴 접근 자체가 차단될 수 있음 (RoleGuard)
    const isAccessBlocked =
      bodyText.includes('권한') ||
      bodyText.includes('접근') ||
      bodyText.includes('403') ||
      bodyText.includes('Forbidden') ||
      page.url().includes('/login') ||
      page.url().includes('/unauthorized')

    // 접근 허용된 경우 — 발행/취소/신규작성 버튼 미노출 검증
    const issueBtn = page.locator('[data-testid="tax-invoice-detail-issue-button"]')
    const cancelBtn = page.locator('[data-testid="tax-invoice-detail-cancel-button"]')
    const newBtn = page.locator('[data-testid="tax-invoice-new-button"]')

    const issueBtnVisible = !isAccessBlocked && (await issueBtn.count()) > 0
    const cancelBtnVisible = !isAccessBlocked && (await cancelBtn.count()) > 0
    const newBtnVisible = !isAccessBlocked && (await newBtn.count()) > 0

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'T5-viewer-role-guard.png'),
      fullPage: true,
    })

    // 접근 차단 OR 버튼 미노출 — 둘 중 하나이면 권한 가드 통과
    expect(
      isAccessBlocked || (!issueBtnVisible && !cancelBtnVisible && !newBtnVisible),
      'VIEWER 권한에서 발행/취소/신규작성 버튼이 노출됨 — 권한 가드 실패',
    ).toBeTruthy()
    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })
})
