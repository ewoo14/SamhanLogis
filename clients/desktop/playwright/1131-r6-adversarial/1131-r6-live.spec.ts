import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:51131'
const API_BASE = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1131-r6-fix/screenshots'))
const ZERO_HEAD_SOURCES = [
  '2026/07/16-115', '2026/07/16-116', '2026/07/16-57', '2026/07/16-58',
  '2026/07/16-79', '2026/07/16-80', '2026/07/16-92', '2026/07/16-93',
  '2026/07/17-22', '2026/07/17-23', '2026/07/17-3', '2026/07/17-4',
  '2026/07/17-61', '2026/07/17-62', '2026/08/07-17', '2026/08/07-7',
] as const
const NORMAL_BUNDLE_SOURCE = '2026/08/07-10'
const SWAP_PRODUCT = {
  id: '6fd28b44-f8e5-4e9d-96ba-d4b9ce9fac89',
  name: '실외기_6HP 단배관',
  model: 'AJ060MXHNBC1',
}

type Login = { token: string; userId: string; role: string; displayName: string }
type SlipLine = {
  id: string; productId: string; productName: string; modelName?: string | null
  specification?: string | null; quantity: number; unitPrice: number | string
  note?: string | null; parentSetModel?: string | null; setHead?: boolean
}
type SlipDetail = {
  id: string; slipNo: string; updatedAt: string; lines: SlipLine[]
  partnerId?: string | null; partnerName?: string | null; partnerCode?: string | null
  memo?: string | null; businessNumber?: string | null; deliveryAddress?: string | null
  supervisionAddress?: string | null; projectName?: string | null
  recipientPhone?: string | null; paymentDueDate?: string | null
}

const created: SlipDetail[] = []
const cleaned = new Set<string>()
let login: Login | null = null

