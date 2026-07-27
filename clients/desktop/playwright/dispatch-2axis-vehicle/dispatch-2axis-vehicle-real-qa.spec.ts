import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #1 2축 차량 모델 — 라이브 실서버 캡처(mock OFF).
 *
 * 실 게이트웨이(:8080) → 재빌드 slip-service(V41 2축) → 실 Postgres.
 * /dispatch-board 의 AddVehicleModal 에서 차종(12)→유효 톤수(동적) 노출을 실 화면 캡처:
 *  - 화물 차종(카고) → 톤수 10개 노출
 *  - 소형 차종(오토바이) → 톤수 숨김(0)
 * 산출: docs/qa/dispatch-2axis-vehicle/add-vehicle-2axis.png
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

test('2축 차량 모델 라이브 캡처 — 차종→유효 톤수 동적 노출 (카고 10톤수 / 소형 숨김)', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)

  await page.goto(`${BASE_URL}/#/dispatch-board`)
  await page.waitForSelector('[data-testid="dispatch-board-page"]', { timeout: 30000 })
  await expect(page.getByTestId('dispatch-board-add-vehicle-button')).toBeEnabled({ timeout: 15000 })

  // AddVehicleModal 열기 → 화물 차종(카고) → 톤수 10개 동적 노출
  await page.getByTestId('dispatch-board-add-vehicle-button').click()
  await expect(page.getByTestId('dispatch-board-add-vehicle-submit')).toBeVisible({ timeout: 10000 })
  await page.getByTestId('dispatch-board-add-vehicle-body-option-CARGO').click()
  await expect(
    page.locator('[data-testid^="dispatch-board-add-vehicle-tonnage-option-"]'),
  ).toHaveCount(10)
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(SHOTS, 'add-vehicle-2axis.png'), fullPage: true })

  // 소형 차종(오토바이) → 톤수 숨김(0)
  await page.getByTestId('dispatch-board-add-vehicle-body-option-MOTORCYCLE').click()
  await expect(
    page.locator('[data-testid^="dispatch-board-add-vehicle-tonnage-option-"]'),
  ).toHaveCount(0)
  await page.waitForTimeout(300)
  await page.screenshot({ path: path.join(SHOTS, 'add-vehicle-2axis-small.png'), fullPage: true })
})
