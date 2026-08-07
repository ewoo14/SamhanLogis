import { chromium } from '../../../clients/desktop/node_modules/playwright/index.mjs'
import path from 'node:path'
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.mjs'
import { resolveQaCredential } from '../../../scripts/lib/qa-credentials.cjs'

const baseUrl = 'http://127.0.0.1:5441'
// _local 격리(2026-07-27 하네스 흡수 H2 — override 자체가 없어 재실행마다 커밋 증거를 덮어썼다).
const outputDir = resolveQaShotsDir(path.resolve('docs/qa/919-sol-round'))
const password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const ledgerOnly = process.argv.includes('--ledger-only')

if (!password) {
  throw new Error('QA_DEV_DEFAULT_PASSWORD 자격이 필요합니다.')
}

const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: 'ko-KR',
})
const authResponse = await context.request.post('http://localhost:8080/auth/login', {
  data: { loginId: 'dev_master', password },
})
if (authResponse.status() !== 200) {
  throw new Error(`로그인 실패: HTTP ${authResponse.status()}`)
}
const authBody = await authResponse.json()
const bearerToken = authBody?.data?.token
if (!bearerToken) {
  throw new Error('로그인 응답에 token이 없습니다.')
}
await context.route('http://localhost:8080/**', async (route) => {
  await route.continue({
    headers: {
      ...route.request().headers(),
      Authorization: `Bearer ${bearerToken}`,
    },
  })
})
const page = await context.newPage()
const consoleErrors = []
const measuredResponses = []

page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})

page.on('response', (response) => {
  const url = response.url()
  if (
    url.includes('/admin/sales-slips')
    || url.includes('/admin/purchase-slips')
    || url.includes('/admin/tax-invoices/inbound')
    || url.includes('/admin/tax-invoices/batch-from-sales-slips/candidates')
    || url.includes('/accounting/cash-receipts')
    || url.includes('/admin/accounting/ledgers/partners/search')
  ) {
    measuredResponses.push({ status: response.status(), url })
  }
})

