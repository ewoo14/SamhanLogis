import { _electron as electron, expect, test } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'
import { resolveQaShotsDir } from './support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(HERE, '../../arologis-desktop')
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../docs/qa/1254-notice-banner-layout/screenshots'))
mkdirSync(SHOTS, { recursive: true })

const ELECTRON_BINARY = path.resolve(
  APP_DIR,
  'node_modules/electron/dist',
  process.platform === 'win32' ? 'electron.exe' : 'electron',
)

test('PR #1254 production Electron에서 배너 도달성·모달·print·폭별 상단 조작을 실측한다', async () => {
  const app = await electron.launch({
    executablePath: ELECTRON_BINARY,
    // Ubuntu runner의 Electron setuid sandbox가 준비되지 않아 첫 BrowserWindow가
    // 열리지 않던 것이 60초 timeout의 근원이다. CI Linux에서만 Chromium sandbox를
    // 끄고, Windows/macOS의 기본 sandbox 계약은 그대로 둔다.
    args: [ ...(process.platform === 'linux' ? ['--no-sandbox'] : []), APP_DIR ],
    env: { ...process.env, CERTIFICATE_FIXTURE: '', AROLOGIS_E2E_SKIP_TRUST_PROMPT: '1' },
  })
  try {
    const page = await app.firstWindow()
    await page.evaluate(async () => { await window.arologisAuth.clearToken() })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('login-id-input')).toBeVisible({ timeout: 10000 })
    await page.route('http://localhost:8097/**', async (route) => {
      const url = route.request().url()
      if (url.includes('/auth/admin/login')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accessToken: 'qa-local-only', refreshToken: 'qa-local-refresh', role: 'AROLOGIS_MASTER', expiresAt: '2099-01-01T00:00:00Z', loginId: 'qa', fullName: '적대검증자' }) })
      if (url.includes('/auth/me')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ userId: '00000000-0000-0000-0000-000000010001', role: 'AROLOGIS_MASTER', loginId: 'qa', fullName: '적대검증자' }) })
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: [] }) })
    })
    await page.route('**/auth/admin/login', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ accessToken: 'qa-local-only', refreshToken: 'qa-local-refresh', role: 'AROLOGIS_MASTER', expiresAt: '2099-01-01T00:00:00Z', loginId: 'qa', fullName: '적대검증자' }) }))
    await page.route('**/auth/me', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ userId: '00000000-0000-0000-0000-000000010001', role: 'AROLOGIS_MASTER', loginId: 'qa', fullName: '적대검증자' }) }))
    await page.route('http://localhost:8080/**', async (route) => route.abort())
    await page.route('**/admin/arologis/dispatches/unassigned**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { date: '2026-08-16', totalOutbound: 0, unassignedCount: 0, entries: [] } }) }))
    await page.getByTestId('login-id-input').fill('qa')
    await page.getByTestId('login-password-input').fill('qa-password')
    await page.getByTestId('login-submit').click()
    await expect(page).toHaveURL(/#\/dispatches\/manual/, { timeout: 10000 })
    await page.evaluate(async () => {
      await window.arologisAuth.setToken({ accessToken: 'qa-local-only', refreshToken: 'qa-local-refresh', userId: '00000000-0000-0000-0000-000000010001', role: 'AROLOGIS_MASTER', loginId: 'qa', fullName: '적대검증자', expiresAt: '2099-01-01T00:00:00Z' })
    })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByText('아로로지스')).toBeVisible({ timeout: 10000 })
    await page.evaluate(() => { window.location.hash = '#/dispatches/unassigned' })
    await expect(page.getByTestId('arologis-unassigned-date')).toBeVisible({ timeout: 15000 })
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('updater:status', { kind: 'error', message: '업데이트 검증 상태 확인 실패' })
    })
    await expect(page.getByTestId('app-version-policy-error')).toBeVisible()
    await expect(page.getByTestId('app-auto-update-status')).toBeVisible()

    const metrics: Array<Record<string, unknown>> = []
    for (const height of [720, 800, 900, 1080]) {
      for (const width of [600, 768, 1024, 1280, 1440, 1920]) {
        await page.setViewportSize({ width, height })
        await page.emulateMedia({ media: 'screen' })
        const input = page.getByTestId('arologis-unassigned-date')
        // Electron의 native date picker는 headless BrowserWindow를 닫을 수 있어 실제 입력 포커스 도달을 단정한다.
        await input.focus()
        const measured = await page.evaluate((width) => {
        const date = document.querySelector<HTMLInputElement>('[data-testid="arologis-unassigned-date"]')!
        const notice = document.querySelector<HTMLElement>('[data-testid="app-auto-update-status"]')
        const stack = document.querySelector<HTMLElement>('[data-app-update-notice-stack]')
        const h1 = document.querySelector<HTMLElement>('h3')
        const actions = notice?.querySelector<HTMLElement>('[class*="actions"]')
        const button = actions?.querySelector<HTMLElement>('button')
        const interactiveOverlap = Array.from(document.querySelectorAll<HTMLElement>('a, button, input'))
          .filter((element) => !element.closest('[data-app-update-notice-stack]'))
          .map((element) => {
            const rect = element.getBoundingClientRect()
            const area = stack
              ? Math.max(0, Math.min(stack.getBoundingClientRect().right, rect.right) - Math.max(stack.getBoundingClientRect().left, rect.left))
                * Math.max(0, Math.min(stack.getBoundingClientRect().bottom, rect.bottom) - Math.max(stack.getBoundingClientRect().top, rect.top))
              : 0
            return { label: element.textContent?.trim() || element.getAttribute('data-testid') || element.tagName, area }
          })
          .filter((item) => item.area > 0)
        let hit: string | null = null
        if (actions && button) {
          const ar = actions.getBoundingClientRect(); const br = button.getBoundingClientRect()
          hit = document.elementFromPoint(Math.min(ar.right - 1, br.right + 24), ar.top + ar.height / 2)?.className || null
        }
        return {
          width, active: document.activeElement?.getAttribute('data-testid'),
          hit, notice: notice?.getBoundingClientRect().toJSON(), stack: stack?.getBoundingClientRect().toJSON(),
          h1: h1?.getBoundingClientRect().toJSON(),
          interactiveOverlap,
          interactiveOverlapTotal: interactiveOverlap.reduce((sum, item) => sum + item.area, 0),
          order: stack ? Array.from(stack.children).map((el) => el.getAttribute('data-testid')) : [],
          gaps: stack ? Array.from(stack.children).slice(1).map((el, index) => {
            const previous = stack.children[index].getBoundingClientRect()
            return Number((el.getBoundingClientRect().top - previous.bottom).toFixed(3))
          }) : [],
        }
        }, width)
        await page.screenshot({ path: path.join(SHOTS, `${width}x${height}.png`), fullPage: false })
        await page.emulateMedia({ media: 'print' })
        const printDisplay = await page.locator('.no-print, [data-print-exclude]').evaluateAll((els) => els.map((el) => ({ id: el.getAttribute('data-testid'), display: getComputedStyle(el).display, visibility: getComputedStyle(el).visibility })))
        const result = { ...measured, height, printDisplay }
        metrics.push(result)
        console.log(`[GREEN] ${JSON.stringify(result)}`)
        expect(result.active).toBe('arologis-unassigned-date')
        console.log(`[GREEN-OVERLAP] width=${width} height=${height} total=${result.interactiveOverlapTotal} items=${JSON.stringify(result.interactiveOverlap)}`)
        expect(result.interactiveOverlapTotal).toBe(0)
        if (result.hit !== null) expect(String(result.hit)).not.toContain('actions')
        expect(result.order).toEqual(['app-version-policy-error', 'app-trust-root-disabled', 'app-auto-update-status'])
        expect(result.gaps).toEqual([12, 12])
        expect(result.printDisplay.length).toBeGreaterThan(0)
        expect(result.printDisplay.every((item) => item.display === 'none')).toBe(true)
      }
    }

    const at1024 = metrics.find((item) => item.width === 1024 && item.height === 900)
    if (at1024?.stack && at1024.h1) {
      const stack = at1024.stack as { top: number }
      const h1 = at1024.h1 as { top: number; bottom: number }
      expect(stack.top).toBeGreaterThanOrEqual(h1.bottom)
    }

    await page.evaluate(() => {
      const modal = document.createElement('section')
      modal.dataset.testid = 'app-version-blocking-modal'
      modal.style.position = 'relative'; modal.style.zIndex = '1000'; modal.textContent = '긴급 업데이트'
      document.body.appendChild(modal)
    })
    const stackZ = await page.locator('[data-app-update-notice-stack]').evaluate((el) => getComputedStyle(el).zIndex)
    const modalZ = await page.getByTestId('app-version-blocking-modal').evaluate((el) => getComputedStyle(el).zIndex)
    console.log(`[GREEN-②] modal.z-index=${modalZ} stack.z-index=${stackZ}`)
    expect(Number(modalZ)).toBeGreaterThan(Number(stackZ))

    await page.emulateMedia({ media: 'screen' })
    await page.setViewportSize({ width: 1024, height: 900 })
    const bodyY = await page.evaluate(() => {
      const heading = document.querySelector<HTMLElement>('h3')!
      const stack = document.querySelector<HTMLElement>('[data-app-update-notice-stack]')!
      const withBanner = heading.getBoundingClientRect().top
      stack.style.display = 'none'
      const withoutBanner = heading.getBoundingClientRect().top
      stack.style.removeProperty('display')
      return { withBanner, withoutBanner, difference: withoutBanner - withBanner }
    })
    console.log(`[GREEN-INVARIANT] body-first-y=${JSON.stringify(bodyY)}`)
    expect(bodyY.difference).toBe(0)

    const bannerCountMatrix: Array<Record<string, unknown>> = []
    for (const height of [720, 800, 900, 1080]) {
      for (const width of [600, 768, 1024, 1280, 1440, 1920]) {
        await page.setViewportSize({ width, height })
        const counts = await page.locator('[data-app-update-notice-stack]').evaluate((element) => {
          const stack = element as HTMLElement
          const children = Array.from(stack.children) as HTMLElement[]
          return [1, 2, 3].map((count) => {
            const previousDisplay = children.map((child) => child.style.display)
            children.forEach((child, index) => { child.style.display = index < count ? '' : 'none' })
            const reachable = children.slice(0, count).map((child) => {
              stack.scrollTop = child.offsetTop
              const rect = child.getBoundingClientRect()
              return rect.top >= 0 && rect.bottom <= innerHeight
            })
            const result = {
              count,
              overflowY: getComputedStyle(stack).overflowY,
              order: children.slice(0, count).map((child) => child.dataset.testid),
              gaps: children.slice(0, count).slice(1).map((child, index) => Number((child.getBoundingClientRect().top - children[index].getBoundingClientRect().bottom).toFixed(3))),
              reachable,
            }
            children.forEach((child, index) => { child.style.display = previousDisplay[index] })
            stack.scrollTop = 0
            return result
          })
        })
        bannerCountMatrix.push({ width, height, counts })
        expect(counts.every((item) => item.reachable.every(Boolean))).toBe(true)
        expect(counts.map((item) => item.gaps)).toEqual([[], [12], [12, 12]])
      }
    }
    console.log(`[BANNER-COUNT-MATRIX] cases=${bannerCountMatrix.length} counts=1,2,3 reachable=true`)

    await page.emulateMedia({ media: 'screen' })
    await page.setViewportSize({ width: 600, height: 720 })
    const thirdBanner = page.getByTestId('app-auto-update-status')
    const thirdBeforeScroll = await thirdBanner.boundingBox()
    const stackLocator = page.locator('[data-app-update-notice-stack]')
    await stackLocator.evaluate((element) => { (element as HTMLElement).scrollTop = 0 })
    const stackBox = await stackLocator.boundingBox()
    if (!stackBox) throw new Error('업데이트 알림 stack bounding box가 없습니다.')
    await page.mouse.move(stackBox.x + stackBox.width / 2, stackBox.y + stackBox.height / 2)
    await page.mouse.wheel(0, 240)
    const wheelScrollTop = await stackLocator.evaluate((element) => (element as HTMLElement).scrollTop)
    console.log(`[STACK-WHEEL] ${JSON.stringify({ wheelScrollTop, overflowY: await stackLocator.evaluate((element) => getComputedStyle(element).overflowY) })}`)
    expect(wheelScrollTop).toBeGreaterThan(0)
    const scrollState = await page.locator('[data-app-update-notice-stack]').evaluate((element) => {
      const stack = element as HTMLElement
      stack.focus()
      stack.scrollTop = stack.scrollHeight
      const card = stack.lastElementChild as HTMLElement
      const rect = card.getBoundingClientRect()
      return {
        scrollTop: stack.scrollTop,
        scrollHeight: stack.scrollHeight,
        clientHeight: stack.clientHeight,
        third: { top: rect.top, bottom: rect.bottom, fullyInViewport: rect.top >= 0 && rect.bottom <= innerHeight },
      }
    })
    console.log(`[STACK-SCROLL] ${JSON.stringify({ viewport: { width: 600, height: 720 }, thirdBeforeScroll, ...scrollState })}`)
    expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight)
    expect(scrollState.third.fullyInViewport).toBe(true)
    const thirdButton = thirdBanner.getByRole('button').first()
    await expect(thirdButton).toBeVisible()
    let thirdButtonClicks = 0
    await thirdButton.evaluate((button) => button.addEventListener('click', () => { (window as typeof window & { __thirdButtonClicks?: number }).__thirdButtonClicks = ((window as typeof window & { __thirdButtonClicks?: number }).__thirdButtonClicks ?? 0) + 1 }, { once: true }))
    await thirdButton.click()
    thirdButtonClicks = await page.evaluate(() => (window as typeof window & { __thirdButtonClicks?: number }).__thirdButtonClicks ?? 0)
    console.log(`[THIRD-BUTTON-CLICK] ${JSON.stringify({ thirdButtonClicks, visible: await thirdButton.isVisible() })}`)
    expect(thirdButtonClicks).toBe(1)
  } finally {
    await app.close()
  }
})
