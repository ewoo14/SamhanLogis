/**
 * PR #591 슬4 — 타배송사 인쇄 배차의뢰서(PRINT/BOTH) 라이브 실서버 QA 캡처. 에픽 마지막 슬라이스.
 *
 * [[feedback_no_fake_data_ever]] [[feedback_real_server_check_screenshot]] [[feedback_realqa_run_and_false_red]]
 * - VITE_MOCK_MODE OFF — 실 게이트웨이 http://127.0.0.1:8080 (page.route 프록시 + 실 JWT).
 * - 대상 화면: /dispatch-board 좌측 "미배차 출고전표" 패널 + ExternalCarrierDispatchModal(채널 PRINT/BOTH)
 *   + /dispatch/external-dispatch/:id/print A4 배차의뢰서(PrintLayout).
 * - 흐름(PRINT): 전표 다중선택 → "타배송사 발송" → 모달 채널 PRINT 선택 + 기사 선택
 *   → "인쇄 의뢰서 생성" → SENT 성공(채널 PRINT 는 SMS 없이 즉시 SENT) → "배차의뢰서 인쇄" 버튼
 *   → /dispatch/external-dispatch/{id}/print A4 양식 → 전표 DISPATCHED 이탈.
 * - 흐름(BOTH): 동일하되 채널 BOTH(SMS placeholder stub + 인쇄).
 *
 * window.print 다이얼로그는 헤드리스 캡처 불가 → 인쇄 라우트 A4 렌더 화면 자체를 캡처
 * (emulateMedia({media:'print'}) 로 인쇄 미리보기 스타일 적용 + window.print 미호출).
 *
 * 데이터(실 DB, 본 QA 직전 slip_db 직접 준비):
 * - 발송대기 전표 = 2026/06/24-901 (OUTBOUND/COMPLETED/inspector/UNDISPATCHED 로 재세팅 + 품목라인 1건 추가).
 * - 활성 external_carrier = 새벽퀵배송(010-7777-8888) (슬2/3에서 등록·활성, 재사용).
 * - 본 spec 은 PRINT/BOTH 를 같은 QA 전표로 순차 검증하므로 각 테스트 시작 전 Docker
 *   dev slip_db 에서 해당 전표를 UNDISPATCHED 로 되돌린다. 화면/게이트웨이는 계속 실서버를 사용한다.
 *
 * 실행: 별도 터미널 vite :5175(mock off);
 *   node_modules/.bin/playwright test --config playwright/external-dispatch-print-s4/playwright.config.ts --reporter=line
 */
import * as path from 'path'
import * as fs from 'fs'
import { execFile } from 'child_process'
import { fileURLToPath } from 'url'
import { test, expect, type Page } from '@playwright/test'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GW_URL = 'http://127.0.0.1:8080'

const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_ROLE = 'MASTER'
const MASTER_DISPLAY_NAME = '[DEV-SEED] 개발마스터'

const SLIP_A = '2026/06/24-901' // 검수완료 UNDISPATCHED 발송대기 전표
const CARRIER_LABEL_FRAGMENT = '새벽퀵배송' // 활성 배송사 select option label = "새벽퀵배송 (010-7777-8888)"

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(
  process.env['QA_SHOTS']
    ? path.resolve(process.env['QA_SHOTS'])
    : path.resolve(_dirname, '../../../../docs/qa/external-dispatch-print-s4'),
)

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: false })
}

const DEV_PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'

function fetchRealToken(loginId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    void import('http').then((httpMod) => {
      const http = httpMod.default
      const body = JSON.stringify({ loginId, password: DEV_PASSWORD })
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: 8080,
          path: '/auth/login',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        },
        (res) => {
          let d = ''
          res.on('data', (c) => {
            d += c
          })
          res.on('end', () => {
            try {
              resolve(JSON.parse(d).data.token as string)
            } catch {
              reject(new Error('token parse 실패: ' + d))
            }
          })
        },
      )
      req.on('error', reject)
      req.write(body)
      req.end()
    })
  })
}

