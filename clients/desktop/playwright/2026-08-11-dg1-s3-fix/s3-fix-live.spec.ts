import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5193'
const screenshotDir = resolveQaShotsDir(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../docs/qa/2026-08-11-dg1-s3-fix2'),
)

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(screenshotDir, name), fullPage: true })
}

/**
 * DOM 존재·Playwright 자동 스크롤·강제 클릭으로는 통과하지 않는 사용자 가시성 gate.
 * 후보 중앙점이 viewport 안에 있고, 실제 hit-test가 후보 자신/자손으로 들어와야 한다.
 */
async function expectVisibleAndHitTestable(option: Locator): Promise<void> {
  await expect(option).toBeVisible()
  const evidence = await option.evaluate((node) => {
    const rect = node.getBoundingClientRect()
    const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    const hit = document.elementFromPoint(point.x, point.y)
    return {
      rect: {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
      },
      inViewport: rect.top >= 0 && rect.left >= 0
        && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth,
      hitTag: hit?.tagName ?? null,
      hitTestId: hit?.getAttribute('data-testid') ?? null,
      optionContainsHit: !!hit && node.contains(hit),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      listboxStyle: node.parentElement instanceof HTMLElement
        ? { left: node.parentElement.style.left, width: node.parentElement.style.width }
        : null,
    }
  })
  console.log(`VISIBILITY_GATE=${JSON.stringify(evidence)}`)
  expect(evidence.inViewport).toBe(true)
  expect(evidence.optionContainsHit).toBe(true)
}

async function installAuthMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const session = {
      token: 'playwright-token',
      userId: '00000000-0000-0000-0000-000000010001',
      role: 'MASTER',
      fullName: '오병승',
      partnerCode: 'P-MOCK-001',
    }
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => session,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  })
}

const REFERENCE_VISIBILITY_CASES = [
  {
    type: 'OUTBOUND_SLIP',
    query: '주식회사 윌리-정현수',
    expected: '주식회사 윌리-정현수',
    selected: '2026/05/04-3',
  },
  { type: 'INBOUND_SLIP', query: '2026/05/03-7', expected: '2026/05/03-7' },
  { type: 'JOURNAL', query: '2026/', expected: '2026/' },
  { type: 'TAX_INVOICE', query: '2026/05/02-1', expected: '2026/05/02-1' },
  { type: 'STATEMENT', query: '2026/05/02-1', expected: '2026/05/02-1' },
  { type: 'PARTNER_LEDGER', query: '주식회사 윌리', expected: 'P-WILLY-001', selected: '주식회사 윌리' },
  { type: 'SALES_COMMISSION_SETTLEMENT', query: '2026/08/11-1', expected: '2026/08/11-1' },
] as const

async function selectExpenseTemplate(page: Page): Promise<void> {
  const template = page.getByTestId('groupware-approval-create-template')
  await expect(template.locator('option').filter({ hasText: '지출결의서' })).toBeAttached({ timeout: 10_000 })
  await template.selectOption({ label: '지출결의서' })
}

async function openReferencePicker(page: Page): Promise<void> {
  await page.getByRole('button', { name: '문서 참조 추가' }).click()
}

