/**
 * #854 R4 — outbox 종결 가드 · 4xx 재분류 라이브 QA (실서버 GUI 캡처).
 *
 * 실 게이트웨이(:8080, VITE_MOCK_MODE OFF) → 실 partner_order_db. 렌더러 :5854 선기동.
 * 대상 데이터 = R4 라이브 QA throwaway 시드(QA-854-R4-A/B/C). outbox producer 가 dormant 라
 * 프로덕션 경로로는 row 가 생성되지 않으므로 시드를 사용했고, 전이는 실 스케줄러가 수행했다.
 *
 * 캡처 목적:
 *  - 종결 가드가 적용된 주문(A: requeue 형상 / B: lease 재점유 형상)이 실제 화면에 어떻게 보이는지
 *  - 4xx 재분류로 재시도 후 종결된 주문(C)의 화면 표시
 *  - R4 차원5 발견(화면에 slipPublishStatus 노출 면이 없어 발행 영구실패 주문이 상태 "완료" +
 *    연결 전표 "-" 로만 보임)은 #854 R5 후속에서 해소됐다 — 상세 화면에 design-system Badge
 *    (data-testid="partner-order-slip-publish-status")로 "전표 발행 실패"를 노출한다.
 *    본 스펙은 그 표시 면이 실서버에서 실제로 렌더되는지를 포지티브로 확증한다(#854 R5 MED-3).
 *
 * 단계별 캡처: docs/qa/854-r4-terminal-guard/
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5854'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOTS = path.resolve(_dirname, '../../../../docs/qa/854-r4-terminal-guard')
fs.mkdirSync(SHOTS, { recursive: true })

/** R4 throwaway 시드 주문 id (라이브 QA 전용). */
const ORDER_A = 'aaaa0001-0000-0000-0000-000000000001'
const ORDER_C = 'aaaa0003-0000-0000-0000-000000000003'

let shotNo = 0
async function capture(page: Page, name: string): Promise<void> {
  shotNo++
  await page.screenshot({
    path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`),
    fullPage: false,
  })
}

interface LoginResult {
  token: string
  role: string
  userId: string
  displayName: string
}

async function realLogin(page: Page, loginId: string): Promise<LoginResult> {
  const res = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId, password: PASSWORD },
  })
  expect(res.ok(), `로그인 실패(${loginId}): HTTP ${res.status()}`).toBeTruthy()
  const d = (await res.json()).data ?? {}
  return {
    token: d.token ?? '',
    role: d.role ?? '',
    userId: d.userId ?? '',
    displayName: d.displayName ?? loginId,
  }
}

async function installAuthStub(page: Page, login: LoginResult): Promise<void> {
  await page.addInitScript(
    ({ tok, r, uid, name }: { tok: string; r: string; uid: string; name: string }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({
            token: tok,
            userId: uid,
            role: r,
            fullName: name,
            partnerCode: null,
          }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    { tok: login.token, r: login.role, uid: login.userId, name: login.displayName },
  )
}

test('#854 R4 종결 가드 주문의 실 화면 표시 — 실서버', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  // 1) 주문 목록 — 실서버 렌더
  await page.goto(`${BASE_URL}/#/sales/partner-orders`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await capture(page, 'partner-order-list')

  // 2) A = requeue 형상(결과 tx 실패 루프) → claim 시점 종결 가드로 FAILED_PERMANENT
  await page.goto(`${BASE_URL}/#/sales/partner-orders/${ORDER_A}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForTimeout(2500)
  await capture(page, 'order-A-requeue-terminated-detail')

  // 3) C = 4xx 재분류(1차 재시도 → 2차 종결)
  await page.goto(`${BASE_URL}/#/sales/partner-orders/${ORDER_C}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForTimeout(2500)
  await capture(page, 'order-C-4xx-reclassified-detail')

  // 4) R4 차원5 발견 해소 라이브 확증(#854 R5) — FAILED_PERMANENT 주문(C) 상세에 배지가
  //    실제로 렌더된다. 배지가 사라지면(예: variant/조건 뮤테이션) 차원5 발견이 재발한 것이므로
  //    본 단언이 실패해야 한다 — 포지티브 단언으로 반전(과거: 표시 면 "없음"을 단언하던 시한폭탄).
  const publishStatusBadge = page.getByTestId('partner-order-slip-publish-status')
  await expect(
    publishStatusBadge,
    'slipPublishStatus 노출 면(Badge)이 보이지 않으면 R4 차원5 발견이 재발한 것.',
  ).toBeVisible()
  await expect(publishStatusBadge).toContainText('전표 발행 실패')
  await capture(page, 'order-C-publish-failure-surface')
})
