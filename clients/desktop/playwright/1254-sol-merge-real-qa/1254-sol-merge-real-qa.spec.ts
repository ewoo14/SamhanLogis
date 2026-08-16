import { _electron as electron, expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(HERE, '../../../arologis-desktop')
const ELECTRON = path.resolve(APP_DIR, 'node_modules/electron/dist/electron.exe')
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1254-notice-banner-layout/sol-merge-real-qa'))

async function findScrollableOutsideBanner(page: Page) {
  return page.evaluate(() => {
    const candidates = [document.scrollingElement, ...document.querySelectorAll<HTMLElement>('main, [role="main"], div')]
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
      .filter((element) => !element.closest('[data-app-update-notice-stack]'))
      .filter((element) => element.scrollHeight > element.clientHeight + 1)
    const target = candidates.find((element) => {
      const style = getComputedStyle(element)
      return element === document.scrollingElement || /(auto|scroll)/.test(style.overflowY)
    })
    if (!target) return null
    const rect = target.getBoundingClientRect()
    return {
      tag: target.tagName,
      testId: target.getAttribute('data-testid'),
      clientHeight: target.clientHeight,
      scrollHeight: target.scrollHeight,
      x: Math.max(8, Math.min(innerWidth - 8, rect.left + Math.max(8, rect.width / 2))),
      y: Math.max(8, Math.min(innerHeight - 8, rect.top + Math.max(8, Math.min(rect.height / 2, 80)))),
    }
  })
}

test('PR #1254 SOL 머지 판정 — 문구·외부 클릭·내부 버튼·네이티브 스크롤', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '1254-sol-merge-'))
  const blockedWrites: string[] = []
  const app = await electron.launch({
    executablePath: ELECTRON,
    args: [`--user-data-dir=${userDataDir}`, APP_DIR],
    env: { ...process.env, CERTIFICATE_FIXTURE: '', AROLOGIS_E2E_SKIP_TRUST_PROMPT: '1' },
  })

  try {
    const page = await app.firstWindow()
    await page.route('http://localhost:8080/**', (route) => route.abort('connectionfailed'))
    await page.route('http://localhost:8097/**', async (route) => {
      const method = route.request().method()
      if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || /\/auth\/(?:admin\/)?login(?:\?|$)/.test(route.request().url())) return route.continue()
      blockedWrites.push(`${method} ${route.request().url()}`)
      return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ message: 'SOL merge QA write blocked' }) })
    })

    await page.evaluate(async () => window.arologisAuth.clearToken())
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByTestId('login-id-input').fill('admin')
    await page.getByTestId('login-password-input').fill(resolveQaCredential('QA_AROLOGIS_ADMIN_PASSWORD'))
    await page.getByTestId('login-submit').click()
    await expect(page).toHaveURL(/#\/dispatches\/manual/, { timeout: 15_000 })
    await page.goto(`${page.url().split('#')[0]}#/dispatches/unassigned`)
    await expect(page.getByTestId('arologis-unassigned-date')).toBeVisible({ timeout: 20_000 })

    await app.evaluate(({ BrowserWindow }) => {
      const contents = BrowserWindow.getAllWindows()[0]?.webContents
      contents?.send('trust-root:status', { installed: false, declined: true, shouldAskNextRun: true, shouldBlockApp: false, updateDisabled: true })
      contents?.send('updater:status', { kind: 'error', message: 'SOL 머지 판정 네트워크 오류' })
    })
    await expect(page.getByTestId('app-trust-root-disabled')).toBeVisible()
    await expect(page.getByTestId('app-auto-update-status')).toBeVisible()

    const wording = await page.evaluate(() => ({
      trustRoot: (document.body.innerText.match(/신뢰 루트/g) ?? []).length,
      securityCertificate: (document.body.innerText.match(/보안인증서/g) ?? []).length,
    }))
    const date = page.getByTestId('arologis-unassigned-date')
    await date.click()
    const dateFocused = await date.evaluate((element) => document.activeElement === element)
    const retry = page.getByRole('button', { name: '다시 확인', exact: true })
    await retry.evaluate((element) => {
      ;(window as typeof window & { __solMergeRetryClicks?: number }).__solMergeRetryClicks = 0
      element.addEventListener('click', () => {
        ;(window as typeof window & { __solMergeRetryClicks?: number }).__solMergeRetryClicks = ((window as typeof window & { __solMergeRetryClicks?: number }).__solMergeRetryClicks ?? 0) + 1
      }, { once: true })
    })
    await retry.click()
    const retryClicks = await page.evaluate(() => (window as typeof window & { __solMergeRetryClicks?: number }).__solMergeRetryClicks ?? 0)

    await page.setViewportSize({ width: 1280, height: 480 })
    const scroller = await findScrollableOutsideBanner(page)
    expect(scroller, '배너 밖 네이티브 스크롤 컨테이너가 있어야 한다').not.toBeNull()
    const before = await page.evaluate(() => {
      const candidates = [document.scrollingElement, ...document.querySelectorAll<HTMLElement>('main, [role="main"], div')]
        .filter((element): element is HTMLElement => element instanceof HTMLElement)
        .filter((element) => !element.closest('[data-app-update-notice-stack]'))
        .filter((element) => element.scrollHeight > element.clientHeight + 1)
      const target = candidates.find((element) => element === document.scrollingElement || /(auto|scroll)/.test(getComputedStyle(element).overflowY))
      return target?.scrollTop ?? 0
    })
    await page.mouse.move(scroller!.x, scroller!.y)
    await page.mouse.wheel(0, 500)
    await page.waitForTimeout(100)
    const after = await page.evaluate(() => {
      const candidates = [document.scrollingElement, ...document.querySelectorAll<HTMLElement>('main, [role="main"], div')]
        .filter((element): element is HTMLElement => element instanceof HTMLElement)
        .filter((element) => !element.closest('[data-app-update-notice-stack]'))
        .filter((element) => element.scrollHeight > element.clientHeight + 1)
      const target = candidates.find((element) => element === document.scrollingElement || /(auto|scroll)/.test(getComputedStyle(element).overflowY))
      return target?.scrollTop ?? 0
    })

    const shot = path.join(SHOTS, '1254-sol-merge-real-qa.png')
    await page.screenshot({ path: shot, fullPage: false })
    console.log(`[SOL-MERGE-QA] ${JSON.stringify({ wording, dateFocused, retryClicks, scroller, before, after, blockedWrites, shot, bytes: fs.statSync(shot).size })}`)
    expect(wording.trustRoot).toBe(0)
    expect(wording.securityCertificate).toBeGreaterThan(0)
    expect(dateFocused).toBe(true)
    expect(retryClicks).toBe(1)
    expect(after).toBeGreaterThan(before)
  } finally {
    await app.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})