async function readScrollFrame(page: Page) {
  return page.evaluate(() => {
    const listbox = document.querySelector('[role="listbox"]')
    const input = document.querySelector('[data-testid="doc-ref-search-input"]')
    const picker = input?.closest('[class*="picker"]')
    const scrollOwner = document.scrollingElement
    if (!(listbox instanceof HTMLElement) || !(picker instanceof HTMLElement)) {
      return {
        closed: true,
        aligned: true,
        gap: null,
        scrollY: window.scrollY,
        scrollOwner: scrollOwner?.tagName ?? null,
        scrollTop: scrollOwner?.scrollTop ?? null,
        maxScrollTop: scrollOwner ? scrollOwner.scrollHeight - scrollOwner.clientHeight : null,
      }
    }
    if (getComputedStyle(listbox).visibility === 'hidden') {
      return {
        closed: true,
        aligned: true,
        gap: null,
        scrollY: window.scrollY,
        scrollOwner: document.scrollingElement?.tagName ?? null,
        scrollTop: document.scrollingElement?.scrollTop ?? null,
        maxScrollTop: document.scrollingElement
          ? document.scrollingElement.scrollHeight - document.scrollingElement.clientHeight
          : null,
      }
    }

    const listRect = listbox.getBoundingClientRect()
    const pickerRect = picker.getBoundingClientRect()
    const belowGap = listRect.top - pickerRect.bottom
    const aboveGap = pickerRect.top - listRect.bottom
    const belowAligned = Math.abs(belowGap - 4) <= 2
    const aboveAligned = Math.abs(aboveGap - 4) <= 2
    return {
      closed: false,
      aligned: belowAligned || aboveAligned,
      gap: belowAligned ? belowGap : aboveGap,
      scrollY: window.scrollY,
      scrollOwner: scrollOwner?.tagName ?? null,
      scrollTop: scrollOwner?.scrollTop ?? null,
      maxScrollTop: scrollOwner ? scrollOwner.scrollHeight - scrollOwner.clientHeight : null,
    }
  })
}

async function addJournalReference(page: Page): Promise<void> {
  await openReferencePicker(page)
  await page.getByTestId('doc-ref-type-select').first().selectOption({ value: 'JOURNAL' })
  const searchInput = page.getByTestId('doc-ref-search-input').first()
  await searchInput.fill('2026/')
  const option = page.getByTestId('doc-ref-search-option').first()
  await expect(option).toBeVisible({ timeout: 10_000 })
  await option.click()
}

test('지출결의서 정산서 검색·선택은 isolated mock에서 결과와 refDocNo를 유지한다', async ({ page }) => {
  const apiBase = 'http://127.0.0.1:1'
  const leakedRequests: string[] = []
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(apiBase)) leakedRequests.push(`${request.method()} ${request.url()}`)
  })

  await page.goto(`${BASE_URL}/?mockRole=MASTER#/groupware/approvals/new`, {
    waitUntil: 'domcontentloaded',
  })
  await expect(page.locator('main.app-main')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('groupware-approval-create-template').selectOption({ label: '지출결의서' })
  await expect(page.getByRole('button', { name: '문서 참조 추가' })).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: '문서 참조 추가' }).click()

  const typeSelect = page.getByTestId('doc-ref-type-select').first()
  const searchInput = page.getByTestId('doc-ref-search-input').first()
  await typeSelect.selectOption({ label: '영업수수료 정산서' })
  await searchInput.fill('2026/08/11')

  const option = page.getByTestId('doc-ref-search-option').first()
  await expect(option).toContainText('2026/08/11-1', { timeout: 10_000 })
  await expectVisibleAndHitTestable(option)
  await capture(page, '01-settlement-search-result.png')

  await option.click()
  await expect(page.getByTestId('attachment-chip')).toContainText('영업수수료 정산서')
  await expect(page.getByTestId('attachment-chip')).toContainText('2026/08/11-1')
  await expect(searchInput).toHaveCount(0)
  await capture(page, '02-settlement-selected.png')

  expect(leakedRequests).toEqual([])
})

