import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const API_BASE = process.env['REAL_QA_API_BASE'] ?? 'http://127.0.0.1:8080'
const SHOTS = resolveQaShotsDir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../docs/qa/2026-08-15-s4-real-qa'))
fs.mkdirSync(SHOTS, { recursive: true })

async function openDailyClosing(page: Page) {
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  expect(response.ok(), `로그인 실패 ${response.status()}`).toBeTruthy()
  const data = (await response.json()).data ?? {}
  await page.addInitScript(({ token, role, userId, name }: { token: string; role: string; userId: string; name: string }) => {
    Object.defineProperty(window, 'samhanAuth', { configurable: true, value: {
      getToken: async () => ({ token, userId, role, fullName: name, partnerCode: null }),
      setToken: async () => undefined, clearToken: async () => undefined,
    } })
  }, { token: data.token ?? '', role: data.role ?? '', userId: data.userId ?? '', name: data.displayName ?? 'dev_master' })
  await page.goto('/#/accounting/daily-closings')
  await expect(page.getByTestId('daily-closing-table')).toBeVisible({ timeout: 30_000 })
  const closeUpdate = page.getByRole('button', { name: '닫기', exact: true })
  if (await closeUpdate.count()) await closeUpdate.first().click()
  await expect(page.getByRole('tab', { name: '결과 (1)' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '선발행 (12)' })).toBeVisible()
}

test('S4 결과 탭 실데이터', async ({ page }) => {
  await openDailyClosing(page)
  await page.screenshot({ path: path.join(SHOTS, '01-result-tab.png'), fullPage: true })
  fs.writeFileSync(path.join(SHOTS, 'navigation.txt'), '결과 탭: 사용자는 일마감 메뉴에 들어와 대상일 2026-08-14를 조회하면 처음 이 탭에 도착한다.\n', 'utf8')
})

test('S4 선발행 탭 실데이터', async ({ page }) => {
  await openDailyClosing(page)
  await page.getByRole('tab', { name: '선발행 (12)' }).click()
  await expect(page.getByRole('tab', { name: '선발행 (12)' })).toHaveAttribute('aria-selected', 'true')
  await page.screenshot({ path: path.join(SHOTS, '02-pre-issued-tab.png'), fullPage: true })
  fs.appendFileSync(path.join(SHOTS, 'navigation.txt'), '선발행 탭: 사용자는 상단 회계반영일자 이동 탭에서 선발행을 클릭해 posted_at 없는 12건을 본다.\n', 'utf8')
})

test('S4 확장행 실데이터', async ({ page }) => {
  await openDailyClosing(page)
  await page.getByRole('tab', { name: '선발행 (12)' }).click()
  await page.getByRole('button', { name: '상세 펼치기 2' }).click()
  await expect(page.getByTestId('daily-closing-expanded-2')).toBeVisible()
  await page.screenshot({ path: path.join(SHOTS, '03-expanded-row.png'), fullPage: false })
  fs.appendFileSync(path.join(SHOTS, 'navigation.txt'), '확장행: 사용자는 선발행 결과 표에서 번호 2행의 상세 펼치기를 클릭해 현대 검증값과 확인 사유를 본다.\n', 'utf8')
})
