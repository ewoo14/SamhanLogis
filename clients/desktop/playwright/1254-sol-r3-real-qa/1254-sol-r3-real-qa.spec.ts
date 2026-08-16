import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron, expect, test } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const DATE = '2026-08-08'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(HERE, '../../../arologis-desktop')
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1254-notice-banner-layout/sol-r3-screenshots'))

async function gotoHash(page: import('@playwright/test').Page, route: string): Promise<void> {
  const target = await page.evaluate((nextRoute) => {
    const url = new URL(window.location.href)
    url.hash = nextRoute
    return url.href
  }, route)
  await page.goto(target)
}

test('PR #1254 SOL R3 — 스크롤·레이어·print·3장 stack·Tab을 실 앱/실 서버에서 적대검증한다', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '1254-sol-r3-'))
  const defects: string[] = []
  const app = await electron.launch({
    executablePath: path.resolve(APP_DIR, 'node_modules/electron/dist/electron.exe'),
    args: [`--user-data-dir=${userDataDir}`, APP_DIR],
    env: { ...process.env, CERTIFICATE_FIXTURE: '', AROLOGIS_E2E_SKIP_TRUST_PROMPT: '1' },
  })

  try {
    const page = await app.firstWindow()
    page.on('console', (message) => console.log(`[BROWSER-CONSOLE] ${message.type()} ${message.text()}`))
    page.on('pageerror', (error) => console.log(`[BROWSER-PAGEERROR] ${error.stack ?? error.message}`))

    // 실제 8097 데이터는 그대로 두고, 세 번째 정책 오류 배너만 실제 네트워크 실패로 만든다.
    await page.route('http://localhost:8080/**', (route) => route.abort('connectionfailed'))
    await page.evaluate(async () => { await window.arologisAuth.clearToken() })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('login-id-input')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('login-id-input').fill('admin')
    await page.getByTestId('login-password-input').fill(resolveQaCredential('QA_AROLOGIS_ADMIN_PASSWORD'))
    await page.getByTestId('login-submit').click()
    await expect(page).toHaveURL(/#\/dispatches\/manual/, { timeout: 15_000 })

    // 해시라우트 및 화면 고유 요소로 실제 도달을 먼저 단정한다.
    await gotoHash(page, '/dispatches/unassigned')
    await expect(page.getByRole('heading', { name: '미배차 리스트' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('arologis-unassigned-date')).toBeVisible()

    const responsePromise = page.waitForResponse((response) => response.url().includes(`/admin/arologis/dispatches/unassigned?date=${DATE}`))
    await page.getByTestId('arologis-unassigned-date').fill(DATE)
    const response = await responsePromise
    const responseBody = await response.json()
    const backendCount = responseBody.data.entries.length as number
    const renderedRowLocator = page.locator('[data-testid^="arologis-unassigned-row-"]')
    await expect(renderedRowLocator).toHaveCount(backendCount, { timeout: 15_000 })
    const renderedRows = await renderedRowLocator.count()
    console.log(`[REAL-DATA] date=${DATE} response=${response.status()} backendEntries=${backendCount} renderedRows=${renderedRows}`)
    expect(response.status()).toBe(200)
    expect(renderedRows).toBe(backendCount)

    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('updater:status', { kind: 'error', message: '업데이트 검증 상태 확인 실패' })
    })
    await expect(page.getByTestId('app-version-policy-error')).toBeVisible()
    await expect(page.getByTestId('app-trust-root-disabled')).toBeVisible()
    await expect(page.getByTestId('app-auto-update-status')).toBeVisible()

    await page.setViewportSize({ width: 600, height: 720 })
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))

    const stack = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('[data-app-update-notice-stack]')!
      const rect = root.getBoundingClientRect()
      const children = Array.from(root.children).map((element) => {
        const childRect = element.getBoundingClientRect()
        return {
          id: element.getAttribute('data-testid'),
          top: childRect.top,
          bottom: childRect.bottom,
          fullyInViewport: childRect.top >= 0 && childRect.bottom <= window.innerHeight,
        }
      })
      return {
        viewport: { width: innerWidth, height: innerHeight },
        rect: rect.toJSON(),
        order: children.map((item) => item.id),
        gaps: children.slice(1).map((item, index) => Number((item.top - children[index].bottom).toFixed(3))),
        children,
      }
    })
    console.log(`[STACK-3] ${JSON.stringify(stack)}`)
    if (!stack.children.every((item) => item.fullyInViewport)) {
      defects.push(`600x720에서 3장 배너가 뷰포트 밖으로 잘림: ${JSON.stringify(stack.children)}`)
    }
    const screenshotPath = path.join(SHOTS, 'sol-r3-600x720-three-banners-45rows.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })
    const screenshotBytes = fs.statSync(screenshotPath).size
    console.log(`[SCREENSHOT] file=${screenshotPath} bytes=${screenshotBytes} backendEntries=${backendCount} renderedRows=${renderedRows}`)

    // 긴 목록을 스크롤해 배너 바로 아래에 실제 행을 놓고, pointer-through 클릭을 실측한다.
    const clickProbe = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('[data-app-update-notice-stack]')!
      const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-testid^="arologis-unassigned-row-"]'))
      const row = rows[Math.min(20, rows.length - 1)]
      const stackRect = root.getBoundingClientRect()
      const targetX = stackRect.left + Math.min(24, Math.max(8, stackRect.width / 4))
      const targetY = Math.min(innerHeight - 24, stackRect.top + 48)
      let scroller: HTMLElement | null = row.parentElement
      while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /(auto|scroll)/.test(getComputedStyle(scroller).overflowY))) {
        scroller = scroller.parentElement
      }
      const before = row.getBoundingClientRect()
      if (scroller) scroller.scrollTop += before.top + before.height / 2 - targetY
      else scrollBy(0, before.top + before.height / 2 - targetY)
      const hit = document.elementFromPoint(targetX, targetY)
      const hitRow = hit?.closest<HTMLElement>('[data-testid^="arologis-unassigned-row-"]') ?? null
      ;(window as typeof window & { __solR3RowClicks?: number }).__solR3RowClicks = 0
      hitRow?.addEventListener('click', () => {
        const state = window as typeof window & { __solR3RowClicks?: number }
        state.__solR3RowClicks = (state.__solR3RowClicks ?? 0) + 1
      }, { once: true })
      return { targetX, targetY, hitTag: hit?.tagName, hitRow: hitRow?.dataset.testid, scrollY, scrollerTop: scroller?.scrollTop ?? null, rowRect: row.getBoundingClientRect().toJSON() }
    })
    await page.mouse.click(clickProbe.targetX, clickProbe.targetY)
    const clickCount = await page.evaluate(() => (window as typeof window & { __solR3RowClicks?: number }).__solR3RowClicks ?? 0)
    console.log(`[SCROLL-CLICK] ${JSON.stringify({ ...clickProbe, clickCount })}`)
    if (!clickProbe.hitRow || clickCount !== 1) defects.push(`스크롤 후 배너 아래 행 클릭 미도달: ${JSON.stringify({ ...clickProbe, clickCount })}`)

    // 실제 저장 모달을 열되 저장하지 않고 취소한다. backdrop 1000이 stack 999보다 위여야 한다.
    await page.evaluate(() => scrollTo(0, 0))
    await page.getByTestId('unassigned-history-save-button').click()
    const dialog = page.getByRole('dialog', { name: '미배차 결과 저장' })
    await expect(dialog).toBeVisible()
    const modalLayer = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('[data-app-update-notice-stack]')!
      const modal = document.querySelector<HTMLElement>('[role="dialog"][aria-label="미배차 결과 저장"]')!
      const backdrop = modal.parentElement as HTMLElement
      const r = root.getBoundingClientRect()
      const x = Math.min(innerWidth - 2, r.left + 8)
      const y = Math.min(innerHeight - 2, r.top + 8)
      const hit = document.elementFromPoint(x, y)
      return {
        stackZ: getComputedStyle(root).zIndex,
        backdropZ: getComputedStyle(backdrop).zIndex,
        hitInsideBackdrop: backdrop.contains(hit),
        hitTag: hit?.tagName,
      }
    })
    console.log(`[MODAL-LAYER] ${JSON.stringify(modalLayer)}`)
    if (!(Number(modalLayer.backdropZ) > Number(modalLayer.stackZ) && modalLayer.hitInsideBackdrop)) defects.push(`모달이 배너보다 위에서 hit되지 않음: ${JSON.stringify(modalLayer)}`)
    await dialog.getByRole('button', { name: '취소' }).click()

    // 실제 native select를 열 수 있는 수동 배차 화면에서 focus/키보드 상호작용을 확인한다.
    await gotoHash(page, '/dispatches/manual')
    await expect(page.getByRole('heading', { name: '수동 배차' })).toBeVisible({ timeout: 15_000 })
    const select = page.locator('select').first()
    await expect(select).toBeVisible()
    await select.focus()
    await page.keyboard.press('Alt+ArrowDown')
    const dropdown = await select.evaluate((element) => ({ active: document.activeElement === element, options: element.options.length, value: element.value }))
    await page.keyboard.press('Escape')
    const tooltipCount = await page.locator('[role="tooltip"]').count()
    console.log(`[DROPDOWN-TOOLTIP] ${JSON.stringify({ ...dropdown, tooltipCount, note: 'native select popup은 DOM 외부 레이어' })}`)
    if (!dropdown.active || dropdown.options < 1) defects.push(`native dropdown 상호작용 미도달: ${JSON.stringify(dropdown)}`)

    await gotoHash(page, '/dispatches/unassigned')
    await expect(page.getByRole('heading', { name: '미배차 리스트' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('app-auto-update-status')).toBeVisible()

    // 배너 버튼에서 Tab을 시작해 stack 밖으로 빠져나오는지 확인한다.
    const firstBannerButton = page.getByTestId('app-trust-root-disabled').getByRole('button')
    await firstBannerButton.focus()
    const tabSequence: Array<{ testId: string | null; text: string }> = []
    for (let index = 0; index < 10; index += 1) {
      tabSequence.push(await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null
        return { testId: active?.getAttribute('data-testid') ?? null, text: active?.textContent?.trim().slice(0, 40) ?? '' }
      }))
      await page.keyboard.press('Tab')
    }
    const focusEscaped = await page.evaluate(() => !document.activeElement?.closest('[data-app-update-notice-stack]'))
    console.log(`[TAB-SEQUENCE] escaped=${focusEscaped} sequence=${JSON.stringify(tabSequence)}`)
    if (!focusEscaped) defects.push(`Tab이 10회 후에도 배너 stack 안에 갇힘: ${JSON.stringify(tabSequence)}`)

    await page.emulateMedia({ media: 'print' })
    const print = await page.locator('[data-print-exclude]').evaluateAll((elements) => elements.map((element) => ({ id: element.getAttribute('data-testid'), display: getComputedStyle(element).display })))
    await page.emulateMedia({ media: 'screen' })
    console.log(`[PRINT] ${JSON.stringify(print)}`)
    if (!print.every((item) => item.display === 'none')) defects.push(`print에서 배너 잔존: ${JSON.stringify(print)}`)

    const wording = await page.locator('body').innerText()
    const wordingMetric = { trustRootUserFacing: (wording.match(/신뢰 루트/g) ?? []).length, securityCertificate: (wording.match(/보안인증서/g) ?? []).length }
    console.log(`[WORDING] ${JSON.stringify(wordingMetric)}`)
    if (wordingMetric.trustRootUserFacing !== 0 || wordingMetric.securityCertificate < 1) defects.push(`사용자 문구 불변식 위반: ${JSON.stringify(wordingMetric)}`)

    const headingY = await page.evaluate(() => {
      const heading = document.querySelector<HTMLElement>('h3')!
      const root = document.querySelector<HTMLElement>('[data-app-update-notice-stack]')!
      const withBanner = heading.getBoundingClientRect().top
      root.style.display = 'none'
      const withoutBanner = heading.getBoundingClientRect().top
      root.style.removeProperty('display')
      return { withBanner, withoutBanner, difference: withoutBanner - withBanner }
    })
    console.log(`[BODY-Y] ${JSON.stringify(headingY)}`)
    if (headingY.difference !== 0) defects.push(`본문 y 좌표 밀림: ${JSON.stringify(headingY)}`)

    console.log(`[DEFECTS] count=${defects.length} items=${JSON.stringify(defects)}`)

    expect(stack.order).toEqual(['app-version-policy-error', 'app-trust-root-disabled', 'app-auto-update-status'])
    expect(stack.gaps).toEqual([12, 12])
    expect(defects, defects.join('\n')).toEqual([])
  } finally {
    await app.close()
    if (path.basename(userDataDir).startsWith('1254-sol-r3-') && path.dirname(userDataDir) === os.tmpdir()) {
      fs.rmSync(userDataDir, { recursive: true, force: true })
    }
  }
})
