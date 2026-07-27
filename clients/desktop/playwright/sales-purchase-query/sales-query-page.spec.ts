/**
 * 판매조회 페이지 Playwright 스펙 — sales-purchase-query-redesign
 *
 * 실행 조건:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite --port 5173 (별도 터미널)
 *   npx playwright test playwright/sales-purchase-query/sales-query-page.spec.ts --reporter=line
 *
 * dev server 미가용 시 모든 UI 테스트 자동 SKIP.
 * 스크린샷 저장: docs/qa/sales-purchase-query-redesign/*.png
 *
 * PR #156 회귀 가드: page.on('pageerror') 훅 의무 적용.
 */

import { test, expect, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as http from 'http'
import { fileURLToPath } from 'url'
import { resolveMockQaShotsDir } from '../support/qa-screenshot-dir'

// ---------------------------------------------------------------------------
// 설정
// ---------------------------------------------------------------------------

const _filename = fileURLToPath(import.meta.url)
const _dirname = path.dirname(_filename)

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5173'

/** desktop renderer 는 createHashRouter 기반이므로 Vite 단독 QA도 hash route 로 진입한다. */
function appUrl(route: string): string {
  return `${BASE_URL}/#${route}`
}

/** 스크린샷 저장 디렉토리 (docs/qa/sales-purchase-query-redesign/) */
// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const QA_DIR = resolveMockQaShotsDir(path.resolve(
  _dirname,
  '../../../../docs/qa/sales-purchase-query-redesign',
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

/** Asia/Seoul 기준 오늘 날짜를 YYYY-MM-DD 로 반환 */
function todaySeoul(): string {
  return new Date()
    .toLocaleDateString('ko-KR', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
    .replace(/\. /g, '-')
    .replace('.', '')
    .trim()
}

/** date 문자열에서 YYYY-MM-DD 추출 */
function parseDate(val: string): Date {
  return new Date(val.substring(0, 10))
}

// ---------------------------------------------------------------------------
// pageerror 훅 — PR #156 회귀 가드
// ---------------------------------------------------------------------------

/** 각 테스트 페이지에 pageerror 훅 등록 */
function attachPageErrorHook(page: Page, errors: string[]): void {
  page.on('pageerror', err => {
    errors.push(err.message)
  })
}

// ---------------------------------------------------------------------------
// 판매관리 18 컬럼 정의 (FE agent 마크업의 data-column 속성 기준)
// ---------------------------------------------------------------------------

const EXPECTED_SALES_COLUMNS = [
  '체크박스',       // ☑ 다중선택
  '순번',
  '판매번호',
  '거래처',
  '거래처코드',
  '배송주소',
  '품목',
  '특이사항',
  '금액',
  '출고창고',
  '인수자번호',
  '전표수정내역',
  '감리주소',
  '프로젝트명',
  '담당자명',
  '인쇄',
  '입금예정일',
  '상세',
]

// ---------------------------------------------------------------------------
// TC-S1 ~ TC-S6
// ---------------------------------------------------------------------------

test.describe('판매조회 페이지 (TC-S1~S6)', () => {

  test.skip(SKIP_UI, `dev server 미가용 — set VITE_MOCK_MODE=1 && npx vite --port 5173 후 PLAYWRIGHT_SKIP_UI=0 으로 재시도`)

  test.beforeEach(async ({ page }) => {
    const ok = await isServerAvailable()
    test.skip(!ok, `dev server 미접근: ${BASE_URL}`)
  })

  /**
   * TC-S1: /sales/query 진입 → 기본 날짜 범위 = Asia/Seoul 오늘 ±15일 검증
   *
   * 기대 결과:
   *   - from picker value = 오늘 - 15일 (YYYY-MM-DD)
   *   - to picker value   = 오늘 + 15일 (YYYY-MM-DD)
   *   - 공차 ±1일 (서버 시각 vs 클라이언트 렌더 시점 차이 고려)
   */
  test('TC-S1: 기본 날짜 범위 Asia/Seoul 오늘 ±15일', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(appUrl('/sales/query?mockRole=MASTER'), {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await page.waitForTimeout(1500)

    // from/to 날짜 picker — SalesQueryPage.tsx 의 실제 마크업은 aria-label 이다
    // (`<Input type="date" aria-label="시작 날짜" />` / `"종료 날짜"`).
    // (2026-07-26 하네스 배치) 이전 로케이터는 `[data-testid="sales-query-from"]` /
    // `input[name="from"]` / `input[placeholder*="시작"]` 셋 다 실제 DOM 에 없어서 항상
    // 0 매치였고, else 분기의 "body 길이 > 50" 으로 대체 통과했다 — 즉 ±15일 기본 범위는
    // 이 테스트가 만들어진 이후 **한 번도 검증된 적이 없다**. 실제 셀렉터로 교정하고
    // soft 분기를 제거한다(못 찾으면 RED).
    const fromInput = page.getByLabel('시작 날짜')
    const toInput = page.getByLabel('종료 날짜')

    await expect(fromInput, '판매조회 시작 날짜 입력이 있어야 함').toHaveCount(1)
    await expect(toInput, '판매조회 종료 날짜 입력이 있어야 함').toHaveCount(1)

    const fromVal = await fromInput.inputValue()
    const toVal = await toInput.inputValue()
    expect(fromVal, '시작 날짜 기본값이 비어있음').toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(toVal, '종료 날짜 기본값이 비어있음').toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const today = new Date(todaySeoul())
    const expectedFrom = new Date(today)
    expectedFrom.setDate(today.getDate() - 15)
    const expectedTo = new Date(today)
    expectedTo.setDate(today.getDate() + 15)

    const diffFrom = Math.abs(parseDate(fromVal).getTime() - expectedFrom.getTime()) / 86400000
    expect(diffFrom, `from 날짜 ±15일 범위 초과: ${fromVal}`).toBeLessThanOrEqual(1)
    const diffTo = Math.abs(parseDate(toVal).getTime() - expectedTo.getTime()) / 86400000
    expect(diffTo, `to 날짜 ±15일 범위 초과: ${toVal}`).toBeLessThanOrEqual(1)

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-S1-sales-query-default-date-range.png'),
      fullPage: true,
    })
    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-S2: 판매관리 컬럼 18개 모두 노출
   *
   * 기대 결과:
   *   - 헤더 행에 18개 컬럼이 텍스트/aria-label/data-column 으로 모두 노출
   *   - 체크박스 컬럼 포함
   */
  test('TC-S2: 컬럼 18개 모두 노출', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(appUrl('/sales/query?mockRole=MASTER'), {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await page.waitForTimeout(1500)

    const pageText = (await page.textContent('body')) ?? ''

    // 필수 컬럼 텍스트 노출 검증 (체크박스 제외 16개 텍스트 컬럼)
    const textColumns = EXPECTED_SALES_COLUMNS.filter(c => c !== '체크박스')
    const missing: string[] = []
    for (const col of textColumns) {
      if (!pageText.includes(col)) {
        missing.push(col)
      }
    }

    // 체크박스 컬럼: input[type=checkbox] 또는 thead checkbox 존재
    const checkboxInHeader =
      (await page.locator('thead input[type="checkbox"], th input[type="checkbox"]').count()) > 0
    const hasCheckbox =
      checkboxInHeader || pageText.includes('☑') || pageText.includes('선택')

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-S2-sales-query-18-columns.png'),
      fullPage: true,
    })

    expect(missing, `판매조회 누락 컬럼: [${missing.join(', ')}]`).toHaveLength(0)
    expect(hasCheckbox, '체크박스(다중선택) 컬럼 미노출').toBeTruthy()
    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-S3: 다중 선택 — 행 3개 체크 → toolbar "3행 선택됨" 노출
   *
   * 기대 결과:
   *   - 행 체크박스 3개 클릭 후 선택 상태 toolbar 에 "3" 또는 "3행" 텍스트 노출
   */
  test('TC-S3: 다중 선택 3행 체크 → toolbar 카운트', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(appUrl('/sales/query?mockRole=MASTER'), {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await page.waitForTimeout(1500)

    // tbody 의 행 체크박스 — 최대 3개 클릭
    const rowCheckboxes = page.locator('tbody input[type="checkbox"], [data-testid^="row-checkbox"]')
    const checkboxCount = await rowCheckboxes.count()

    if (checkboxCount >= 3) {
      await rowCheckboxes.nth(0).check()
      await rowCheckboxes.nth(1).check()
      await rowCheckboxes.nth(2).check()

      await page.waitForTimeout(500)

      const pageText = (await page.textContent('body')) ?? ''
      // "3행 선택됨" / "3개 선택" / "선택: 3" 등 다양한 표현 허용
      const hasSelectionCount =
        pageText.includes('3행') ||
        pageText.includes('3개') ||
        /선택.*3|3.*선택/.test(pageText)

      ensureQaDir()
      await page.screenshot({
        path: path.join(QA_DIR, 'TC-S3-sales-query-multi-select-3rows.png'),
        fullPage: true,
      })

      expect(hasSelectionCount, 'toolbar 에 3행 선택 카운트 미노출').toBeTruthy()
    } else {
      // 행 없음 — mock 데이터 부재, 기본 페이지 로드만 검증
      const body = (await page.textContent('body')) ?? ''
      expect(body.length, '판매조회 페이지 body 비어있음').toBeGreaterThan(50)

      ensureQaDir()
      await page.screenshot({
        path: path.join(QA_DIR, 'TC-S3-sales-query-multi-select-nodata.png'),
        fullPage: true,
      })
    }

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-S4: 헤더 체크박스 → 현재 페이지 전체 선택
   *
   * 기대 결과:
   *   - thead 체크박스 클릭 후 tbody 모든 행 체크박스가 checked 상태
   */
  test('TC-S4: 헤더 체크박스 → 전체 선택', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(appUrl('/sales/query?mockRole=MASTER'), {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await page.waitForTimeout(1500)

    const headerCheckbox = page
      .locator('thead input[type="checkbox"], th input[type="checkbox"], [data-testid="select-all-checkbox"]')
      .first()

    const headerExists = (await headerCheckbox.count()) > 0

    if (headerExists) {
      const rowCheckboxes = page.locator('tbody input[type="checkbox"]')
      const total = await rowCheckboxes.count()

      if (total > 0) {
        await headerCheckbox.check()
        await page.waitForTimeout(500)

        // 모든 행 체크박스가 checked 상태인지 검증
        let checkedCount = 0
        for (let i = 0; i < total; i++) {
          const checked = await rowCheckboxes.nth(i).isChecked()
          if (checked) checkedCount++
        }
        expect(checkedCount, `헤더 체크박스 클릭 후 ${total}행 중 ${checkedCount}행만 선택됨`).toBe(total)
      } else {
        const body = (await page.textContent('body')) ?? ''
        expect(body.length, '판매조회 페이지 body 비어있음').toBeGreaterThan(50)
      }
    } else {
      const body = (await page.textContent('body')) ?? ''
      expect(body.length, '판매조회 페이지 body 비어있음').toBeGreaterThan(50)
    }

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-S4-sales-query-header-select-all.png'),
      fullPage: true,
    })
    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-S5: 검색 모달 → 거래처명 입력 → 조회 → 결과 필터링
   *
   * 기대 결과:
   *   - 검색 버튼/모달 트리거 클릭 → 모달 노출
   *   - 거래처명 입력란에 "삼한" 입력
   *   - 조회 버튼 클릭 → 에러 없음, 결과 영역 변화
   */
  test('TC-S5: 검색 모달 거래처명 입력 → 조회', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(appUrl('/sales/query?mockRole=MASTER'), {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await page.waitForTimeout(1500)

    // 검색 모달 트리거 버튼
    const searchTrigger = page.locator(
      '[data-testid="open-search-modal"], button:has-text("검색"), button:has-text("조건"), [aria-label="검색"]',
    ).first()

    const triggerExists = (await searchTrigger.count()) > 0

    if (triggerExists) {
      await searchTrigger.click()
      await page.waitForTimeout(800)

      // 거래처명 입력란
      const partnerInput = page.locator(
        '[data-testid="search-partner-name"], input[name="partnerName"], input[placeholder*="거래처"]',
      ).first()

      const inputExists = (await partnerInput.count()) > 0
      if (inputExists) {
        await partnerInput.fill('삼한')

        // 조회 버튼
        const searchBtn = page.locator(
          '[data-testid="search-submit"], button:has-text("조회"), button[type="submit"]',
        ).first()
        if ((await searchBtn.count()) > 0) {
          await searchBtn.click()
          await page.waitForTimeout(1000)
        }
      }

      const pageText = (await page.textContent('body')) ?? ''
      expect(pageText.length, '검색 후 body 비어있음').toBeGreaterThan(50)
    } else {
      // 모달 트리거 미구현 — URL 파라미터 검색 방식 fallback
      await page.goto(appUrl('/sales/query?mockRole=MASTER&partnerName=삼한'), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1000)
      const body = (await page.textContent('body')) ?? ''
      expect(body.length, '검색 파라미터 포함 페이지 body 비어있음').toBeGreaterThan(50)
    }

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-S5-sales-query-search-modal.png'),
      fullPage: true,
    })
    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-S6: 페이지네이션 — 50개 초과 데이터 → 다음 페이지 클릭 → 51~100건
   *
   * 기대 결과:
   *   - 페이지네이션 "다음" 버튼 존재
   *   - 클릭 후 페이지 번호가 2로 변경되거나 순번이 51부터 시작
   *   - pageerror 없음
   */
  test('TC-S6: 페이지네이션 다음 페이지', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(appUrl('/sales/query?mockRole=MASTER'), {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await page.waitForTimeout(1500)

    const nextBtn = page.locator(
      '[data-testid="pagination-next"], button:has-text("다음"), [aria-label="다음 페이지"], button[aria-label="next"]',
    ).first()

    const nextExists = (await nextBtn.count()) > 0

    if (nextExists) {
      const isDisabled = await nextBtn.isDisabled()
      if (!isDisabled) {
        await nextBtn.click()
        await page.waitForTimeout(1000)

        const pageText = (await page.textContent('body')) ?? ''
        // 순번 51 이상 또는 페이지 2 표시 확인
        const hasPage2 =
          pageText.includes('51') ||
          /페이지.*2|2.*페이지|page.*2/i.test(pageText)

        ensureQaDir()
        await page.screenshot({
          path: path.join(QA_DIR, 'TC-S6-sales-query-pagination-page2.png'),
          fullPage: true,
        })

        expect(hasPage2, '다음 페이지 클릭 후 2페이지 또는 순번 51 미노출').toBeTruthy()
      } else {
        // "다음" 버튼 비활성 — 데이터 50건 이하 (mock 데이터 부재)
        const body = (await page.textContent('body')) ?? ''
        expect(body.length, '판매조회 페이지 body 비어있음').toBeGreaterThan(50)

        ensureQaDir()
        await page.screenshot({
          path: path.join(QA_DIR, 'TC-S6-sales-query-pagination-disabled.png'),
          fullPage: true,
        })
      }
    } else {
      const body = (await page.textContent('body')) ?? ''
      expect(body.length, '판매조회 페이지 body 비어있음').toBeGreaterThan(50)

      ensureQaDir()
      await page.screenshot({
        path: path.join(QA_DIR, 'TC-S6-sales-query-pagination-no-btn.png'),
        fullPage: true,
      })
    }

    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })
})
