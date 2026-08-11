import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const here = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['S4_REAL_QA_BASE_URL'] ?? ''
const ORDER_ID = process.env['S4_REAL_QA_ORDER_ID'] ?? ''
const ESTIMATE_ID = process.env['S4_REAL_QA_ESTIMATE_ID'] ?? ''
const BASELINE_PATH = process.env['S4_REAL_QA_BASELINE_JSON'] ?? ''
const SHOTS = resolveQaShotsDir(path.resolve(here, '../../../../docs/qa/883-s4-order-ds-migration-real-qa'))

type ValueSet = {
  documentNumber: string
  statusLabel: string
  amount: string
  quantities: string[]
  documentNumbers?: string[]
}

type RedABaseline = {
  order: ValueSet
  estimate: ValueSet
  printPreview?: {
    order?: string[]
    estimate?: string[]
  }
}

function loadBaseline(): RedABaseline | null {
  if (!BASELINE_PATH) return null
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as RedABaseline
}

const baseline = loadBaseline()
const ready = Boolean(BASE_URL && ORDER_ID && ESTIMATE_ID && baseline)

function assertValues(body: string, values: ValueSet): void {
  expect(body).toContain(values.documentNumber)
  expect(body).toContain(values.statusLabel)
  expect(body).toContain(values.amount)
  for (const quantity of values.quantities) expect(body).toContain(quantity)
  for (const documentNumber of values.documentNumbers ?? []) {
    expect(body).toContain(documentNumber)
  }
}

async function openAndAssert(page: Page, route: string, values: ValueSet) {
  await page.goto(`${BASE_URL}/#/${route}`, { waitUntil: 'domcontentloaded' })
  await expect(page).toHaveURL(new RegExp(`#/${route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
  const body = await page.locator('body').innerText()
  assertValues(body, values)
  return body
}

test.describe('883 S4 RED-A — 주문서·견적서 DS 셸 전환 텍스트 계약', () => {
  test.skip(!ready, '격리 서비스 URL·세션과 전환 전 baseline JSON이 제공될 때만 실행합니다. 공유 DB 로그인은 하지 않습니다.')

  test('주문서 목록·상세의 값과 DS 상세 고유 요소', async ({ page }) => {
    if (!baseline) return
    await page.goto(`${BASE_URL}/#/sales/partner-orders`, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/#\/sales\/partner-orders$/)
    await expect(page.getByTestId('partner-order-audience-banner')).toBeVisible()
    const listText = await page.locator('body').innerText()
    expect(listText).toContain(baseline.order.documentNumber)

    const detailText = await openAndAssert(page, `sales/partner-orders/${encodeURIComponent(ORDER_ID)}`, baseline.order)
    await expect(page.locator('[data-order-number]').filter({ hasText: baseline.order.documentNumber }).first()).toBeVisible()
    await expect(page.locator('[data-status]').filter({ hasText: baseline.order.statusLabel }).first()).toBeVisible()
    await page.screenshot({ path: path.join(SHOTS, '01-order-detail-after.png'), fullPage: true })
    fs.writeFileSync(path.join(SHOTS, '01-order-detail-after.txt'), `${detailText}\n`, 'utf8')
  })

  test('견적서 목록·상세의 값과 detail-grid 셸', async ({ page }) => {
    if (!baseline) return
    await page.goto(`${BASE_URL}/#/sales/estimates`, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/#\/sales\/estimates$/)
    const listText = await page.locator('body').innerText()
    expect(listText).toContain(baseline.estimate.documentNumber)

    const detailText = await openAndAssert(page, `sales/estimates/${encodeURIComponent(ESTIMATE_ID)}`, baseline.estimate)
    await expect(page.getByTestId('estimate-detail-no')).toHaveText(baseline.estimate.documentNumber)
    await expect(page.locator('.detail-grid')).toBeVisible()
    await page.screenshot({ path: path.join(SHOTS, '02-estimate-detail-after.png'), fullPage: true })
    fs.writeFileSync(path.join(SHOTS, '02-estimate-detail-after.txt'), `${detailText}\n`, 'utf8')
  })

  test('인쇄·미리보기 텍스트 계약', async ({ page }) => {
    if (!baseline?.printPreview) return
    const print = baseline.printPreview.estimate ?? []
    if (print.length === 0) return
    await page.goto(`${BASE_URL}/#/sales/estimates/${encodeURIComponent(baseline.estimate.documentNumber)}/print`, {
      waitUntil: 'domcontentloaded',
    })
    const printText = await page.locator('body').innerText()
    for (const value of print) expect(printText).toContain(value)
    await page.screenshot({ path: path.join(SHOTS, '03-estimate-print-after.png'), fullPage: true })
    fs.writeFileSync(path.join(SHOTS, '03-estimate-print-after.txt'), `${printText}\n`, 'utf8')
  })
})