async function go(route, rootTestId) {
  await page.goto(`${baseUrl}/#${route}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId(rootTestId).waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForTimeout(600)
}

async function setDateRange(fromIndex, toIndex, from, to) {
  const dates = page.locator('input[type="date"]')
  await dates.nth(fromIndex).fill(from)
  await dates.nth(toIndex).fill(to)
  await page.waitForTimeout(500)
}

async function fillPartnerAndCapture({
  rootTestId,
  value,
  endpointPart,
  screenshot,
  inputIndex = 0,
}) {
  const input = page.locator('input[placeholder="거래처 코드"]').nth(inputIndex)
  const responsePromise = page.waitForResponse((response) => {
    if (!response.url().includes(endpointPart)) return false
    const url = new URL(response.url())
    return url.searchParams.get('partnerCode') === value
  }, { timeout: 15_000 })
  await input.fill(value)
  const response = await responsePromise
  await page.waitForTimeout(500)
  const root = page.getByTestId(rootTestId)
  const rowCount = await root.locator('tbody tr').count()
  const text = (await root.innerText()).replace(/\s+/g, ' ').slice(0, 500)
  await page.screenshot({ path: path.join(outputDir, screenshot), fullPage: true })
  console.log(JSON.stringify({
    surface: rootTestId,
    input: value,
    status: response.status(),
    rowCount,
    text,
    screenshot,
  }))
}

async function runPartnerCodeScreen({
  route,
  rootTestId,
  endpointPart,
  dateIndexes,
  dateRange,
  normalCode,
  screenshotPrefix,
}) {
  await go(route, rootTestId)
  await setDateRange(dateIndexes[0], dateIndexes[1], dateRange[0], dateRange[1])
  for (const [suffix, value] of [
    ['percent', '%'],
    ['underscore', '_'],
    ['normal', normalCode],
  ]) {
    await fillPartnerAndCapture({
      rootTestId,
      value,
      endpointPart,
      screenshot: `${screenshotPrefix}-${suffix}.png`,
    })
  }
}

async function runCashReceipts() {
  await go('/accounting/admin/cash-receipts', 'cash-receipt-list-page')
  const input = page.getByTestId('cash-receipt-filter-slip-no')
  for (const [suffix, value] of [
    ['partial', '2026/07'],
    ['percent', '%'],
    ['underscore', '_'],
  ]) {
    await input.fill(value)
    const responsePromise = page.waitForResponse((response) => {
      if (!response.url().includes('/accounting/cash-receipts')) return false
      const url = new URL(response.url())
      return url.searchParams.get('slipNo') === value
    }, { timeout: 15_000 })
    await page.getByRole('button', { name: '검색', exact: true }).click()
    const response = await responsePromise
    await page.waitForTimeout(400)
    const root = page.getByTestId('cash-receipt-list-page')
    const rowCount = await root.locator('tbody tr').count()
    const text = (await root.innerText()).replace(/\s+/g, ' ').slice(0, 500)
    const screenshot = `13-cash-receipt-${suffix}.png`
    await page.screenshot({ path: path.join(outputDir, screenshot), fullPage: true })
    console.log(JSON.stringify({
      surface: 'cash-receipt-list-page',
      input: value,
      status: response.status(),
      rowCount,
      text,
      screenshot,
    }))
  }
}

async function runLedgerPartners() {
  await go('/groupware/approvals/new', 'groupware-approval-create-template')
  await page.getByRole('button', { name: '문서 참조 추가', exact: true }).click()
  await page.getByTestId('doc-ref-type-select').selectOption('PARTNER_LEDGER')
  const input = page.getByTestId('doc-ref-search-input')
  for (const [suffix, value] of [
    ['percent', '%'],
    ['underscore', '_'],
    ['normal', 'QA919'],
  ]) {
    const responsePromise = page.waitForResponse((response) => {
      if (!response.url().includes('/admin/accounting/ledgers/partners/search')) return false
      const url = new URL(response.url())
      return url.searchParams.get('q') === value
    }, { timeout: 15_000 })
    await input.fill(value)
    const response = await responsePromise
    await page.waitForTimeout(250)
    const options = page.getByTestId('doc-ref-search-option')
    const optionCount = await options.count()
    const optionText = await options.allInnerTexts()
    const firstOptionVisible = optionCount > 0 ? await options.first().isVisible() : false
    const listbox = page.locator('[role="listbox"]')
    const listboxBox = await listbox.boundingBox()
    const listboxStyle = await listbox.evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
        zIndex: style.zIndex,
      }
    })
    const screenshot = `16-ledger-partners-${suffix}.png`
    await page.screenshot({ path: path.join(outputDir, screenshot), fullPage: true })
    const optionScreenshot = `16-ledger-partners-${suffix}-options.png`
    if (firstOptionVisible) {
      await listbox.screenshot({ path: path.join(outputDir, optionScreenshot) })
    }
    console.log(JSON.stringify({
      surface: 'ledger-partners-picker',
      input: value,
      status: response.status(),
      optionCount,
      optionText,
      firstOptionVisible,
      listboxBox,
      listboxStyle,
      screenshot,
      optionScreenshot: firstOptionVisible ? optionScreenshot : null,
    }))
  }
}

try {
  console.log(JSON.stringify({ login: authResponse.status(), auth: 'Bearer [REDACTED]' }))

  if (!ledgerOnly) {
    await runPartnerCodeScreen({
      route: '/accounting/sales-slips',
      rootTestId: 'sales-accounting-slip-page',
      endpointPart: '/admin/sales-slips',
      dateIndexes: [0, 1],
      dateRange: ['2026-05-01', '2026-05-31'],
      normalCode: '1212532234',
      screenshotPrefix: '01-sales',
    })
    await runPartnerCodeScreen({
      route: '/accounting/purchase-slips',
      rootTestId: 'purchase-accounting-slip-page',
      endpointPart: '/admin/purchase-slips',
      dateIndexes: [0, 1],
      dateRange: ['2026-05-01', '2026-05-31'],
      normalCode: '5621102555',
      screenshotPrefix: '04-purchase',
    })
    await runPartnerCodeScreen({
      route: '/accounting/tax-invoices/inbound',
      rootTestId: 'tax-invoice-inbound-page',
      endpointPart: '/admin/tax-invoices/inbound',
      dateIndexes: [1, 2],
      dateRange: ['2026-07-01', '2026-07-24'],
      normalCode: 'QA919',
      screenshotPrefix: '07-inbound',
    })
    await runPartnerCodeScreen({
      route: '/accounting/tax-invoices/batch',
      rootTestId: 'tax-invoice-batch-issue-page',
      endpointPart: '/admin/tax-invoices/batch-from-sales-slips/candidates',
      dateIndexes: [1, 2],
      dateRange: ['2026-05-01', '2026-05-31'],
      normalCode: '010-4872-2432',
      screenshotPrefix: '10-batch',
    })
    await runCashReceipts()
  }
  await runLedgerPartners()

  console.log(JSON.stringify({
    measuredResponseCount: measuredResponses.length,
    non200Responses: measuredResponses.filter((item) => item.status !== 200),
    consoleErrorCount: consoleErrors.length,
    consoleErrors,
  }))
} finally {
  await context.close()
  await browser.close()
}
