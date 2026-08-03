import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from '@playwright/test'

const scenario = Number(process.argv[2])
const here = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(here, '../..')
const repoRoot = path.resolve(desktopRoot, '../..')
const shots = path.join(repoRoot, 'docs/qa/1001-partner-ledger-real-qa')
const password = process.env.QA_PASSWORD
if (!password) throw new Error('QA_PASSWORD 환경변수가 필요합니다.')
if (!Number.isInteger(scenario) || scenario < 1 || scenario > 7) throw new Error('시나리오 번호 1~7이 필요합니다.')
fs.mkdirSync(shots, { recursive: true })

const app = await electron.launch({
  executablePath: path.join(desktopRoot, 'node_modules/electron/dist/electron.exe'),
  args: [desktopRoot, `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'samhan-1001-electron-'))}`, '--disable-gpu'],
  env: { ...process.env, VITE_API_BASE_URL: 'http://127.0.0.1:8080' },
})
const page = await app.firstWindow()
const browserErrors = []
page.on('console', (message) => {
  if (message.type() === 'error') browserErrors.push(message.text())
})
page.on('pageerror', (error) => browserErrors.push(`pageerror: ${error.message}`))

async function capture(name, target = page) {
  const file = path.join(shots, name)
  await target.screenshot({ path: file, fullPage: true })
  return file
}

async function loginAndOpenLedger() {
  await page.waitForLoadState('domcontentloaded')
  await page.waitForSelector('[data-testid="login-id-input"]', { timeout: 20000 })
  await page.locator('[data-testid="login-id-input"]').fill('dev_master')
  await page.locator('[data-testid="login-password-input"]').fill(password)
  await page.locator('[data-testid="login-submit-button"]').click()
  await page.getByText('대시보드', { exact: true }).waitFor({ timeout: 30000 })
  await page.goto(`file://${path.join(desktopRoot, 'out/renderer/index.html').replaceAll('\\', '/')}#/accounting/partner-ledger`)
  await page.waitForSelector('[data-testid="partner-ledger-from"]', { timeout: 30000 })
}

async function query(from, to, partner = '') {
  await page.locator('[data-testid="partner-ledger-from"]').fill(from)
  await page.locator('[data-testid="partner-ledger-to"]').fill(to)
  await page.locator('[data-testid="partner-ledger-partner"]').fill(partner)
  await page.locator('[data-testid="partner-ledger-search"]').click()
  await page.waitForTimeout(15000)
}

function visibleText(locator) {
  return locator.innerText().catch(() => '')
}

async function aggregateRows() {
  return page.locator('[data-testid="partner-ledger-aggregate-table"] tbody tr').evaluateAll((rows) =>
    rows.map((row) => ({
      testId: row.getAttribute('data-testid'),
      cells: Array.from(row.querySelectorAll('td')).map((cell) => cell.innerText.trim()),
    })),
  ).catch(() => [])
}

async function alerts(target = page) {
  return target.locator('[role="alert"]').allInnerTexts().catch(() => [])
}