async function installRealAuth(page: Page, token: string): Promise<void> {
  await page.addInitScript(
    (a: { t: string; userId: string; role: string; displayName: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({
            token: a.t,
            userId: a.userId,
            role: a.role,
            displayName: a.displayName,
            fullName: a.displayName,
            partnerCode: null,
          }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    { t: token, userId: MASTER_USER_ID, role: MASTER_ROLE, displayName: MASTER_DISPLAY_NAME },
  )
}

/** 게이트웨이 백엔드 호출만 좁게 프록시(:8080) — 앱 lazy 청크는 가로채지 않는다. */
async function setupApiProxy(page: Page, token: string): Promise<void> {
  await page.route(/:8080\//, async (route) => {
    const u = new URL(route.request().url())
    const realUrl = `${GW_URL}${u.pathname}${u.search}`
    const headers: Record<string, string> = {}
    for (const { name, value } of await route.request().headersArray()) {
      if (name.toLowerCase() !== 'host') headers[name] = value
    }
    headers['Authorization'] = `Bearer ${token}`
    const postData = route.request().postData()
    try {
      const response = await route.fetch({
        url: realUrl,
        method: route.request().method(),
        headers,
        body: postData ?? undefined,
      })
      await route.fulfill({ response })
    } catch (err) {
      console.error('[PROXY]', realUrl, err)
      await route.abort()
    }
  })
}

async function gotoAndSettle(page: Page, url: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(2_500)
}

function runSlipDbSql(sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(
      'docker',
      ['exec', 'samhan-postgres', 'psql', '-U', 'samhan', '-d', 'slip_db', '-v', 'ON_ERROR_STOP=1', '-c', sql],
      { timeout: 15_000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`slip_db QA 준비 실패: ${stderr || stdout || error.message}`))
          return
        }
        resolve()
      },
    )
  })
}

/** PRINT/BOTH 순차 실QA가 같은 전표를 소모하므로 테스트 시작 전 발송대기 상태를 복원한다. */
async function ensureQaSlipDispatchReady(): Promise<void> {
  await runSlipDbSql(`
    UPDATE slips
       SET dispatch_status = 'UNDISPATCHED',
           status = 'COMPLETED',
           inspector_user_id = '${MASTER_USER_ID}'::uuid,
           inspector_signed_at = COALESCE(inspector_signed_at, NOW()),
           is_deleted = false,
           modified_at = NOW(),
           modified_by = 'external-dispatch-print-s4-qa'
     WHERE slip_no = '${SLIP_A}'
       AND slip_type = 'OUTBOUND';
  `)
}

/**
 * 발송대기 전표 다중선택 → 타배송사 발송 모달 → 채널 선택 + 기사 선택 → 발송 실행 공통 흐름.
 * 발송 응답으로 부여된 인쇄 라우트(/dispatch/external-dispatch/{id}/print)의 id 를 반환한다.
 */
