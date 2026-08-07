import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #720 월마감 실행 실패 fix 라이브 QA — lock-by-period 내부 엔드포인트화 실증.
 *
 * 근본원인(수정 전): accounting `MonthEndCloseService` → `SlipServiceClient` →
 * slip `POST /slips/lock-by-period` 가 public + `@RequirePermission` 인데 서비스간 호출은
 * X-Internal-Token 뿐(user context 없음, 게이트웨이 미경유) → 403 → client 4xx 매핑 → 409.
 * 월마감 실행 100% 실패(#719 QA 라이브 적발).
 *
 * fix: slip `POST /internal/slips/lock-by-period` 내부 엔드포인트(InternalTokenFilter,
 * `@RequirePermission` 제거) + accounting `SlipServiceClient` 경로/바디(startDate/endDate) 정정.
 *
 * 실 게이트웨이(:8080, mock OFF) → 재빌드 accounting-service+slip-service → 실 Postgres.
 *
 * 1차 라운드(본 세션 선행 실행, 스펙 locator 버그로 재실행): 2026-02(MONTHLY) —
 * CONFIRMED OUTBOUND 슬립 4건(2026/02/15-1~2026/02/18-1) → 마감 성공(HTTP 201,
 * lockedSlipCount=4) 실 네트워크 응답으로 확인 완료 + DB persist 확인(accounting_periods
 * 1행, slips.lock_flag=true 4건). 본 스펙은 그 성공을 재현하되 대상 기간을 2026-04 로
 * 전환(2026-02 는 이미 CLOSED 라 재실행 시 idempotency 충돌로 원치 않는 실패 유발) —
 * 2026-04(MONTHLY) CONFIRMED INBOUND 슬립 1건(2026/04/08-1), lock_flag=false,
 * accounting_periods 미존재(사전 DB 조회로 확인, 합성 데이터 아님).
 *
 * 단계별 캡처(docs/qa/720-month-end-close-lock-by-period/):
 *  01 마감 화면 진입 — 마감 실행 카드 + 마감 list(2026-02 CLOSED 기존행 포함)
 *  02 월별 2026-04 입력 + 마감 실행 버튼 클릭 직전
 *  03 마감 성공 메시지("마감이 완료되었습니다.")
 *  04 마감 list — 2026-02(잠금 4)·2026-04(잠금 1) 모두 CLOSED (클로즈업)
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5195'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/720-month-end-close-lock-by-period'))
fs.mkdirSync(SHOTS, { recursive: true })

let shotNo = 0
async function capture(page: Page, name: string): Promise<void> {
  shotNo++
  await page.screenshot({
    path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`),
    fullPage: false,
  })
}

async function captureElement(
  page: Page,
  locator: ReturnType<Page['locator']>,
  name: string,
): Promise<void> {
  shotNo++
  await locator.screenshot({ path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`) })
}

interface LoginResult { token: string; role: string; userId: string; displayName: string }

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId, password: PASSWORD } })
  expect(res.ok(), `로그인 실패(${loginId}): HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return { token: d.token ?? '', role: d.role ?? '', userId: d.userId ?? '', displayName: d.displayName ?? loginId }
}

async function installAuthStub(page: Page, login: LoginResult): Promise<void> {
  await page.addInitScript(
    ({ tok, r, uid, name }: { tok: string; r: string; uid: string; name: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token: tok, userId: uid, role: r, fullName: name, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    { tok: login.token, r: login.role, uid: login.userId, name: login.displayName },
  )
}

test('월마감(MONTHLY 2026-04) 실행 — lock-by-period 내부 엔드포인트 fix 성공 실증 (2026-02 는 선행 라운드 기 성공/CLOSED)', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  // POST /accounting/closings 실 응답 캡처 (게이트웨이 :8080 경유 → accounting-service → slip-service internal)
  const closingResponses: string[] = []
  page.on('response', async (response) => {
    if (response.url().includes('/accounting/closings') && response.request().method() === 'POST') {
      try {
        const body = await response.text()
        closingResponses.push(`Status: ${response.status()}\nBody: ${body}`)
        console.log('[CLOSING RESPONSE]', response.status(), body)
      } catch {
        // ignore
      }
    }
  })

  // 1) 마감 화면 진입 — 2026-02 는 선행 라운드에서 이미 CLOSED(잠금 4) 로 list 에 남아있음
  await page.goto(`${BASE_URL}/#/warehouse/closing`)
  await expect(page.getByRole('heading', { name: '마감 실행' })).toBeVisible({ timeout: 30_000 })
  const feb = page.locator('tr', { hasText: '2026-02' })
  await expect(feb).toBeVisible({ timeout: 15_000 })
  await capture(page, 'closing-page-entry-2026-02-already-closed')

  // 2) 월별 탭 선택 + 기간 2026-04 입력
  await page.getByRole('tab', { name: '월별' }).click()
  const monthInput = page.locator('input[type="month"]')
  await monthInput.fill('2026-04')
  await page.getByPlaceholder('마감 사유 등 (선택)').fill('QA #720 라이브 검증 — lock-by-period 내부 엔드포인트 fix 실증')
  await capture(page, 'closing-form-filled-2026-04')

  // 3) 마감 실행 클릭
  const closeBtn = page.getByTestId('closing-new-button')
  await expect(closeBtn).toBeEnabled()
  await closeBtn.click()

  // 4) 성공 메시지 대기 — fix 전에는 "마감 실행 실패: ..." error-banner 였음(#719 100% 실패)
  await expect(page.getByText('마감이 완료되었습니다.')).toBeVisible({ timeout: 30_000 })
  await expect(page.locator('.error-banner')).toHaveCount(0)
  await capture(page, 'closing-success-message')

  // 5) list 갱신 — 2026-02(기존 CLOSED·잠금4) + 2026-04(신규 CLOSED·잠금1) 모두 확인
  // getByText 는 기본 substring 매치 — "마감" badge 는 "역마감" 버튼도 포함하므로 exact:true 필수.
  const apr = page.locator('tr', { hasText: '2026-04' })
  await expect(apr).toBeVisible({ timeout: 15_000 })
  await expect(apr.getByText('마감', { exact: true })).toBeVisible()
  await expect(apr.getByText('1', { exact: true })).toBeVisible()
  await expect(feb.getByText('마감', { exact: true })).toBeVisible()
  await expect(feb.getByText('4', { exact: true })).toBeVisible()
  await captureElement(page, page.locator('table').first(), 'closing-list-2026-02-and-04-closed-locked')

  console.log('[CLOSING RESPONSES]', closingResponses.join('\n---\n'))
})
