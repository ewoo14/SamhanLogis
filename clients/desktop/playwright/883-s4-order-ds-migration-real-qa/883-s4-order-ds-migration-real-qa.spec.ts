import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const here = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['S4_REAL_QA_BASE_URL'] ?? ''
const AUTH_BASE_URL = process.env['S4_REAL_QA_AUTH_BASE_URL'] ?? ''
const ORDER_ID = process.env['S4_REAL_QA_ORDER_ID'] ?? ''
const ESTIMATE_ID = process.env['S4_REAL_QA_ESTIMATE_ID'] ?? ''
const BASELINE_PATH = process.env['S4_REAL_QA_BASELINE_JSON'] ?? ''
const SHOTS = resolveQaShotsDir(path.resolve(here, '../../../../docs/qa/883-s4-order-ds-migration-real-qa'))

const ORDER_STATUS_LABELS = ['접수', '보류', '완료', '취소']
const ESTIMATE_STATUS_LABELS = ['작성중', '발송완료', '수주완료', '거절', '전표변환완료']

type ScreenContract = {
  documentNumber: string
  documentDate?: string
  dueOrValidDate?: string
  currentStatusLabel?: string
  amountValues: string[]
  quantityValues?: string[]
  productValues?: string[]
  allStatusLabels: string[]
}

type PrintContract = {
  values: string[]
}

type RedABaseline = {
  order: {
    list: ScreenContract
    detail: ScreenContract
    print: PrintContract
  }
  estimate: {
    list: ScreenContract
    detail: ScreenContract
    print: PrintContract
  }
}

function loadBaseline(): RedABaseline | null {
  if (!BASELINE_PATH) return null
  return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')) as RedABaseline
}

const baseline = loadBaseline()
const ready = Boolean(BASE_URL && AUTH_BASE_URL && ORDER_ID && ESTIMATE_ID && baseline)

/** 격리 auth-service에만 로그인한다. 공유 DB gateway URL은 환경변수로 주입하지 않으면 실행되지 않는다. */
async function installIsolatedAuth(page: Page): Promise<void> {
  const response = await page.request.post(`${AUTH_BASE_URL}/auth/login`, {
    data: {
      loginId: 'dev_master',
      password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'),
    },
  })
  expect(response.ok(), `격리 auth-service 로그인 실패: HTTP ${response.status()}`).toBeTruthy()
  const payload = (await response.json()) as { data?: { token?: string; userId?: string; role?: string; displayName?: string } }
  const auth = payload.data
  expect(auth?.token, '격리 로그인 응답에 token이 없습니다').toBeTruthy()

  await page.addInitScript((session) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => session,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, {
    token: auth?.token,
    userId: auth?.userId,
    role: auth?.role,
    fullName: auth?.displayName ?? 'dev_master',
    partnerCode: null,
  })
}

function expectRequiredContract(contract: ScreenContract, expectedStatuses: string[]): void {
  expect(contract.documentNumber).toBeTruthy()
  expect(contract.amountValues.length).toBeGreaterThan(0)
  expect(contract.allStatusLabels).toEqual(expectedStatuses)
}

async function assertAllStatusLabels(page: Page, labels: string[]): Promise<void> {
  const bodyText = await page.locator('body').innerText()
  for (const label of labels) {
    expect(bodyText, `화면에 상태 라벨이 없습니다: ${label}`).toContain(label)
  }
}

async function assertRowContract(row: Locator, contract: ScreenContract): Promise<void> {
  await expect(row).toBeVisible()
  await expect(row).toContainText(contract.documentNumber)
  for (const value of [contract.documentDate, contract.dueOrValidDate, ...contract.amountValues, ...(contract.quantityValues ?? []), ...(contract.productValues ?? [])]) {
    if (value) await expect(row).toContainText(value)
  }
}

async function assertDetailField(page: Page, label: string, value: string): Promise<void> {
  const field = page.locator('.detail-grid > div').filter({ hasText: label }).filter({ hasText: value }).first()
  await expect(field, `상세 필드 [${label}]에 [${value}]가 없습니다`).toBeVisible()
}

async function assertLineValues(page: Page, contract: ScreenContract): Promise<void> {
  for (const product of contract.productValues ?? []) {
    const line = page.getByRole('row').filter({ hasText: product }).first()
    await expect(line, `품목 라인에 [${product}]가 없습니다`).toBeVisible()
    for (const quantity of contract.quantityValues ?? []) await expect(line).toContainText(quantity)
  }
}

