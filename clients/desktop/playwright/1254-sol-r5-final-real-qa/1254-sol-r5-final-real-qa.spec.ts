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
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1254-notice-banner-layout/sol-r5-final'))
const ELECTRON_BINARY = path.resolve(APP_DIR, 'node_modules/electron/dist/electron.exe')

async function gotoHash(page: import('@playwright/test').Page, route: string): Promise<void> {
  const target = await page.evaluate((nextRoute) => {
    const url = new URL(window.location.href)
    url.hash = nextRoute
    return url.href
  }, route)
  await page.goto(target)
}

test('PR #1254 SOL R5 최종 재수렴 — 실 사용자 도달 표면', async () => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '1254-sol-r5-final-'))
  const defects: string[] = []
  const launchArgs = [`--user-data-dir=${userDataDir}`, APP_DIR]
  console.log(`[WINDOWS-LAUNCH-ARGS] ${JSON.stringify(launchArgs)}`)
  const app = await electron.launch({
    executablePath: ELECTRON_BINARY,
    args: launchArgs,
    env: { ...process.env, CERTIFICATE_FIXTURE: '', AROLOGIS_E2E_SKIP_TRUST_PROMPT: '1' },
  })

  try {
    const page = await app.firstWindow()
    await page.route('http://localhost:8080/**', (route) => route.abort('connectionfailed'))
    await page.route('http://localhost:8097/**', async (route) => {
      if (route.request().method() === 'POST' && route.request().url().includes('/admin/arologis/dispatches/history')) {
        console.log(`[WRITE-BLOCKED] ${route.request().method()} ${route.request().url()}`)
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { id: 'local-write-blocked', savedAt: '2026-08-16T00:00:00Z' } }) })
      }
      return route.continue()
    })
    await page.evaluate(async () => { await window.arologisAuth.clearToken() })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('login-id-input')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('login-id-input').fill('admin')
    await page.getByTestId('login-password-input').fill(resolveQaCredential('QA_AROLOGIS_ADMIN_PASSWORD'))
    await page.getByTestId('login-submit').click()
    await expect(page).toHaveURL(/#\/dispatches\/manual/, { timeout: 15_000 })

    await gotoHash(page, '/dispatches/unassigned')
    await expect(page.getByRole('heading', { name: '미배차 리스트' })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('arologis-unassigned-date')).toBeVisible()
    // 최신 자동저장 복원 GET이 끝난 뒤 날짜를 바꿔, 아래 배너 표면 측정은 안정된 45행으로 수행한다.
    await page.waitForTimeout(1_500)
    const responsePromise = page.waitForResponse((response) => response.url().includes(`/admin/arologis/dispatches/unassigned?date=${DATE}`))
    await page.getByTestId('arologis-unassigned-date').fill(DATE)
    const response = await responsePromise
    const responseBody = await response.json()
    const backendCount = Number(responseBody.data.entries.length)
    const rows = page.locator('[data-testid^="arologis-unassigned-row-"]')
    await expect(rows).toHaveCount(backendCount, { timeout: 15_000 })
    const renderedRows = await rows.count()
    console.log(`[REAL-DATA] date=${DATE} response=${response.status()} backendEntries=${backendCount} renderedRows=${renderedRows}`)

    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('updater:status', { kind: 'error', message: '업데이트 검증 상태 확인 실패' })
    })
    for (const id of ['app-version-policy-error', 'app-trust-root-disabled', 'app-auto-update-status']) {
      await expect(page.getByTestId(id)).toBeVisible()
    }

    const matrix: Array<Record<string, unknown>> = []
    for (const height of [480, 600, 720, 900]) {
      for (const width of [320, 480, 600, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height })
        await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
        const item = await page.locator('[data-app-update-notice-stack]').evaluate((element) => {
          const stack = element as HTMLElement
          const children = Array.from(stack.children) as HTMLElement[]
          const outside = Array.from(document.querySelectorAll<HTMLElement>('a,button,input,select'))
            .filter((candidate) => !candidate.closest('[data-app-update-notice-stack]'))
          const stackRect = stack.getBoundingClientRect()
          const overlapArea = outside.reduce((sum, candidate) => {
            const rect = candidate.getBoundingClientRect()
            return sum + Math.max(0, Math.min(stackRect.right, rect.right) - Math.max(stackRect.left, rect.left))
              * Math.max(0, Math.min(stackRect.bottom, rect.bottom) - Math.max(stackRect.top, rect.top))
          }, 0)
          const counts = [1, 2, 3].map((count) => {
            const previous = children.map((child) => child.style.display)
            children.forEach((child, index) => { child.style.display = index < count ? '' : 'none' })
            stack.scrollTop = 0
            const visibleRanges = children.slice(0, count).map((child) => {
              const start = child.offsetTop
              const end = child.offsetTop + child.offsetHeight
              const maxScroll = Math.max(0, stack.scrollHeight - stack.clientHeight)
              return {
                id: child.dataset.testid,
                topReachable: start <= maxScroll + stack.clientHeight,
                bottomReachable: end - stack.clientHeight <= maxScroll,
                buttons: Array.from(child.querySelectorAll<HTMLElement>('button,a')).map((button) => ({
                  text: button.textContent?.trim(),
                  offsetTop: button.offsetTop,
                })),
              }
            })
            const result = {
              count,
              clientHeight: stack.clientHeight,
              scrollHeight: stack.scrollHeight,
              visibleRanges,
              order: children.slice(0, count).map((child) => child.dataset.testid),
              gaps: children.slice(0, count).slice(1).map((child, index) => Number((child.getBoundingClientRect().top - children[index].getBoundingClientRect().bottom).toFixed(3))),
            }
            children.forEach((child, index) => { child.style.display = previous[index] })
            stack.scrollTop = 0
            return result
          })
          return {
            width: innerWidth,
            height: innerHeight,
            top: stackRect.top,
            bottom: stackRect.bottom,
            clientHeight: stack.clientHeight,
            scrollHeight: stack.scrollHeight,
            overflowY: getComputedStyle(stack).overflowY,
            overlapArea,
            counts,
          }
        })
        matrix.push(item)
        const reachable = item.counts.every((count) => count.visibleRanges.every((range) => range.topReachable && range.bottomReachable))
        console.log(`[MATRIX] ${JSON.stringify({ width, height, top: item.top, bottom: item.bottom, clientHeight: item.clientHeight, scrollHeight: item.scrollHeight, overlapArea: item.overlapArea, reachable })}`)
        if (!reachable || item.clientHeight <= 0) defects.push(`${width}x${height}에서 배너 내용 순차 도달 불가: ${JSON.stringify(item)}`)
        if (item.overlapArea !== 0) defects.push(`${width}x${height} 조작 요소 교차 면적 ${item.overlapArea}`)
      }
    }
    console.log(`[MATRIX-SUMMARY] cases=${matrix.length} bannerCounts=1,2,3`)

    await page.setViewportSize({ width: 600, height: 720 })
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    const stack = page.locator('[data-app-update-notice-stack]')
    const stackState = await stack.evaluate((element) => {
      const root = element as HTMLElement
      return {
        order: Array.from(root.children).map((child) => child.getAttribute('data-testid')),
        gaps: Array.from(root.children).slice(1).map((child, index) => Number((child.getBoundingClientRect().top - root.children[index].getBoundingClientRect().bottom).toFixed(3))),
        top: root.getBoundingClientRect().top,
        bottom: root.getBoundingClientRect().bottom,
        clientHeight: root.clientHeight,
        scrollHeight: root.scrollHeight,
      }
    })
    console.log(`[600x720-STACK] ${JSON.stringify(stackState)}`)

    const buttons = stack.locator('button')
    const buttonReach: Array<Record<string, unknown>> = []
    for (let index = 0; index < await buttons.count(); index += 1) {
      const button = buttons.nth(index)
      await button.evaluate((element) => element.scrollIntoView({ block: 'nearest' }))
      const metric = await button.evaluate((element) => {
        const root = element.closest<HTMLElement>('[data-app-update-notice-stack]')!
        const rect = element.getBoundingClientRect()
        const stackRect = root.getBoundingClientRect()
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        return {
          text: element.textContent?.trim(),
          top: rect.top,
          bottom: rect.bottom,
          withinStack: rect.top >= stackRect.top && rect.bottom <= stackRect.bottom,
          hitSelf: hit === element || element.contains(hit),
          scrollTop: root.scrollTop,
        }
      })
      buttonReach.push(metric)
      if (!metric.withinStack || !metric.hitSelf) defects.push(`600x720 배너 버튼 도달 실패: ${JSON.stringify(metric)}`)
    }
    console.log(`[600x720-BUTTON-REACH] ${JSON.stringify(buttonReach)}`)

    const dismiss = page.getByTestId('app-auto-update-dismiss')
    await dismiss.scrollIntoViewIfNeeded()
    await dismiss.click()
    console.log(`[600x720-CLICK] target=닫기 visibleBefore=true remaining=${await page.getByTestId('app-auto-update-status').count()}`)
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('updater:status', { kind: 'checking' })
    })
    await expect(page.getByTestId('app-auto-update-status')).toBeVisible()
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('updater:status', { kind: 'error', message: '업데이트 검증 상태 확인 실패' })
    })
    await expect(page.getByTestId('app-auto-update-status')).toBeVisible()

    const wheelProbe = await stack.evaluate((element) => {
      const root = element as HTMLElement
      root.scrollTop = root.scrollHeight
      const rect = root.getBoundingClientRect()
      const x = rect.left + Math.max(8, rect.width / 2)
      const y = rect.top + Math.max(8, Math.min(rect.height - 8, rect.height / 2))
      const under = document.elementFromPoint(x, y) as HTMLElement | null
      let scroller: HTMLElement | null = under
      while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /(auto|scroll)/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement
      if (!scroller && document.scrollingElement instanceof HTMLElement) scroller = document.scrollingElement
      if (scroller) scroller.scrollTop = Math.min(100, Math.max(0, scroller.scrollHeight - scroller.clientHeight - 100))
      return { x, y, stackBefore: root.scrollTop, bodyBefore: scroller?.scrollTop ?? null, scrollerTag: scroller?.tagName ?? null }
    })
    await page.mouse.move(wheelProbe.x, wheelProbe.y)
    await page.mouse.wheel(0, 240)
    const wheelAfter = await stack.evaluate((element) => {
      const root = element as HTMLElement
      const rect = root.getBoundingClientRect()
      const under = document.elementFromPoint(rect.left + Math.max(8, rect.width / 2), rect.top + Math.max(8, Math.min(rect.height - 8, rect.height / 2))) as HTMLElement | null
      let scroller: HTMLElement | null = under
      while (scroller && !(scroller.scrollHeight > scroller.clientHeight && /(auto|scroll)/.test(getComputedStyle(scroller).overflowY))) scroller = scroller.parentElement
      if (!scroller && document.scrollingElement instanceof HTMLElement) scroller = document.scrollingElement
      return { stackAfter: root.scrollTop, bodyAfter: scroller?.scrollTop ?? null }
    })
    console.log(`[WHEEL-BOUNDARY] ${JSON.stringify({ ...wheelProbe, ...wheelAfter })}`)

    const scrollbarProbe = await stack.evaluate((element) => {
      const root = element as HTMLElement
      root.scrollTop = 0
      const rect = root.getBoundingClientRect()
      const x = rect.right - 3
      const y = rect.top + rect.height * 0.8
      const under = document.elementFromPoint(x, y) as HTMLElement | null
      ;(window as typeof window & { __scrollbarUnderlyingClicks?: number }).__scrollbarUnderlyingClicks = 0
      under?.addEventListener('click', () => {
        const state = window as typeof window & { __scrollbarUnderlyingClicks?: number }
        state.__scrollbarUnderlyingClicks = (state.__scrollbarUnderlyingClicks ?? 0) + 1
      }, { once: true })
      return { x, y, before: root.scrollTop, hitTag: under?.tagName ?? null, hitTestId: under?.closest<HTMLElement>('[data-testid]')?.dataset.testid ?? null }
    })
    await page.mouse.click(scrollbarProbe.x, scrollbarProbe.y)
    const scrollbarAfter = await stack.evaluate((element) => ({
      after: (element as HTMLElement).scrollTop,
      underlyingClicks: (window as typeof window & { __scrollbarUnderlyingClicks?: number }).__scrollbarUnderlyingClicks ?? 0,
    }))
    console.log(`[SCROLLBAR-CLICK] ${JSON.stringify({ ...scrollbarProbe, ...scrollbarAfter })}`)

    await stack.focus()
    await page.keyboard.press('End')
    const tabSequence: Array<Record<string, unknown>> = []
    for (let index = 0; index < 10; index += 1) {
      tabSequence.push(await page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null
        return { tag: active?.tagName, text: active?.textContent?.trim().slice(0, 30), inside: Boolean(active?.closest('[data-app-update-notice-stack]')) }
      }))
      await page.keyboard.press('Tab')
    }
    const focusEscaped = tabSequence.some((item) => item.inside === false)
    console.log(`[TAB] escaped=${focusEscaped} sequence=${JSON.stringify(tabSequence)}`)
    if (!focusEscaped) defects.push(`Tab 포커스가 stack에서 탈출하지 못함: ${JSON.stringify(tabSequence)}`)

    await page.getByTestId('unassigned-history-save-button').click()
    const dialog = page.getByRole('dialog', { name: '미배차 결과 저장' })
    await expect(dialog).toBeVisible()
    const modal = await page.evaluate(() => {
      const root = document.querySelector<HTMLElement>('[data-app-update-notice-stack]')!
      const dialog = document.querySelector<HTMLElement>('[role="dialog"][aria-label="미배차 결과 저장"]')!
      const backdrop = dialog.parentElement as HTMLElement
      const r = root.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + 8, Math.min(innerHeight - 2, r.top + 8))
      return { stackZ: getComputedStyle(root).zIndex, backdropZ: getComputedStyle(backdrop).zIndex, backdropHit: backdrop.contains(hit) }
    })
    console.log(`[MODAL] ${JSON.stringify(modal)}`)
    if (!(Number(modal.backdropZ) > Number(modal.stackZ) && modal.backdropHit)) defects.push(`모달 레이어가 stack을 제압하지 못함: ${JSON.stringify(modal)}`)
    await dialog.getByRole('button', { name: '취소' }).click()

    await gotoHash(page, '/dispatches/manual')
    await expect(page.getByRole('heading', { name: '수동 배차' })).toBeVisible({ timeout: 15_000 })
    const select = page.locator('select').first()
    await select.focus()
    await page.keyboard.press('Alt+ArrowDown')
    const dropdown = await select.evaluate((element) => ({ active: document.activeElement === element, options: element.options.length }))
    await page.keyboard.press('Escape')
    console.log(`[DROPDOWN] ${JSON.stringify(dropdown)}`)
    if (!dropdown.active || dropdown.options < 1) defects.push(`드롭다운 도달 실패: ${JSON.stringify(dropdown)}`)

    await gotoHash(page, '/dispatches/unassigned')
    await expect(page.getByRole('heading', { name: '미배차 리스트' })).toBeVisible({ timeout: 15_000 })
    await page.emulateMedia({ media: 'print' })
    const print = await page.locator('[data-print-exclude]').evaluateAll((elements) => elements.map((element) => ({ id: element.getAttribute('data-testid'), display: getComputedStyle(element).display })))
    await page.emulateMedia({ media: 'screen' })
    console.log(`[PRINT] ${JSON.stringify(print)}`)
    if (!print.every((item) => item.display === 'none')) defects.push(`인쇄에 stack/배너가 남음: ${JSON.stringify(print)}`)

    const wording = await page.locator('body').innerText()
    const wordingMetric = { trustRoot: (wording.match(/신뢰 루트/g) ?? []).length, securityCertificate: (wording.match(/보안인증서/g) ?? []).length }
    console.log(`[WORDING] ${JSON.stringify(wordingMetric)}`)
    if (wordingMetric.trustRoot !== 0 || wordingMetric.securityCertificate < 1) defects.push(`사용자 문구 위반: ${JSON.stringify(wordingMetric)}`)

    const bodyY = await page.evaluate(() => {
      const heading = document.querySelector<HTMLElement>('h3')!
      const root = document.querySelector<HTMLElement>('[data-app-update-notice-stack]')!
      const withBanner = heading.getBoundingClientRect().top
      root.style.display = 'none'
      const withoutBanner = heading.getBoundingClientRect().top
      root.style.removeProperty('display')
      return { withBanner, withoutBanner, difference: withoutBanner - withBanner }
    })
    console.log(`[BODY-Y] ${JSON.stringify(bodyY)}`)
    if (bodyY.difference !== 0) defects.push(`본문 y 좌표 이동: ${JSON.stringify(bodyY)}`)

    const screenshotPath = path.join(SHOTS, '600x720-three-banners-final-real-qa.png')
    await page.waitForTimeout(1_500)
    const alternateResponsePromise = page.waitForResponse((res) => res.url().includes('/admin/arologis/dispatches/unassigned?date=2026-08-07'))
    await page.getByTestId('arologis-unassigned-date').fill('2026-08-07')
    await alternateResponsePromise
    const captureResponsePromise = page.waitForResponse((res) => res.url().includes(`/admin/arologis/dispatches/unassigned?date=${DATE}`))
    await page.getByTestId('arologis-unassigned-date').fill(DATE)
    const captureResponse = await captureResponsePromise
    await expect(page.locator('[data-testid^="arologis-unassigned-row-"]')).toHaveCount(backendCount, { timeout: 15_000 })
    await page.setViewportSize({ width: 600, height: 720 })
    await stack.evaluate((element) => { (element as HTMLElement).scrollTop = (element as HTMLElement).scrollHeight })
    await page.screenshot({ path: screenshotPath, fullPage: false })
    console.log(`[SCREENSHOT] file=${screenshotPath} bytes=${fs.statSync(screenshotPath).size} selectedDate=${await page.getByTestId('arologis-unassigned-date').inputValue()} response=${captureResponse.status()} backendEntries=${backendCount} renderedRows=${await page.locator('[data-testid^="arologis-unassigned-row-"]').count()} bannerDomCount=${await stack.locator(':scope > *').count()}`)
    const zeroHeightPath = path.join(SHOTS, '320x480-zero-height-stack-final-real-qa.png')
    await page.setViewportSize({ width: 320, height: 480 })
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    await page.screenshot({ path: zeroHeightPath, fullPage: false })
    console.log(`[SCREENSHOT-DEFECT] file=${zeroHeightPath} bytes=${fs.statSync(zeroHeightPath).size} stack=${JSON.stringify(await stack.evaluate((element) => ({ top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom, clientHeight: (element as HTMLElement).clientHeight, scrollHeight: (element as HTMLElement).scrollHeight })))}`)
    console.log(`[DEFECTS] count=${defects.length} items=${JSON.stringify(defects)}`)

    expect(stackState.order).toEqual(['app-version-policy-error', 'app-trust-root-disabled', 'app-auto-update-status'])
    expect(stackState.gaps).toEqual([12, 12])
    expect(defects, defects.join('\n')).toEqual([])
  } finally {
    await app.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})
