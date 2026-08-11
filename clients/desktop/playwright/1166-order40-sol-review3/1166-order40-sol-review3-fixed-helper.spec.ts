import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const PARTNER_ORDER_API = 'http://127.0.0.1:28088'
const STUB_API = 'http://127.0.0.1:28084'
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/2026-08-11-order40-sol3'))
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'

function persistenceCounts(): string {
  const sql = [
    "SELECT 'orders='||count(*) FROM partner_orders",
    "UNION ALL SELECT 'lines='||count(*) FROM partner_order_lines",
    "UNION ALL SELECT 'history='||count(*) FROM partner_order_history",
    "UNION ALL SELECT 'revisions='||count(*) FROM partner_order_revisions;",
  ].join(' ')
  return execFileSync('docker', [
    'exec', 'sol3-1166-partner-order-db', 'psql', '-U', 'sol3qa',
    '-d', 'partner_order_db', '-Atc', sql,
  ], { encoding: 'utf8' }).trim()
}

test('dc-config 정상 + 불필요한 고정DC 보조 조회 실패 — 정상 주문 오차단 재현', async ({ page, request }) => {
  let confirmStatus: number | null = null
  let beforeConfirmCounts = ''
  let afterConfirmCounts = ''

  await request.post(`${STUB_API}/__qa/fixed-fail/on`)
  try {
    await page.route('**/api/v1/partner-orders/bootstrap', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify({ success: true, data: { payloads: {} } }),
      })
    })
    await page.route('**/api/v1/partner-orders/**', async (route) => {
      const target = route.request().url().replace(/^https?:\/\/[^/]+/, PARTNER_ORDER_API)
      if (/\/confirm$/.test(target)) beforeConfirmCounts = persistenceCounts()
      const response = await route.fetch({
        url: target,
        headers: {
          ...route.request().headers(),
          'X-User-Id': USER_ID,
          'X-User-Name': encodeURIComponent('SOL3 QA'),
          'X-Is-Partner': 'true',
          'X-Partner-Code': 'P-QA-40',
        },
      })
      if (/\/confirm$/.test(target)) {
        confirmStatus = response.status()
        afterConfirmCounts = persistenceCounts()
      }
      await route.fulfill({ response })
    })
    await page.route('**/app/version', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: null }) })
    })
    await page.route('https://t1.kakaocdn.net/**', (route) => route.abort())
    await page.route('https://cdnjs.cloudflare.com/**', (route) => route.abort())

    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(() => Boolean(window.google?.script?.run))
    await page.evaluate(() => new Promise<void>((resolve) => {
      const progress = document.getElementById('dlgProgress') as HTMLDialogElement
      const icon = document.getElementById('progressIcon') as HTMLElement
      const text = document.getElementById('progressText') as HTMLElement
      const buttons = document.getElementById('progressBtns') as HTMLElement
      progress.showModal()
      const runner = (window as typeof window & { google: any }).google.script.run
        .withSuccessHandler((result: { ok?: boolean; error?: string } | null) => {
          if (result?.ok) {
            icon.textContent = '✅'
            text.textContent = '전송이 완료되었습니다'
            buttons.style.display = 'none'
          } else {
            icon.textContent = '⚠️'
            text.textContent = '전송 실패\n' + (result?.error ?? '')
            buttons.style.display = 'block'
          }
          resolve()
        })
        .withFailureHandler((error: unknown) => {
          icon.textContent = '⚠️'
          text.textContent = '시스템 에러가 발생했습니다\n' + String(error)
          buttons.style.display = 'block'
          resolve()
        })
      runner.sendOrderFromUi([{
        section: 'HOME', name: '격리 QA 전열교환기', model: 'QA-HVAC-001',
        unit: 'EA', qty: 1, price: 600000,
        remarks: 'dc-config 정상인데 고정DC 보조 조회 500',
      }], {
        bizno: '1234567890', addr: '서울시 격리 QA구 보조 조회 오차단 검증',
        memo: 'SOL3 고정DC 없음 정상 주문 오차단', due: '2026-08-12', payDue: '2026-08-12',
      })
    }))

    const expected = '품목 고정 할인 기준을 확인할 수 없어 주문 가격을 계산할 수 없습니다'
    await expect(page.locator('#progressText')).toContainText(expected, { timeout: 30_000 })
    expect(confirmStatus).toBe(503)
    expect(afterConfirmCounts).toBe(beforeConfirmCounts)
    await page.screenshot({ path: path.join(SHOTS, '04-product-fixed-helper-500-overblocks-order.png'), fullPage: true })
    console.log(`FIXED_HELPER confirmStatus=${confirmStatus} before=${beforeConfirmCounts.replaceAll('\n', ',')} after=${afterConfirmCounts.replaceAll('\n', ',')} message=${await page.locator('#progressText').innerText()}`)
  } finally {
    await request.post(`${STUB_API}/__qa/fixed-fail/off`)
  }
})
