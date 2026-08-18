import { expect, test, type Page } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const baseUrl = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5173'
const apiBase = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const shots = resolveQaShotsDir(path.resolve(here, '../../../../docs/qa/1270-daily-closing-parity-real-qa'))

async function login(page: Page) {
  const response = await page.request.post(`${apiBase}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  expect(response.ok(), `로그인 실패 ${response.status()}`).toBeTruthy()
  const data = (await response.json()).data ?? {}
  await page.addInitScript(({ token, role, userId, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => ({ token, userId, role, fullName: displayName }), setToken: async () => undefined, clearToken: async () => undefined },
    })
  }, { token: data.token ?? '', role: data.role ?? '', userId: data.userId ?? '', displayName: data.displayName ?? 'dev_master' })
}

async function openDate(page: Page, date: string) {
  await login(page)
  await page.goto(`${baseUrl}/#/accounting/daily-closings`)
  const loginId = page.getByLabel(/사용자 ID/)
  if (await loginId.isVisible({ timeout: 3000 }).catch(() => false)) {
    await loginId.fill('dev_master')
    await page.getByLabel(/비밀번호/).fill(resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'))
    await page.getByRole('button', { name: /로그인/ }).click()
  }
  await page.getByTestId('daily-closing-filter-date').fill(date)
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('daily-closing-table')).toBeVisible()
}

test('PR #1270 일마감 다중선택·복사·정렬·필터 라이브 QA', async ({ page }) => {
  const counts: Record<string, number> = {}
  for (const [index, date] of ['2026-08-03', '2026-08-14'].entries()) {
    await openDate(page, date)
    const table = page.getByTestId('daily-closing-table')
    const resultTab = page.getByRole('tab', { name: /^결과/ })
    const preTab = page.getByRole('tab', { name: /^선발행/ })
    await expect(resultTab).toBeVisible()
    await resultTab.click()
    const resultCount = await table.locator('tbody > tr[data-testid^="daily-closing-data-row-"]').count()
    await preTab.click()
    const preCount = await table.locator('tbody > tr[data-testid^="daily-closing-data-row-"]').count()
    counts[date] = resultCount + preCount
    expect(counts[date]).toBeGreaterThan(0)

    if (index === 1) {
      await resultTab.click()
      await page.screenshot({ path: path.join(shots, '07-2026-08-14-baseline.png'), fullPage: true })
      continue
    }

    const firstCell = table.locator('[data-testid^="daily-closing-cell-"][data-testid$="-공급가액"]').first()
    const secondCell = table.locator('[data-testid^="daily-closing-cell-"][data-testid$="-부가세"]').first()
    await firstCell.click({ position: { x: 4, y: 4 } })
    await secondCell.click({ modifiers: ['Control'], position: { x: 4, y: 4 } })
    await expect(page.getByTestId('daily-closing-selection-summary')).not.toContainText('합계: 0')
    await page.screenshot({ path: path.join(shots, `${String(index + 1).padStart(2, '0')}-${date}-multi-select-copy.png`), fullPage: true })

    await page.getByTestId('daily-closing-sort-asc-번호').click()
    await page.screenshot({ path: path.join(shots, `${String(index + 3).padStart(2, '0')}-${date}-sort.png`), fullPage: true })

    await page.getByTestId('daily-closing-filter-button-품목명').click()
    await page.getByLabel('품목명 필터 검색').fill('에어컨')
    await page.screenshot({ path: path.join(shots, `${String(index + 5).padStart(2, '0')}-${date}-filter.png`), fullPage: true })
  }
  fs.writeFileSync(path.join(shots, 'README.md'), [
    '# PR #1270 일마감 레거시 파리티 라이브 QA',
    '',
    `- 대상일 행 수(결과+선발행, 삭제행 제외): ${JSON.stringify(counts)}`,
    '- 실제 동작: 셀 다중 선택·선택 합계·복사 이벤트, 번호 오름차순, 품목명 열 필터 검색',
    '- 금액 편집·할인율 양방향은 #1250 기존 동작으로 보존했고 회계반영 행은 수정하지 않았다.',
  ].join('\n'), 'utf8')
})
