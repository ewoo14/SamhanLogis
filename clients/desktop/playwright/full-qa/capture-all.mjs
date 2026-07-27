import { resolveMockQaShotsDir } from '../support/qa-screenshot-dir.mjs'
/**
 * 전 기능 Docker 실 QA — 데스크톱 화면 일괄 캡처 (2026-05-30).
 *
 * 현행 main 풀스택(:8080 게이트웨이) 대상으로 desktop renderer(web :5173)를 헤드리스 chromium 으로
 * 구동, 데스크톱 전 영역 화면을 실사용처럼 진입해 캡처한다. 각 화면의 백엔드 호출은 **실 게이트웨이로
 * 그대로** 나가므로(브리지 없음), 동작 화면은 데이터가 뜨고 깨진 화면은 실제 에러/빈 화면이 그대로 찍힌다.
 *
 * 유일한 stub: GET /auth/admin/permissions/my → MASTER 전체 page×7action (RC1 게이트웨이 격차로
 * 권한매트릭스가 403 이라 PermissionGuard 가 모든 화면을 막기 때문 — RC1 자체가 결함이며, 화면에
 * 도달하기 위한 최소 우회). 그 외 모든 호출은 실 게이트웨이.
 *
 * 산출: docs/qa/full-desktop-qa-2026-05-30/screens/*.png + console-errors.json
 */
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = resolveMockQaShotsDir(resolve(__dirname, '../../../../docs/qa/full-desktop-qa-2026-05-30/screens'));
const BASE = 'http://127.0.0.1:5173'
const CODES = JSON.parse(fs.readFileSync(resolve(__dirname, 'pagecodes.json'), 'utf8'))
const ACTIONS = ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'DOWNLOAD', 'PRINT']
const matrix = Object.fromEntries(CODES.map((c) => [c, ACTIONS]))

const LOGIN_ID = process.env.QA_MASTER_ID || 'dev_master'
const PW = process.env.QA_MASTER_PW
if (!PW) { console.error('QA_MASTER_PW 환경변수 필요'); process.exit(2) }

const SHIM = `(()=>{const K='__qa_auth';const r=()=>{try{return JSON.parse(localStorage.getItem(K)||'null')}catch{return null}};window.samhanAuth={getToken:async()=>r(),setToken:async a=>localStorage.setItem(K,JSON.stringify(a)),clearToken:async()=>localStorage.removeItem(K)};window.samhanLegacy={getEstimateUrl:async()=>'',openExternal:async()=>{}};})();`

