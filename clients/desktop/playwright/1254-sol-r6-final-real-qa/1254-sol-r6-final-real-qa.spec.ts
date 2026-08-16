import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron, expect, test, type Locator, type Page } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_DIR = path.resolve(HERE, '../../../arologis-desktop')
const ELECTRON = path.resolve(APP_DIR, 'node_modules/electron/dist/electron.exe')
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1254-notice-banner-layout/sol-r6-final'))
const IDS = ['app-version-policy-error', 'app-trust-root-disabled', 'app-auto-update-status']

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}

async function gotoHash(page: Page, route: string): Promise<void> {
  const target = await page.evaluate((hash) => {
    const url = new URL(location.href)
    url.hash = hash
    return url.href
  }, route)
  await page.goto(target)
}

async function buttonReach(button: Locator): Promise<Record<string, unknown>> {
  await button.evaluate((element) => element.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
  return button.evaluate((element) => {
    const stack = element.closest<HTMLElement>('[data-app-update-notice-stack]')!
    const rect = element.getBoundingClientRect()
    const stackRect = stack.getBoundingClientRect()
    const visibleBottom = stackRect.top + stack.clientHeight
    const x = Math.max(stackRect.left + 1, Math.min(stackRect.right - 1, rect.left + rect.width / 2))
    const y = Math.max(stackRect.top + 1, Math.min(visibleBottom - 1, rect.top + rect.height / 2))
    const hit = document.elementFromPoint(x, y)
    return {
      text: element.textContent?.trim(),
      top: rect.top,
      bottom: rect.bottom,
      stackTop: stackRect.top,
      visibleBottom,
      fullyVisible: rect.top >= stackRect.top && rect.bottom <= visibleBottom,
      hitSelf: hit === element || element.contains(hit),
      hitTag: hit?.tagName ?? null,
      scrollTop: stack.scrollTop,
    }
  })
}

test('PR #1254 SOL R6 최종 재수렴 — 배너 스택 사용자 도달 표면', async () => {
  const startedAt = Date.now()
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), '1254-sol-r6-final-'))
  const defects: string[] = []
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
      const request = route.request()
      const method = request.method()
      if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS' || /\/auth\/(?:admin\/)?login(?:\?|$)/.test(request.url())) return route.continue()
      blockedWrites += 1
      console.log(`[WRITE-BLOCKED] ${method} ${request.url()}`)
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { id: 'sol-r6-write-blocked', savedAt: '2026-08-16T00:00:00Z' } }) })
    })

    await page.evaluate(async () => window.arologisAuth.clearToken())
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('login-id-input')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('login-id-input').fill('admin')
    await page.getByTestId('login-password-input').fill(resolveQaCredential('QA_AROLOGIS_ADMIN_PASSWORD'))
    await page.getByTestId('login-submit').click()
    await expect(page).toHaveURL(/#\/dispatches\/manual/, { timeout: 15_000 })

    await gotoHash(page, '/dispatches/unassigned')
    await expect(page.getByRole('heading', { name: '미배차 리스트' })).toBeVisible({ timeout: 20_000 })
    await expect(page.getByTestId('arologis-unassigned-date')).toBeVisible()
    console.log(`[ROUTE-PROOF] hash=${new URL(page.url()).hash} heading=미배차 리스트`)
    await page.waitForTimeout(1_200)
    const denseResponsePromise = page.waitForResponse((response) => response.url().includes('/admin/arologis/dispatches/unassigned?date=2026-08-08'))
    await page.getByTestId('arologis-unassigned-date').fill('2026-08-08')
    const denseResponse = await denseResponsePromise
    const denseBody = await denseResponse.json()
    const backendRows = Number(denseBody.data.entries.length)
    await expect(page.locator('[data-testid^="arologis-unassigned-row-"]')).toHaveCount(backendRows, { timeout: 15_000 })
    console.log(`[REAL-DATA] response=${denseResponse.status()} backendRows=${backendRows} renderedRows=${await page.locator('[data-testid^="arologis-unassigned-row-"]').count()}`)

    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.send('updater:status', { kind: 'error', message: '업데이트 검증 상태 확인 실패' })
    })
    for (const id of IDS) await expect(page.getByTestId(id)).toBeVisible()
    const stack = page.locator('[data-app-update-notice-stack]')

    const yMetric = await page.evaluate(() => {
      const heading = document.querySelector<HTMLElement>('h3')!
      const stack = document.querySelector<HTMLElement>('[data-app-update-notice-stack]')!
      const withBanner = heading.getBoundingClientRect().top
      stack.style.display = 'none'
      const withoutBanner = heading.getBoundingClientRect().top
      stack.style.removeProperty('display')
      return { withBanner, withoutBanner, difference: withoutBanner - withBanner }
    })
    console.log(`[BODY-Y] ${JSON.stringify(yMetric)}`)
    if (yMetric.difference !== 0) defects.push(`본문 y 좌표 이동 ${JSON.stringify(yMetric)}`)

    const viewports = [
      { width: 320, height: 480 },
      { width: 480, height: 480 },
      { width: 320, height: 600 },
      { width: 600, height: 720 },
    ]
    let matrixCases = 0
    for (const viewport of viewports) {
      await page.setViewportSize(viewport)
      await settle(page)
      for (const count of [1, 2, 3]) {
        await stack.evaluate((element, visibleCount) => {
          Array.from(element.children).forEach((child, index) => {
            ;(child as HTMLElement).style.display = index < visibleCount ? '' : 'none'
          })
          ;(element as HTMLElement).scrollTop = 0
        }, count)
        await settle(page)
        matrixCases += 1
        const metric = await stack.evaluate((element) => {
          const root = element as HTMLElement
          const rect = root.getBoundingClientRect()
          const external = Array.from(document.querySelectorAll<HTMLElement>('a,button,input,select'))
            .filter((candidate) => !candidate.closest('[data-app-update-notice-stack]'))
            .map((candidate) => ({ candidate, rect: candidate.getBoundingClientRect() }))
            .filter(({ rect: candidate }) => candidate.width > 0 && candidate.height > 0)
            .map(({ candidate, rect: candidateRect }) => {
              const left = Math.max(rect.left, candidateRect.left)
              const right = Math.min(rect.right, candidateRect.right)
              const top = Math.max(rect.top, candidateRect.top)
              const bottom = Math.min(rect.bottom, candidateRect.bottom)
              const area = Math.max(0, right - left) * Math.max(0, bottom - top)
              if (area === 0) return null
              const x = (left + right) / 2
              const y = (top + bottom) / 2
              const hit = document.elementFromPoint(x, y) as HTMLElement | null
              return {
                area,
                target: candidate.dataset.testid ?? candidate.getAttribute('aria-label') ?? candidate.textContent?.trim().slice(0, 40) ?? candidate.tagName,
                hitTag: hit?.tagName ?? null,
                hitInsideStack: Boolean(hit?.closest('[data-app-update-notice-stack]')),
              }
            })
            .filter(Boolean)
          const visible = Array.from(root.children).filter((child) => getComputedStyle(child).display !== 'none') as HTMLElement[]
          return {
            top: rect.top,
            bottom: rect.bottom,
            clientHeight: root.clientHeight,
            clientWidth: root.clientWidth,
            scrollHeight: root.scrollHeight,
            scrollWidth: root.scrollWidth,
            overflowX: getComputedStyle(root).overflowX,
            overlaps: external,
            overlapArea: external.reduce((sum, item) => sum + (item?.area ?? 0), 0),
            order: visible.map((child) => child.dataset.testid),
            gaps: visible.slice(1).map((child, index) => Number((child.getBoundingClientRect().top - visible[index].getBoundingClientRect().bottom).toFixed(3))),
          }
        })
        const reaches: Array<Record<string, unknown>> = []
        for (let index = 0; index < await stack.locator('button:visible,a:visible').count(); index += 1) {
          reaches.push(await buttonReach(stack.locator('button:visible,a:visible').nth(index)))
        }
        console.log(`[MATRIX] ${viewport.width}x${viewport.height} banners=${count} ${JSON.stringify({ ...metric, reaches })}`)
        if (metric.clientHeight <= 0) defects.push(`${viewport.width}x${viewport.height}/${count}장 stack clientHeight=${metric.clientHeight}`)
        if (metric.overlapArea !== 0) defects.push(`${viewport.width}x${viewport.height}/${count}장 교차 면적=${metric.overlapArea.toFixed(4)} targets=${JSON.stringify(metric.overlaps)}`)
        if (reaches.some((item) => !item.fullyVisible || !item.hitSelf)) defects.push(`${viewport.width}x${viewport.height}/${count}장 버튼 도달 실패 ${JSON.stringify(reaches)}`)
        if (count === 3 && (JSON.stringify(metric.order) !== JSON.stringify(IDS) || JSON.stringify(metric.gaps) !== JSON.stringify([12, 12]))) {
          defects.push(`${viewport.width}x${viewport.height} 순서/간격 위반 order=${JSON.stringify(metric.order)} gaps=${JSON.stringify(metric.gaps)}`)
        }
      }
      await stack.evaluate((element) => Array.from(element.children).forEach((child) => ((child as HTMLElement).style.display = '')))
      await settle(page)
      await expect(page.getByRole('heading', { name: '미배차 리스트' })).toBeVisible()
      await stack.evaluate((element) => { (element as HTMLElement).scrollTop = (element as HTMLElement).scrollHeight })
      const shot = path.join(SHOTS, `${viewport.width}x${viewport.height}-three-banners-sol-r6-final-real-qa.png`)
      await page.screenshot({ path: shot, fullPage: false })
      console.log(`[SCREENSHOT] file=${shot} bytes=${fs.statSync(shot).size}`)
    }
    console.log(`[MATRIX-SUMMARY] viewportBannerCases=${matrixCases}`)

    await page.setViewportSize({ width: 320, height: 480 })
    await stack.evaluate((element) => Array.from(element.children).forEach((child, index) => { (child as HTMLElement).style.display = index === 0 ? '' : 'none' }))
    await settle(page)
    const blockedTabProbe = await page.evaluate(() => {
      const stack = document.querySelector<HTMLElement>('[data-app-update-notice-stack]')!
      const target = document.querySelector<HTMLElement>('[data-testid="arologis-unassigned-date"]')!
      const a = stack.getBoundingClientRect()
      const b = target.getBoundingClientRect()
      const x = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2
      const y = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2
      ;(window as typeof window & { __solR6TargetClicks?: number }).__solR6TargetClicks = 0
      target.addEventListener('click', () => { (window as typeof window & { __solR6TargetClicks?: number }).__solR6TargetClicks = ((window as typeof window & { __solR6TargetClicks?: number }).__solR6TargetClicks ?? 0) + 1 }, { once: true })
      const hit = document.elementFromPoint(x, y) as HTMLElement | null
      return { x, y, hitTag: hit?.tagName ?? null, hitInsideStack: Boolean(hit?.closest('[data-app-update-notice-stack]')) }
    })
    await page.mouse.click(blockedTabProbe.x, blockedTabProbe.y)
    const targetClicks = await page.evaluate(() => (window as typeof window & { __solR6TargetClicks?: number }).__solR6TargetClicks ?? 0)
    console.log(`[DIRECT-BLOCK] ${JSON.stringify({ ...blockedTabProbe, targetClicks })}`)
    if (targetClicks !== 1) defects.push(`320x480 스택이 날짜 입력 실제 클릭 차단 ${JSON.stringify({ ...blockedTabProbe, targetClicks })}`)
    await stack.evaluate((element) => Array.from(element.children).forEach((child) => { (child as HTMLElement).style.display = '' }))

    await page.setViewportSize({ width: 600, height: 720 })
    await settle(page)
    const dynamic: Array<Record<string, unknown>> = []
    for (const viewport of [{ width: 600, height: 720 }, { width: 320, height: 480 }, { width: 480, height: 480 }, { width: 600, height: 720 }]) {
      await page.setViewportSize(viewport)
      await settle(page)
      dynamic.push(await stack.evaluate((element) => ({ width: innerWidth, height: innerHeight, top: element.getBoundingClientRect().top, clientHeight: (element as HTMLElement).clientHeight })))
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.send('updater:status', { kind: 'not-available' }))
    await expect(page.getByTestId('app-auto-update-status')).toHaveCount(0)
    dynamic.push(await stack.evaluate((element) => ({ phase: 'removed', top: element.getBoundingClientRect().top, clientHeight: (element as HTMLElement).clientHeight, children: element.children.length })))
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.send('updater:status', { kind: 'error', message: '업데이트 검증 상태 확인 실패' }))
    await expect(page.getByTestId('app-auto-update-status')).toBeVisible()
    await settle(page)
    dynamic.push(await stack.evaluate((element) => ({ phase: 'added', top: element.getBoundingClientRect().top, clientHeight: (element as HTMLElement).clientHeight, children: element.children.length })))
    console.log(`[DYNAMIC] ${JSON.stringify(dynamic)}`)
    if (dynamic.some((item) => Number(item.clientHeight) <= 0)) defects.push(`동적 리사이즈/추가제거 중 stack 0px ${JSON.stringify(dynamic)}`)

    const wheelPoint = await stack.evaluate((element) => {
      const root = element as HTMLElement
      const rect = root.getBoundingClientRect()
      return { x: rect.left + Math.min(40, rect.width / 2), y: rect.top + Math.min(20, rect.height / 2) }
    })
    const wheelResults: Array<Record<string, unknown>> = []
    for (const probe of [
      { name: 'remaining-down', stack: 50, main: 100, delta: 80 },
      { name: 'remaining-up', stack: 100, main: 100, delta: -60 },
      { name: 'bottom-down', stack: Number.MAX_SAFE_INTEGER, main: 100, delta: 120 },
      { name: 'top-up', stack: 0, main: 200, delta: -80 },
    ]) {
      const before = await page.evaluate(({ stackTop, mainTop }) => {
        const stack = document.querySelector<HTMLElement>('[data-app-update-notice-stack]')!
        const rect = stack.getBoundingClientRect()
        stack.style.display = 'none'
        let main = document.elementFromPoint(rect.left + Math.min(40, rect.width / 2), rect.top + Math.min(20, rect.height / 2)) as HTMLElement | null
        stack.style.display = ''
        while (main && !(main.scrollHeight > main.clientHeight && /(auto|scroll)/.test(getComputedStyle(main).overflowY))) main = main.parentElement
        if (!main) main = document.scrollingElement as HTMLElement | null
        document.querySelector<HTMLElement>('[data-sol-r6-scroller]')?.removeAttribute('data-sol-r6-scroller')
        main?.setAttribute('data-sol-r6-scroller', 'true')
        stack.scrollTop = stackTop
        if (main) main.scrollTop = mainTop
        return { stack: stack.scrollTop, main: main?.scrollTop ?? null, mainTag: main?.tagName ?? null, mainMax: main ? main.scrollHeight - main.clientHeight : null, max: stack.scrollHeight - stack.clientHeight }
      }, { stackTop: probe.stack, mainTop: probe.main })
      await page.mouse.move(wheelPoint.x, wheelPoint.y)
      await page.mouse.wheel(0, probe.delta)
      const after = await page.evaluate(() => ({
        stack: document.querySelector<HTMLElement>('[data-app-update-notice-stack]')!.scrollTop,
        main: document.querySelector<HTMLElement>('[data-sol-r6-scroller]')?.scrollTop ?? null,
      }))
      const item = { ...probe, before, after }
      wheelResults.push(item)
      if (before.mainMax === null || before.mainMax <= 0) defects.push(`휠 대상 본문 스크롤러 미확보 ${JSON.stringify(item)}`)
      if (probe.name.startsWith('remaining') && after.main !== before.main) defects.push(`stack 잔여 스크롤 중 본문 이동 ${JSON.stringify(item)}`)
      if (probe.name === 'remaining-down' && after.stack <= before.stack) defects.push(`stack 하향 잔여 스크롤 미소비 ${JSON.stringify(item)}`)
      if (probe.name === 'remaining-up' && after.stack >= before.stack) defects.push(`stack 상향 잔여 스크롤 미소비 ${JSON.stringify(item)}`)
      if (probe.name === 'bottom-down' && after.main <= before.main) defects.push(`stack 하단에서 본문 하향 전달 실패 ${JSON.stringify(item)}`)
      if (probe.name === 'top-up' && after.main >= before.main) defects.push(`stack 상단에서 본문 상향 전달 실패 ${JSON.stringify(item)}`)
    }
    console.log(`[WHEEL] ${JSON.stringify(wheelResults)}`)

    const scrollbar = await stack.evaluate((element) => {
      const root = element as HTMLElement
      root.scrollTop = 0
      const rect = root.getBoundingClientRect()
      const x = rect.right - 3
      const y = rect.top + rect.height * 0.8
      const direct = document.elementFromPoint(x, y) as HTMLElement | null
      root.style.pointerEvents = 'none'
      const below = document.elementFromPoint(x, y) as HTMLElement | null
      root.style.pointerEvents = ''
      ;(window as typeof window & { __solR6BelowClicks?: number }).__solR6BelowClicks = 0
      below?.addEventListener('click', () => { (window as typeof window & { __solR6BelowClicks?: number }).__solR6BelowClicks = ((window as typeof window & { __solR6BelowClicks?: number }).__solR6BelowClicks ?? 0) + 1 }, { once: true })
      return { x, y, directTag: direct?.tagName ?? null, directInsideStack: Boolean(direct?.closest('[data-app-update-notice-stack]')), belowTag: below?.tagName ?? null }
    })
    await page.mouse.click(scrollbar.x, scrollbar.y)
    const belowClicks = await page.evaluate(() => (window as typeof window & { __solR6BelowClicks?: number }).__solR6BelowClicks ?? 0)
    console.log(`[SCROLLBAR] ${JSON.stringify({ ...scrollbar, belowClicks })}`)
    if (!scrollbar.directInsideStack || belowClicks !== 0) defects.push(`스크롤바 클릭 통과 ${JSON.stringify({ ...scrollbar, belowClicks })}`)

    const zoomResults: Array<Record<string, unknown>> = []
    for (const factor of [1, 1.25, 1.5]) {
      await app.evaluate(({ BrowserWindow }, value) => BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(value), factor)
      await settle(page)
      const reaches: Array<Record<string, unknown>> = []
      for (let index = 0; index < await stack.locator('button').count(); index += 1) reaches.push(await buttonReach(stack.locator('button').nth(index)))
      const metric = await stack.evaluate((element) => ({ factor: devicePixelRatio, innerWidth, innerHeight, top: element.getBoundingClientRect().top, clientHeight: (element as HTMLElement).clientHeight, scrollHeight: (element as HTMLElement).scrollHeight }))
      zoomResults.push({ requestedFactor: factor, ...metric, reaches })
      if (reaches.some((item) => !item.fullyVisible || !item.hitSelf)) defects.push(`배율 ${factor} 버튼 경계 위반 ${JSON.stringify(reaches)}`)
    }
    console.log(`[ZOOM] ${JSON.stringify(zoomResults)}`)
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1))
    await page.setViewportSize({ width: 600, height: 720 })
    await settle(page)

    const dismiss = page.getByTestId('app-auto-update-dismiss')
    await dismiss.scrollIntoViewIfNeeded()
    await dismiss.click()
    await expect(page.getByTestId('app-auto-update-status')).toHaveCount(0)
    console.log('[INTERNAL-BUTTON] 닫기 클릭 후 app-auto-update-status=0')

    await stack.focus()
    const tab: Array<Record<string, unknown>> = []
    for (let index = 0; index < 8; index += 1) {
      tab.push(await page.evaluate(() => ({ tag: document.activeElement?.tagName, inside: Boolean((document.activeElement as HTMLElement | null)?.closest('[data-app-update-notice-stack]')), text: (document.activeElement as HTMLElement | null)?.textContent?.trim().slice(0, 30) })))
      await page.keyboard.press('Tab')
    }
    console.log(`[TAB] ${JSON.stringify(tab)}`)
    if (!tab.some((item) => item.inside === false)) defects.push(`Tab이 stack 밖으로 탈출하지 못함 ${JSON.stringify(tab)}`)

    await page.getByTestId('unassigned-history-save-button').click()
    const dialog = page.getByRole('dialog', { name: '미배차 결과 저장' })
    await expect(dialog).toBeVisible()
    console.log('[MODAL] 미배차 결과 저장 visible=true')
    await dialog.getByRole('button', { name: '취소' }).click()

    const rows = page.locator('[data-testid^="arologis-unassigned-row-"]')
    const rowCount = await rows.count()
    if (rowCount > 0) {
      const action = rows.nth(Math.min(5, rowCount - 1)).getByRole('button', { name: '수동 배차로 이동' })
      await action.scrollIntoViewIfNeeded()
      await action.click()
      await expect(page.getByRole('heading', { name: '수동 배차' })).toBeVisible({ timeout: 15_000 })
      console.log(`[ROW-CLICK] rows=${rowCount} hash=${new URL(page.url()).hash}`)
    }

    await gotoHash(page, '/dispatches/manual')
    await expect(page.getByRole('heading', { name: '수동 배차' })).toBeVisible()
    const select = page.locator('select').first()
    await select.focus()
    await page.keyboard.press('Alt+ArrowDown')
    const dropdown = await select.evaluate((element) => ({ active: document.activeElement === element, options: element.options.length }))
    await page.keyboard.press('Escape')
    console.log(`[DROPDOWN] ${JSON.stringify(dropdown)}`)
    if (!dropdown.active || dropdown.options < 1) defects.push(`드롭다운 도달 실패 ${JSON.stringify(dropdown)}`)

    await gotoHash(page, '/dispatches/unassigned')
    await expect(page.getByRole('heading', { name: '미배차 리스트' })).toBeVisible()
    await page.emulateMedia({ media: 'print' })
    const print = await page.locator('[data-print-exclude]').evaluateAll((elements) => elements.map((element) => ({ id: element.getAttribute('data-testid'), display: getComputedStyle(element).display })))
    await page.emulateMedia({ media: 'screen' })
    console.log(`[PRINT] ${JSON.stringify(print)}`)
    if (!print.every((item) => item.display === 'none')) defects.push(`인쇄 제외 실패 ${JSON.stringify(print)}`)

    const wording = await page.locator('body').innerText()
    const wordingMetric = { trustRoot: (wording.match(/신뢰 루트/g) ?? []).length, securityCertificate: (wording.match(/보안인증서/g) ?? []).length }
    console.log(`[WORDING] ${JSON.stringify(wordingMetric)}`)
    if (wordingMetric.trustRoot !== 0 || wordingMetric.securityCertificate < 1) defects.push(`사용자 문구 위반 ${JSON.stringify(wordingMetric)}`)
    console.log(`[WRITE-SUMMARY] blockedWrites=${blockedWrites}`)
    console.log(`[DEFECTS] count=${defects.length} ${JSON.stringify(defects)}`)
    console.log(`[DURATION] ms=${Date.now() - startedAt}`)
    expect(defects, defects.join('\n')).toEqual([])
  } finally {
    await app.close()
    fs.rmSync(userDataDir, { recursive: true, force: true })
  }
})
