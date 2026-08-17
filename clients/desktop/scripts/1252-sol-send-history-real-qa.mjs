import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('../../../qa/playwright/node_modules/@playwright/test')
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:29490'
const attestation = process.env.SAMHAN_GATEWAY_ATTESTATION
if (!attestation) throw new Error('SAMHAN_GATEWAY_ATTESTATION is required')

const committedDir = path.resolve(
  __dirname,
  '../../../docs/qa/1252-send-history-adversarial-real-qa',
)
const shotsDir = resolveQaShotsDir(committedDir)
const output = path.join(shotsDir, '02-sol-real-data-history.png')

const browser = await chromium.launch({ headless: true })
try {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1400 },
    extraHTTPHeaders: {
      'X-User-Id': 'a0000000-0000-0000-0000-000000000003',
      'X-Is-Partner': 'true',
      'X-Partner-Code': 'P-2026-0009',
      'X-Samhan-Gateway-Attestation': attestation,
    },
  })
  const page = await context.newPage()
  const historyResponses = []
  page.on('response', async (response) => {
    if (!response.url().includes('/api/v1/partner-orders/history')) return
    const body = await response.json().catch(() => null)
    historyResponses.push({ url: response.url(), status: response.status(), body })
  })

  await page.goto(`${baseUrl}/#/`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  const historyButton = page.locator('#btnHistory')
  await historyButton.waitFor({ state: 'attached', timeout: 120_000 })
  await page.waitForFunction(
    () => typeof window.google?.script?.run?.withSuccessHandler === 'function',
    null,
    { timeout: 120_000 },
  )
  const historyButtonText = (await historyButton.innerText()).trim()
  if (historyButtonText !== '과거 발송내역 확인') {
    throw new Error(`발송내역 전용 요소 불일치: ${historyButtonText}`)
  }

  await page.evaluate(() => {
    window.CURRENT_BIZNO = '2176310279'
    window.AUTH_BIZ = '2176310279'
    document.body.classList.remove('no-active')
    document.body.classList.add('history-active')
    document.querySelector('#btnHistory')?.removeAttribute('hidden')
    for (const id of ['pageBizGate', 'mobileGate', 'pageLoading', 'gateImageModal']) {
      const element = document.getElementById(id)
      if (element) {
        element.classList.add('hidden')
        element.style.display = 'none'
      }
    }
  })
  await page.locator('#pageHistory').waitFor({ state: 'visible' })
  await page.locator('#histStart').fill('2026-06-08')
  await page.locator('#histEnd').fill('2026-06-08')
  await page.evaluate(() => window.fetchOrderHistory())
  await page.waitForFunction(
    () => document.querySelectorAll('#historyBody tr').length === 117,
    null,
    { timeout: 120_000 },
  )

  const rows = await page.locator('#historyBody tr').evaluateAll((items) => items.map((row) => ({
    cells: Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent?.replace(/\s+/g, ' ').trim() || ''),
    deletedClass: row.classList.contains('history-deleted-row'),
    color: getComputedStyle(row).color,
    textDecoration: getComputedStyle(row).textDecorationLine,
  })))
  await page.screenshot({ path: output, fullPage: true })

  const pages = historyResponses.map((item) => item.body?.data).filter(Boolean)
  const apiRows = pages.flatMap((item) => item.content || [])
  const uniqueOrderNos = new Set(apiRows.map((item) => item.orderNo))
  const orderCounts = new Map()
  for (const row of apiRows) orderCounts.set(row.orderNo, (orderCounts.get(row.orderNo) || 0) + 1)
  const duplicates = [...orderCounts.entries()].filter(([, count]) => count > 1)

  console.log(`ROUTE=${page.url()}`)
  console.log(`SCREEN_ONLY_ASSERT=#btnHistory:${historyButtonText}|#pageHistory:visible`)
  console.log('SELECTED_BIZ_CODE=2176310279')
  console.log(`HISTORY_HTTP_CALLS=${historyResponses.length}`)
  console.log(`HISTORY_HTTP_STATUSES=${historyResponses.map((item) => item.status).join(',')}`)
  console.log(`API_PAGE_CONTENT_COUNTS=${pages.map((item) => item.content?.length ?? 0).join(',')}`)
  console.log(`API_TOTAL_ELEMENTS=${pages[0]?.totalElements ?? 'NONE'}`)
  console.log(`API_COLLECTED_ROWS=${apiRows.length}`)
  console.log(`API_UNIQUE_ORDER_NOS=${uniqueOrderNos.size}`)
  console.log(`API_DUPLICATES=${duplicates.map(([orderNo, count]) => `${orderNo}:${count}`).join(',') || 'NONE'}`)
  console.log(`SCREEN_DOM_ROWS=${rows.length}`)
  console.log(`SCREEN_DELETED_ROWS=${rows.filter((row) => row.deletedClass).length}`)
  console.log(`SCREEN_STRIKETHROUGH_ROWS=${rows.filter((row) => row.textDecoration.includes('line-through')).length}`)
  console.log(`SCREEN_ROW_COLOR_SET=${[...new Set(rows.map((row) => row.color))].join(',')}`)
  console.log('--- SCREEN TOP20 DISPLAY ORDER ---')
  rows.slice(0, 20).forEach((row, index) => {
    console.log(`${String(index + 1).padStart(2, '0')}|${row.cells.join('|')}`)
  })
  console.log(`SCREENSHOT=${output}`)
} finally {
  await browser.close()
}
