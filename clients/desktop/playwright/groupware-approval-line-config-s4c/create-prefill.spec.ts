/**
 * 슬4c — 그룹웨어 생성 기본 결재라인 프리필 (mock 모드 playwright).
 *
 * CI Desktop Playwright(mock 회귀 하드게이트, VITE_MOCK_MODE webServer :5173)에서 실행되어
 * 프리필을 검증한다(*-real-qa 아님 → CI 포함). 로컬 수동 캡처 시 AUDIT_BASE_URL=:5175.
 * 생성 페이지에서 "지출결의서"(GROUPWARE_EXPENSE_REPORT) 선택→중앙 결재선 미리보기
 * (mock 시드: 작성자 / 회계팀 GROUP / 홍지수 USER) + 추가 결재자 칩. canAccess 보장 위해 mockRole=MASTER+mockPerms.
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, expect, type Page } from '@playwright/test'

const BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const _dirname = path.dirname(fileURLToPath(import.meta.url))
const DIR = path.resolve(_dirname, '../../../../docs/qa/groupware-approval-line-config-s4c')
fs.mkdirSync(DIR, { recursive: true })
async function cap(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(DIR, name), fullPage: true })
}

async function pickFirstDropdownOption(page: Page, listboxLabel: string, timeoutMs = 8_000): Promise<boolean> {
  const listbox = page.getByRole('listbox', { name: listboxLabel })
  await listbox.waitFor({ state: 'visible', timeout: timeoutMs })
  const firstOption = listbox.getByRole('option').first()
  await firstOption.dispatchEvent('mousedown')
  await page.waitForTimeout(400)
  return true
}

test('S4c: 그룹웨어 생성 — 지출결의서 선택 시 중앙 결재선 미리보기+추가 결재자', async ({ page }) => {
  const perms = Buffer.from(JSON.stringify([{ pageCode: 'groupware.approvals', view: true, edit: true }]), 'utf-8').toString('base64')
  await page.goto(`${BASE}/?mockRole=MASTER&mockPerms=${perms}#/groupware/approvals/new`, { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(1500)
  await page.evaluate(() => { window.location.hash = '#/groupware/approvals/new' })
  await page.waitForTimeout(2500)

  const select = page.getByTestId('groupware-approval-create-template')
  await expect(select).toBeVisible({ timeout: 10_000 })
  await select.selectOption({ label: '지출결의서' })
  await page.waitForTimeout(2000)
  await cap(page, '02-create-expense-report-prefilled.png')

  // 중앙 config 결재선은 별도 미리보기로 노출되고, GROUP 단계는 그룹명만 표시(UUID 비노출).
  const body = (await page.locator('body').textContent()) ?? ''
  expect(body).toContain('기본 결재선')
  expect(body).toContain('작성자')
  expect(body).toContain('회계팀')
  expect(body).toContain('홍지수')
  expect(body).not.toContain('mock-group-custom-accounting')

  const approverInput = page.getByTestId('approver-search-input')
  await approverInput.fill('박배차')
  await page.waitForTimeout(1_200)
  await pickFirstDropdownOption(page, '결재자 검색 결과')
  await expect(page.getByTestId('approver-chip')).toHaveCount(1)
  await cap(page, '03-create-expense-report-extra-approver.png')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(700)
  await cap(page, '04-create-expense-report-mobile.png')
})
