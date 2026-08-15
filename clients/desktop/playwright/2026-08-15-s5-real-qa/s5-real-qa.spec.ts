import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const API_BASE = process.env['REAL_QA_API_BASE'] ?? 'http://127.0.0.1:8080'
const SHOTS = resolveQaShotsDir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../docs/qa/2026-08-15-s5-real-qa'))
fs.mkdirSync(SHOTS, { recursive: true })

async function openPage(page: Page) {
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
  const closeUpdate = page.getByRole('button', { name: '닫기', exact: true })
  if (await closeUpdate.count()) await closeUpdate.first().click()
  await expect(page.getByTestId('daily-closing-table')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('daily-closing-list-table')).toBeVisible({ timeout: 30_000 })
}

test('S5 실서버 — 원본행 결과·선발행·실행·이력 read-only 확인', async ({ page }) => {
  await openPage(page)
  await expect(page.getByTestId('daily-closing-tab-result')).toContainText('결과 (1)')
  await expect(page.getByTestId('daily-closing-tab-pre_issued')).toContainText('선발행 (12)')
  await page.screenshot({ path: path.join(SHOTS, '01-result-tab-and-history.png'), fullPage: true })

  await page.getByTestId('daily-closing-tab-pre_issued').click()
  await expect(page.getByTestId('daily-closing-tab-pre_issued')).toHaveAttribute('aria-selected', 'true')
  await page.screenshot({ path: path.join(SHOTS, '02-pre-issued-tab-and-history.png'), fullPage: true })

  const executeButton = page.getByTestId('daily-closing-exec-button')
  await expect(executeButton).toBeVisible()
  const scopeChip = page.getByTestId('daily-closing-all-chip')
  if (await scopeChip.getAttribute('aria-pressed') !== 'true') await scopeChip.click()
  await expect(executeButton).toBeEnabled()
  await expect(page.getByText('마감 이력', { exact: true })).toBeVisible()
  await page.screenshot({ path: path.join(SHOTS, '03-execution-and-history.png'), fullPage: true })

  fs.writeFileSync(path.join(SHOTS, 'navigation.txt'), [
    '결과 탭: 사용자는 일마감 메뉴에서 대상일 2026-08-14를 조회하면 처음 결과 탭과 마감 이력을 본다.',
    '선발행 탭: 사용자는 원본행 표 상단의 선발행 탭을 눌러 posted_at 없는 12건을 본다.',
    '실행·이력: 사용자는 일마감 실행 영역에서 전체 범위를 선택하면 실행 버튼이 활성화되고, 아래 마감 이력을 확인한다. 실행 버튼은 공유 DB write 방지를 위해 누르지 않았다.',
  ].join('\n') + '\n', 'utf8')
})