test('선택한 정산서는 상세와 인쇄에서 업무 라벨·번호로 표시된다', async ({ page }) => {
  await installAuthMock(page)
  await page.goto(`${BASE_URL}/?mockRole=MASTER#/groupware/approvals/new`, {
    waitUntil: 'domcontentloaded',
  })
  await expect(page.locator('main.app-main')).toBeVisible({ timeout: 15_000 })
  await page.getByTestId('groupware-approval-create-template').selectOption({ label: '지출결의서' })
  await page.getByTestId('groupware-approval-create-title').fill('S3 정산서 소비자 표시 QA')

  const approverInput = page.getByTestId('approver-search-input')
  await approverInput.fill('김기철')
  await page.getByRole('listbox', { name: '결재자 검색 결과' }).getByRole('option').first().click()

  await page.getByTestId('dynamic-approval-field-expenseItem').fill('S3 정산서 참조')
  await page.getByTestId('dynamic-approval-field-amount').fill('1320000')
  await page.getByTestId('dynamic-approval-field-accountCode').selectOption({ label: '복리후생비' })
  await page.getByTestId('dynamic-approval-field-expenseDate').fill('2026-08-11')

  await page.getByRole('button', { name: '문서 참조 추가' }).click()
  await page.getByTestId('doc-ref-type-select').first().selectOption({ label: '영업수수료 정산서' })
  await page.getByTestId('doc-ref-search-input').first().fill('2026/08/11')
  const option = page.getByTestId('doc-ref-search-option').first()
  await expect(option).toContainText('2026/08/11-1', { timeout: 10_000 })
  await expectVisibleAndHitTestable(option)
  await option.click()

  await page.getByTestId('groupware-approval-create-submit').click()
  await expect(page.getByTestId('groupware-approval-detail-no')).toBeVisible({ timeout: 15_000 })
  const detailAttachment = page.getByText('2026/08/11-1').last().locator('xpath=../../..')
  await expect(detailAttachment).toContainText('영업수수료 정산서')
  await expect(detailAttachment).toContainText('2026/08/11-1')
  await expect(detailAttachment.locator('a[href="#"]')).toHaveCount(0)
  await capture(page, '03-settlement-detail.png')

  await page.getByRole('button', { name: '인쇄 미리보기' }).click()
  await expect(page.getByLabel('결재문서 첨부')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByLabel('결재문서 첨부')).toContainText('영업수수료 정산서')
  await expect(page.getByLabel('결재문서 첨부')).toContainText('2026/08/11-1')
  await capture(page, '04-settlement-print.png')
})

test('문서 참조 7유형은 공통 picker에서 모두 visible·hit-test 가능하고 선택된다', async ({ page }) => {
  const leakedRequests: string[] = []
  page.on('requestfailed', (request) => {
    if (request.url().startsWith('http://127.0.0.1:1')) leakedRequests.push(`${request.method()} ${request.url()}`)
  })

  await page.goto(`${BASE_URL}/?mockRole=MASTER#/groupware/approvals/new`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main.app-main')).toBeVisible({ timeout: 15_000 })
  await selectExpenseTemplate(page)

  for (const reference of REFERENCE_VISIBILITY_CASES) {
    await openReferencePicker(page)
    const typeSelect = page.getByTestId('doc-ref-type-select').first()
    const searchInput = page.getByTestId('doc-ref-search-input').first()
    await typeSelect.selectOption({ value: reference.type })
    await searchInput.fill(reference.query)

    const options = page.getByTestId('doc-ref-search-option')
    const option = options.first()
    await expect(option).toContainText(reference.expected, { timeout: 10_000 })
    await expectVisibleAndHitTestable(option)
    if (reference.type === 'JOURNAL') {
      expect(await options.count()).toBeGreaterThan(1)
      const listboxMetrics = await page.getByRole('listbox').evaluate((node) => ({
        scrollHeight: node.scrollHeight,
        clientHeight: node.clientHeight,
      }))
      expect(listboxMetrics.scrollHeight).toBeGreaterThan(listboxMetrics.clientHeight)
    }

    const layout = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth)

    await option.click()
    await expect(page.getByTestId('attachment-chip').last()).toContainText(reference.selected ?? reference.expected)
  }

  expect(leakedRequests).toEqual([])
})

