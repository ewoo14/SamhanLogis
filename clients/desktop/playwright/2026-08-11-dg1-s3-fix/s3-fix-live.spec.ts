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

async function waitForDropdownAligned(page: Page): Promise<void> {
  await expect.poll(async () => page.evaluate(() => {
    const listbox = document.querySelector('[role="listbox"]')
    const input = document.querySelector('[data-testid="doc-ref-search-input"]')
    const picker = input?.closest('[class*="picker"]')
    if (!(listbox instanceof HTMLElement) || !(picker instanceof HTMLElement)) return false
    const listRect = listbox.getBoundingClientRect()
    const pickerRect = picker.getBoundingClientRect()
    return Math.abs(listRect.left - pickerRect.left) <= 2
      && Math.abs(listRect.width - pickerRect.width) <= 4
  })).toBe(true)
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
  await page.goto(`${BASE_URL}/?mockRole=MASTER#/groupware/approvals/new`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main.app-main')).toBeVisible({ timeout: 15_000 })
  await selectExpenseTemplate(page)
  await openReferencePicker(page)
  await page.setViewportSize({ width: 1280, height: 480 })

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
  await page.evaluate(() => {
    const input = document.querySelector('[data-testid="doc-ref-search-input"]')
    const main = document.querySelector('main.app-main')
    if (!(input instanceof HTMLElement) || !(main instanceof HTMLElement)) return
    const rect = input.getBoundingClientRect()
    main.scrollTop = Math.max(0, main.scrollTop + rect.top - 350)
    main.dispatchEvent(new Event('scroll'))
  })
  await waitForDropdownAligned(page)
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
    if (main instanceof HTMLElement) {
      main.scrollTop += 80
      main.dispatchEvent(new Event('scroll'))
    }
  })
  await waitForDropdownAligned(page)
  const scrollEvidence = await page.evaluate(() => {
    const optionNode = document.querySelector('[data-testid="doc-ref-search-option"]')
    const input = document.querySelector('[data-testid="doc-ref-search-input"]')
    const picker = input?.closest('[class*="picker"]')
    if (!(optionNode instanceof HTMLElement) || !(picker instanceof HTMLElement)) {
      return { closed: true, aligned: true }
    }
    const listboxRect = optionNode.parentElement?.getBoundingClientRect()
    const pickerRect = picker.getBoundingClientRect()
    if (!listboxRect) return { closed: true, aligned: true }
    const below = Math.abs(listboxRect.top - pickerRect.bottom - 4) <= 2
    const above = Math.abs(listboxRect.bottom - pickerRect.top + 4) <= 2
    return { closed: false, aligned: below || above }
  })
  expect(scrollEvidence.closed || scrollEvidence.aligned).toBe(true)

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
