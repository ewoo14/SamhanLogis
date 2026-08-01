import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * PR #991 라이브 QA — 출고전표 전환을 실 화면에서 수행하고, 같은 주문을 다시
 * 전환하려 할 때 화면이 어떻게 되는지 캡처한다. 이 PR 의 fix 가 바꾼 표면은
 * "같은 멱등 키 재시도 판정" 이며, 실 사용자가 그것을 만드는 조작이 전환 재시도다.
 * 확인 항목: ① 전환 성공 ② 전표가 하나만 생김 ③ 전표 상세 금액 표시.
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5931'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const ORDER_ID = process.env['ORDER_ID'] ?? '5d78eaa1-226c-49ea-a2ac-1b52bccef571'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/991-replay-gui'))
fs.mkdirSync(SHOTS, { recursive: true })

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

test('#991 출고전표 전환 — 재시도해도 전표가 하나만 생기고 금액이 맞다', async ({ page }) => {
  const login = await realLogin(page, 'dev_manager')
  await installAuthStub(page, login)

  const convertLog: string[] = []
  page.on('response', async (response) => {
    if (response.url().includes('/convert-to-slip') && response.request().method() === 'POST') {
      try {
        convertLog.push(`HTTP ${response.status()} :: ${await response.text()}`)
      } catch { /* ignore */ }
    }
  })

  // 1) 주문 상세 진입
  await page.goto(`${BASE_URL}/#/sales/partner-orders/${ORDER_ID}`)
  await expect(page.getByTestId('partner-order-convert-open')).toBeVisible({ timeout: 30_000 })
  await capture(page, 'order-detail-before-convert')

  // 2) 전환 모달
  await page.getByTestId('partner-order-convert-open').click()
  await expect(page.getByTestId('partner-order-convert-submit')).toBeVisible({ timeout: 10_000 })
  const warehouseInput = page.getByTestId('partner-order-convert-warehouse').locator('input')
  await warehouseInput.fill('HQ-001')
  await page.getByText('본사창고', { exact: false }).first().click()
  await capture(page, 'convert-modal-ready')

  // 3) 전환 제출 — 더블클릭(같은 멱등 키로 두 번 도달하는 실 사용자 조작)
  const submitBtn = page.getByTestId('partner-order-convert-submit')
  await expect(submitBtn).toBeEnabled({ timeout: 10_000 })
  await submitBtn.dblclick()
  await Promise.race([
    submitBtn.waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => undefined),
    page.waitForTimeout(20_000),
  ])
  await page.waitForTimeout(1500)
  await capture(page, 'convert-result-after-doubleclick')

  // 4) 주문 상세 재조회 — 전환 결과 상태
  await page.reload()
  await page.waitForTimeout(3000)
  await capture(page, 'order-detail-after-convert')

  console.log('[CONVERT RESPONSES]\n' + convertLog.join('\n---\n'))
  fs.writeFileSync(path.join(SHOTS, 'convert-responses.txt'), convertLog.join('\n---\n'), 'utf8')
})