test('문서 참조 dropdown은 0건에서 닫히고 하단·창 축소·뒤 화면 scroll에서도 anchor와 함께 동작한다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 480 })
  await page.goto(`${BASE_URL}/?mockRole=MASTER#/groupware/approvals/new`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main.app-main')).toBeVisible({ timeout: 15_000 })
  await selectExpenseTemplate(page)
  await openReferencePicker(page)

  const typeSelect = page.getByTestId('doc-ref-type-select').first()
  const searchInput = page.getByTestId('doc-ref-search-input').first()
  await typeSelect.selectOption({ value: 'SALES_COMMISSION_SETTLEMENT' })
  await searchInput.fill('NO_MATCHING_DOCUMENT_000')
  await expect(page.getByRole('listbox')).toHaveCount(0)

  await typeSelect.selectOption({ value: 'JOURNAL' })
  await searchInput.fill('2026/')
  const option = page.getByTestId('doc-ref-search-option').first()
  await expect(option).toBeVisible({ timeout: 10_000 })
  await searchInput.scrollIntoViewIfNeeded()
  await expectVisibleAndHitTestable(option)

  const aboveEvidence = await page.evaluate(() => {
    const optionNode = document.querySelector('[data-testid="doc-ref-search-option"]')
    const input = document.querySelector('[data-testid="doc-ref-search-input"]')
    const picker = input?.closest('[class*="picker"]')
    if (!(optionNode instanceof HTMLElement) || !(picker instanceof HTMLElement)) return null
    const optionRect = optionNode.getBoundingClientRect()
    const pickerRect = picker.getBoundingClientRect()
    return {
      optionBottom: optionRect.bottom,
      pickerTop: pickerRect.top,
      opensAbove: optionRect.bottom <= pickerRect.top + 1,
    }
  })
  expect(aboveEvidence?.opensAbove).toBe(true)

  await page.evaluate(() => {
    const main = document.querySelector('main.app-main')
    if (!(main instanceof HTMLElement)) return
    main.style.height = '100vh'
    main.style.minHeight = '0'
    const scrollSentinel = document.createElement('div')
    scrollSentinel.setAttribute('data-testid', 'container-scroll-sentinel')
    scrollSentinel.style.height = '160px'
    scrollSentinel.style.pointerEvents = 'none'
    main.appendChild(scrollSentinel)
  })
  const containerFrames = await page.evaluate(async () => {
    const main = document.querySelector('main.app-main')
    if (!(main instanceof HTMLElement)) return null
    const read = () => {
      const listbox = document.querySelector('[role="listbox"]')
      const input = document.querySelector('[data-testid="doc-ref-search-input"]')
      const picker = input?.closest('[class*="picker"]')
      if (!(listbox instanceof HTMLElement) || !(picker instanceof HTMLElement)
        || getComputedStyle(listbox).visibility === 'hidden') {
        return { closed: true, aligned: true, gap: null, scrollTop: main.scrollTop }
      }
      const listRect = listbox.getBoundingClientRect()
      const pickerRect = picker.getBoundingClientRect()
      const belowGap = listRect.top - pickerRect.bottom
      const aboveGap = pickerRect.top - listRect.bottom
      return {
        closed: false,
        aligned: Math.abs(belowGap - 4) <= 2 || Math.abs(aboveGap - 4) <= 2,
        gap: Math.abs(belowGap - 4) <= 2 ? belowGap : aboveGap,
        scrollTop: main.scrollTop,
      }
    }
    main.scrollTo(0, 0)
    main.scrollBy(0, 80)
    const frame1 = await new Promise<ReturnType<typeof read>>((resolve) => {
      requestAnimationFrame(() => resolve(read()))
    })
    const frame2 = await new Promise<ReturnType<typeof read>>((resolve) => {
      requestAnimationFrame(() => resolve(read()))
    })
    return { frame1, frame2, scrollHeight: main.scrollHeight, clientHeight: main.clientHeight }
  })
  console.log(`CONTAINER_SCROLL_FIRST_PAINT=${JSON.stringify(containerFrames)}`)
  expect(containerFrames?.scrollHeight).toBeGreaterThan(containerFrames?.clientHeight ?? 0)
  expect(containerFrames?.frame1.scrollTop).toBe(80)
  expect(containerFrames?.frame1.closed || containerFrames?.frame1.aligned).toBe(true)

  await page.evaluate(() => {
    document.querySelector('main.app-main')?.scrollTo(0, 0)
  })
  await searchInput.fill('2026')
  await searchInput.fill('2026/')
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 10_000 })
  await expectVisibleAndHitTestable(page.getByTestId('doc-ref-search-option').first())

  await page.setViewportSize({ width: 480, height: 640 })
  await page.evaluate(() => window.dispatchEvent(new Event('resize')))
  await expect.poll(() => page.getByRole('listbox').count()).toBe(0)
  const resizeEvidence = await page.evaluate(() => {
    const input = document.querySelector('[data-testid="doc-ref-search-input"]')
    const picker = input?.closest('[class*="picker"]')
    if (!(picker instanceof HTMLElement)) return { anchorOutsideViewport: false }
    const rect = picker.getBoundingClientRect()
    return { anchorOutsideViewport: rect.top > window.innerHeight || rect.bottom < 0 }
  })
  expect(resizeEvidence.anchorOutsideViewport).toBe(true)
  const narrowLayout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(narrowLayout.scrollWidth).toBeLessThanOrEqual(narrowLayout.clientWidth)
})

