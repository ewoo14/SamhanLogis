/**
 * SP-09-2 Aligo SMS 발송 이력(SEND_AUDIT) QA — Playwright 스펙 (재게이트)
 *
 * 실행 조건:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite --port 5173  (별도 터미널)
 *   npx playwright test playwright/sp-09-2-aligo-sms-real-send/sp-09-2-aligo-sms-real-send.spec.ts --reporter=line
 *
 * dev server 미가용 시 테스트 FAIL (false green 방지).
 * 스크린샷 저장: docs/qa/sp-09-2-aligo-sms-real-send/screenshots/*.png
 *
 * ⚠️ 재게이트 근거 (in-process mock 정합):
 *   VITE_MOCK_MODE 의 mock 은 axios 어댑터(in-process)라 HTTP 미발생 → page.route 무효.
 *   따라서 본 스펙은 in-process mock(src/renderer/api/mock.ts)의 SEND_AUDIT 데모 3건에 정합한다:
 *     - 2026-05-17: 성공 2 / 발송금지 1 / msgId ALG-2026051700001
 *     - 2026-05-16: 성공 1 / 실패 1 / msgId ALG-2026051600002 (result_code=-1)
 *     - 2026-05-15: 실패 2 / msgId 없음 (result_code=-2 등)
 *   수신자 마스킹(010-****-NNNN)·msg_id·result_code 는 목록이 아닌 "상세 모달"에 표시된다.
 *
 * TC 목록 (5건):
 *   T1 발송 이력 리스트 진입 — SEND_AUDIT row ≥3 + 상세 모달 수신자 마스킹(010-****-NNNN) 검증
 *   T2 날짜 범위 필터 입력 + 조회 — 테이블 재렌더 + 대상 row 표시
 *   T3 첫 row 상세 버튼 → 상세 모달 + Aligo msg_id 표시
 *   T4 실패 row 상세 버튼 → 상세 모달 + Aligo result_code(에러 사유) 표시
 *   T5 권한 가드 — MANAGER/MASTER/DISPATCH 허용, SALES/ACCOUNTANT 차단
 *
 * false green (|| true / test.skip / page.setContent fallback) 절대 금지.
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

/** 스크린샷 저장 디렉터리 */
// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const QA_DIR = resolveQaShotsDir(path.resolve(
  _dirname,
  '../../../../docs/qa/sp-09-2-aligo-sms-real-send/screenshots',
))

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
// URL 상수 — 실제 HashRouter 라우트 /arologis/dispatch-sms/send-audit
// ---------------------------------------------------------------------------

const SMS_AUDIT_URL_MANAGER = `${BASE_URL}/#/arologis/dispatch-sms/send-audit?mockRole=MANAGER`
const SMS_AUDIT_URL_MASTER = `${BASE_URL}/#/arologis/dispatch-sms/send-audit?mockRole=MASTER`
const SMS_AUDIT_URL_SALES = `${BASE_URL}/#/arologis/dispatch-sms/send-audit?mockRole=SALES`
const SMS_AUDIT_URL_DISPATCH = `${BASE_URL}/#/arologis/dispatch-sms/send-audit?mockRole=DISPATCH`
const SMS_AUDIT_URL_ACCOUNTANT = `${BASE_URL}/#/arologis/dispatch-sms/send-audit?mockRole=ACCOUNTANT`

// in-process mock SEND_AUDIT 데모 3건의 날짜 키 (배차일 = requestParams.date)
const DATE_SUCCESS = '2026-05-17' // 성공 2 / 발송금지 1 / msgId 有
const DATE_PARTIAL = '2026-05-16' // 성공 1 / 실패 1 / msgId 有 (result_code=-1)

// ---------------------------------------------------------------------------
// 헬퍼
// ---------------------------------------------------------------------------

/** 발송 이력 화면 진입 + 제목/테이블 로드 대기. */
async function gotoAuditPage(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
  // 역할 cross-check 시 직전 mockRole 세션이 새 role 로 재설정되도록 reload (sp-09-3/5 확립 패턴)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
}

