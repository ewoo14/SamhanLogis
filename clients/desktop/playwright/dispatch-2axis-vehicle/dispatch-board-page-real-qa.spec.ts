import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #1 배차 보드 — 라이브 실서버 캡처(mock OFF, Fable5 라운드 QA).
 *
 * view-only 보드 fix(mount auto-create skip) 후 보드가 정상 렌더됨을 실 화면 캡처.
 * (view-only 읽기전용 자체는 시드에 dispatch.board view-only 계정 부재로 라이브 캡처 불가 →
 *  Playwright mock 23 passed 로 커버. 본 캡처는 edit 사용자(dev_master) 보드 정상 렌더 실증.)
 * 산출: docs/qa/dispatch-2axis-vehicle/dispatch-board-page.png
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5178'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? (process.env.DEV_PASSWORD ?? '')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/dispatch-2axis-vehicle'))
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

test('배차 보드 라이브 캡처 — view-only fix 후 보드 정상 렌더 (좌 미배차 / 우 차량 그룹)', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  await page.goto(`${BASE_URL}/#/dispatch-board`)
  await page.waitForSelector('[data-testid="dispatch-board-page"]', { timeout: 30000 })
  await expect(page.getByTestId('dispatch-board-add-vehicle-button')).toBeVisible({ timeout: 15000 })
  await page.waitForTimeout(600)
  await page.screenshot({ path: path.join(SHOTS, 'dispatch-board-page.png'), fullPage: true })
})
