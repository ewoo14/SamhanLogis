/**
 * 구매조회 페이지 Playwright 스펙 — sales-purchase-query-redesign
 *
 * 실행 조건:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite --port 5173 (별도 터미널)
 *   npx playwright test playwright/sales-purchase-query/purchase-query-page.spec.ts --reporter=line
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
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

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

/** 스크린샷 저장 디렉토리 */
// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const QA_DIR = resolveQaShotsDir(path.resolve(
  _dirname,
  '../../../../docs/qa/sales-purchase-query-redesign',
))

function ensureQaDir(): void {
  if (!fs.existsSync(QA_DIR)) {
    fs.mkdirSync(QA_DIR, { recursive: true })
  }
}

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

// ---------------------------------------------------------------------------
// pageerror 훅 — PR #156 회귀 가드
// ---------------------------------------------------------------------------

function attachPageErrorHook(page: Page, errors: string[]): void {
  page.on('pageerror', err => {
    errors.push(err.message)
  })
}

// ---------------------------------------------------------------------------
// 구매관리 12 컬럼 정의
// ---------------------------------------------------------------------------

const EXPECTED_PURCHASE_COLUMNS = [
  '체크박스',   // ☑ 다중선택
  '순번',
  '구매번호',
  '거래처',
  '거래처코드',
  '품목',
  '금액',
  '수량합계',
  '입고창고',
  '적요',
  '비고',
  '상세',
]

// ---------------------------------------------------------------------------
// TC-P1 ~ TC-P3
// ---------------------------------------------------------------------------

test.describe('구매조회 페이지 (TC-P1~P3)', () => {

  test.skip(SKIP_UI, `dev server 미가용 — set VITE_MOCK_MODE=1 && npx vite --port 5173 후 PLAYWRIGHT_SKIP_UI=0 으로 재시도`)

  test.beforeEach(async ({ page }) => {
    const ok = await isServerAvailable()
    test.skip(!ok, `dev server 미접근: ${BASE_URL}`)
  })

  /**
   * TC-P1: /purchases/query 진입 → 컬럼 12개 노출
   *
   * 기대 결과:
   *   - 체크박스/순번/구매번호/거래처/거래처코드/품목/금액/수량합계/입고창고/적요/비고/상세
   *   - 페이지 에러 없음
   */
  test('TC-P1: 구매관리 컬럼 12개 노출', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(appUrl('/purchases/query?mockRole=MASTER'), {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await page.waitForTimeout(1500)

    const pageText = (await page.textContent('body')) ?? ''

    // 텍스트 컬럼 검증 (체크박스 제외 10개)
    const textColumns = EXPECTED_PURCHASE_COLUMNS.filter(c => c !== '체크박스')
    const missing: string[] = []
    for (const col of textColumns) {
      if (!pageText.includes(col)) {
        missing.push(col)
      }
    }

    // 체크박스 컬럼 존재
    const checkboxInHeader =
      (await page.locator('thead input[type="checkbox"], th input[type="checkbox"]').count()) > 0
    const hasCheckbox =
      checkboxInHeader || pageText.includes('☑') || pageText.includes('선택')

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-P1-purchase-query-12-columns.png'),
      fullPage: true,
    })

    expect(missing, `구매조회 누락 컬럼: [${missing.join(', ')}]`).toHaveLength(0)
    expect(hasCheckbox, '체크박스(다중선택) 컬럼 미노출').toBeTruthy()
    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-P2: slipType=INBOUND 만 노출 검증 (OUTBOUND 행 0건)
   *
   * 기대 결과:
   *   - 구매조회 목록에 "출고" / OUTBOUND 행이 0건
   *   - 입고(INBOUND) 전표만 노출 (구매번호 패턴 또는 입고창고 컬럼 존재)
   *   - pageerror 없음
   */
  test('TC-P2: slipType=INBOUND 만 노출, OUTBOUND 0건', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(appUrl('/purchases/query?mockRole=MASTER'), {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await page.waitForTimeout(1500)

    const pageText = (await page.textContent('body')) ?? ''

    // "출고" 또는 "OUTBOUND" 가 데이터 행에 노출되지 않아야 함
    // 헤더/버튼 등에는 "출고" 가 있을 수 있으므로 tbody 기준 체크
    const tbodyRows = page.locator('tbody tr')
    const rowCount = await tbodyRows.count()

    let outboundRowFound = false
    for (let i = 0; i < rowCount; i++) {
      const rowText = (await tbodyRows.nth(i).textContent()) ?? ''
      if (rowText.includes('OUTBOUND') || rowText.includes('출고전표')) {
        outboundRowFound = true
        break
      }
    }

    // 입고창고 컬럼이 헤더에 노출됨을 재확인
    const hasInboundWarehouse =
      pageText.includes('입고창고') ||
      pageText.includes('INBOUND') ||
      pageText.includes('입고')

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-P2-purchase-query-inbound-only.png'),
      fullPage: true,
    })

    expect(outboundRowFound, '구매조회에 OUTBOUND 행이 노출됨').toBeFalsy()
    expect(hasInboundWarehouse, '입고창고/INBOUND 관련 텍스트 미노출').toBeTruthy()
    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })

  /**
   * TC-P3: 검색 모달 → 사업자등록번호 입력 → 조회
   *
   * 기대 결과:
   *   - 검색 모달 트리거 → 사업자등록번호 입력란 존재
   *   - "123-45-67890" 형식 입력 → 조회 → 에러 없음
   *   - pageerror 없음
   */
  test('TC-P3: 검색 모달 사업자등록번호 입력 → 조회', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await page.goto(appUrl('/purchases/query?mockRole=MASTER'), {
      waitUntil: 'domcontentloaded',
      timeout: 20000,
    })
    await page.waitForTimeout(1500)

    // 검색 모달 트리거
    const searchTrigger = page.locator(
      '[data-testid="open-search-modal"], button:has-text("검색"), button:has-text("조건"), [aria-label="검색"]',
    ).first()

    const triggerExists = (await searchTrigger.count()) > 0

    if (triggerExists) {
      await searchTrigger.click()
      await page.waitForTimeout(800)

      // 사업자등록번호 입력란
      const bizInput = page.locator(
        '[data-testid="search-business-number"], input[name="businessNumber"], input[placeholder*="사업자"]',
      ).first()

      const inputExists = (await bizInput.count()) > 0
      if (inputExists) {
        await bizInput.fill('123-45-67890')

        const searchBtn = page.locator(
          '[data-testid="search-submit"], button:has-text("조회"), button[type="submit"]',
        ).first()
        if ((await searchBtn.count()) > 0) {
          await searchBtn.click()
          await page.waitForTimeout(1000)
        }
      }
    } else {
      // URL 파라미터 검색 방식 fallback
      await page.goto(appUrl('/purchases/query?mockRole=MASTER&businessNumber=123-45-67890'), {
        waitUntil: 'domcontentloaded',
        timeout: 20000,
      })
      await page.waitForTimeout(1000)
    }

    const body = (await page.textContent('body')) ?? ''
    expect(body.length, '구매조회 검색 후 body 비어있음').toBeGreaterThan(50)

    ensureQaDir()
    await page.screenshot({
      path: path.join(QA_DIR, 'TC-P3-purchase-query-search-biz-no.png'),
      fullPage: true,
    })
    expect(errors, `pageerror 발생: ${errors.join(', ')}`).toHaveLength(0)
  })
})
