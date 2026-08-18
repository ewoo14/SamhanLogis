import { expect, test, type Page, type Route } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const here = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5942'
const SHARED_API = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const BRANCH_INVENTORY = process.env['BRANCH_INVENTORY_BASE'] ?? 'http://127.0.0.1:28085'
const BRANCH_SLIP = process.env['BRANCH_SLIP_BASE'] ?? 'http://127.0.0.1:28086'
const FROM = '2025-01-01'
const TO = '2026-08-17'
const SHOTS = resolveQaShotsDir(path.resolve(here, '../../../../docs/qa/1271-live-capture'))
const INPUTS = path.join(SHOTS, 'inputs')
fs.mkdirSync(INPUTS, { recursive: true })
let authToken = ''
let authUserId = ''

type InboundRow = {
  slipNo: string
  slipDate: string
  partnerCode: string | null
  partnerName: string | null
  productCode: string
  productName: string | null
  quantity: number
  totalAmount: number
}

function makeXlsx(rows: InboundRow[], fileName: string, amountIndex = -1, qtyIndex = -1): string {
  const jsonPath = path.join(INPUTS, `${fileName}.json`)
  fs.writeFileSync(jsonPath, JSON.stringify({ rows, amountIndex, qtyIndex }), 'utf8')
  const xlsxPath = path.join(INPUTS, `${fileName}.xlsx`)
  const python = [
    'import json, sys',
    'from openpyxl import Workbook',
    'payload=json.load(open(sys.argv[1], encoding="utf-8"))',
    'wb=Workbook(); ws=wb.active; ws.title="DPS 원본"',
    'ws.append(["DPS 입고 내역 export"]); ws.append(["조회 원본"]); ws.append(["표지"]);',
    'ws.append(["납품일자","납품번호","모델","수량","매입단가","공급가","인도처명","부가세","합계"])',
    'for i,r in enumerate(payload["rows"]):',
    '  total=float(r.get("totalAmount") or 0); qty=int(r.get("quantity") or 0)',
    '  if i == payload["amountIndex"]: total += 1000',
    '  if i == payload["qtyIndex"]: qty += 1',
    '  ws.append([r.get("slipDate"),r.get("slipNo"),r.get("productCode"),qty,0,total,r.get("partnerName") or "",0,total])',
    'wb.save(sys.argv[2])',
  ].join('\n')
  execFileSync('python', ['-', jsonPath, xlsxPath], { input: python, stdio: ['pipe', 'pipe', 'pipe'] })
  return xlsxPath
}

async function login(page: Page): Promise<void> {
  const loginResponse = await page.request.post('http://localhost:8080/auth/login', {
    data: {
      loginId: resolveQaCredential('QA_DEV_MANAGER_LOGIN_ID'),
      password: resolveQaCredential('QA_DEV_MANAGER_PASSWORD'),
    },
  })
  expect(loginResponse.status()).toBe(200)
  const loginJson = await loginResponse.json() as { data?: { token?: string; userId?: string } }
  authToken = loginJson.data?.token ?? ''
  authUserId = loginJson.data?.userId ?? ''
  console.log(`login status=${loginResponse.status()} set-cookie=${(loginResponse.headers()['set-cookie'] ?? '').length}`)
  expect(authToken).not.toBe('')
  await page.goto(`${BASE_URL}/#/warehouse/dps-compare`)
  const loginId = resolveQaCredential('QA_DEV_MANAGER_LOGIN_ID')
  const password = resolveQaCredential('QA_DEV_MANAGER_PASSWORD')
  const loginIdInput = page.getByRole('textbox', { name: '사용자 ID (필수)' })
  await loginIdInput.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined)
  if (await loginIdInput.isVisible().catch(() => false)) {
    await page.locator('input').nth(0).fill(loginId)
    await page.locator('input').nth(1).fill(password)
    await page.waitForTimeout(500)
    console.log(`ui login ready disabled=${await page.getByRole('button', { name: '로그인', exact: true }).isDisabled()}`)
    await page.getByRole('button', { name: '로그인', exact: true }).click()
    await page.waitForTimeout(1_000)
    await page.goto(`${BASE_URL}/#/warehouse/dps-compare`)
  }
  await page.waitForTimeout(3_000)
  await expect(page.getByText('DPS 입고 비교', { exact: true }).first()).toBeVisible({ timeout: 60_000 })
}

