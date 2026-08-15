import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const API_BASE = process.env['REAL_QA_API_BASE'] ?? 'http://127.0.0.1:8080'
const SHOTS = resolveQaShotsDir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../docs/qa/2026-08-15-s8-real-qa'))
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
      setToken: async () => undefined,
      clearToken: async () => undefined,
    } })
  }, { token: data.token ?? '', role: data.role ?? '', userId: data.userId ?? '', name: data.displayName ?? 'dev_master' })
  await page.goto('/#/accounting/daily-closings')
  const closeUpdate = page.getByRole('button', { name: '닫기', exact: true })
  if (await closeUpdate.count()) await closeUpdate.first().click()
  await expect(page.getByTestId('daily-closing-action-row')).toBeVisible({ timeout: 30_000 })
}

test('S8 실서버 — 레거시 상단 탭·액션 줄·단일 표 구조', async ({ page }) => {
  await openDailyClosing(page)
  await expect(page.getByTestId('daily-closing-table')).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: path.join(SHOTS, '01-result.png'), fullPage: true })

  await page.getByTestId('daily-closing-tab-pre_issued').click()
  await expect(page.getByTestId('daily-closing-table')).toBeVisible()
  await page.screenshot({ path: path.join(SHOTS, '02-pre-issued.png'), fullPage: true })

  await page.getByTestId('daily-closing-tab-history').click()
  await expect(page.getByText('마감 이력', { exact: true })).toBeVisible()
  await page.screenshot({ path: path.join(SHOTS, '03-history.png'), fullPage: true })

  await page.getByTestId('daily-closing-tab-detail').click()
  await expect(page.getByText('일마감 상세', { exact: true })).toBeVisible()
  await page.screenshot({ path: path.join(SHOTS, '04-detail.png'), fullPage: true })

  await expect(page.getByTestId('daily-closing-exec-button')).toBeVisible()
  await expect(page.getByTestId('daily-closing-filter-reset')).toBeVisible()
  fs.writeFileSync(path.join(SHOTS, 'navigation.txt'), [
    '결과: 사용자는 일마감 메뉴에 들어와 대상일 2026-08-14를 조회하면 결과 탭과 표를 본다.',
    '선발행: 사용자는 상단 선발행 탭을 눌러 회계반영일자 없는 원본행을 본다.',
    '마감이력: 사용자는 상단 마감이력 탭을 눌러 같은 날짜의 마감 이력을 본다.',
    '상세: 사용자는 상단 상세 탭을 눌러 선택된 마감 상세를 본다.',
    '액션 줄: 사용자는 표 위 액션 줄에서 대상일·마감 실행·역마감·필터초기화를 본다. 마감 실행은 공유 DB write 방지를 위해 누르지 않았다.',
  ].join('\n') + '\n', 'utf8')
})
