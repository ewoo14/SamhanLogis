/**
 * S3-5 배차 coedit 협업 메모 섹션 스크린샷 캡처 (라이브 QA, mock OFF)
 */
import { test, expect } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.cjs'
import { resolveQaCredential } from '../../../scripts/lib/qa-credentials.cjs'

const BASE_URL = 'http://127.0.0.1:5175'
const API_BASE = 'http://localhost:8080'
// _local 격리(2026-07-27 재수렴 3차 W2 — __dirname 직접 지정은 재실행마다 커밋된
// 01~03*.png 를 덮어썼다. 다른 docs/qa 캡처 스크립트와 같은 resolveQaShotsDir 규약으로 감싼다).
const SS_DIR = resolveQaShotsDir(path.resolve(__dirname))

test('배차 보드 → task 모달 협업 메모 섹션 캡처', async ({ page }) => {
  // 1. 로그인
  await page.goto(`${BASE_URL}/login`)
  await page.waitForLoadState('networkidle').catch(() => {})
  await page.screenshot({ path: path.join(SS_DIR, '01-login.png'), fullPage: false })

  const loginIdInput = page.locator('input[name="loginId"], input[type="text"]').first()
  const passwordInput = page.locator('input[name="password"], input[type="password"]').first()
  await loginIdInput.fill('kimmiseon')
  await passwordInput.fill(resolveQaCredential('QA_MASTER_PASSWORD'))
  await page.keyboard.press('Enter')
  await page.waitForURL(url => !url.includes('/login'), { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(2000)
  await page.screenshot({ path: path.join(SS_DIR, '02-after-login.png'), fullPage: false })

  // 2. 배차 보드 이동
  await page.goto(`${BASE_URL}/dispatch-board`)
  await page.waitForLoadState('domcontentloaded')
  await page.waitForTimeout(3000)
  await page.screenshot({ path: path.join(SS_DIR, '03-dispatch-board.png'), fullPage: false })

  // 3. 배차 task 클릭 (첫 번째 task)
  const taskRow = page.locator('[data-testid*="dispatch-task"], table tbody tr, .task-row, [class*="task"]').first()
  const isVisible = await taskRow.isVisible().catch(() => false)
  if (isVisible) {
    await taskRow.click()
    await page.waitForTimeout(2000)
    await page.screenshot({ path: path.join(SS_DIR, '04-task-modal-opened.png'), fullPage: false })
  } else {
    // 테이블 행 직접 클릭 시도
    const anyRow = page.locator('table tbody tr').first()
    if (await anyRow.isVisible().catch(() => false)) {
      await anyRow.click()
      await page.waitForTimeout(2000)
      await page.screenshot({ path: path.join(SS_DIR, '04-task-modal-opened.png'), fullPage: false })
    }
  }

  // 4. 협업 메모 섹션 찾기
  const collabSection = page.locator('[aria-label="협업 메모"], [data-testid*="coedit"], [class*="collab-memo"]').first()
  const sectionVisible = await collabSection.isVisible().catch(() => false)
  if (sectionVisible) {
    await collabSection.scrollIntoViewIfNeeded()
    await page.waitForTimeout(500)
  }
  await page.screenshot({ path: path.join(SS_DIR, '05-collab-memo-section.png'), fullPage: false })
})