test('실제 window scroll의 첫 paint에서도 문서 참조 dropdown은 닫히거나 anchor와 정렬된다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto(`${BASE_URL}/?mockRole=MASTER#/groupware/approvals/new`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main.app-main')).toBeVisible({ timeout: 15_000 })
  await selectExpenseTemplate(page)

  for (let index = 0; index < 4; index += 1) await addJournalReference(page)

  await openReferencePicker(page)
  await page.getByTestId('doc-ref-type-select').first().selectOption({ value: 'JOURNAL' })
  const searchInput = page.getByTestId('doc-ref-search-input').first()
  await searchInput.fill('2026/')
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 10_000 })
  await page.evaluate(() => {
    const scrollSentinel = document.createElement('div')
    scrollSentinel.setAttribute('data-testid', 'window-scroll-sentinel')
    scrollSentinel.style.height = '160px'
    scrollSentinel.style.pointerEvents = 'none'
    document.body.appendChild(scrollSentinel)
  })

  const before = await readScrollFrame(page)
  const metrics = await page.evaluate(() => ({
    innerHeight: window.innerHeight,
    scrollingElement: document.scrollingElement?.tagName ?? null,
    document: {
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
    },
    main: (() => {
      const main = document.querySelector('main.app-main')
      return main instanceof HTMLElement
        ? { scrollHeight: main.scrollHeight, clientHeight: main.clientHeight, scrollTop: main.scrollTop }
        : null
    })(),
    attachmentChips: document.querySelectorAll('[data-testid="attachment-chip"]').length,
    bodyTextLength: document.body.innerText.length,
  }))
  console.log(`WINDOW_SCROLL_SETUP_METRICS=${JSON.stringify(metrics)}`)
  expect(before.scrollOwner).toBe('HTML')
  expect(before.scrollTop).toBe(0)
  expect(before.maxScrollTop).toBeGreaterThanOrEqual(80)
  expect(before.closed || before.aligned).toBe(true)

  const frames = await page.evaluate(async () => {
    const events: string[] = []
    window.addEventListener('scroll', () => events.push('scroll'), { once: true })
    const read = () => {
      const listbox = document.querySelector('[role="listbox"]')
      const input = document.querySelector('[data-testid="doc-ref-search-input"]')
      const picker = input?.closest('[class*="picker"]')
      if (!(listbox instanceof HTMLElement) || !(picker instanceof HTMLElement)) {
        return { closed: true, aligned: true, gap: null, scrollY: window.scrollY }
      }
      if (getComputedStyle(listbox).visibility === 'hidden') {
        return { closed: true, aligned: true, gap: null, scrollY: window.scrollY }
      }
      const listRect = listbox.getBoundingClientRect()
      const pickerRect = picker.getBoundingClientRect()
      const belowGap = listRect.top - pickerRect.bottom
      const aboveGap = pickerRect.top - listRect.bottom
      const belowAligned = Math.abs(belowGap - 4) <= 2
      const aboveAligned = Math.abs(aboveGap - 4) <= 2
      return {
        closed: false,
        aligned: belowAligned || aboveAligned,
        gap: belowAligned ? belowGap : aboveGap,
        scrollY: window.scrollY,
      }
    }
    window.scrollTo(0, 0)
    window.scrollBy(0, 80)
    const frame1 = await new Promise<ReturnType<typeof read>>((resolve) => {
      requestAnimationFrame(() => {
        events.push('raf1')
        resolve(read())
      })
    })
    const frame2 = await new Promise<ReturnType<typeof read>>((resolve) => {
      requestAnimationFrame(() => {
        events.push('raf2')
        resolve(read())
      })
    })
    return { frame1, frame2, events }
  })
  console.log(`WINDOW_SCROLL_FIRST_PAINT=${JSON.stringify({ before, ...frames })}`)
  expect(frames.frame1.scrollY).toBe(80)
  expect(frames.frame1.closed || frames.frame1.aligned).toBe(true)

  await page.evaluate(() => window.scrollTo(0, 0))
  await searchInput.fill('2026')
  await searchInput.fill('2026/')
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 10_000 })
  const rapidFrames = await page.evaluate(async () => {
    const read = () => {
      const listbox = document.querySelector('[role="listbox"]')
      return !(listbox instanceof HTMLElement) || getComputedStyle(listbox).visibility === 'hidden'
    }
    const frames: boolean[] = []
    for (let index = 0; index < 6; index += 1) {
      window.scrollBy(0, 20)
      frames.push(await new Promise<boolean>((resolve) => {
        requestAnimationFrame(() => resolve(read()))
      }))
    }
    return { frames, scrollY: window.scrollY }
  })
  console.log(`WINDOW_SCROLL_RAPID_FRAMES=${JSON.stringify(rapidFrames)}`)
  expect(rapidFrames.scrollY).toBe(120)
  expect(rapidFrames.frames).toEqual([true, true, true, true, true, true])

  await page.evaluate(() => window.scrollTo(0, 0))
  await searchInput.fill('2026')
  await searchInput.fill('2026/')
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 10_000 })
  const resizeDuringScroll = await page.evaluate(async () => {
    window.scrollBy(0, 20)
    window.dispatchEvent(new Event('resize'))
    return new Promise<boolean>((resolve) => {
      requestAnimationFrame(() => {
        const listbox = document.querySelector('[role="listbox"]')
        resolve(!(listbox instanceof HTMLElement) || getComputedStyle(listbox).visibility === 'hidden')
      })
    })
  })
  console.log(`WINDOW_SCROLL_RESIZE_FIRST_PAINT=${JSON.stringify({ closed: resizeDuringScroll })}`)
  expect(resizeDuringScroll).toBe(true)

  await page.evaluate(() => window.scrollTo(0, 0))
  await searchInput.fill('2026')
  await searchInput.fill('2026/')
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 10_000 })
  const clickOption = page.getByTestId('doc-ref-search-option').first()
  await page.evaluate(() => {
    const option = document.querySelector('[data-testid="doc-ref-search-option"]')
    option?.addEventListener('mousedown', () => window.scrollBy(0, 20), { once: true })
  })
  await clickOption.click()
  const clickDuringScroll = await page.evaluate(() => new Promise<boolean>((resolve) => {
    requestAnimationFrame(() => {
      const listbox = document.querySelector('[role="listbox"]')
      resolve(!(listbox instanceof HTMLElement) || getComputedStyle(listbox).visibility === 'hidden')
    })
  }))
  console.log(`WINDOW_SCROLL_DURING_CLICK_FIRST_PAINT=${JSON.stringify({ closed: clickDuringScroll })}`)
  expect(clickDuringScroll).toBe(true)
})