async function dispatchAndGetPrintId(
  page: Page,
  channelValue: 'PRINT' | 'BOTH',
  prefix: string,
): Promise<string> {
  await gotoAndSettle(page, `${BASE_URL}/#/dispatch-board?mockRole=MASTER`)
  await page.getByTestId('dispatch-board-undispatched-list').waitFor({ timeout: 20_000 })
  const rowA = page.getByTestId(`dispatch-board-slip-row-${SLIP_A}`)
  await expect(rowA, '검수완료 UNDISPATCHED 전표가 발송대기 목록에 표시되어야 함').toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByTestId('dispatch-board-external-dispatch-open')).toBeVisible({
    timeout: 10_000,
  })
  await page.waitForTimeout(600)
  if (prefix === '01') await capture(page, '01-pending')

  // 전표 다중선택(체크)
  const selectA = page.getByTestId(`dispatch-board-slip-select-${SLIP_A}`)
  await expect(selectA, '전표 선택 체크박스가 노출되어야 함').toBeVisible({ timeout: 10_000 })
  await selectA.check()
  await expect(selectA).toBeChecked()
  await page.waitForTimeout(300)

  await page.getByTestId('dispatch-board-external-dispatch-open').click()

  // 모달 — 채널/기사 선택
  const dialog = page.getByRole('dialog')
  await expect(dialog, '타배송사 발송 모달이 열려야 함').toBeVisible({ timeout: 10_000 })
  await expect(
    page.getByTestId(`external-carrier-dispatch-slip-${SLIP_A}`),
    '모달 안에 선택 전표 요약이 표시되어야 함',
  ).toBeVisible({ timeout: 10_000 })

  // 활성 배송사 선택
  const carrierSelect = page.getByTestId('external-carrier-dispatch-carrier')
  await carrierSelect.waitFor({ timeout: 10_000 })
  const carrierOption = carrierSelect.locator('option', { hasText: CARRIER_LABEL_FRAGMENT })
  await expect(carrierOption, '활성 배송사 옵션이 select 에 노출되어야 함').toHaveCount(1, {
    timeout: 10_000,
  })
  const carrierValue = await carrierOption.getAttribute('value')
  if (!carrierValue) throw new Error('활성 배송사 옵션 value(UUID) 를 찾지 못함')
  await carrierSelect.selectOption(carrierValue)

  // 채널 라디오(PRINT 또는 BOTH) 선택
  const channelRadio = page
    .getByTestId('external-carrier-dispatch-channel')
    .locator(`input[type="radio"][value="${channelValue}"]`)
  await expect(channelRadio, `채널 ${channelValue} 라디오가 노출되어야 함`).toBeVisible({
    timeout: 10_000,
  })
  await channelRadio.check()
  await expect(channelRadio).toBeChecked()
  await page.waitForTimeout(500)
  await capture(page, `${prefix}-channel-${channelValue.toLowerCase()}`)

  // 발송 실행
  const submit = page.getByTestId('external-carrier-dispatch-submit')
  await expect(submit).toBeEnabled()
  // 발송 버튼 라벨 검증: PRINT='인쇄 의뢰서 생성', BOTH='SMS 발송 + 인쇄'
  await expect(submit).toHaveText(channelValue === 'PRINT' ? '인쇄 의뢰서 생성' : 'SMS 발송 + 인쇄')
  await capture(page, `${prefix}-send`)
  await submit.click()

  // 성공(SENT) 피드백 + "배차의뢰서 인쇄" 버튼 노출
  const success = page.getByTestId('external-carrier-dispatch-success')
  const errorBox = page.getByTestId('external-carrier-dispatch-error')
  await expect(success.or(errorBox), '발송 후 성공/실패 피드백이 노출되어야 함').toBeVisible({
    timeout: 20_000,
  })
  await expect(success, 'PRINT/BOTH 는 즉시 SENT 성공해야 함').toBeVisible({ timeout: 10_000 })
  const printBtn = page.getByTestId('external-carrier-dispatch-print')
  await expect(printBtn, 'PRINT/BOTH SENT 시 "배차의뢰서 인쇄" 진입 버튼이 노출되어야 함').toBeVisible({
    timeout: 10_000,
  })
  await page.waitForTimeout(400)
  await capture(page, `${prefix}-send-result`)

  // "배차의뢰서 인쇄" 클릭 → 인쇄 라우트로 이동 → URL 에서 id 추출
  await printBtn.click()
  await page.waitForURL(/\/dispatch\/external-dispatch\/[0-9a-f-]+\/print/, { timeout: 15_000 })
  const m = page.url().match(/external-dispatch\/([0-9a-f-]+)\/print/)
  if (!m) throw new Error('인쇄 라우트 URL 에서 external_dispatch id 추출 실패: ' + page.url())
  return m[1]
}