async function assertButtonStyle(button: Locator): Promise<void> {
  await expect(button).toBeVisible()
  const style = await button.evaluate((element) => {
    const computed = window.getComputedStyle(element)
    return {
      className: element.getAttribute('class') ?? '',
      padding: computed.padding,
      fontSize: computed.fontSize,
      cursor: computed.cursor,
    }
  })
  expect(style.className).not.toBe('')
  expect(style.padding).toBe('6px 10px')
  expect(style.fontSize).toBe('12px')
  expect(style.cursor).toBe('pointer')
}

async function saveText(page: Page, name: string, text: string): Promise<void> {
  fs.writeFileSync(path.join(SHOTS, name), `${text}\n`, 'utf8')
}

test.describe('883 S4 RED-A — 격리 auth 기반 주문·견적 DS 셸 전수 계약', () => {
  test.skip(
    !ready,
    '격리 renderer URL·격리 auth-service URL·주문/견적 ID·확장 baseline JSON이 모두 필요합니다. 공유 DB 로그인 fallback은 없습니다.',
  )
  test.describe.configure({ mode: 'serial' })

  test.beforeEach(async ({ page }) => {
    await installIsolatedAuth(page)
  })

  test.afterEach(async ({ context }) => {
    for (const extraPage of context.pages().slice(1)) await extraPage.close()
  })

  test('설정 화면 7개 btnMini 버튼이 실제 스타일을 유지한다', async ({ page }) => {
    await page.goto(`${BASE_URL}/#/sales/partner-dc-config`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('거래처 DC 설정', { exact: true })).toBeVisible()

    await assertButtonStyle(page.getByRole('button', { name: '검색', exact: true }))
    await assertButtonStyle(page.getByTestId('admin-dcconfig-import-button'))
    const firstRow = page.getByRole('row').nth(1)
    await assertButtonStyle(firstRow.getByRole('button', { name: '저장', exact: true }))
    await assertButtonStyle(firstRow.getByRole('button', { name: '보기', exact: true }))
    await firstRow.getByRole('button', { name: '보기', exact: true }).click()
    const auditPanel = page.getByTestId('partner-dc-config-audit-panel')
    await expect(auditPanel).toBeVisible()
    await assertButtonStyle(auditPanel.getByRole('button', { name: '닫기', exact: true }))
    await auditPanel.getByRole('button', { name: '닫기', exact: true }).click()

    await page.goto(`${BASE_URL}/#/sales/estimate-config`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('견적 가격 설정', { exact: true })).toBeVisible()
    await assertButtonStyle(page.getByRole('button', { name: '되돌리기', exact: true }))
    await assertButtonStyle(page.locator('.topActions').getByRole('button', { name: /^(저장|조회 전용)$/ }).first())
    await page.screenshot({ path: path.join(SHOTS, '00-settings-btn-mini-after.png'), fullPage: true })
  })

  test('주문 목록·상세가 금액·수량·상태·문서번호·날짜·고유 기능을 전수 보존한다', async ({ page }) => {
    if (!baseline) throw new Error('baseline이 준비되지 않았습니다')
    expectRequiredContract(baseline.order.list, ORDER_STATUS_LABELS)
    expectRequiredContract(baseline.order.detail, ORDER_STATUS_LABELS)

    await page.goto(`${BASE_URL}/#/sales/partner-orders`, { waitUntil: 'domcontentloaded' })
    const listRow = page.getByRole('row').filter({ hasText: baseline.order.list.documentNumber }).first()
    await assertRowContract(listRow, baseline.order.list)
    await assertAllStatusLabels(page, baseline.order.list.allStatusLabels)

    const detailText = await openOrderDetail(page, baseline.order.detail)
    await assertAllStatusLabels(page, baseline.order.detail.allStatusLabels)
    await expect(page.locator('[data-order-number]').filter({ hasText: baseline.order.detail.documentNumber }).first()).toBeVisible()
    if (baseline.order.detail.currentStatusLabel) {
      await expect(page.locator('[data-status]').filter({ hasText: baseline.order.detail.currentStatusLabel }).first()).toBeVisible()
    }
    if (baseline.order.detail.dueOrValidDate) await assertDetailField(page, '납기', baseline.order.detail.dueOrValidDate)
    expect(baseline.order.detail.quantityValues?.length).toBeGreaterThan(0)
    expect(baseline.order.detail.productValues?.length).toBeGreaterThan(0)
    await assertLineValues(page, baseline.order.detail)
    await expect(page.getByTestId('partner-order-collab-edit-open')).toBeVisible()
    await expect(page.getByTestId('partner-order-inventory-lookup-btn')).toBeDisabled()
    await expect(page.getByTestId('partner-order-line-lookup-btn')).toBeVisible()
    await page.screenshot({ path: path.join(SHOTS, '01-order-detail-after.png'), fullPage: true })
    await saveText(page, '01-order-detail-after.txt', detailText)
  })

  test('견적 목록·상세가 금액·수량·상태·문서번호·날짜와 detail-grid를 전수 보존한다', async ({ page }) => {
    if (!baseline) throw new Error('baseline이 준비되지 않았습니다')
    expectRequiredContract(baseline.estimate.list, ESTIMATE_STATUS_LABELS)
    expectRequiredContract(baseline.estimate.detail, ESTIMATE_STATUS_LABELS)

    await page.goto(`${BASE_URL}/#/sales/estimates`, { waitUntil: 'domcontentloaded' })
    const listRow = page.getByRole('row').filter({ hasText: baseline.estimate.list.documentNumber }).first()
    await assertRowContract(listRow, baseline.estimate.list)
    await assertAllStatusLabels(page, baseline.estimate.list.allStatusLabels)

    const detailText = await openEstimateDetail(page, baseline.estimate.detail)
    await assertAllStatusLabels(page, baseline.estimate.detail.allStatusLabels)
    await expect(page.getByTestId('estimate-detail-no')).toHaveText(baseline.estimate.detail.documentNumber)
    await expect(page.locator('.detail-grid')).toBeVisible()
    if (baseline.estimate.detail.currentStatusLabel) {
      await expect(page.getByText(baseline.estimate.detail.currentStatusLabel, { exact: true }).first()).toBeVisible()
    }
    if (baseline.estimate.detail.documentDate) await assertDetailField(page, '작성일', baseline.estimate.detail.documentDate)
    if (baseline.estimate.detail.dueOrValidDate) await assertDetailField(page, '유효기간', baseline.estimate.detail.dueOrValidDate)
    expect(baseline.estimate.detail.quantityValues?.length).toBeGreaterThan(0)
    expect(baseline.estimate.detail.productValues?.length).toBeGreaterThan(0)
    await assertLineValues(page, baseline.estimate.detail)
    await expect(page.getByTestId('estimate-detail-totals')).toContainText(baseline.estimate.detail.amountValues[baseline.estimate.detail.amountValues.length - 1] ?? '')
    await page.screenshot({ path: path.join(SHOTS, '02-estimate-detail-after.png'), fullPage: true })
    await saveText(page, '02-estimate-detail-after.txt', detailText)
  })

  test('주문 인쇄 HTML과 견적 브라우저 미리보기의 문자열을 전수 보존한다', async ({ page, context }) => {
    if (!baseline) throw new Error('baseline이 준비되지 않았습니다')
    await openOrderDetail(page, baseline.order.detail)
    const orderPopupPromise = page.waitForEvent('popup')
    await page.getByTestId('partner-order-print-open').click()
    const orderPopup = await orderPopupPromise
    await orderPopup.waitForLoadState('domcontentloaded')
    const orderPrintText = await orderPopup.locator('body').innerText()
    for (const value of baseline.order.print.values) expect(orderPrintText).toContain(value)
    await saveText(page, '06-order-print-html.txt', orderPrintText)
    await orderPopup.close()

    await page.goto(`${BASE_URL}/#/sales/estimates/${encodeURIComponent(baseline.estimate.detail.documentNumber)}`, {
      waitUntil: 'domcontentloaded',
    })
    const estimatePrintPagePromise = context.waitForEvent('page')
    await page.getByTestId('estimate-detail-print-button').click()
    const estimatePrintPage = await estimatePrintPagePromise
    await estimatePrintPage.waitForLoadState('domcontentloaded')
    const estimatePrintText = await estimatePrintPage.locator('body').innerText()
    for (const value of baseline.estimate.print.values) expect(estimatePrintText).toContain(value)
    await estimatePrintPage.screenshot({ path: path.join(SHOTS, '03-estimate-print-after.png'), fullPage: true })
    await saveText(page, '03-estimate-print-after.txt', estimatePrintText)
    await estimatePrintPage.close()
  })
})

async function openOrderDetail(page: Page, contract: ScreenContract): Promise<string> {
  await page.goto(`${BASE_URL}/#/sales/partner-orders/${encodeURIComponent(ORDER_ID)}`, {
    waitUntil: 'domcontentloaded',
  })
  await expect(page).toHaveURL(/#\/sales\/partner-orders\//)
  const text = await page.locator('body').innerText()
  await expect(page.locator('[data-order-number]').filter({ hasText: contract.documentNumber }).first()).toBeVisible()
  return text
}

async function openEstimateDetail(page: Page, contract: ScreenContract): Promise<string> {
  await page.goto(`${BASE_URL}/#/sales/estimates/${encodeURIComponent(ESTIMATE_ID)}`, {
    waitUntil: 'domcontentloaded',
  })
  await expect(page).toHaveURL(/#\/sales\/estimates\//)
  const text = await page.locator('body').innerText()
  await expect(page.getByTestId('estimate-detail-no')).toHaveText(contract.documentNumber)
  return text
}