/** 상세 모달을 연다 (배차일 키 기준). 동일 배차일이 복수일 수 있어 첫 행을 사용. */
async function openDetail(page: Page, date: string) {
  const btn = page.getByTestId(`sms-audit-detail-btn-${date}`).first()
  await expect(btn, `상세 버튼 미표시 — sms-audit-detail-btn-${date}`).toBeVisible({ timeout: 5000 })
  await btn.click()
  // Modal(design-system)은 data-testid 를 forward 하지 않고 role="dialog" 로 렌더된다.
  const modal = page.getByRole('dialog')
  await expect(modal, '상세 modal 미오픈 — role=dialog (발송 감사 상세)').toBeVisible({ timeout: 5000 })
  await expect(modal, '상세 modal 제목 불일치').toContainText('발송 감사 상세')
  // 데이터 ready 대기 — "로딩 중..." 상태에서 innerText 캡처 시 공허 PASS 방지(QA F-1)
  await expect(modal, '상세 modal 로딩 미완료').not.toContainText('로딩 중', { timeout: 5000 })
  return modal
}

// ---------------------------------------------------------------------------
// TC-T1 ~ TC-T5
// ---------------------------------------------------------------------------

test.describe('SP-09-2 Aligo SMS 발송 이력(SEND_AUDIT) QA (T1~T5)', () => {
  test.skip(SKIP_UI, 'PLAYWRIGHT_SKIP_UI=1 — UI 테스트 전체 skip')

  test.beforeEach(async () => {
    const ok = await isServerAvailable()
    // dev server 미가용 시 false green 방지 — skip 아닌 FAIL
    expect(ok, `dev server 미접근: ${BASE_URL} — VITE_MOCK_MODE=1 npx vite --port 5173 실행 후 재시도`).toBe(true)
    ensureQaDir()
  })

  // -------------------------------------------------------------------------
  /**
   * T1: 발송 이력 리스트 진입 + SEND_AUDIT row ≥3 + 상세 모달 수신자 마스킹
   *
   * - /arologis/dispatch-sms/send-audit (HashRouter) 진입 정상
   * - SEND_AUDIT 데모 3건 렌더 (sms-audit-table)
   * - 상세 모달의 수신번호가 마스킹 형식(010-****-NNNN)으로 표시되고 평문 11자리는 미노출
   */
  test('T1: 발송 이력 리스트 진입 + SEND_AUDIT row ≥3 + 수신자 마스킹', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await test.step('MANAGER 권한 발송 이력 화면 진입', async () => {
      await gotoAuditPage(page, SMS_AUDIT_URL_MANAGER)
      const pageTitle = page.locator('h3, h2, h1').first()
      await expect(pageTitle, 'SMS 발송 이력 페이지 제목 미표시 — 실제 화면 진입 실패').toBeVisible({ timeout: 5000 })
    })

    await test.step('SEND_AUDIT row ≥3 확인', async () => {
      const queryBtn = page.getByTestId('sms-audit-search-btn')
      if ((await queryBtn.count()) > 0) {
        await queryBtn.click()
        await page.waitForTimeout(600)
      }
      const rowLocator = page.locator('[data-testid^="sms-audit-date-"]')
      const rowCount = await rowLocator.count()
      expect(
        rowCount,
        `SEND_AUDIT row 렌더 미확인 — 현재 rowCount=${rowCount}. in-process mock 데모 3건 기대`,
      ).toBeGreaterThanOrEqual(3)
    })

    await test.step('상세 모달 수신자 마스킹(010-****-NNNN) 검증', async () => {
      const modal = await openDetail(page, DATE_SUCCESS)

      // 마스킹 형식(010-****-NNNN) 출현을 blocking 대기 — 데이터 ready 보장 + 공허 PASS 방지(QA F-1)
      await expect(
        modal,
        '마스킹 형식(010-****-NNNN) 미표시 — 수신자 마스킹 회귀',
      ).toContainText(/010-\*{4}-\d{4}/, { timeout: 5000 })

      // 평문 11자리(01012345678 등) 미노출 — 마스킹 회귀 가드 (데이터 렌더 후 검사)
      const modalText = (await modal.innerText()).replace(/\s+/g, ' ')
      expect(
        /01\d{9}/.test(modalText),
        `평문 전화번호(01XXXXXXXXX) 노출 — 마스킹 실패. modal text="${modalText}"`,
      ).toBe(false)

      await page.screenshot({ path: path.join(QA_DIR, 'sp-09-2-t1-masking.png'), fullPage: true })
    })

    expect(errors, `pageerror 발생: ${errors.join(' | ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T2: 날짜 범위 필터 입력 + 조회 — 테이블 재렌더 + 대상 row 표시
   *
   * ⚠️ in-process mock 한계: 서버측 from/to 날짜 필터링은 미구현(항상 SEND_AUDIT 3건 반환).
   *    따라서 본 TC 는 (1) 필터 입력 UI 동작 (2) 조회 후 테이블 재렌더 (3) 범위 내 대상 row 표시를
   *    검증한다. 서버측 날짜 필터 strict 검증은 Phase 11 mock 보강 후속.
   */
  test('T2: 날짜 범위 필터 (2026-05-15 ~ 2026-05-17) 입력 + 조회', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await gotoAuditPage(page, SMS_AUDIT_URL_MANAGER)
    await expect(page.locator('h3, h2, h1').first()).toBeVisible({ timeout: 5000 })

    await test.step('날짜 범위 입력 + 조회', async () => {
      // Input(design-system)은 ...rest 로 data-testid 를 <input> 에 직접 forward 한다.
      await page.getByTestId('sms-audit-filter-from').fill('2026-05-15')
      await page.getByTestId('sms-audit-filter-to').fill('2026-05-17')
      await page.getByTestId('sms-audit-search-btn').click()
      await page.waitForTimeout(800)
    })

    await test.step('테이블 재렌더 + 범위 내 대상 row 표시', async () => {
      // DataTable 은 data-testid 를 DOM 에 forward 하지 않으므로 배차일 셀로 렌더를 검증한다.
      const rows = page.locator('[data-testid^="sms-audit-date-"]')
      await expect(rows.first(), '날짜 필터 적용 후 발송 이력 row 미렌더').toBeVisible({ timeout: 5000 })
      // 범위 내 대상 row(2026-05-17) 표시 (동일 배차일 복수 가능 → first)
      await expect(
        page.getByTestId(`sms-audit-date-${DATE_SUCCESS}`).first(),
        `범위 내 대상 row(${DATE_SUCCESS}) 미표시`,
      ).toBeVisible({ timeout: 5000 })
      await page.screenshot({ path: path.join(QA_DIR, 'sp-09-2-t2-date-filter.png'), fullPage: true })
    })

    expect(errors, `pageerror 발생: ${errors.join(' | ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T3: 첫 row 상세 버튼 → 상세 모달 + Aligo msg_id 표시
   */
  test('T3: 첫 번째 SEND_AUDIT row 상세 → 모달 오픈 + Aligo msg_id', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await gotoAuditPage(page, SMS_AUDIT_URL_MANAGER)
    await expect(page.locator('h3, h2, h1').first()).toBeVisible({ timeout: 5000 })

    const modal = await openDetail(page, DATE_SUCCESS)

    await test.step('Aligo msg_id 표시 검증', async () => {
      const msgId = page.getByTestId('dispatch-sms-send-audit-msg-id')
      await expect(msgId, 'Aligo msg_id 미표시 — dispatch-sms-send-audit-msg-id').toBeVisible({ timeout: 5000 })
      await expect(msgId, 'msg_id 값(ALG-)이 표시되지 않음').toContainText('ALG-')
      // 성공 배지 동반 표시
      await expect(modal).toContainText('성공')
      await page.screenshot({ path: path.join(QA_DIR, 'sp-09-2-t3-detail-msgid.png'), fullPage: true })
    })

    expect(errors, `pageerror 발생: ${errors.join(' | ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T4: 실패 row 상세 버튼 → 상세 모달 + Aligo result_code(에러 사유) 표시
   *
   * 2026-05-16 row 는 성공1/실패1 — 실패 details 의 reason 에 'result_code=-1' 이 포함된다.
   */
  test('T4: 실패 row 상세 → 상세 modal + Aligo result_code', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    await gotoAuditPage(page, SMS_AUDIT_URL_MANAGER)
    await expect(page.locator('h3, h2, h1').first()).toBeVisible({ timeout: 5000 })

    const modal = await openDetail(page, DATE_PARTIAL)

    await test.step('Aligo result_code(에러 사유) 표시 검증', async () => {
      const modalText = (await modal.innerText()).replace(/\s+/g, ' ')
      expect(
        modalText.includes('result_code'),
        `Aligo result_code 미표시 — modal text="${modalText}"`,
      ).toBe(true)
      // 실패 배지 동반 표시
      await expect(modal).toContainText('실패')
      await page.screenshot({ path: path.join(QA_DIR, 'sp-09-2-t4-result-code.png'), fullPage: true })
    })

    expect(errors, `pageerror 발생: ${errors.join(' | ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T5: 권한 가드 — MANAGER/MASTER/DISPATCH 허용, SALES/ACCOUNTANT 차단
   *
   * notification.dispatch-sms.send-audit: MANAGER/DISPATCH/MASTER 보유, SALES/ACCOUNTANT 미보유.
   * 차단 판정은 "접근 권한이 없습니다" 화면 OR 페이지 제목 미진입(redirect)을 허용 (sp-d4 패턴).
   */
  test('T5: 권한 가드 — MANAGER/MASTER/DISPATCH 허용, SALES/ACCOUNTANT 차단', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    // 허용: 제목 진입 + 실제 데이터 row 렌더까지 검증 (제목만으로는 공허 — QA F-3)
    const allowedTitle = async (url: string, label: string) => {
      await gotoAuditPage(page, url)
      const title = page.getByText('SMS 발송 이력', { exact: false }).first()
      await expect(title, `${label} 권한인데 발송 이력 화면 미진입`).toBeVisible({ timeout: 5000 })
      await expect(
        page.locator('[data-testid^="sms-audit-date-"]').first(),
        `${label} 권한인데 발송 이력 데이터 row 미렌더`,
      ).toBeVisible({ timeout: 5000 })
    }

    // 차단: 거부 화면 표시 OR 화면 미진입(제목 부재 = redirect). "제목 진입+데이터 0건"을 차단으로
    // 오판하지 않도록 rowsVisible 은 차단 신호에서 제외한다 (QA F-2 — PermissionGuard 미동작 회귀 감지).
    const blocked = async (url: string, label: string) => {
      await gotoAuditPage(page, url)
      const denied = page.getByText('접근 권한이 없습니다', { exact: false })
      const title = page.getByText('SMS 발송 이력', { exact: false })
      const deniedVisible = (await denied.count()) > 0 && (await denied.first().isVisible())
      const titleVisible = (await title.count()) > 0 && (await title.first().isVisible())
      expect(
        deniedVisible || !titleVisible,
        `${label} 권한인데 발송 이력 화면 진입 허용됨(거부화면 없음 + 제목 표시) — 차단 실패`,
      ).toBe(true)
    }

    await test.step('MANAGER 허용', async () => allowedTitle(SMS_AUDIT_URL_MANAGER, 'MANAGER'))
    await test.step('MASTER 허용', async () => allowedTitle(SMS_AUDIT_URL_MASTER, 'MASTER'))
    await test.step('DISPATCH 허용', async () => allowedTitle(SMS_AUDIT_URL_DISPATCH, 'DISPATCH'))
    await test.step('SALES 차단', async () => blocked(SMS_AUDIT_URL_SALES, 'SALES'))
    await test.step('ACCOUNTANT 차단', async () => blocked(SMS_AUDIT_URL_ACCOUNTANT, 'ACCOUNTANT'))

    await page.screenshot({ path: path.join(QA_DIR, 'sp-09-2-t5-rbac.png'), fullPage: true })
    expect(errors, `pageerror 발생: ${errors.join(' | ')}`).toHaveLength(0)
  })
})
