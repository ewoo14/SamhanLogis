import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../../../scripts/lib/qa-shots-dir.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require('../../../qa/playwright/node_modules/@playwright/test')

const baseUrl = process.env.QA_BASE_URL || 'http://127.0.0.1:29390'
const attestation = process.env.SAMHAN_GATEWAY_ATTESTATION
const committedDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../docs/qa/1252-send-history-adversarial-real-qa',
)
const output = path.join(resolveQaShotsDir(committedDir), '01-real-data-history.png')
if (!attestation) throw new Error('SAMHAN_GATEWAY_ATTESTATION is required')
fs.mkdirSync(path.dirname(output), { recursive: true })

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
    if (response.url().includes('/api/v1/partner-orders/history')) {
      const body = await response.json().catch(() => null)
      historyResponses.push({ status: response.status(), body })
    }
  })

  await page.goto(`${baseUrl}/#/`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.locator('#btnHistory').waitFor({ state: 'attached', timeout: 120_000 })
  await page.waitForFunction(() => typeof window.google?.script?.run?.withSuccessHandler === 'function', null, {
    timeout: 120_000,
  })
  const historyButtonText = (await page.locator('#btnHistory').innerText()).trim()
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
  await page.waitForFunction(() => document.querySelectorAll('#historyBody tr').length === 117, null, {
    timeout: 120_000,
  })

  const rows = await page.locator('#historyBody tr').evaluateAll((items) => items.map((row) => ({
    text: row.textContent?.replace(/\s+/g, ' ').trim() || '',
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
  console.log(`SCREEN_FIRST_ROW=${rows[0]?.text || ''}`)
  console.log(`SCREEN_LAST_ROW=${rows.at(-1)?.text || ''}`)
  console.log(`SCREENSHOT=${output}`)
} finally {
  await browser.close()
}