test.describe('PR #591 슬4 타배송사 인쇄 배차의뢰서(PRINT/BOTH) — 라이브 실 QA(mock OFF)', () => {
  test('PRINT 채널: 발송대기 다중선택 → PRINT 발송 → SENT → 배차의뢰서 A4 인쇄 → DISPATCHED 이탈', async ({
    page,
  }) => {
    const token = await fetchRealToken('dev_master')
    await ensureQaSlipDispatchReady()
    await installRealAuth(page, token)
    await setupApiProxy(page, token)

    // ── 1~3) 발송대기 → 채널 PRINT 선택 + 기사선택 → 발송 실행 → SENT → 인쇄 라우트 진입 ──
    const printId = await dispatchAndGetPrintId(page, 'PRINT', '01')
    expect(printId, 'external_dispatch id 가 있어야 함').toBeTruthy()

    // ── 4) 배차의뢰서 인쇄 화면 — A4 양식(PrintLayout), 인쇄 미리보기 스타일로 캡처 ──
    // 인쇄 본문(article)이 렌더되어야 함: "배차의뢰서" 제목 + 배송사/기사 + 품목요약 등.
    await expect(page.getByRole('heading', { name: '배차의뢰서' })).toBeVisible({ timeout: 15_000 })
    // 배송사명은 문서 본문 + 페이지타이틀 헤더에 모두 등장 가능 → 본문 첫 매치만 단언.
    await expect(page.getByText(CARRIER_LABEL_FRAGMENT, { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    })
    // 선택 전표번호가 표 본문에 표시되어야 함
    await expect(page.getByText(SLIP_A, { exact: false }).first()).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(400)
    // 화면 스타일 캡처
    await capture(page, '04-print-screen')
    // 인쇄 미디어 스타일 적용(.no-print 숨김 등) — window.print 호출 없이 인쇄 미리보기 외형
    await page.emulateMedia({ media: 'print' })
    await page.waitForTimeout(400)
    await capture(page, '04-print-preview')
    await page.emulateMedia({ media: 'screen' })

    // ── 5) 발송대기 목록 복귀 → 전표 DISPATCHED 이탈(목록서 사라짐) ──
    await gotoAndSettle(page, `${BASE_URL}/#/dispatch-board?mockRole=MASTER`)
    await page.getByTestId('dispatch-board-undispatched-list').waitFor({ timeout: 20_000 })
    await expect(
      page.getByTestId(`dispatch-board-slip-row-${SLIP_A}`),
      'PRINT SENT 후 전표가 발송대기(UNDISPATCHED) 목록에서 사라져야 함(DISPATCHED 이탈)',
    ).toHaveCount(0, { timeout: 15_000 })
    await page.waitForTimeout(400)
    await capture(page, '05-dispatched')
  })

  test('BOTH 채널: SMS(placeholder stub) + 인쇄 동시 발송 → SENT → 배차의뢰서 A4 인쇄', async ({
    page,
  }) => {
    const token = await fetchRealToken('dev_master')
    await ensureQaSlipDispatchReady()
    await installRealAuth(page, token)
    await setupApiProxy(page, token)

    // BOTH 채널: SMS = Aligo placeholder stub(키 미주입 → stub success) + 인쇄 의뢰서 생성.
    const printId = await dispatchAndGetPrintId(page, 'BOTH', '07')
    expect(printId, 'BOTH external_dispatch id 가 있어야 함').toBeTruthy()

    // 배차의뢰서 A4 — 채널 라벨이 "SMS + 인쇄" 로 표시되어야 함.
    await expect(page.getByRole('heading', { name: '배차의뢰서' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('SMS + 인쇄', { exact: false }).first()).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByText(SLIP_A, { exact: false }).first()).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(400)
    await capture(page, '07-both')
    await page.emulateMedia({ media: 'print' })
    await page.waitForTimeout(300)
    await capture(page, '07-both-print-preview')
    await page.emulateMedia({ media: 'screen' })
  })
})