async function runFile(page: Page, filePath: string, shotName: string): Promise<{ dpsRows: number; mismatches: number; detailRows: number }> {
  const routeHandler = async (route: Route) => {
    const direct = await page.request.post(`${BRANCH_INVENTORY}/warehouse/audit/dps-compare`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'X-Samhan-Gateway-Attestation': resolveQaCredential('SAMHAN_GATEWAY_ATTESTATION'),
        'X-User-Id': authUserId,
        'X-User-Groups': 'MANAGER',
        'X-Is-System-Master': 'false',
        'X-Is-Partner': 'false',
        'X-User-Name': 'DEV-MANAGER',
      },
      multipart: {
        file: {
          name: path.basename(filePath),
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: fs.readFileSync(filePath),
        },
        from: FROM,
        to: TO,
        groupBy: 'SLIP',
      },
    })
    const directBody = await direct.body()
    console.log(`branch response ${direct.status()} ${directBody.toString('utf8').slice(0, 500)}`)
    await route.fulfill({ status: direct.status(), headers: direct.headers(), body: directBody })
  }
  await page.route('**/warehouse/audit/dps-compare', routeHandler)
  page.on('request', (request) => {
    if (request.url().includes('dps-compare')) console.log(`DPS request ${request.method()} ${request.url()}`)
  })
  page.on('response', (response) => {
    if (response.url().includes('dps-compare')) console.log(`DPS response ${response.status()} ${response.url()}`)
  })
  await page.getByTestId('dps-compare-file-input').setInputFiles(filePath)
  await expect(page.getByText(path.basename(filePath), { exact: true })).toBeVisible()
  await page.getByTestId('dps-compare-run-button').click()
  await expect(page.getByText(/불일치 상세/)).toBeVisible({ timeout: 60_000 })
  await expect.poll(async () => (await page.locator('body').innerText()).includes('DPS 행'), { timeout: 60_000 }).toBeTruthy()
  const body = await page.locator('body').innerText()
  const dpsRows = Number((body.match(/DPS 행\s*([\d,]+)/)?.[1] ?? '0').replace(/,/g, ''))
  const mismatches = Number((body.match(/불일치\s*([\d,]+)/)?.[1] ?? '0').replace(/,/g, ''))
  const detailRows = await page.locator('[data-testid="dps-compare-result-table"] tbody tr').count()
  await page.screenshot({ path: path.join(SHOTS, shotName), fullPage: true })
  await page.unroute('**/warehouse/audit/dps-compare', routeHandler)
  return { dpsRows, mismatches, detailRows }
}

test('PR 1271 실제 DPS 헤더와 금액·수량 불일치를 라이브 캡처한다', async ({ page }) => {
  const internalToken = resolveQaCredential('SAMHAN_INTERNAL_TOKEN')
  const sourceResponse = await page.request.get(`${BRANCH_SLIP}/internal/slips/inbound-lines?from=${FROM}&to=${TO}`, {
    headers: { 'X-Internal-Token': internalToken },
  })
  expect(sourceResponse.status()).toBe(200)
  const sourceJson = await sourceResponse.json() as { data?: InboundRow[] }
  const rows = sourceJson.data ?? []
  expect(rows.length).toBeGreaterThan(0)
  const amountIndex = rows.findIndex((row) => Number(row.totalAmount) > 0)
  const qtyIndex = rows.findIndex((_row, index) => index !== amountIndex)
  expect(amountIndex).toBeGreaterThanOrEqual(0)
  expect(qtyIndex).toBeGreaterThanOrEqual(0)

  await login(page)

  const actualFile = makeXlsx(rows, 'A-real-dps-header', -1, -1)
  const cFile = makeXlsx(rows, 'C-same-qty-different-amount', amountIndex, -1)
  const dFile = makeXlsx(rows, 'D-different-qty', -1, qtyIndex)
  const bFile = makeXlsx(rows, 'B-all-match', -1, -1)

  const a = await runFile(page, actualFile, '01-A-real-header-77-rows-real-qa.png')
  expect(a.dpsRows).toBe(rows.length)
  expect(a.mismatches).toBe(0)

  const c = await runFile(page, cFile, '02-C-same-qty-amount-mismatch-real-qa.png')
  expect(c.dpsRows).toBe(rows.length)
  expect(c.mismatches).toBeGreaterThanOrEqual(1)
  expect(c.detailRows).toBeGreaterThanOrEqual(1)
  await expect(page.getByText('합계금액 불일치', { exact: true }).first()).toBeVisible()

  const d = await runFile(page, dFile, '03-D-quantity-mismatch-real-qa.png')
  expect(d.dpsRows).toBe(rows.length)
  expect(d.mismatches).toBeGreaterThanOrEqual(1)
  expect(d.detailRows).toBeGreaterThanOrEqual(1)
  await expect(page.getByText('수량 불일치', { exact: true }).first()).toBeVisible()

  const b = await runFile(page, bFile, '04-B-all-match-zero-mismatch-real-qa.png')
  expect(b.dpsRows).toBe(rows.length)
  expect(b.mismatches).toBe(0)
  expect(b.detailRows).toBe(0)
  await expect(page.locator('[role="status"]').filter({ hasText: '모든 라인이 정상 일치합니다' })).toBeVisible()

  fs.writeFileSync(path.join(SHOTS, 'measured-summary.json'), JSON.stringify({
    from: FROM, to: TO, sourceRows: rows.length, amountIndex, qtyIndex,
    amountBefore: rows[amountIndex]!.totalAmount, amountAfter: Number(rows[amountIndex]!.totalAmount) + 1000,
    qtyBefore: rows[qtyIndex]!.quantity, qtyAfter: Number(rows[qtyIndex]!.quantity) + 1,
    a, c, d, b,
  }, null, 2), 'utf8')
})
