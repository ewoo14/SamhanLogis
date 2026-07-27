/**
 * 슬4c — 그룹웨어 생성 기본 결재선 미리보기 (mock 모드 playwright).
 *
 * CI Desktop Playwright(mock 회귀 하드게이트, VITE_MOCK_MODE webServer :5173)에서 실행되어
 * 결재선 미리보기를 검증한다(*-real-qa 아님 → CI 포함). 로컬 수동 캡처 시 AUDIT_BASE_URL=:5175.
 *
 * P1-A/B 변경 반영:
 * - 생성 페이지는 비-admin GET /auth/approval-line-configs/{type}/structure 사용.
 * - 미리보기는 구조 라벨만 표시(그룹명·사원명 미표시 — 구조 endpoint 미제공).
 * - V75 seed: 작성자(CREATOR) / 부서장(GROUP, 매니저 그룹) / 대표(USER, user-001 김미선).
 */
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'
import { test, expect, type Page } from '@playwright/test'
import { resolveMockQaShotsDir } from '../support/qa-screenshot-dir'

const BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const _dirname = path.dirname(fileURLToPath(import.meta.url))
// 캡처는 커밋된 확정 증거(docs/qa/<slug>/*.png)가 아니라 gitignore 된 _local/ 로 나간다 —
// 재실행이 증거를 덮어쓰지 못하게 한다. 승격은 QA_SHOTS_DIR 로만 opt-in (#926 참조 구현).
const DIR = resolveMockQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/groupware-approval-line-config-s4c'))
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

  // P1-A/B: 미리보기는 비-admin structure endpoint 기반 라벨만 표시.
  // V75 seed: 작성자(seq0) / 부서장(seq1, GROUP) / 대표(seq2, USER).
  // UUID·그룹ID·사원ID 화면 미노출 확인.
  const body = (await page.locator('body').textContent()) ?? ''
  expect(body).toContain('기본 결재선')
  expect(body).toContain('작성자')
  expect(body).toContain('부서장')
  expect(body).toContain('대표')
  expect(body).not.toContain('00000000-0000-0000-0000-000000000101')
  expect(body).not.toContain('user-001')

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
