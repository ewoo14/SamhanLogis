/** #824 R2 #6 — 거래명세서 일괄 인쇄가 실제 조회를 출력하는가 (dev_accountant) */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5192'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOT_DIR = join(process.cwd(), '..', '..', 'docs', 'qa', '824-print-live-qa-2026-07-23')

test.use({ viewport: { width: 1400, height: 1600 } })

test('#6 거래명세서 일괄 인쇄 — 실제 조회 출력', async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const r = await page.request.post(`${API_BASE}/api/auth/login`, { data: { loginId: 'dev_accountant', password: PASSWORD } })
  expect(r.ok(), `로그인 실패 HTTP ${r.status()}`).toBeTruthy()
  const v = (await r.json()).data ?? {}
  await page.addInitScript((x: { token: string; userId: string; role: string; fullName: string }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => ({ ...x, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined },
    })
  }, { token: v.token ?? '', userId: v.userId ?? '', role: v.role ?? 'MASTER', fullName: v.displayName ?? '개발회계' })

  const today = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)

  await page.goto(`${BASE_URL}/#/accounting/statement-batch`)
  await page.waitForTimeout(3500)
  await page.screenshot({ path: join(SHOT_DIR, 'P6a-일괄-목록.png'), fullPage: true })
  const listBody = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  console.log(`■ 일괄 목록: ${listBody.slice(0, 260)}`)
  expect(listBody, '권한 부족으로 대시보드로 튕겼다 — 이 상태의 단언은 무의미').not.toContain('환영합니다')

  await page.goto(`${BASE_URL}/#/print/statement-batch?from=${from}&to=${today}`)
  await page.waitForTimeout(4000)
  await page.screenshot({ path: join(SHOT_DIR, 'P6b-일괄-인쇄미리보기.png'), fullPage: true })
  const printBody = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  console.log(`■ 일괄 인쇄: ${printBody.slice(0, 500)}`)
  expect(printBody, '권한 부족으로 대시보드로 튕겼다').not.toContain('환영합니다')

  for (const ghost of ['(주)한빛물산', '(주)대성유통', '샘플거래처', 'MOCK']) {
    expect(printBody, `정적 목업 흔적 "${ghost}" 이 인쇄 화면에 있다`).not.toContain(ghost)
  }
})
