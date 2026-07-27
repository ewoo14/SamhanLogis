import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #2 2-pane 배차 보드 — 라이브 실서버 캡처(mock OFF).
 *
 * 실 게이트웨이(:8080) → 재빌드 slip-service(V42 그룹 발송상태) → 실 Postgres.
 * (1) AddVehicleModal: 차종 9(active subset, 승용차/축차/추레라 제외) + 화물 카고 톤수 6(1.2/14/18/25 제외).
 * (2) 보드 차량 캡슐: 상태색·차량아이콘·차종톤수 헤더·전표번호 입력·체크박스 렌더.
 * 산출: docs/qa/dispatch-board-2pane/add-vehicle-active-subset.png, board-capsule.png
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
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/dispatch-board-2pane'))
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

test('2-pane 보드 라이브 — active subset(차종9/톤수6) + 캡슐 고도화', async ({ page }) => {
  const login = await realLogin(page, 'dev_master')
  await installAuthStub(page, login)
  await page.goto(`${BASE_URL}/#/dispatch-board`)
  await page.waitForSelector('[data-testid="dispatch-board-page"]', { timeout: 30000 })
  await expect(page.getByTestId('dispatch-board-add-vehicle-button')).toBeEnabled({ timeout: 15000 })

  // (1) AddVehicleModal — active subset 검증 + 캡처
  await page.getByTestId('dispatch-board-add-vehicle-button').click()
  await expect(page.getByTestId('dispatch-board-add-vehicle-submit')).toBeVisible({ timeout: 10000 })
  // 차종 9개 (제외 3종 미노출)
  await expect(page.locator('[data-testid^="dispatch-board-add-vehicle-body-option-"]')).toHaveCount(9)
  await expect(page.getByTestId('dispatch-board-add-vehicle-body-option-SEDAN')).toHaveCount(0)
  await expect(page.getByTestId('dispatch-board-add-vehicle-body-option-AXLE')).toHaveCount(0)
  await expect(page.getByTestId('dispatch-board-add-vehicle-body-option-TRAILER')).toHaveCount(0)
  // 화물 카고 → 톤수 6개 (제외 4종 미노출)
  await page.getByTestId('dispatch-board-add-vehicle-body-option-CARGO').click()
  await expect(page.locator('[data-testid^="dispatch-board-add-vehicle-tonnage-option-"]')).toHaveCount(6)
  await expect(page.getByTestId('dispatch-board-add-vehicle-tonnage-option-T_14')).toHaveCount(0)
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(SHOTS, 'add-vehicle-active-subset.png'), fullPage: true })

  // (2) 차량 그룹 추가 → 캡슐(상태색/아이콘/전표번호입력/체크박스) 캡처
  await page.getByTestId('dispatch-board-add-vehicle-submit').click()
  await expect(page.getByTestId('dispatch-board-vehicle-group-1')).toBeVisible({ timeout: 10000 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(SHOTS, 'board-capsule.png'), fullPage: true })
})
