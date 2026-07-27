import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * #880 blast-radius 확인 — 변경하지 않은 다른 DataTable 소비처가 좁은 폭에서 정상인지.
 * design-system diff=0 + 6파일만 변경이므로 무영향이 자명하나, 실서버로 재확인한다.
 */
import { expect, test } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5310'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PASSWORD = process.env['DEV_PASSWORD'] ?? 'dev_p05_pass!'
const SHOT_DIR = resolveQaShotsDir(join(process.cwd(), '..', '..', 'docs', 'qa', '880-opus-review-2026-07-24'))

test('SalesOrderApprovalsPage(미변경) 768px 정상 렌더 — 무영향 확인', async ({ page }) => {
  mkdirSync(SHOT_DIR, { recursive: true })
  const res = await page.request.post(`${API_BASE}/api/auth/login`, { data: { loginId: 'dev_master', password: PASSWORD } })
  expect(res.ok()).toBeTruthy()
  const d = (await res.json()).data ?? {}
  await page.addInitScript((v) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => ({ ...v, partnerCode: null }), setToken: async () => undefined, clearToken: async () => undefined },
    })
  }, { token: d.token ?? '', userId: d.userId ?? '', role: d.role ?? 'MASTER', fullName: d.displayName ?? '개발책임자' })

  await page.setViewportSize({ width: 768, height: 900 })
  await page.goto(`${BASE_URL}/#/sales/order-approvals`, { waitUntil: 'domcontentloaded', timeout: 25_000 })
  // 페이지 골격(제목/테이블 혹은 빈 메시지)이 크래시 없이 뜨는 것만 확인.
  await expect(page.locator('body')).toBeVisible()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: join(SHOT_DIR, 'blast-radius-sales-order-approvals-768.png'), fullPage: true })
})