async function run() {
  await loginAndOpenLedger()

  if (scenario === 1) {
    await query('2026-02-01', '2026-03-31')
    const file = await capture('01-period-query.png')
    const rows = await aggregateRows()
    console.log(JSON.stringify({ scenario, file, aggregateCount: rows.length, rows, alerts: await alerts(), body: (await visibleText(page.locator('body'))).slice(0, 18000), browserErrors }, null, 2))
  }

  if (scenario === 2 || scenario === 3 || scenario === 4 || scenario === 5) {
    await query('2026-02-01', '2026-03-31')
    const rows = await aggregateRows()
    const row = page.locator('[data-testid="partner-ledger-aggregate-row-P-2026-0017"]')
    await row.click()
    await page.waitForTimeout(3500)
    if (scenario === 2) {
      const file = await capture('02-selected-detail.png')
      console.log(JSON.stringify({ scenario, file, selectedRow: await visibleText(row), detailVisible: await page.locator('[data-testid="partner-ledger-detail-table"]').isVisible().catch(() => false), alerts: await alerts(), body: (await visibleText(page.locator('body'))).slice(0, 22000), browserErrors }, null, 2))
    }
    if (scenario === 3) {
      const file = await capture('03-amount-consistency.png')
      const aggregateCells = await row.locator('td').allInnerTexts()
      const totalCells = await page.locator('[data-testid="partner-ledger-detail-table"] tfoot tr td').allInnerTexts().catch(() => [])
      const detailLastBalance = await page.locator('[data-testid="partner-ledger-detail-table"] tbody tr td:last-child').allInnerTexts().catch(() => [])
      console.log(JSON.stringify({ scenario, file, aggregateCells, totalCells, detailLastBalance, alerts: await alerts(), browserErrors }, null, 2))
    }
    if (scenario === 4) {
      const file = await capture('04-cumulative-balance.png')
      const balanceCells = await page.locator('[data-testid="partner-ledger-detail-table"] tbody tr td:last-child').allInnerTexts().catch(() => [])
      console.log(JSON.stringify({ scenario, file, detailLineCount: balanceCells.length, balanceCells, nonZeroBalance: balanceCells.filter((value) => value.trim() && value.trim() !== '—' && value.trim() !== '0').length, alerts: await alerts(), browserErrors }, null, 2))
    }
    if (scenario === 5) {
      const popupPromise = app.waitForEvent('window', { timeout: 15000 }).catch(() => null)
      await page.locator('[data-testid="partner-ledger-print-button"]').click()
      const printPage = await popupPromise
      await page.waitForTimeout(3000)
      const target = printPage ?? app.windows().find((candidate) => candidate !== page) ?? page
      const file = await capture('05-print-preview.png', target)
      const printBody = await visibleText(target.locator('body'))
      const amountTexts = await target.locator('body').innerText().catch(() => '')
      console.log(JSON.stringify({ scenario, file, printUrl: target.url(), printBody: printBody.slice(0, 26000), totalCount: (amountTexts.match(/합계/g) ?? []).length, endingBalanceCount: (amountTexts.match(/기말잔액/g) ?? []).length, negativeRedCells: await target.locator('td').evaluateAll((cells) => cells.filter((cell) => getComputedStyle(cell).color.includes('220, 38, 38')).map((cell) => cell.innerText.trim())).catch(() => []), alerts: await alerts(target), browserErrors }, null, 2))
      if (printPage) await printPage.close().catch(() => {})
    }
  }

  if (scenario === 6) {
    await query('2026-06-01', '2026-06-30')
    const file = await capture('06-unfiltered-code-only.png')
    const rows = await aggregateRows()
    const gateRows = rows.filter((row) => row.cells.some((cell) => cell.includes('QA-GATE-A') || cell.includes('QA-GATE-B')))
    console.log(JSON.stringify({ scenario, file, aggregateCount: rows.length, gateRows, allRows: rows, alerts: await alerts(), body: (await visibleText(page.locator('body'))).slice(0, 22000), browserErrors }, null, 2))
  }

  if (scenario === 7) {
    await query('2026-06-01', '2026-06-30')
    const row = page.locator('[data-testid="partner-ledger-aggregate-row-QA-GATE-A"]')
    await row.click()
    await page.waitForTimeout(3000)
    const file = await capture('07-uuid-hidden.png')
    const body = await visibleText(page.locator('body'))
    const uuidHits = body.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi) ?? []
    const slipLikeHits = body.match(/\b(?:[0-9]{4}\/){2}[0-9]{2}-[0-9]+\b/g) ?? []
    console.log(JSON.stringify({ scenario, file, uuidHits, slipLikeHits, body: body.slice(0, 22000), alerts: await alerts(), browserErrors }, null, 2))
  }
}

try {
  await run()
} finally {
  await app.close()
}
