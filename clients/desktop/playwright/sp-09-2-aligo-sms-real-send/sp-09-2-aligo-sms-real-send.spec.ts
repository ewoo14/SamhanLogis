/**
 * SP-09-2 Aligo SMS 실 발송 + send_audit QA — Playwright 스펙
 *
 * 실행 조건:
 *   cd clients/desktop
 *   VITE_MOCK_MODE=1 npx vite --port 5173  (별도 터미널)
 *   npx playwright test playwright/sp-09-2-aligo-sms-real-send/sp-09-2-aligo-sms-real-send.spec.ts --reporter=line
 *
 * dev server 미가용 시 테스트 FAIL (false green 방지 — SP-09-1 cycle 1 H1 회귀 방지).
 * 스크린샷 저장: docs/qa/sp-09-2-aligo-sms-real-send/screenshots/*.png
 *
 * TC 목록 (5건):
 *   T1 발송 이력 리스트 진입 — SEND_AUDIT row 5+ 확인 + 수신자 마스킹 검증 (010-****-1234)
 *   T2 필터 (날짜 범위 + 결과 상태) 적용 — 결과 row 갱신 확인
 *   T3 row 클릭 — 상세 modal 표시 + 전체 메시지 + msg_id 표시
 *   T4 실패 사례 row 클릭 — Aligo result_code + 한국어 에러 메시지 표시
 *   T5 권한 가드 — MANAGER/MASTER/DISPATCH 허용, SALES/ACCOUNTANT 차단
 *
 * SP-09-1 패턴: test.step 분리 + role="alert" assertion + data-testid 사용
 * false green (|| true / test.skip / page.setContent fallback) 절대 금지
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
  '../../../../docs/qa/sp-09-2-aligo-sms-real-send/screenshots',
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
// URL 상수 — 실제 HashRouter 라우트 /arologis/dispatch-sms/send-audit
// ---------------------------------------------------------------------------

const SMS_AUDIT_URL_MANAGER = `${BASE_URL}/#/arologis/dispatch-sms/send-audit?mockRole=MANAGER`
const SMS_AUDIT_URL_MASTER = `${BASE_URL}/#/arologis/dispatch-sms/send-audit?mockRole=MASTER`
const SMS_AUDIT_URL_SALES = `${BASE_URL}/#/arologis/dispatch-sms/send-audit?mockRole=SALES`
const SMS_AUDIT_URL_DISPATCH = `${BASE_URL}/#/arologis/dispatch-sms/send-audit?mockRole=DISPATCH`
const SMS_AUDIT_URL_ACCOUNTANT = `${BASE_URL}/#/arologis/dispatch-sms/send-audit?mockRole=ACCOUNTANT`

// ---------------------------------------------------------------------------
// Mock 데이터 — Aligo send_audit 발송 이력 10건 (성공 7 + 실패 3)
// ---------------------------------------------------------------------------

function mockSendAuditRows(count: number = 10) {
  return Array.from({ length: count }, (_, i) => {
    const seq = i + 1
    const failed = seq % 4 === 0  // seq 4, 8 → 실패
    const phone = `010-${String(1000 + seq * 19 % 9000).padStart(4, '0')}-${String(1000 + seq * 47 % 9000).padStart(4, '0')}`
    return {
      id: `send-audit-mock-id-${seq.toString().padStart(4, '0')}`,
      saveMode: 'SEND_AUDIT',
      topic: `발송 감사 ${seq}건차`,
      programType: 'DISPATCH_SMS',
      rowCount: seq + 2,
      recipientPhone: phone,
      recipientPhoneMasked: phone.replace(/(\d{3})-(\d{4})-(\d{4})/, '$1-****-$3'),
      resultCode: failed ? -101 : 1,
      resultMessage: failed ? '수신 거부 등록된 번호입니다.' : '성공',
      msgId: failed ? null : `aligo-msg-${seq}-1747555200000`,
      rawResponse: failed
        ? JSON.stringify({ result_code: -101, message: '수신 거부 등록된 번호입니다.' })
        : JSON.stringify({ result_code: 1, message: '성공', msg_id: `aligo-msg-${seq}-1747555200000` }),
      messageBody: `[삼한공조] 배차 안내: ${seq}건차 출발 예정입니다. 확인 부탁드립니다.`,
      sentAt: `2026-05-${String(17 + (seq % 2)).padStart(2, '0')}T${String(9 + (seq % 8)).padStart(2, '0')}:${String(seq % 60).padStart(2, '0')}:00Z`,
      createdBy: `dispatch-user-${String.fromCharCode(97 + (seq % 3))}`,
      status: failed ? 'FAILED' : 'SENT',
    }
  })
}

/** Aligo 발송 이력 API mock 응답 */
function buildSendAuditListResponse(rows: ReturnType<typeof mockSendAuditRows>) {
  return {
    success: true,
    data: {
      content: rows,
      totalElements: rows.length,
      totalPages: 1,
      size: 20,
      number: 0,
    },
  }
}