test('실제 window scroll 직후 같은 검색 input을 mouse click하면 후보 dropdown을 다시 연다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto(`${BASE_URL}/?mockRole=MASTER#/groupware/approvals/new`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main.app-main')).toBeVisible({ timeout: 15_000 })
  await selectExpenseTemplate(page)
  await openReferencePicker(page)
  await page.getByTestId('doc-ref-type-select').first().selectOption({ value: 'JOURNAL' })

  const searchInput = page.getByTestId('doc-ref-search-input').first()
  await searchInput.fill('2026/')
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 10_000 })
  await page.evaluate(() => {
    const sentinel = document.createElement('div')
    sentinel.setAttribute('data-testid', 'fix4-window-click-sentinel')
    sentinel.style.height = '160px'
    sentinel.style.pointerEvents = 'none'
    document.body.appendChild(sentinel)
    const input = document.querySelector('[data-testid="doc-ref-search-input"]')
    input?.addEventListener('pointerdown', () => window.scrollBy(0, 1), { once: true })
  })

  const box = await searchInput.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2)

  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 10_000 })
  await expect(page.getByTestId('doc-ref-search-option')).toHaveCount(7)
  await expect(searchInput).toHaveValue('2026/')
})

test('scroll 0→3 직후 재클릭은 첫 rAF부터 anchor와 정렬된다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto(`${BASE_URL}/?mockRole=MASTER#/groupware/approvals/new`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main.app-main')).toBeVisible({ timeout: 15_000 })
  await selectExpenseTemplate(page)
  await openReferencePicker(page)
  await page.getByTestId('doc-ref-type-select').first().selectOption({ value: 'JOURNAL' })

  const searchInput = page.getByTestId('doc-ref-search-input').first()
  await searchInput.fill('2026/')
  await expect(page.getByRole('listbox')).toBeVisible({ timeout: 10_000 })
  await page.evaluate(() => {
    const sentinel = document.createElement('div')
    sentinel.setAttribute('data-testid', 'fix5-window-click-sentinel')
    sentinel.style.height = '160px'
    sentinel.style.pointerEvents = 'none'
    document.body.appendChild(sentinel)
    const input = document.querySelector('[data-testid="doc-ref-search-input"]')
    window.scrollTo(0, 0)
    const blockNativeScroll = (event: Event) => event.stopImmediatePropagation()
    window.addEventListener('scroll', blockNativeScroll, true)
    input?.addEventListener('pointerdown', () => window.scrollBy(0, 3), { once: true })
    input?.addEventListener('click', () => queueMicrotask(() => {
      window.removeEventListener('scroll', blockNativeScroll, true)
      window.dispatchEvent(new Event('scroll'))
    }), { once: true })
  })

  const box = await searchInput.boundingBox()
  expect(box).not.toBeNull()
  await page.mouse.click((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2)

  const firstRaf = await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => {
      const listbox = document.querySelector('[role="listbox"]')
      const input = document.querySelector('[data-testid="doc-ref-search-input"]')
      const picker = input?.closest('[class*="picker"]')
      if (!(listbox instanceof HTMLElement) || !(picker instanceof HTMLElement)) {
        resolve({ visible: false, aligned: true, belowGap: null, scrollY: window.scrollY })
        return
      }
      const listRect = listbox.getBoundingClientRect()
      const pickerRect = picker.getBoundingClientRect()
      const belowGap = listRect.top - pickerRect.bottom
      const aboveGap = pickerRect.top - listRect.bottom
      resolve({
        visible: listbox.getBoundingClientRect().height > 0,
        aligned: Math.abs(belowGap - 4) <= 2 || Math.abs(aboveGap - 4) <= 2,
        belowGap,
        scrollY: window.scrollY,
      })
    })
  }))
  console.log(`FIX5_FIRST_RAF=${JSON.stringify(firstRaf)}`)
  expect(firstRaf).toMatchObject({ visible: true, aligned: true, scrollY: 3 })
})