const SCREENS = [
  ['dashboard', '/'],
  ['notifications', '/notifications'],
  // 거래처/마스터데이터
  ['partners-list', '/admin/partners'],
  ['partners-new', '/admin/partners/new'],
  ['blocked-partners', '/admin/blocked-partners'],
  ['permission-matrix', '/admin/permission-matrix'],
  ['permission-matrix-bulk', '/admin/permission-matrix/bulk'],
  ['regions', '/admin/regions'],
  ['sheet-sync', '/admin/sheet-sync'],
  ['chat-rooms', '/admin/chat-rooms'],
  ['aligo-address-book', '/admin/aligo-address-book'],
  ['accounting-edit-requests', '/admin/accounting-edit-requests'],
  ['slip-edit-requests', '/admin/slip-edit-requests'],
  ['photo-audit', '/admin/photo-audit'],
  // 판매/전표
  ['sales-list', '/sales'],
  ['sales-slips', '/sales/slips'],
  ['sales-query', '/sales/query'],
  ['estimates-list', '/sales/estimates'],
  ['estimates-new', '/sales/estimates/new'],
  ['partner-orders', '/sales/partner-orders'],
  ['order-approvals', '/sales/order-approvals'],
  ['partner-dc-config', '/sales/partner-dc-config'],
  ['sales-closing', '/sales/closing'],
  ['next-day-slip', '/sales/next-day-slip'],
  ['slip-cleanup', '/sales/slip-cleanup'],
  ['link-dispatch', '/sales/link-dispatch'],
  // 구매
  ['purchases-list', '/purchases'],
  ['purchases-query', '/purchases/query'],
  ['purchases-slips', '/purchases/slips'],
  // 재고
  ['safety-stock-alerts', '/inventory/safety-stock-alerts'],
  // 회계
  ['acc-accounts', '/accounting/accounts'],
  ['acc-balances', '/accounting/balances'],
  ['acc-journals', '/accounting/journals'],
  ['acc-ledgers', '/accounting/ledgers'],
  ['acc-reports', '/accounting/reports'],
  ['acc-income-statement', '/accounting/reports/income-statement'],
  ['acc-balance-sheet', '/accounting/reports/balance-sheet'],
  ['acc-vat', '/accounting/reports/vat'],
  ['acc-daily-closing', '/accounting/daily-closing'],
  ['acc-partner-ledger', '/accounting/partner-ledger'],
  ['acc-tax-invoices', '/accounting/tax-invoices'],
  ['acc-period-close', '/accounting/period-close'],
  ['acc-orders', '/accounting/admin/orders'],
  // 아로로지스
  ['arologis-pre-classify', '/arologis/pre-classify'],
  ['arologis-unassigned', '/arologis/unassigned'],
  ['arologis-manual', '/arologis/manual'],
  ['arologis-manual-dispatch', '/arologis/admin/manual-dispatch'],
  ['arologis-driver-assignment', '/arologis/admin/driver-assignment'],
  ['arologis-auto-dispatch', '/arologis/admin/auto-dispatch'],
  ['arologis-dispatch-sms', '/arologis/dispatch-sms'],
  ['dispatch-board', '/dispatch-board'],
  ['dispatch-reconcile', '/arologis/dispatch-reconcile'],
]

const consoleErrors = {}
let current = 'init'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 980 }, locale: 'ko-KR' })
  await context.addInitScript(SHIM)
  await context.route('**', async (route) => {
    const u = new URL(route.request().url())
    if (u.pathname === '/auth/admin/permissions/my') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, code: 'OK', message: '성공', data: matrix, timestamp: new Date().toISOString() }) })
    }
    return route.continue()
  })

  const page = await context.newPage()
  page.on('console', (m) => { if (m.type() === 'error') (consoleErrors[current] = consoleErrors[current] || []).push(m.text().slice(0, 200)) })
  page.on('pageerror', (e) => { (consoleErrors[current] = consoleErrors[current] || []).push('PAGEERROR ' + String(e.message).slice(0, 200)) })

  // 로그인 (실 게이트웨이)
  current = 'login'
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=login-id-input]', { timeout: 30000 })
  await page.fill('[data-testid=login-id-input]', LOGIN_ID)
  await page.fill('[data-testid=login-password-input]', PW)
  await page.screenshot({ path: `${OUT}/00-login.png`, fullPage: true })
  await page.click('[data-testid=login-submit-button]')
  await page.waitForFunction(() => !location.hash.includes('login'), { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(1500)

  let i = 0
  for (const [name, route] of SCREENS) {
    i += 1
    current = name
    const file = `${OUT}/${String(i).padStart(2, '0')}-${name}.png`
    try {
      await page.goto(`${BASE}/#${route}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(1800)
      await page.screenshot({ path: file, fullPage: true })
      console.log(`  📸 ${String(i).padStart(2, '0')}-${name}  (err:${(consoleErrors[name] || []).length})`)
    } catch (e) {
      try { await page.screenshot({ path: file, fullPage: true }) } catch {}
      console.log(`  ⚠️  ${name}: ${String(e.message).slice(0, 80)}`)
    }
  }

  fs.writeFileSync(resolve(OUT, 'console-errors.json'), JSON.stringify(consoleErrors, null, 2))
  await browser.close()
  console.log(`DONE — ${SCREENS.length + 1} screens, console-errors.json 기록`)
}

main().catch((e) => { console.error('CAPTURE FAILED:', e?.stack || e); process.exit(1) })
