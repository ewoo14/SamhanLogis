/**
 * 슬4b — 결재라인 설정 메뉴 동적 doc-type UI 캡처 (VITE_MOCK_MODE, mockRole=MASTER).
 *
 * config 페이지(/admin/approval-line-config)는 PermissionGuard(admin.approval-line-config) +
 * standalone QA-env 실 게이트웨이 admin 403 한계([[local-stack-qa-gotchas]]) → mock 모드 MASTER 로
 * FE 컴포넌트 UI 캡처(실 백엔드 아님 — 명시). 동적 doc-type: 전표 3종 + 그룹웨어 활성 템플릿.
 *
 * P1-D: -real-qa 접미사 제거 → mock 모드 CI 게이트 포함.
 * mock 시드 V75 정합: 지출결의서 = 부서장(매니저 그룹) + 대표(user-001 김미선).
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
const DIR = resolveMockQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/groupware-approval-line-config-s4b'))
fs.mkdirSync(DIR, { recursive: true })
let seq = 0
async function cap(page: Page, name: string): Promise<void> {
  seq++
  await page.screenshot({ path: path.join(DIR, `${String(seq).padStart(2, '0')}-${name}.png`), fullPage: true })
}

test('S4b: 결재라인 설정 동적 doc-type (전표+그룹웨어 종류)', async ({ page }) => {
  // config 페이지는 canAccess(admin.approval-line-config) 필요 → mockPerms override 로 grant.
  const perms = Buffer.from(JSON.stringify([{ pageCode: 'admin.approval-line-config', view: true, edit: true }]), 'utf-8').toString('base64')
  await page.goto(`${BASE}/?mockRole=MASTER&mockPerms=${perms}#/admin/approval-line-config`, { waitUntil: 'networkidle', timeout: 30_000 })
  await page.waitForTimeout(1500)
  await page.evaluate(() => { window.location.hash = '#/admin/approval-line-config' })
  await page.waitForTimeout(2500)
  console.log('[URL]', page.url())
  console.log('[BODY]', ((await page.locator('body').textContent()) ?? '').replace(/\s+/g, ' ').slice(0, 300))
  await cap(page, 'config-doctype-initial')
  const select = page.getByTestId('approval-line-doc-type-select')
  await expect(select).toBeVisible({ timeout: 10_000 })

  // 셀렉터에 전표 + 그룹웨어 옵션 존재 확인
  const optionLabels = await select.locator('option').allTextContents()
  console.log('[DOCTYPES]', optionLabels.join(' | '))
  expect(optionLabels.some((t) => t.includes('판매전표'))).toBeTruthy()
  expect(optionLabels.some((t) => t.includes('지출결의서') || t.includes('휴가신청서'))).toBeTruthy()

  // 그룹웨어 종류 선택 → V75 seed: 부서장(매니저 그룹) / 대표(user-001)
  await select.selectOption('GROUPWARE_EXPENSE_REPORT')
  await page.waitForTimeout(1500)
  await expect(page.getByText('부서장').first()).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText('매니저').first()).toBeVisible({ timeout: 10_000 })
  await cap(page, 'config-groupware-expense-report')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(700)
  await cap(page, 'config-groupware-expense-report-mobile')
})
