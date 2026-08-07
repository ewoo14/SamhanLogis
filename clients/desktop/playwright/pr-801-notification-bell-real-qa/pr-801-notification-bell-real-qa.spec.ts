import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * PR #801 — 알림 게이트웨이 role 헤더 상수 리팩터(notification-service, 백엔드 동작 무변경) 라이브 QA.
 *
 * 변경 내용: `NotificationCenterController` 의 `X-User-Role` 헤더 리터럴을 상수로 치환(리팩터).
 * 동작 자체는 무변경이므로, 본 스펙은 **회귀 없음**을 실증한다 — 알림 벨(NotificationBellDropdown)이
 * 정상 렌더되고, 사전 시딩된 미확인 알림(id=5424c726-0095-45b4-be44-d52759acac62,
 * channel=MESSENGER, title="[QA] PR #801 알림 상수 리팩터 검증")이 드롭다운에 실제로 표시되는지 확인한다.
 *
 * ⚠️ acknowledge(읽음 처리)·시드 삭제는 이 스펙에서 하지 않는다 — GET 조회만 수행해
 * 시드 알림을 미확인 상태로 보존한다(PM 이후 acknowledge 실측 예정).
 *
 * 단계별 캡처(docs/qa/pr-801/):
 *  01 로그인 직후 홈 화면 — 알림 벨 배지(count) 노출 확인
 *  02 알림 벨 드롭다운 오픈 — 시드 알림 title 표시 확인
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5175'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/pr-801'))
fs.mkdirSync(SHOTS, { recursive: true })

const SEEDED_NOTIFICATION_ID = '5424c726-0095-45b4-be44-d52759acac62'
const SEEDED_NOTIFICATION_TITLE = '[QA] PR #801 알림 상수 리팩터 검증'

let shotNo = 0
async function capture(page: Page, name: string): Promise<void> {
  shotNo++
  await page.screenshot({
    path: path.join(SHOTS, `${String(shotNo).padStart(2, '0')}-${name}.png`),
    fullPage: false,
  })
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

test('PR #801 — notification-service role 헤더 상수 리팩터 후 알림 벨 무회귀 (시드 알림 실 표시)', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  const myResponses: { status: number; itemCount?: number }[] = []
  page.on('response', (response) => {
    const url = response.url()
    if (url.includes('/api/notifications/my') && response.request().method() === 'GET') {
      response
        .json()
        .then((json: unknown) => {
          const arr = Array.isArray((json as { data?: unknown })?.data)
            ? (json as { data: unknown[] }).data
            : null
          const record = { status: response.status(), itemCount: arr?.length }
          myResponses.push(record)
          console.log(`[NOTIFICATIONS/MY] ${response.status()} -> ${arr?.length ?? '?'}건`)
        })
        .catch(() => myResponses.push({ status: response.status() }))
    }
  })

  // 홈 화면(#/) — AppLayout 이 전역 헤더에 NotificationBellDropdown 을 마운트한다.
  const myWaiter = page
    .waitForResponse(
      (res) => res.url().includes('/api/notifications/my') && res.request().method() === 'GET',
      { timeout: 30_000 },
    )
    .catch(() => null)
  await page.goto(`${BASE_URL}/#/`, { waitUntil: 'domcontentloaded' })
  const bell = page.getByTestId('notification-bell')
  await expect(bell, '알림 벨 버튼이 렌더되지 않음').toBeVisible({ timeout: 30_000 })
  await myWaiter
  await page.waitForTimeout(1_000)
  await capture(page, 'home-bell-badge')

  const badge = page.getByTestId('notification-bell-badge')
  const badgeVisible = await badge.isVisible().catch(() => false)
  console.log(`[BELL BADGE] visible=${badgeVisible}`)
  expect.soft(badgeVisible, '알림 벨 배지가 표시되지 않음(미확인 알림 1건 이상 기대)').toBeTruthy()

  // 드롭다운 오픈 — 시드 알림 title 표시 확인.
  await bell.click()
  const panel = page.getByTestId('notification-bell-panel')
  await expect(panel, '알림 드롭다운 패널이 열리지 않음').toBeVisible({ timeout: 10_000 })

  const seededRow = page.getByTestId(`notification-row-${SEEDED_NOTIFICATION_ID}`)
  const rowVisible = await seededRow.isVisible().catch(() => false)
  console.log(`[SEEDED ROW] visible=${rowVisible}`)
  await capture(page, 'bell-dropdown-seeded')

  console.log('[MY RESPONSES]', JSON.stringify(myResponses, null, 2))

  expect(rowVisible, `시드 알림(id=${SEEDED_NOTIFICATION_ID})이 드롭다운에 표시되지 않음`).toBeTruthy()
  const rowText = await seededRow.innerText().catch(() => '')
  expect(rowText, '시드 알림 title 텍스트 불일치').toContain(SEEDED_NOTIFICATION_TITLE)

  // ⚠️ 여기서 acknowledge/click 하지 않는다 — 시드 알림을 미확인 상태로 보존(PM 이후 acknowledge 실측).
})