function psql(sql: string): string {
  return execFileSync('docker', [
    'exec', 'samhan-postgres', 'psql', '-U', 'samhan', '-d', 'slip_db',
    '-X', '-P', 'pager=off', '-Atc', `BEGIN TRANSACTION READ ONLY; ${sql}; COMMIT;`,
  ], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter((line) => line !== 'BEGIN' && line !== 'COMMIT' && line.trim() !== '')
    .join('\n')
    .trim()
}

async function authenticate(page: Page, context: BrowserContext): Promise<Login> {
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  const current = JSON.parse(raw).data as Login
  await context.addInitScript(({ token, userId, role, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, userId, role, fullName: displayName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, current)
  return current
}

function headers(token: string) {
  return { Authorization: `Bearer ${token}` }
}

async function listDrafts(request: APIRequestContext, token: string) {
  const response = await request.get(
    `${API_BASE}/slips?slipType=OUTBOUND&status=DRAFT&page=0&size=500`,
    { headers: headers(token) },
  )
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  return JSON.parse(raw).data.content as Array<{ id: string; slipNo: string }>
}

async function detail(request: APIRequestContext, token: string, id: string): Promise<SlipDetail> {
  const response = await request.get(`${API_BASE}/slips/${id}`, { headers: headers(token) })
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  return JSON.parse(raw).data as SlipDetail
}

async function duplicate(
  request: APIRequestContext,
  token: string,
  source: { id: string; slipNo: string },
): Promise<SlipDetail> {
  const response = await request.post(`${API_BASE}/slips/${source.id}/duplicate`, {
    headers: headers(token),
  })
  const raw = await response.text()
  expect(response.status(), raw).toBe(201)
  const copy = JSON.parse(raw).data as SlipDetail
  created.push(copy)
  return detail(request, token, copy.id)
}

function updateBody(source: SlipDetail, targetLineId?: string, swapHead = false) {
  return {
    updatedAt: source.updatedAt,
    partnerId: source.partnerId ?? null,
    partnerName: source.partnerName ?? null,
    partnerCode: source.partnerCode ?? null,
    memo: source.memo ?? null,
    businessNumber: source.businessNumber ?? null,
    deliveryAddress: source.deliveryAddress ?? null,
    supervisionAddress: source.supervisionAddress ?? null,
    projectName: source.projectName ?? null,
    recipientPhone: source.recipientPhone ?? null,
    paymentDueDate: source.paymentDueDate ?? null,
    lineIdContract: true,
    lines: source.lines.map((line) => ({
      lineId: line.id,
      productId: swapHead && line.id === targetLineId ? SWAP_PRODUCT.id : line.productId,
      productName: swapHead && line.id === targetLineId ? SWAP_PRODUCT.name : line.productName,
      modelName: swapHead && line.id === targetLineId ? SWAP_PRODUCT.model : line.modelName ?? null,
      specification: line.specification ?? null,
      quantity: !swapHead && line.id === targetLineId ? line.quantity + 1 : line.quantity,
      unitPrice: line.unitPrice,
      note: line.note ?? null,
    })),
  }
}

async function put(
  request: APIRequestContext,
  token: string,
  source: SlipDetail,
  targetLineId?: string,
  swapHead = false,
): Promise<SlipDetail> {
  const response = await putRaw(request, token, source, targetLineId, swapHead)
  expect(response.status, response.raw).toBe(200)
  return JSON.parse(response.raw).data as SlipDetail
}

async function putRaw(
  request: APIRequestContext,
  token: string,
  source: SlipDetail,
  targetLineId?: string,
  swapHead = false,
) {
  const response = await request.put(`${API_BASE}/slips/${source.id}/sales`, {
    headers: headers(token),
    data: updateBody(source, targetLineId, swapHead),
  })
  const raw = await response.text()
  return { status: response.status(), raw }
}

async function openSalesEdit(page: Page, copy: SlipDetail) {
  await page.goto(`${APP_BASE}/#/sales/${copy.id}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: new RegExp(`판매전표 상세.*${copy.slipNo.replaceAll('/', '\\/')}`) }))
    .toBeVisible({ timeout: 30_000 })
  await page.getByTestId('sales-slip-edit-button').click()
  await expect(page.getByTestId('sales-slip-edit-modal')).toBeVisible()
}

async function softDelete(request: APIRequestContext, token: string, copy: SlipDetail) {
  const current = await detail(request, token, copy.id)
  const response = await request.delete(`${API_BASE}/slips/${copy.id}/sales`, {
    headers: headers(token),
    data: { updatedAt: current.updatedAt },
  })
  const raw = await response.text()
  expect([200, 204], raw).toContain(response.status())
  cleaned.add(copy.id)
}

test.afterAll(async ({ request }) => {
  if (!login) return
  for (const copy of created) {
    if (!cleaned.has(copy.id)) await softDelete(request, login.token, copy)
  }
  console.log(`R6-CLEANUP|softDeleted=${cleaned.size}|created=${created.length}`)
})

test('R6 라이브 — 0-head 16전표 2회 저장과 head 품목 교체 후 orphan 계보', async ({ context, page, request }) => {
  test.setTimeout(180_000)
  fs.mkdirSync(SHOTS, { recursive: true })
  login = await authenticate(page, context)
  const drafts = await listDrafts(request, login.token)
  const copies: SlipDetail[] = []
  const lookupBlocked: string[] = []
  const stalePutResponses: string[] = []

  for (const slipNo of ZERO_HEAD_SOURCES) {
    const source = drafts.find((row) => row.slipNo === slipNo)
    expect(source, `0-head 원본 ${slipNo}`).toBeTruthy()
    const copy = await duplicate(request, login.token, source!)
    const target = copy.lines.find((line) => line.parentSetModel && !line.setHead)
    expect(target, `${slipNo} 0-head 구성품`).toBeTruthy()
    const oldIds = new Set(copy.lines.map((line) => line.id))
    const firstResponse = await putRaw(request, login.token, copy, target!.id)
    if (firstResponse.status === 404) {
      expect(firstResponse.raw).toContain('일부 제품을 찾을 수 없습니다')
      lookupBlocked.push(slipNo)
      console.log(`R6-ZERO-HEAD|source=${slipNo}|copy=${copy.slipNo}|first=404|boundary=product-lookup-before-new-guard`)
      continue
    }
    expect(firstResponse.status, firstResponse.raw).toBe(200)
    const first = JSON.parse(firstResponse.raw).data as SlipDetail
    const firstIds = new Set(first.lines.map((line) => line.id))
    expect([...firstIds].some((id) => oldIds.has(id))).toBe(false)
    const refreshed = await detail(request, login.token, copy.id)
    if (refreshed.updatedAt !== first.updatedAt) {
      stalePutResponses.push(slipNo)
      console.log(`R6-PUT-RESPONSE-STALE|source=${slipNo}|response=${first.updatedAt}|reget=${refreshed.updatedAt}`)
    }
    const secondTarget = refreshed.lines.find((line) => line.productId === target!.productId && line.parentSetModel)
    expect(secondTarget, `${slipNo} 1차 저장 뒤 0-head 구성품`).toBeTruthy()
    const second = await put(request, login.token, refreshed, secondTarget!.id)
    expect(second.lines.find((line) => line.productId === target!.productId)?.quantity)
      .toBe(target!.quantity + 2)
    copies.push(second)
    console.log(`R6-ZERO-HEAD|source=${slipNo}|copy=${second.slipNo}|first=200|second=200|lineIdsRotated=true`)
  }

  expect(copies.map((copy) => copy.lines.some((line) => line.parentSetModel === 'AF17DX738WSS'))).toContain(true)
  expect(copies.map((copy) => copy.lines.some((line) => line.parentSetModel === 'AC072CS6PBH1SY'))).toContain(true)
  expect(copies).toHaveLength(2)
  expect(lookupBlocked).toHaveLength(14)
  expect(stalePutResponses).toHaveLength(2)
  const copyIds = copies.map((copy) => `'${copy.id}'`).join(',')
  const zeroHeadCount = psql(`WITH g AS (
    SELECT s.id, l.parent_set_model, count(*) FILTER (WHERE l.set_head) AS heads
    FROM slips s JOIN slip_lines l ON l.slip_id=s.id AND l.is_deleted=false
    WHERE s.id IN (${copyIds}) AND s.is_deleted=false
      AND l.parent_set_model IS NOT NULL AND btrim(l.parent_set_model)<>''
    GROUP BY s.id,l.parent_set_model
  ) SELECT count(DISTINCT id) FROM g WHERE heads=0`)
  expect(zeroHeadCount).toBe('2')
  await openSalesEdit(page, copies.find((copy) => copy.lines.some((line) => line.parentSetModel === 'AF17DX738WSS'))!)
  await page.screenshot({ path: path.join(SHOTS, '01-live-zero-head-16-sample-second-edit.png'), fullPage: true })

  const normalSource = drafts.find((row) => row.slipNo === NORMAL_BUNDLE_SOURCE)
  expect(normalSource, `정상 head 원본 ${NORMAL_BUNDLE_SOURCE}`).toBeTruthy()
  const normalCopy = await duplicate(request, login.token, normalSource!)
  const head = normalCopy.lines.find((line) => line.setHead && line.parentSetModel)
  expect(head, '교체할 canonical head').toBeTruthy()
  const parentModel = head!.parentSetModel!
  const swapped = await put(request, login.token, normalCopy, head!.id, true)
  const orphan = psql(`SELECT count(*)||'|'||count(*) FILTER (WHERE set_head)
    FROM slip_lines WHERE slip_id='${normalCopy.id}' AND is_deleted=false
      AND parent_set_model='${parentModel.replaceAll("'", "''")}'`)
  expect(orphan).toBe('2|0')
  console.log(`R6-HEAD-SWAP|source=${NORMAL_BUNDLE_SOURCE}|copy=${swapped.slipNo}|PUT=200|remainingBundle=2|heads=0|swapped=${SWAP_PRODUCT.model}`)
  await openSalesEdit(page, swapped)
  await page.screenshot({ path: path.join(SHOTS, '02-live-head-product-swap-orphan-lineage.png'), fullPage: true })

  for (const copy of created) await softDelete(request, login.token, copy)
  const activeAfterCleanup = psql(`SELECT count(*) FROM slips WHERE id IN (${created.map((copy) => `'${copy.id}'`).join(',')}) AND is_deleted=false`)
  expect(activeAfterCleanup).toBe('0')
})

test('R6 라이브 — 첫 PUT 응답을 받은 사용자의 즉시 두 번째 저장은 409', async ({ context, page, request }) => {
  fs.mkdirSync(SHOTS, { recursive: true })
  login = await authenticate(page, context)
  const drafts = await listDrafts(request, login.token)
  const source = drafts.find((row) => row.slipNo === '2026/08/10-16')
  expect(source).toBeTruthy()
  const copy = await duplicate(request, login.token, source!)
  const original = await detail(request, login.token, copy.id)
  const targetIndex = 0

  const firstReturned = await put(request, login.token, original, original.lines[targetIndex]!.id)
  const secondResponse = await putRaw(
    request, login.token, firstReturned, firstReturned.lines[targetIndex]!.id,
  )
  expect(secondResponse.status, secondResponse.raw).toBe(409)
  expect(secondResponse.raw).toContain('전표가 이미 변경되었습니다')
  const latest = await detail(request, login.token, copy.id)
  expect(firstReturned.updatedAt).not.toBe(latest.updatedAt)
  console.log(`R6-SECOND-EDIT|first=200|second=409|responseUpdatedAt=${firstReturned.updatedAt}|dbUpdatedAt=${latest.updatedAt}`)
  await softDelete(request, login.token, copy)
})

test('R6 라이브 — 기존 BUNDLE의 수량 편집은 권위금액 오인으로 400', async ({ context, page, request }) => {
  fs.mkdirSync(SHOTS, { recursive: true })
  login = await authenticate(page, context)
  const drafts = await listDrafts(request, login.token)
  const source = drafts.find((row) => row.slipNo === '2026/08/07-17')
  expect(source).toBeTruthy()
  const copy = await duplicate(request, login.token, source!)
  const original = await detail(request, login.token, copy.id)
  const targetIndex = original.lines.findIndex((line) => line.parentSetModel === 'AF17DX738WSS')
  expect(targetIndex).toBeGreaterThanOrEqual(0)

  await openSalesEdit(page, original)
  const quantity = page.getByRole('spinbutton', { name: `수량 ${targetIndex + 1}`, exact: true })
  await quantity.fill(String(original.lines[targetIndex]!.quantity + 1))
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === 'PUT' && response.url().endsWith(`/slips/${copy.id}/sales`))
  await page.getByTestId('sales-slip-edit-save').click()
  const response = await responsePromise
  const raw = await response.text()
  expect(response.status(), raw).toBe(400)
  expect(raw).toContain('세트 구성품의 공급가액·부가세는 개별 편집할 수 없습니다')
  console.log(`R6-BUNDLE-UI-EDIT|source=2026/08/07-17|copy=${copy.slipNo}|quantityOnly=true|HTTP=400|message=세트 구성품의 공급가액·부가세는 개별 편집할 수 없습니다`)
  await page.screenshot({ path: path.join(SHOTS, '04-live-bundle-quantity-edit-400-authority.png'), fullPage: true })
  await softDelete(request, login.token, copy)
})
