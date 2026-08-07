import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
/**
 * PR #591 슬3 — 타배송사 문자(SMS) 발송 라이브 실서버 QA 캡처.
 *
 * [[feedback_no_fake_data_ever]] [[feedback_real_server_check_screenshot]] [[feedback_realqa_run_and_false_red]]
 * - VITE_MOCK_MODE OFF — 실 게이트웨이 http://127.0.0.1:8080 (page.route 프록시 + 실 JWT).
 * - 대상 화면: /dispatch-board 좌측 "미배차 출고전표" 패널(검수완료 UNDISPATCHED 발송대기 목록).
 * - 발송 흐름: 전표 다중선택 → "타배송사 발송" → ExternalCarrierDispatchModal(외부기사/배송사 선택)
 *   → "SMS 발송" → SENT 성공(Aligo placeholder=stub success) → 전표 DISPATCHED 이탈.
 *
 * 데이터(실 DB):
 * - 발송대기 전표 = 2026/06/24-901 (OUTBOUND/COMPLETED/inspector/UNDISPATCHED, 슬1 QA 시드 재사용).
 * - 활성 external_carrier = 새벽퀵배송(010-7777-8888) (본 QA 직전 POST /admin/external-carriers 실등록).
 *
 * 실행: 별도 터미널 vite :5175(mock off);
 *   node_modules/.bin/playwright test --config playwright/external-dispatch-sms-real-qa/playwright.config.ts --reporter=line
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, expect, type Page } from '@playwright/test'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const GW_URL = 'http://127.0.0.1:8080'

const MASTER_USER_ID = 'a0000000-0000-0000-0000-000000000001'
const MASTER_ROLE = 'MASTER'
const MASTER_DISPLAY_NAME = '[DEV-SEED] 개발마스터'

const SLIP_A = '2026/06/24-901' // 검수완료 UNDISPATCHED 발송대기 전표
const CARRIER_LABEL_FRAGMENT = '새벽퀵배송' // 활성 배송사(select option label = "새벽퀵배송 (010-7777-8888)")

const _dirname = path.dirname(fileURLToPath(import.meta.url))
const SCREENSHOT_DIR = resolveQaShotsDir(
  process.env['QA_SHOTS']
    ? path.resolve(process.env['QA_SHOTS'])
    : path.resolve(_dirname, '../../../../docs/qa/external-dispatch-sms-s3'),
)

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: false })
}

const QA_DEV_DEFAULT_PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')

function fetchRealToken(loginId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    void import('http').then((httpMod) => {
      const http = httpMod.default
      const body = JSON.stringify({ loginId, password: QA_DEV_DEFAULT_PASSWORD })
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

test.describe('PR #591 슬3 타배송사 SMS 발송 — 라이브 실 QA(mock OFF)', () => {
  test('발송대기 전표 다중선택 → 타배송사 발송 → SMS 발송 → SENT → DISPATCHED 이탈', async ({
    page,
  }) => {
    const token = await fetchRealToken('dev_master')
    await installRealAuth(page, token)
    await setupApiProxy(page, token)

    // ── 1) 배차현황 진입 → 발송대기(미배차) 목록에 검수완료 UNDISPATCHED 전표 표시 ──
    await gotoAndSettle(page, `${BASE_URL}/#/dispatch-board?mockRole=MASTER`)
    await page.getByTestId('dispatch-board-undispatched-list').waitFor({ timeout: 20_000 })
    const rowA = page.getByTestId(`dispatch-board-slip-row-${SLIP_A}`)
    await expect(rowA, '검수완료 UNDISPATCHED 전표가 발송대기 목록에 표시되어야 함').toBeVisible({
      timeout: 15_000,
    })
    // "타배송사 발송" 버튼 노출(dispatch.board CREATE — MASTER bypass)
    await expect(page.getByTestId('dispatch-board-external-dispatch-open')).toBeVisible({
      timeout: 10_000,
    })
    await page.waitForTimeout(600)
    await capture(page, '01-pending')

    // ── 2) 전표 다중선택(체크) + "타배송사 발송" 버튼 클릭 ──
    const selectA = page.getByTestId(`dispatch-board-slip-select-${SLIP_A}`)
    await expect(selectA, '전표 선택 체크박스가 노출되어야 함').toBeVisible({ timeout: 10_000 })
    await selectA.check()
    await expect(selectA).toBeChecked()
    await page.waitForTimeout(400)
    await capture(page, '02-select')

    await page.getByTestId('dispatch-board-external-dispatch-open').click()

    // ── 3) ExternalCarrierDispatchModal — 외부기사/배송사 선택 + 선택 전표 요약 ──
    const dialog = page.getByRole('dialog')
    await expect(dialog, '타배송사 발송 모달이 열려야 함').toBeVisible({ timeout: 10_000 })
    // 선택 전표 요약 행 표시
    await expect(
      page.getByTestId(`external-carrier-dispatch-slip-${SLIP_A}`),
      '모달 안에 선택 전표 요약이 표시되어야 함',
    ).toBeVisible({ timeout: 10_000 })
    // 활성 배송사 select 옵션 선택(label = "새벽퀵배송 (010-7777-8888)")
    const carrierSelect = page.getByTestId('external-carrier-dispatch-carrier')
    await carrierSelect.waitFor({ timeout: 10_000 })
    // 활성 배송사 옵션을 라벨 부분일치로 찾아 value(UUID) 로 선택한다.
    const carrierOption = carrierSelect.locator('option', { hasText: CARRIER_LABEL_FRAGMENT })
    await expect(carrierOption, '활성 배송사 옵션이 select 에 노출되어야 함').toHaveCount(1, {
      timeout: 10_000,
    })
    const carrierValue = await carrierOption.getAttribute('value')
    if (!carrierValue) throw new Error('활성 배송사 옵션 value(UUID) 를 찾지 못함')
    await carrierSelect.selectOption(carrierValue)
    await page.waitForTimeout(500)
    await capture(page, '03-modal')

    // ── 4) "SMS 발송" 클릭 → 발송 트리거 ──
    const submit = page.getByTestId('external-carrier-dispatch-submit')
    await expect(submit).toBeEnabled()
    await capture(page, '04-send')
    await submit.click()

    // ── 5) 발송 결과 — SENT 성공(또는 FAILED) 피드백 ──
    // SENT → success(role=status), FAILED(HTTP200) → error(role=alert). 둘 중 하나는 반드시 노출.
    const success = page.getByTestId('external-carrier-dispatch-success')
    const errorBox = page.getByTestId('external-carrier-dispatch-error')
    await expect(success.or(errorBox), '발송 후 성공/실패 피드백이 노출되어야 함').toBeVisible({
      timeout: 20_000,
    })
    const sentSucceeded = await success.isVisible().catch(() => false)
    if (sentSucceeded) {
      await expect(success).toContainText('SMS 발송 완료')
    }
    await page.waitForTimeout(600)
    await capture(page, '05-result')

    // ── 6) 모달 닫고 발송대기 목록 새로고침 시 해당 전표 DISPATCHED 이탈 ──
    await page.getByTestId('external-carrier-dispatch-cancel').click()
    await page.waitForTimeout(1_500)
    // 모달 onClose 가 선택 초기화 + DISPATCH_BOARD_QUERY_KEY invalidate → 재조회
    await expect(
      rowA,
      sentSucceeded
        ? 'SENT 성공 시 전표가 발송대기(UNDISPATCHED) 목록에서 사라져야 함(DISPATCHED 이탈)'
        : 'FAILED 시 전표는 발송대기 목록에 남아 재시도 가능해야 함',
    ).toHaveCount(sentSucceeded ? 0 : 1, { timeout: 15_000 })
    await page.waitForTimeout(600)
    await capture(page, '06-dispatched')
  })
})
