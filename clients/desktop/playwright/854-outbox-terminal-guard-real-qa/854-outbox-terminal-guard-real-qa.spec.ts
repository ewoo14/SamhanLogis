import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #854 — 전표 발행 상태 표시 면 라이브 QA (실서버 GUI 캡처).
 *
 * 실 게이트웨이(:8080, VITE_MOCK_MODE OFF) → 실 partner_order_db. 렌더러 :5855 선기동.
 * 대상 데이터 = R5 라이브 QA throwaway 시드(QA-854-R5-E/F). outbox producer 가 dormant 라
 * 프로덕션 경로로는 row 가 생성되지 않으므로 시드를 사용했다(합성 producer 위장 아님).
 *
 * 배경: R4 차원5 적대검증이 "slipPublishStatus 노출 면이 전 클라이언트에 없어 발행이 영구 실패한
 * 주문이 상태 '완료' + 연결 전표 '-' 로만 보인다"를 발견했고(라이브 GUI 로 확증), R4 Track 2 가
 * design-system Badge 로 표시 면을 구현, R5 가 목록 화면 미배선·모바일 배치를 추가 지적해 보강했다.
 *
 * 본 스펙은 그 표시 면이 실서버에서 실제로 렌더되는지를 **포지티브로** 확증한다:
 *  - 목록 화면 배지(R5 에서 배선 — 자동 회귀 테스트가 없는 지점이라 라이브 캡처가 유일 검증)
 *  - 상세 화면 FAILED_PERMANENT("전표 발행 실패") · PENDING_RETRY("전표 발행 재시도 중")
 *  - 모바일 뷰포트 배치(배지 그룹핑 + 실패 캡션 — R5 LOW 지적의 실기기 확증)
 *
 * 단계별 캡처: docs/qa/854-r5-publish-status-badge/
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5855'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/854-r5-publish-status-badge'))
fs.mkdirSync(SHOTS, { recursive: true })

/** R5 throwaway 시드 주문 id (라이브 QA 전용). */
const ORDER_FAILED = 'aaaa0006-0000-0000-0000-000000000006' // slipPublishStatus=FAILED_PERMANENT
const ORDER_PENDING = 'aaaa0007-0000-0000-0000-000000000007' // slipPublishStatus=PENDING_RETRY
const BADGE = 'partner-order-slip-publish-status'

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

test('#854 전표 발행 상태 배지 — 실서버 데스크톱(목록·상세)', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  // 1) 상세 — FAILED_PERMANENT
  await page.goto(`${BASE_URL}/#/sales/partner-orders/${ORDER_FAILED}`, {
    waitUntil: 'domcontentloaded',
  })
  const failedBadge = page.getByTestId(BADGE)
  await expect(
    failedBadge,
    '발행 영구실패 주문 상세에 배지가 없으면 R4 차원5 발견이 재발한 것.',
  ).toBeVisible({ timeout: 30_000 })
  await expect(failedBadge).toContainText('전표 발행 실패')
  await capture(page, 'detail-failed-permanent')

  // 2) 상세 — PENDING_RETRY (R5 에서 "대기"→"재시도 중" 으로 문구 정정)
  await page.goto(`${BASE_URL}/#/sales/partner-orders/${ORDER_PENDING}`, {
    waitUntil: 'domcontentloaded',
  })
  const pendingBadge = page.getByTestId(BADGE)
  await expect(pendingBadge).toBeVisible({ timeout: 30_000 })
  await expect(pendingBadge).toContainText('전표 발행 재시도 중')
  await capture(page, 'detail-pending-retry')

  // 3) 목록 — R5 배선(자동 회귀 테스트 부재 지점이라 라이브 캡처가 유일 검증).
  //    목록 배지는 '연결 전표' 셀에 렌더되고 상세와 다른 testid 를 쓴다
  //    (partner-order-row-slip-publish-status-{orderNo}). 기본 상태 필터가 DRAFT(진행중)라
  //    CONFIRMED 시드가 안 보이므로 "전체 상태"로 바꾼 뒤 관측한다.
  await page.goto(`${BASE_URL}/#/sales/partner-orders`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('partner-order-list-status-filter').selectOption('')
  await page.getByTestId('partner-order-list-partner-filter').fill('QA-854-R5-E')
  await page.waitForTimeout(3000)

  const rowBadge = page.getByTestId('partner-order-row-slip-publish-status-2026/07/20-R5E')
  await expect(
    rowBadge,
    '목록 행에 배지가 없으면 R4 차원5 원발견의 절반(목록 미배선)이 잔존하는 것.',
  ).toBeVisible({ timeout: 30_000 })
  await expect(rowBadge).toContainText('전표 발행 실패')
  await capture(page, 'list-failed-permanent-row')
})

test('#854 전표 발행 상태 배지 — 실서버 모바일 뷰포트', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  await page.goto(`${BASE_URL}/#/sales/partner-orders/${ORDER_FAILED}`, {
    waitUntil: 'domcontentloaded',
  })
  const badge = page.getByTestId(BADGE)
  await expect(badge, '모바일 요약 카드에도 배지가 렌더돼야 한다.').toBeVisible({ timeout: 30_000 })
  await expect(badge).toContainText('전표 발행 실패')
  // R5 LOW — 배지 그룹핑/캡션 배치를 실기기 폭(390px)에서 확인한다(정적 CSS 산술의 실측 확증).
  await capture(page, 'mobile-failed-permanent-390px')
})
