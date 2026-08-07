import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 배차 코멘트 — 라이브 실서버 캡처(mock OFF).
 *
 * 실 게이트웨이(:8080) → 재빌드 slip-service(C1a, V37) → 실 Postgres.
 * 실 API 로 코멘트 등록 → 배차현황 상세 모달의 코멘트 스레드에 렌더됨을 실 화면 캡처.
 * 산출: docs/qa/dispatch-collab-comment/comment-live.png
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5178'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/dispatch-collab-comment'))
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

test('배차 코멘트 라이브 캡처 (실 API 등록 → 배차현황 상세 렌더)', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  const auth = { Authorization: `Bearer ${login.token}` }

  // 1) 실 DISPATCHED 작업 1건 조회 → arologisDispatchId(상세 키) + 상세에서 task.id 획득
  const listRes = await page.request.get(
    `${API_BASE}/admin/dispatch-tasks?from=2025-01-01&to=2026-12-31&status=DISPATCHED&page=0&size=1`,
    { headers: auth },
  )
  expect(listRes.ok(), `목록 HTTP ${listRes.status()}`).toBeTruthy()
  const summary = (await listRes.json()).data?.content?.[0]
  expect(summary, '실 DISPATCHED 작업 없음 — 캡처 불가').toBeTruthy()
  const detailKey = summary.arologisDispatchId
  const detailRes = await page.request.get(`${API_BASE}/admin/dispatch-tasks/${detailKey}`, { headers: auth })
  expect(detailRes.ok(), `상세 HTTP ${detailRes.status()}`).toBeTruthy()
  const taskId = (await detailRes.json()).data?.id
  expect(taskId, 'task.id 없음').toBeTruthy()

  // 2) 실 API 로 코멘트 등록(게이트웨이 → slip-service → Postgres)
  const body = '야간 배차 코멘트 — 라이브 실서버 캡처 (collab-core C1a)'
  const postRes = await page.request.post(`${API_BASE}/admin/dispatch-tasks/${taskId}/comments`, {
    headers: auth,
    data: { body },
  })
  expect(postRes.ok(), `코멘트 등록 HTTP ${postRes.status()}: ${await postRes.text()}`).toBeTruthy()

  // 3) 배차현황 상세 진입 → 코멘트 스레드에 방금 등록 코멘트 렌더 확인 + 캡처
  await page.goto(`${BASE_URL}/#/dispatch-board/history`)
  await page.waitForSelector('[data-testid="dispatch-history-table"]', { timeout: 30000 })
  await page.getByTestId('dispatch-history-from').fill('2025-01-01')
  await page.getByTestId('dispatch-history-to').fill('2026-12-31')
  await page.getByTestId('dispatch-history-filter-submit').click()
  await page.waitForSelector('[data-testid^="dispatch-history-row-"]', { timeout: 15000 })
  await page.locator('[data-testid^="dispatch-history-row-"]').first().click()
  await expect(page.getByTestId('dispatch-task-detail-body')).toBeVisible({ timeout: 10000 })
  await expect(page.getByTestId('dispatch-comment-thread')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText(body)).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(800)
  await page.screenshot({ path: path.join(SHOTS, 'comment-live.png'), fullPage: true })
})
