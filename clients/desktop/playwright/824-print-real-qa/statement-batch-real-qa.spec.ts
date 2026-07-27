import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/** #824 R2 #6 — 거래명세서 일괄 인쇄가 실제 조회를 출력하는가 (dev_accountant) */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5192'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '824-print-live-qa-2026-07-23'))

test.use({ viewport: { width: 1400, height: 1600 } })

test('#6 거래명세서 일괄 인쇄 — 실제 선택 거래처만 출력', async ({ page }) => {
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
  await expect(page.getByRole('heading', { name: '거래명세서 일괄 생성' })).toBeVisible({ timeout: 15000 })
  await page.screenshot({ path: join(SHOT_DIR, 'P6a-일괄-목록.png'), fullPage: true })
  const listBody = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  console.log(`■ 일괄 목록: ${listBody.slice(0, 260)}`)
  expect(listBody, '권한 부족으로 대시보드로 튕겼다 — 이 상태의 단언은 무의미').not.toContain('환영합니다')

  // Q1 — 목록의 실제 row에서 거래처를 고르고, 선택 key가 print route로 전달되는지 확인한다.
  await page.getByTestId('statement-batch-from').fill(from)
  await page.getByTestId('statement-batch-to').fill(today)
  const rows = page.locator('[data-testid^="statement-batch-row-"]')
  await expect(rows.first(), '실 API 거래처 목록이 렌더되지 않았다').toBeVisible({ timeout: 15000 })
  expect(await rows.count(), '선택/비선택 비교를 위한 거래처가 2개 미만이다').toBeGreaterThanOrEqual(2)
  const selectedRow = rows.nth(0)
  const unselectedRow = rows.nth(1)
  const selectedName = (await selectedRow.locator('td').nth(2).innerText()).trim()
  const unselectedName = (await unselectedRow.locator('td').nth(2).innerText()).trim()
  expect(selectedName, '선택 대상 거래처명이 비어 있다').not.toBe('')
  expect(unselectedName, '비선택 대상 거래처명이 비어 있다').not.toBe('')
  expect(unselectedName).not.toBe(selectedName)

  await selectedRow.getByRole('checkbox').check()
  await expect(page.getByTestId('statement-batch-print-selected')).toContainText('1')
  await page.getByTestId('statement-batch-print-selected').click()

  const route = new URL(page.url())
  const hashQuery = new URLSearchParams(route.hash.split('?')[1] ?? '')
  const selectionKeys = hashQuery.getAll('selectionKeys')
  expect(selectionKeys, '목록 선택이 인쇄 route 반복 query로 전달되지 않았다').toHaveLength(1)
  expect(selectionKeys[0]).not.toBe('')

  // Q2/Q3 — 인쇄 화면이 실제로 성공 렌더되고 선택 거래처만 출력하는지 먼저 양성으로 증명한다.
  await expect(page.getByTestId('statement-batch-print-area')).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('heading', { name: '거래명세서', exact: true }).first()).toBeVisible()
  const printArea = page.getByTestId('statement-batch-print-area')
  await expect(printArea.getByText(selectedName, { exact: true })).toBeVisible()
  await expect(printArea.locator('section')).toHaveCount(1)
  await expect(printArea.getByText(unselectedName, { exact: true })).toHaveCount(0)

  await page.screenshot({ path: join(SHOT_DIR, 'P6b-일괄-인쇄미리보기.png'), fullPage: true })
  const printBody = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  console.log(`■ 일괄 인쇄: ${printBody.slice(0, 500)}`)

  for (const ghost of ['(주)한빛물산', '(주)대성유통', '샘플거래처', 'MOCK']) {
    expect(printBody, `정적 목업 흔적 "${ghost}" 이 인쇄 화면에 있다`).not.toContain(ghost)
  }
})