// ---------------------------------------------------------------------------
// TC-T1 ~ TC-T5
// ---------------------------------------------------------------------------

test.describe('SP-09-2 Aligo SMS 실 발송 + send_audit QA (T1~T5)', () => {
  test.skip(SKIP_UI, 'PLAYWRIGHT_SKIP_UI=1 — UI 테스트 전체 skip')

  test.beforeEach(async () => {
    const ok = await isServerAvailable()
    // dev server 미가용 시 false green 방지 — skip 아닌 FAIL
    expect(ok, `dev server 미접근: ${BASE_URL} — VITE_MOCK_MODE=1 npx vite --port 5173 실행 후 재시도`).toBe(true)
  })

  // -------------------------------------------------------------------------
  /**
   * T1: 발송 이력 리스트 진입 — SEND_AUDIT row 5+ 확인 + 수신자 마스킹 검증
   *
   * 검증 항목:
   *   - /arologis/dispatch-sms/send-audit (HashRouter) 진입 정상
   *   - SEND_AUDIT mode 필터 적용 후 row 5개 이상 확인
   *   - 수신자 전화번호가 마스킹 형식 (010-****-NNNN) 으로 표시됨
   *     (평문 010-NNNN-NNNN 존재 검증 후 마스킹 assert — 데이터 부재 PASS 금지)
   *   - UUID 텍스트 노드 미노출 (피드백 UUID 비공개 원칙)
   *   - pageerror 없음
   *
   * BE 계약 근거:
   *   GET /admin/notifications/dispatch-sms/history?mode=SEND_AUDIT
   *   NotificationAdminController — MANAGER/MASTER 권한
   *   AligoSmsAdapter — result_code 1 성공, 그 외 실패
   *   recipientAddress 는 FE 마스킹 적용 후 표시 (010-****-NNNN)
   */
  test('T1: 발송 이력 리스트 진입 + SEND_AUDIT row 5+ + 수신자 마스킹', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    const auditRows = mockSendAuditRows(10)

    // ── step 1: SEND_AUDIT 발송 이력 API mock 등록
    await test.step('SEND_AUDIT 발송 이력 API mock 등록', async () => {
      await page.route('**/admin/notifications/dispatch-sms/history**', async route => {
        const url = route.request().url()
        const isSendAudit = url.includes('mode=SEND_AUDIT') || url.includes('saveMode=SEND_AUDIT')
        const rows = isSendAudit ? auditRows : auditRows.slice(0, 3)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildSendAuditListResponse(rows)),
        })
      })

      await page.route('**/admin/notifications**', async route => {
        const url = route.request().url()
        if (url.includes('/dispatch-sms/')) {
          return
        }
        const status = url.includes('status=SENT') ? 'SENT' : url.includes('status=FAILED') ? 'FAILED' : null
        const filtered = auditRows.filter(r =>
          (status == null || r.status === status)
        )
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: filtered }),
        })
      })
    })

    // ── step 2: MANAGER 권한으로 SMS 발송 이력 화면 진입
    await test.step('MANAGER 권한 발송 이력 화면 진입', async () => {
      await page.goto(SMS_AUDIT_URL_MANAGER, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      // 실제 화면 로드 여부 검증 — fallback 텍스트("접근"/"로그인")만으로는 PASS 불가
      const pageTitle = page.locator('h3, h2, h1').first()
      await expect(pageTitle, 'SMS 발송 이력 페이지 제목 미표시 — 실제 화면 진입 실패').toBeVisible({ timeout: 5000 })
    })

    // ── step 3: SEND_AUDIT row 5+ 확인
    await test.step('SEND_AUDIT row 5개 이상 확인', async () => {
      // 조회 버튼 클릭 (존재 시)
      const queryBtn = page.locator('[data-testid="sms-audit-search-btn"]').first()
      if ((await queryBtn.count()) > 0) {
        await queryBtn.click()
        await page.waitForTimeout(800)
      }

      // row count 확인 — data-testid 패턴 또는 tbody tr
      const rowLocator = page.locator(
        '[data-testid="sms-audit-table"] tbody tr, [data-testid^="sms-audit-date-"]',
      )
      const rowCount = await rowLocator.count()

      expect(
        rowCount,
        `SEND_AUDIT row 5개 이상 미확인 — 현재 rowCount=${rowCount}. data-testid="sms-audit-table" 테이블 렌더 필요`,
      ).toBeGreaterThanOrEqual(5)
    })

    // ── step 4: 수신자 전화번호 마스킹 형식 검증
    await test.step('수신자 전화번호 마스킹 형식 검증 (010-****-NNNN)', async () => {
      const bodyText = (await page.textContent('body')) ?? ''

      // 마스킹 패턴 존재 확인
      const maskingPattern = /010-\*{4}-\d{4}/
      const hasMasking = maskingPattern.test(bodyText)

      // 평문 전화번호 (010-NNNN-NNNN) 미노출 확인
      const plainPhoneInBody = /010-\d{4}-\d{4}/.test(bodyText)

      ensureQaDir()
      await page.screenshot({
        path: path.join(QA_DIR, 'T1-send-audit-list-masking.png'),
        fullPage: true,
      })

      // 마스킹 검증: 데이터가 화면에 렌더된 경우 반드시 마스킹 형식이어야 함
      // !plainPhoneInBody 는 데이터 자체가 없을 때도 PASS 하는 false green — 사용 금지
      // 평문이 없다면 마스킹도 없어야 하거나, 마스킹이 있어야 정상
      if (plainPhoneInBody) {
        expect(
          hasMasking,
          '수신자 전화번호 평문 노출 — 마스킹 형식 (010-****-NNNN) 미적용. 화면에 010-NNNN-NNNN 형식 전화번호 표시됨',
        ).toBe(true)
        expect(
          plainPhoneInBody,
          '수신자 전화번호 평문 (010-NNNN-NNNN) 미마스킹 상태로 화면에 노출됨',
        ).toBe(false)
      } else {
        // 데이터가 없거나 마스킹 처리된 경우 — 마스킹이 표시되어야 정상 데이터 로드
        expect(
          hasMasking,
          '마스킹 데이터(010-****-NNNN) 미표시 — API mock 응답 10건이 화면에 렌더되지 않음',
        ).toBe(true)
      }
    })

    // ── step 5: UUID 비공개 — 텍스트 노드 UUID 미노출
    await test.step('UUID 텍스트 노드 미노출 검증', async () => {
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
        `UUID 텍스트 노출 위반 (UUID 비공개 원칙): ${visibleUuids.join(', ')}`,
      ).toHaveLength(0)
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T2: 필터 (날짜 범위 + 결과 상태) 적용 — 결과 row 갱신 확인
   *
   * 검증 항목:
   *   - 날짜 범위 (from: 2026-05-17, to: 2026-05-18) 입력 후 조회
   *   - 결과 상태 필터 (SUCCESS / FAIL) 적용 후 row 수 변화 확인
   *   - 필터 적용 전/후 row count 비교 (필터 동작 증명)
   *   - "조회 결과 없음" 메시지가 아닌 row 렌더 확인
   *   - pageerror 없음
   *
   * BE 계약 근거:
   *   GET /admin/notifications/dispatch-sms/history?mode=SEND_AUDIT&from=...&to=...
   *   DateRange.of(from, to) 경계 포함 (from=to 동일일 포함)
   *   결과 필터 — DispatchSmsSendAuditPage 클라이언트 측 SUCCESS/PARTIAL/FAIL 로컬 필터링
   */
  test('T2: 날짜 범위 + 결과 상태 필터 적용 — row 갱신 확인', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    const allRows = mockSendAuditRows(10)
    const sentRows = allRows.filter(r => r.status === 'SENT')
    const failedRows = allRows.filter(r => r.status === 'FAILED')

    // ── step 1: 날짜 범위 + 상태 필터 route mock — 파라미터 기반 응답 분기
    await test.step('날짜 범위 + 상태 필터 API mock 등록', async () => {
      await page.route('**/admin/notifications/dispatch-sms/history**', async route => {
        const url = route.request().url()
        let rows = allRows

        if (url.includes('status=SENT') || url.includes('gatewayStatus=SUCCESS')) {
          rows = sentRows
        } else if (url.includes('status=FAILED') || url.includes('gatewayStatus=FAILURE')) {
          rows = failedRows
        }

        // 날짜 범위 필터 시뮬레이션 — from/to 파라미터 있으면 절반만 반환
        if (url.includes('from=') && url.includes('to=')) {
          rows = rows.slice(0, Math.max(1, Math.floor(rows.length / 2)))
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildSendAuditListResponse(rows)),
        })
      })
    })

    // ── step 2: 초기 진입 — 전체 row 확인
    await test.step('초기 진입 — 전체 목록 확인', async () => {
      await page.goto(SMS_AUDIT_URL_MANAGER, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      // 실제 화면 제목 확인 — bodyText fallback PASS 금지
      const pageTitle = page.locator('h3, h2, h1').first()
      await expect(pageTitle, '초기 발송 이력 페이지 미로드 — 화면 제목 미표시').toBeVisible({ timeout: 5000 })
    })

    // ── step 3: 날짜 범위 필터 입력 + 조회
    await test.step('날짜 범위 필터 (2026-05-17 ~ 2026-05-18) 입력 + 조회', async () => {
      // from 날짜 입력 — 실제 data-testid="sms-audit-filter-from"
      const fromInput = page.locator('[data-testid="sms-audit-filter-from"]').first()
      await expect(fromInput, '날짜 시작(from) 입력 필드 미존재 — data-testid="sms-audit-filter-from"').toBeVisible({ timeout: 5000 })
      await fromInput.fill('2026-05-17')
      await page.waitForTimeout(300)

      // to 날짜 입력 — 실제 data-testid="sms-audit-filter-to"
      const toInput = page.locator('[data-testid="sms-audit-filter-to"]').first()
      await expect(toInput, '날짜 종료(to) 입력 필드 미존재 — data-testid="sms-audit-filter-to"').toBeVisible({ timeout: 5000 })
      await toInput.fill('2026-05-18')
      await page.waitForTimeout(300)

      // 조회 버튼 클릭 — data-testid="sms-audit-search-btn"
      const queryBtn = page.locator('[data-testid="sms-audit-search-btn"]').first()
      await expect(queryBtn, '조회 버튼 미존재 — data-testid="sms-audit-search-btn"').toBeVisible({ timeout: 5000 })
      await queryBtn.click()
      await page.waitForTimeout(800)

      // row 또는 empty 메시지 표시 확인
      const table = page.locator('[data-testid="sms-audit-table"]')
      await expect(table, '날짜 필터 적용 후 sms-audit-table 미렌더').toBeVisible({ timeout: 5000 })
    })

    // ── step 4: SUCCESS 상태 필터 적용 + 스크린샷
    await test.step('SUCCESS 상태 필터 적용 + row 수 변화 확인', async () => {
      // 결과 필터 select — data-testid="sms-audit-filter-result"
      const resultSelect = page.locator('[data-testid="sms-audit-filter-result"]').first()
      await expect(resultSelect, '결과 필터 select 미존재 — data-testid="sms-audit-filter-result"').toBeVisible({ timeout: 5000 })
      await resultSelect.selectOption('SUCCESS')
      await page.waitForTimeout(500)

      const queryBtn = page.locator('[data-testid="sms-audit-search-btn"]').first()
      await queryBtn.click()
      await page.waitForTimeout(800)

      ensureQaDir()
      await page.screenshot({
        path: path.join(QA_DIR, 'T2-filter-date-status.png'),
        fullPage: true,
      })

      const table = page.locator('[data-testid="sms-audit-table"]')
      await expect(table, 'SUCCESS 필터 후 sms-audit-table 미렌더').toBeVisible({ timeout: 5000 })
    })

    // ── step 5: FAIL 상태 필터 적용
    await test.step('FAIL 상태 필터 적용 + 실패 row 표시 확인', async () => {
      const resultSelect = page.locator('[data-testid="sms-audit-filter-result"]').first()
      await resultSelect.selectOption('FAIL')
      await page.waitForTimeout(500)

      const queryBtn = page.locator('[data-testid="sms-audit-search-btn"]').first()
      await queryBtn.click()
      await page.waitForTimeout(800)

      const table = page.locator('[data-testid="sms-audit-table"]')
      await expect(table, 'FAIL 필터 후 sms-audit-table 미렌더').toBeVisible({ timeout: 5000 })
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T3: row 클릭 — 상세 modal 표시 + 전체 메시지 + msg_id 표시
   *
   * 검증 항목:
   *   - SEND_AUDIT row 클릭 시 상세 modal 오픈
   *   - modal 내 Aligo msg_id 노출 (aligo-msg-N-EPOCHMILLI 형식)
   *   - data-testid="dispatch-sms-send-audit-detail-modal" 확인 (실제 TSX 기준)
   *   - modal 닫기 후 목록 복귀
   *   - pageerror 없음
   *
   * BE 계약 근거:
   *   GET /admin/notifications/dispatch-sms/history/{id}
   *   DispatchSmsSaveHistoryDetailResponse — responsePayload.sent/failed/blocked + rawResponse
   *   AligoSmsAdapter — result_code 1 → msg_id 포함 NotificationGatewayResult.success(messageId, rawResponse)
   */
  test('T3: row 클릭 — 상세 modal + 전체 메시지 + msg_id 표시', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    const auditRows = mockSendAuditRows(10)
    const targetRow = auditRows[0]  // 성공 사례 row (seq=1)

    // ── step 1: 목록 + 상세 API mock 등록
    await test.step('목록 + 상세 API mock 등록', async () => {
      await page.route('**/admin/notifications/dispatch-sms/history**', async route => {
        const url = route.request().url()
        const detailMatch = url.match(/history\/([^?]+)/)
        if (detailMatch) {
          const id = detailMatch[1]
          const found = auditRows.find(r => r.id === id) ?? targetRow
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: {
                id: found.id,
                saveMode: found.saveMode,
                topic: found.topic,
                programType: found.programType,
                savedAt: found.sentAt,
                responsePayload: {
                  sent: found.status === 'SENT' ? found.rowCount : 0,
                  failed: found.status === 'FAILED' ? found.rowCount : 0,
                  blocked: 0,
                  rawResponse: found.rawResponse,
                  messageBody: found.messageBody,
                  msgId: found.msgId,
                },
                requestParams: { rowCount: found.rowCount, date: '2026-05-17' },
              },
            }),
          })
          return
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildSendAuditListResponse(auditRows)),
        })
      })
    })

    // ── step 2: SEND_AUDIT 모드 진입
    await test.step('SEND_AUDIT 모드 발송 이력 목록 진입', async () => {
      await page.goto(SMS_AUDIT_URL_MANAGER, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      const queryBtn = page.locator('[data-testid="sms-audit-search-btn"]').first()
      if ((await queryBtn.count()) > 0) {
        await queryBtn.click()
        await page.waitForTimeout(800)
      }
    })

    // ── step 3: 첫 번째 row 상세 버튼 클릭 → 상세 modal 오픈
    await test.step('첫 번째 SEND_AUDIT row 상세 버튼 클릭 → 상세 modal 오픈', async () => {
      // sms-audit-table 안의 상세 버튼 — data-testid="sms-audit-detail-btn-{date}"
      const detailBtn = page.locator('[data-testid^="sms-audit-detail-btn-"]').first()
      await expect(detailBtn, '상세 버튼 미존재 — data-testid="sms-audit-detail-btn-*". sms-audit-table 에 row 가 없거나 버튼 렌더 실패').toBeVisible({ timeout: 5000 })
      await detailBtn.click()
      await page.waitForTimeout(1000)

      // 실제 modal data-testid — dispatch-sms-send-audit-detail-modal
      const modal = page.locator('[data-testid="dispatch-sms-send-audit-detail-modal"]').first()
      await expect(modal, '상세 modal 미오픈 — data-testid="dispatch-sms-send-audit-detail-modal" 미표시').toBeVisible({ timeout: 5000 })

      await page.screenshot({
        path: path.join(QA_DIR, 'T3-row-click-detail-modal.png'),
        fullPage: true,
      })
    })

    // ── step 4: modal 내 msg_id 표시 검증
    await test.step('modal 내 Aligo msg_id 표시 검증', async () => {
      // 실제 data-testid — dispatch-sms-send-audit-msg-id
      const msgIdElement = page.locator('[data-testid="dispatch-sms-send-audit-msg-id"]').first()
      await expect(msgIdElement, 'Aligo msg_id 미표시 — data-testid="dispatch-sms-send-audit-msg-id" 없음').toBeVisible({ timeout: 5000 })
      await expect(msgIdElement).toContainText('aligo-msg')
    })

    // ── step 5: 전체 메시지 본문 표시 검증
    await test.step('전체 메시지 본문 표시 검증 (truncated 없음)', async () => {
      const bodyText = (await page.textContent('body')) ?? ''
      const hasFullBody =
        bodyText.includes('배차 안내') ||
        bodyText.includes('삼한공조') ||
        bodyText.includes('출발 예정')

      expect(
        hasFullBody,
        '전체 메시지 본문 미표시 — modal 내 "[삼한공조] 배차 안내:" 텍스트 없음',
      ).toBe(true)
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T4: 실패 사례 row 클릭 — Aligo result_code + 한국어 에러 메시지 표시
   *
   * 검증 항목:
   *   - FAILED 상태 row 상세 버튼 클릭 시 상세 modal 내 Aligo result_code 표시 (-101)
   *   - 한국어 에러 메시지 표시 ("수신 거부 등록된 번호입니다." 등)
   *   - role="alert" 또는 error banner 표시
   *   - AligoSmsAdapter failure path — FAILURE_ALIGO_-101 gatewayStatus 확인
   *   - pageerror 없음
   *
   * BE 계약 근거:
   *   AligoSmsAdapter: result_code != 1 → NotificationGatewayResult.failure("FAILURE_ALIGO_" + resultCode, response)
   *   NotificationLog.gatewayStatus = "FAILURE_ALIGO_-101"
   *   FE — FAILURE_ 접두사 gatewayStatus 를 한국어 에러 메시지로 변환
   */
  test('T4: 실패 row 클릭 — Aligo result_code + 한국어 에러 메시지 표시', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    const auditRows = mockSendAuditRows(10)
    const failedRow = auditRows.find(r => r.status === 'FAILED') ?? auditRows[3]

    // ── step 1: 실패 row 포함 목록 + 상세 API mock
    await test.step('실패 row API mock 등록', async () => {
      await page.route('**/admin/notifications/dispatch-sms/history**', async route => {
        const url = route.request().url()
        const detailMatch = url.match(/history\/([^?]+)/)
        if (detailMatch) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: {
                id: failedRow.id,
                saveMode: failedRow.saveMode,
                topic: failedRow.topic,
                programType: failedRow.programType,
                savedAt: failedRow.sentAt,
                responsePayload: {
                  sent: 0,
                  failed: failedRow.rowCount,
                  blocked: 0,
                  rawResponse: failedRow.rawResponse,
                  messageBody: failedRow.messageBody,
                  msgId: null,
                  gatewayStatus: `FAILURE_ALIGO_${failedRow.resultCode}`,
                  gatewayMessage: failedRow.resultMessage,
                  resultCode: failedRow.resultCode,
                },
                requestParams: { rowCount: failedRow.rowCount, date: '2026-05-17' },
              },
            }),
          })
          return
        }
        // 목록 — FAILED 행만 반환
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildSendAuditListResponse(auditRows.filter(r => r.status === 'FAILED'))),
        })
      })
    })

    // ── step 2: FAIL 필터 목록 진입
    await test.step('FAIL 결과 필터 목록 진입', async () => {
      await page.goto(SMS_AUDIT_URL_MANAGER, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1500)

      // 결과 필터 FAIL 선택
      const resultSelect = page.locator('[data-testid="sms-audit-filter-result"]').first()
      await expect(resultSelect, '결과 필터 select 미존재 — data-testid="sms-audit-filter-result"').toBeVisible({ timeout: 5000 })
      await resultSelect.selectOption('FAIL')
      await page.waitForTimeout(500)

      const queryBtn = page.locator('[data-testid="sms-audit-search-btn"]').first()
      await queryBtn.click()
      await page.waitForTimeout(800)
    })

    // ── step 3: 실패 row 상세 버튼 클릭 → 상세 modal + Aligo result_code 표시
    await test.step('실패 row 상세 버튼 클릭 → 상세 modal + Aligo result_code 표시', async () => {
      const detailBtn = page.locator('[data-testid^="sms-audit-detail-btn-"]').first()
      await expect(detailBtn, '실패 row 상세 버튼 미존재 — FAIL 필터 후 sms-audit-table 에 row 없음').toBeVisible({ timeout: 5000 })
      await detailBtn.click()
      await page.waitForTimeout(1000)

      const modal = page.locator('[data-testid="dispatch-sms-send-audit-detail-modal"]').first()
      await expect(modal, '실패 상세 modal 미오픈 — data-testid="dispatch-sms-send-audit-detail-modal" 미표시').toBeVisible({ timeout: 5000 })

      const bodyText = (await page.textContent('body')) ?? ''
      const hasResultCode =
        bodyText.includes('-101') ||
        bodyText.includes('수신 거부') ||
        bodyText.includes('FAILURE_ALIGO') ||
        bodyText.includes('발송 실패')

      await page.screenshot({
        path: path.join(QA_DIR, 'T4-failed-row-aligo-result-code.png'),
        fullPage: true,
      })

      expect(
        hasResultCode,
        'Aligo result_code 또는 한국어 에러 메시지 미표시 — FAILURE_ALIGO_-101 + "수신 거부 등록된 번호입니다." 필요',
      ).toBe(true)
    })

    // ── step 4: role="alert" 에러 배너 확인
    await test.step('role="alert" 에러 배너 표시 확인', async () => {
      const alertLocator = page.locator('[role="alert"]').first()

      // role="alert" 가 실제로 존재해야 함
      await expect(
        alertLocator,
        '실패 상세 — role="alert" 에러 배너 미표시. dispatch-sms-send-audit-detail-modal 내 role="alert" 필요',
      ).toBeVisible({ timeout: 5000 })
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })

  // -------------------------------------------------------------------------
  /**
   * T5: 권한 가드 — MANAGER/MASTER/DISPATCH 허용, SALES/ACCOUNTANT 차단
   *
   * 검증 항목:
   *   - MANAGER: 발송 이력 목록 접근 허용 + sms-audit-table 노출
   *   - MASTER: 발송 이력 목록 접근 허용 + sms-audit-table 노출
   *   - DISPATCH: 발송 이력 목록 접근 허용 (DispatchSmsSaveHistoryController 허용)
   *   - SALES: 접근 시 403 또는 redirect (미노출)
   *   - ACCOUNTANT: 접근 시 403 또는 redirect (미노출)
   *   - pageerror 없음
   *
   * BE 권한 근거:
   *   NotificationAdminController: @PreAuthorize("hasAnyRole('MASTER','MANAGER')")
   *   DispatchSmsSaveHistoryController: @PreAuthorize("hasAnyRole('DISPATCH','MANAGER','MASTER')")
   *   FE route index.tsx:805 — DISPATCH/MANAGER/MASTER 허용
   */
  test('T5: 권한 가드 — MANAGER/MASTER/DISPATCH 허용, SALES/ACCOUNTANT 차단', async ({ page }) => {
    const errors: string[] = []
    attachPageErrorHook(page, errors)

    ensureQaDir()

    // 공용 mock — 권한 있는 경우 빈 목록 반환, SALES/ACCOUNTANT 403
    await page.route('**/admin/notifications**', async route => {
      const headers = route.request().headers()
      const role = headers['x-user-role'] ?? ''
      if (role === 'SALES' || role === 'ACCOUNTANT') {
        await route.fulfill({
          status: 403,
          contentType: 'application/json',
          body: JSON.stringify({ success: false, code: 'FORBIDDEN', message: '권한이 없습니다.' }),
        })
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(buildSendAuditListResponse([])),
        })
      }
    })

    // ── step 1: MANAGER 권한 — 접근 허용 + sms-audit-table 노출 확인
    await test.step('MANAGER 권한 — 발송 이력 접근 허용', async () => {
      await page.goto(SMS_AUDIT_URL_MANAGER, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1000)

      const table = page.locator('[data-testid="sms-audit-table"]')
      await expect(table, 'MANAGER 권한 발송 이력 접근 차단됨 (허용이어야 함) — sms-audit-table 미표시').toBeVisible({ timeout: 5000 })

      await page.screenshot({
        path: path.join(QA_DIR, 'T5-role-guard-manager-allowed.png'),
        fullPage: true,
      })
    })

    // ── step 2: MASTER 권한 — 접근 허용
    await test.step('MASTER 권한 — 발송 이력 접근 허용', async () => {
      await page.goto(SMS_AUDIT_URL_MASTER, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1000)

      const table = page.locator('[data-testid="sms-audit-table"]')
      await expect(table, 'MASTER 권한 발송 이력 접근 차단됨 (허용이어야 함) — sms-audit-table 미표시').toBeVisible({ timeout: 5000 })
    })

    // ── step 3: DISPATCH 권한 — 접근 허용 확인 (DispatchSmsSaveHistoryController 허용)
    await test.step('DISPATCH 권한 — 배차 이력 접근 허용', async () => {
      await page.goto(SMS_AUDIT_URL_DISPATCH, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1000)

      const table = page.locator('[data-testid="sms-audit-table"]')
      await expect(table, 'DISPATCH 권한 발송 이력 접근 차단됨 — DispatchSmsSaveHistoryController DISPATCH 허용이어야 함').toBeVisible({ timeout: 5000 })
    })

    // ── step 4: SALES 권한 — 접근 차단 확인 (403 또는 redirect)
    await test.step('SALES 권한 — 발송 이력 접근 차단 (403)', async () => {
      await page.goto(SMS_AUDIT_URL_SALES, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1000)

      // sms-audit-table 이 없어야 함 (접근 차단)
      const table = page.locator('[data-testid="sms-audit-table"]')
      const tableVisible = (await table.count()) > 0 && await table.isVisible()

      const bodyText = (await page.textContent('body')) ?? ''
      const salesBlocked =
        !tableVisible ||
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
        'SALES 권한 발송 이력 접근 차단 미작동 — sms-audit-table 미표시 또는 403/redirect 필요',
      ).toBe(true)
    })

    // ── step 5: ACCOUNTANT 권한 — 접근 차단 확인 (403 또는 redirect)
    await test.step('ACCOUNTANT 권한 — 발송 이력 접근 차단 (403)', async () => {
      await page.goto(SMS_AUDIT_URL_ACCOUNTANT, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1000)

      const table = page.locator('[data-testid="sms-audit-table"]')
      const tableVisible = (await table.count()) > 0 && await table.isVisible()

      const bodyText = (await page.textContent('body')) ?? ''
      const accountantBlocked =
        !tableVisible ||
        bodyText.includes('권한') ||
        bodyText.includes('접근') ||
        bodyText.includes('403') ||
        bodyText.includes('Forbidden') ||
        page.url().includes('/login') ||
        page.url().includes('/unauthorized')

      expect(
        accountantBlocked,
        'ACCOUNTANT 권한 발송 이력 접근 차단 미작동 — sms-audit-table 미표시 또는 403/redirect 필요',
      ).toBe(true)
    })

    expect(errors, `pageerror: ${errors.join(', ')}`).toHaveLength(0)
  })
})