test('480px 좁은 창에서 새로 연 문서 참조 dropdown도 visible·hit-test 가능하다', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 640 })
  await page.goto(`${BASE_URL}/?mockRole=MASTER#/groupware/approvals/new`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main.app-main')).toBeVisible({ timeout: 15_000 })
  await selectExpenseTemplate(page)
  await openReferencePicker(page)

  await page.getByTestId('doc-ref-type-select').first().selectOption({ value: 'SALES_COMMISSION_SETTLEMENT' })
  await page.getByTestId('doc-ref-search-input').first().fill('2026/08/11-1')
  const option = page.getByTestId('doc-ref-search-option').first()
  await expect(option).toContainText('2026/08/11-1', { timeout: 10_000 })
  await expectVisibleAndHitTestable(option)

  const layout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth)
})

test('fix5 새 surface 조합은 내부 wheel·키보드·큰 scroll·결과 변경·resize에서 좌표를 보존한다', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.goto(`${BASE_URL}/?mockRole=MASTER#/groupware/approvals/new`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main.app-main')).toBeVisible({ timeout: 15_000 })
  await selectExpenseTemplate(page)
  await openReferencePicker(page)
  await page.getByTestId('doc-ref-type-select').first().selectOption({ value: 'JOURNAL' })

  const searchInput = page.getByTestId('doc-ref-search-input').first()
  await searchInput.fill('2026/')
  const listbox = page.getByRole('listbox')
  await expect(listbox).toBeVisible({ timeout: 10_000 })

  const listBox = await listbox.boundingBox()
  expect(listBox).not.toBeNull()
  await page.mouse.move((listBox?.x ?? 0) + (listBox?.width ?? 0) / 2, (listBox?.y ?? 0) + 40)
  await page.mouse.wheel(0, 21)
  await expect.poll(() => listbox.evaluate((node) => node.scrollTop)).toBe(21)
  console.log(`FIX5_COMBO_WHEEL=${JSON.stringify({ scrollTop: await listbox.evaluate((node) => node.scrollTop), open: await listbox.isVisible() })}`)

  await page.evaluate(() => {
    window.scrollTo(0, 0)
    window.dispatchEvent(new Event('scroll'))
  })
  await expect(listbox).toHaveCount(0)
  await searchInput.press('ArrowDown')
  await expect(listbox).toBeVisible()
  console.log(`FIX5_COMBO_KEYBOARD=${JSON.stringify(await readScrollFrame(page))}`)

  await page.evaluate(() => {
    const sentinel = document.createElement('div')
    sentinel.setAttribute('data-testid', 'fix5-large-scroll-sentinel')
    sentinel.style.height = '240px'
    sentinel.style.pointerEvents = 'none'
    document.body.appendChild(sentinel)
    window.scrollBy(0, 80)
  })
  await expect(listbox).toHaveCount(0)
  const largeScrollBox = await searchInput.boundingBox()
  expect(largeScrollBox).not.toBeNull()
  await page.mouse.click(
    (largeScrollBox?.x ?? 0) + (largeScrollBox?.width ?? 0) / 2,
    (largeScrollBox?.y ?? 0) + (largeScrollBox?.height ?? 0) / 2,
  )
  await expect(listbox).toBeVisible()
  console.log(`FIX5_COMBO_LARGE_SCROLL=${JSON.stringify({ scrollY: await page.evaluate(() => window.scrollY), ...(await readScrollFrame(page)) })}`)

  await page.getByTestId('doc-ref-type-select').first().selectOption({ value: 'SALES_COMMISSION_SETTLEMENT' })
  await searchInput.fill('2026/08/11-1')
  await expect(page.getByTestId('doc-ref-search-option')).toHaveCount(1, { timeout: 10_000 })
  await page.evaluate(() => {
    window.scrollTo(0, 0)
    window.dispatchEvent(new Event('scroll'))
  })
  await expect(listbox).toHaveCount(0)
  const resultReopenBox = await searchInput.boundingBox()
  expect(resultReopenBox).not.toBeNull()
  await page.mouse.click(
    (resultReopenBox?.x ?? 0) + (resultReopenBox?.width ?? 0) / 2,
    (resultReopenBox?.y ?? 0) + (resultReopenBox?.height ?? 0) / 2,
  )
  await page.setViewportSize({ width: 1024, height: 800 })
  await page.evaluate(() => window.dispatchEvent(new Event('resize')))
  await expect(listbox).toBeVisible()
  console.log(`FIX5_COMBO_RESULT_RESIZE=${JSON.stringify({ options: await page.getByTestId('doc-ref-search-option').count(), ...(await readScrollFrame(page)) })}`)
})
