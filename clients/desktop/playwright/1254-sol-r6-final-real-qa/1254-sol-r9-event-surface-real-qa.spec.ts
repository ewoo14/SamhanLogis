import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron, expect, test, type Page } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(HERE, '../../../arologis-desktop')
const ELECTRON = path.resolve(APP_DIR, 'node_modules/electron/dist/electron.exe')
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1254-notice-banner-layout/sol-r9-final'))

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}

test('PR #1254 SOL R9 — 좁아진 캡처 리스너의 반대 표면', async () => {
  const startedAt = Date.now()
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '1254-sol-r9-'))
  let blockedWrites = 0
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
      blockedWrites += 1
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { id: 'sol-r9-write-blocked' } }) })
    })

    await page.evaluate(async () => window.arologisAuth.clearToken())
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByTestId('login-id-input').fill('admin')
    await page.getByTestId('login-password-input').fill(resolveQaCredential('QA_AROLOGIS_ADMIN_PASSWORD'))
    await page.getByTestId('login-submit').click()
    await expect(page).toHaveURL(/#\/dispatches\/manual/, { timeout: 15_000 })
    await page.goto(`${page.url().split('#')[0]}#/dispatches/unassigned`)
    await expect(page.getByRole('heading', { name: '미배차 리스트' })).toBeVisible({ timeout: 20_000 })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.send('updater:status', { kind: 'error', message: 'SOL R9 이벤트 표면' }))
    const stack = page.locator('[data-app-update-notice-stack]')
    await expect(page.getByTestId('app-auto-update-status')).toBeVisible()
    await page.setViewportSize({ width: 320, height: 480 })
    await settle(page)

    const baseUrl = page.url().split('#')[0]
    const navHrefs = await page.locator('a:visible').evaluateAll((elements) => elements
      .filter((element) => !element.closest('[data-app-update-notice-stack]'))
      .map((element) => (element as HTMLAnchorElement).getAttribute('href'))
      .filter((href): href is string => Boolean(href)))
    const navActions: Array<Record<string, unknown>> = []
    for (const href of [...new Set(navHrefs)]) {
      const link = page.locator(`a[href="${href}"]`).first()
      await link.click()
      navActions.push({ href, hash: new URL(page.url()).hash })
      await page.goto(`${baseUrl}#/dispatches/unassigned`)
      await expect(page.getByRole('heading', { name: '미배차 리스트' })).toBeVisible({ timeout: 15_000 })
    }

    const dateInput = page.getByTestId('arologis-unassigned-date')
    await dateInput.click()
    const dateFocused = await dateInput.evaluate((element) => document.activeElement === element)
    const csv = page.getByRole('button', { name: 'CSV 다운로드' })
    await csv.evaluate(() => {
      ;(window as typeof window & { __solR9BlobDownloads?: number }).__solR9BlobDownloads = 0
      const original = URL.createObjectURL.bind(URL)
      URL.createObjectURL = ((blob: Blob | MediaSource) => {
        ;(window as typeof window & { __solR9BlobDownloads?: number }).__solR9BlobDownloads = ((window as typeof window & { __solR9BlobDownloads?: number }).__solR9BlobDownloads ?? 0) + 1
        return original(blob)
      }) as typeof URL.createObjectURL
    })
    await csv.click()
    const blobDownloads = await page.evaluate(() => (window as typeof window & { __solR9BlobDownloads?: number }).__solR9BlobDownloads ?? 0)
    const listTab = page.getByTestId('unassigned-history-tab-list')
    await listTab.click()
    const listSelected = await listTab.getAttribute('aria-selected')
    const runTab = page.getByTestId('unassigned-history-tab-run')
    await runTab.click()
    const runSelected = await runTab.getAttribute('aria-selected')
    console.log(`[R9-EXTERNAL-ACTIONS] ${JSON.stringify({ navActions, dateFocused, blobDownloads, listSelected, runSelected })}`)

    const geometry = await stack.evaluate((element) => {
      const root = element as HTMLElement
      const rect = root.getBoundingClientRect()
      root.scrollTop = 0
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height, max: root.scrollHeight - root.clientHeight }
    })
    expect(geometry.max).toBeGreaterThan(0)

    const laneX = geometry.right - 3
    const laneY = geometry.top + geometry.height * 0.8
    const laneTarget = await page.evaluate(({ x, y }) => {
      const hit = document.elementFromPoint(x, y) as HTMLElement | null
      ;(window as typeof window & { __solR9LaneClicks?: number; __solR9LanePointerDowns?: number }).__solR9LaneClicks = 0
      ;(window as typeof window & { __solR9LaneClicks?: number; __solR9LanePointerDowns?: number }).__solR9LanePointerDowns = 0
      hit?.addEventListener('click', () => { (window as typeof window & { __solR9LaneClicks?: number }).__solR9LaneClicks = ((window as typeof window & { __solR9LaneClicks?: number }).__solR9LaneClicks ?? 0) + 1 })
      hit?.addEventListener('pointerdown', () => { (window as typeof window & { __solR9LanePointerDowns?: number }).__solR9LanePointerDowns = ((window as typeof window & { __solR9LanePointerDowns?: number }).__solR9LanePointerDowns ?? 0) + 1 })
      return { tag: hit?.tagName ?? null, testid: hit?.getAttribute('data-testid') ?? hit?.closest('[data-testid]')?.getAttribute('data-testid') ?? null, text: hit?.textContent?.trim().slice(0, 30) ?? null }
    }, { x: laneX, y: laneY })

    const clickBefore = await stack.evaluate((element) => (element as HTMLElement).scrollTop)
    await page.mouse.click(laneX, laneY)
    const clickAfter = await stack.evaluate((element) => (element as HTMLElement).scrollTop)
    const clickCounts = await page.evaluate(() => ({
      click: (window as typeof window & { __solR9LaneClicks?: number }).__solR9LaneClicks ?? 0,
      pointerdown: (window as typeof window & { __solR9LanePointerDowns?: number }).__solR9LanePointerDowns ?? 0,
    }))
    console.log(`[R9-SCROLLBAR-CLICK] ${JSON.stringify({ laneTarget, clickBefore, clickAfter, clickCounts })}`)

    await stack.evaluate((element) => { (element as HTMLElement).scrollTop = 0 })
    await page.mouse.move(laneX, geometry.top + 5)
    await page.mouse.down()
    await page.mouse.move(laneX, geometry.bottom - 5, { steps: 8 })
    const dragMid = await stack.evaluate((element) => (element as HTMLElement).scrollTop)
    await page.mouse.up()
    const dragAfter = await stack.evaluate((element) => (element as HTMLElement).scrollTop)
    const dragCounts = await page.evaluate(() => ({
      click: (window as typeof window & { __solR9LaneClicks?: number }).__solR9LaneClicks ?? 0,
      pointerdown: (window as typeof window & { __solR9LanePointerDowns?: number }).__solR9LanePointerDowns ?? 0,
    }))
    console.log(`[R9-SCROLLBAR-DRAG] ${JSON.stringify({ dragMid, dragAfter, dragCounts })}`)

    const ownButtons = ['보안인증서 설치', '다시 확인', '닫기']
    const ownResults: Array<Record<string, unknown>> = []
    for (const name of ownButtons) {
      const button = stack.getByRole('button', { name, exact: true })
      if (!await button.count()) continue
      await button.evaluate((element) => element.scrollIntoView({ block: 'nearest' }))
      const before = await stack.evaluate((element) => (element as HTMLElement).scrollTop)
      await button.evaluate((element, key) => {
        ;(window as typeof window & { __solR9OwnClicks?: Record<string, number> }).__solR9OwnClicks ??= {}
        element.addEventListener('click', () => {
          const state = (window as typeof window & { __solR9OwnClicks?: Record<string, number> }).__solR9OwnClicks!
          state[key] = (state[key] ?? 0) + 1
        }, { once: true })
      }, name)
      await button.click()
      const after = await stack.evaluate((element) => (element as HTMLElement).scrollTop)
      const received = await page.evaluate((key) => (window as typeof window & { __solR9OwnClicks?: Record<string, number> }).__solR9OwnClicks?.[key] ?? 0, name)
      ownResults.push({ name, before, after, received, presentAfter: await stack.getByRole('button', { name, exact: true }).count() })
      if (name === '닫기') break
    }
    console.log(`[R9-INTERNAL-BUTTONS] ${JSON.stringify(ownResults)}`)

    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.send('updater:status', { kind: 'error', message: 'SOL R9 연속 조작' }))
    await expect(page.getByTestId('app-auto-update-dismiss')).toBeVisible()
    const rapid = page.getByTestId('app-auto-update-dismiss')
    await rapid.evaluate((element) => {
      ;(window as typeof window & { __solR9Rapid?: number }).__solR9Rapid = 0
      element.addEventListener('click', () => { (window as typeof window & { __solR9Rapid?: number }).__solR9Rapid = ((window as typeof window & { __solR9Rapid?: number }).__solR9Rapid ?? 0) + 1 })
    })
    await rapid.dblclick({ delay: 10 })
    const rapidCount = await page.evaluate(() => (window as typeof window & { __solR9Rapid?: number }).__solR9Rapid ?? 0)
    console.log(`[R9-RAPID] received=${rapidCount} bannerAfter=${await page.getByTestId('app-auto-update-status').count()}`)

    const shot = path.join(SHOTS, '320x480-scrollbar-event-surface-real-qa.png')
    await page.screenshot({ path: shot })
    console.log(`[R9-SCREENSHOT] file=${shot} bytes=${fs.statSync(shot).size}`)
    console.log(`[R9-WRITES] blocked=${blockedWrites}`)
    console.log(`[R9-DURATION] ms=${Date.now() - startedAt}`)

    expect(clickAfter, '스크롤바 레인 클릭이 스택을 스크롤해야 한다').toBeGreaterThan(clickBefore)
    expect(clickCounts.click, '스크롤바 클릭이 아래 요소 click으로 전달되면 안 된다').toBe(0)
    expect(dragMid, '스크롤바 드래그 중 스택이 이동해야 한다').toBeGreaterThan(0)
    expect(dragCounts.pointerdown, '스크롤바 드래그가 아래 요소 pointerdown으로 전달되면 안 된다').toBe(0)
    expect(ownResults.every((item) => item.received === 1), '배너 내부 버튼은 각각 한 번 수신해야 한다').toBe(true)
    expect(rapidCount, '첫 클릭으로 사라지는 닫기 버튼은 빠른 연속 조작에서도 한 번만 동작해야 한다').toBe(1)
    expect({ dateFocused, blobDownloads, listSelected, runSelected }).toEqual({ dateFocused: true, blobDownloads: 1, listSelected: 'true', runSelected: 'true' })
  } finally {
    await app.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})
