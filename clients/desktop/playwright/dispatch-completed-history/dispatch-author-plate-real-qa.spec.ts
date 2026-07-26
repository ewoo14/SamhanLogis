import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 배차현황 실 데이터 — 라이브 실서버 캡처(mock OFF).
 *
 * 실 게이트웨이(:8080) → 재빌드 auth/gateway/arologis/slip → 실 Postgres.
 * (#1) 실명 작성자: 새 JWT displayName claim → X-User-Name → 코멘트 작성자 실명.
 * (#2b) 타사 차량번호 수동기입: PUT matched-driver 로 기사명·차량번호·출처 직접 기입 → 배차현황 표시.
 * 산출: docs/qa/dispatch-author-plate/author-plate-live.png
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5178'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/dispatch-author-plate'))
fs.mkdirSync(SHOTS, { recursive: true })

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

test('배차현황 실 데이터 라이브 캡처 — 실명 작성자 + 타사 차량번호 수동기입', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  const auth = { Authorization: `Bearer ${login.token}` }

  // DISPATCHED 작업 + task.id + 차량그룹 id 획득
  const listRes = await page.request.get(
    `${API_BASE}/admin/dispatch-tasks?from=2025-01-01&to=2026-12-31&status=DISPATCHED&page=0&size=1`,
    { headers: auth },
  )
  const summary = (await listRes.json()).data?.content?.[0]
  expect(summary, '실 DISPATCHED 작업 없음').toBeTruthy()
  const detailRes = await page.request.get(`${API_BASE}/admin/dispatch-tasks/${summary.arologisDispatchId}`, { headers: auth })
  const detail = (await detailRes.json()).data
  const taskId = detail.id
  const groupId = detail.vehicleGroups?.[0]?.id
  expect(taskId && groupId, 'task.id/groupId 없음').toBeTruthy()

  // (#2b) 타사 기사/차량번호 수동 기입 (PUT matched-driver)
  // driverSource 는 BE MatchedDriverSource enum 값 — free-text('경기퀵')는 400 거부됨 (D-DMR-02).
  const setRes = await page.request.put(
    `${API_BASE}/admin/dispatch-tasks/${taskId}/vehicle-groups/${groupId}/matched-driver`,
    { headers: auth, data: { driverName: '이용달', driverPhoneNumber: '010-5555-6789', vehiclePlateNumber: '12가7890', driverSource: 'GYEONGGI_QUICK' } },
  )
  expect(setRes.ok(), `수동 기입 HTTP ${setRes.status()}: ${await setRes.text()}`).toBeTruthy()

  // (#1) 실명 작성자 코멘트 (새 JWT displayName → X-User-Name)
  const body = '라이브 — 실명 작성자 + 타사 차량번호 수동기입 (PR #464)'
  const postRes = await page.request.post(`${API_BASE}/admin/dispatch-tasks/${taskId}/comments`, { headers: auth, data: { body } })
  expect(postRes.ok(), `코멘트 HTTP ${postRes.status()}: ${await postRes.text()}`).toBeTruthy()

  // 배차현황 상세 → 실명 작성자 + 차량번호 12가7890 렌더 확인 + 캡처
  await page.goto(`${BASE_URL}/#/dispatch-board/history`)
  await page.waitForSelector('[data-testid="dispatch-history-table"]', { timeout: 30000 })
  await page.getByTestId('dispatch-history-from').fill('2025-01-01')
  await page.getByTestId('dispatch-history-to').fill('2026-12-31')
  await page.getByTestId('dispatch-history-filter-submit').click()
  await page.waitForSelector('[data-testid^="dispatch-history-row-"]', { timeout: 15000 })
  await page.locator('[data-testid^="dispatch-history-row-"]').first().click()
  await expect(page.getByTestId('dispatch-task-detail-body')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText('12가7890').first()).toBeVisible({ timeout: 10000 })
  // 반복 캡처로 동일 본문 코멘트가 누적될 수 있어 .first() 로 존재만 단언
  await expect(page.getByText(body).first()).toBeVisible({ timeout: 10000 })
  // 작성자 실명(= 로그인 displayName) 표시 — "시스템" 아님
  await expect(
    page.getByTestId('dispatch-comment-thread').getByText(login.displayName).first(),
  ).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(SHOTS, 'author-plate-live.png'), fullPage: true })
})
