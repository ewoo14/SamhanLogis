import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:51131'
const API_BASE = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1131-r5-fix/screenshots'))
const SOURCE_ZERO_HEAD = '2026/08/07-17'
const SOURCE_TWO_INSTANCES = '2026/08/07-20'

type Login = { token: string; userId: string; role: string; displayName: string }
type SlipRef = { id: string; slipNo: string; updatedAt: string }

const created: SlipRef[] = []
const cleaned: string[] = []
let login: Login | null = null

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

async function duplicateSource(request: APIRequestContext, token: string, slipNo: string): Promise<SlipRef> {
  const headers = { Authorization: `Bearer ${token}` }
  const listed = await request.get(`${API_BASE}/slips?slipType=OUTBOUND&status=DRAFT&page=0&size=500`, { headers })
  const listedRaw = await listed.text()
  expect(listed.status(), listedRaw).toBe(200)
  const source = JSON.parse(listedRaw).data.content.find((row: { slipNo?: string }) => row.slipNo === slipNo)
  expect(source, `복사 원본 ${slipNo}`).toBeTruthy()

  const duplicated = await request.post(`${API_BASE}/slips/${source.id}/duplicate`, { headers })
  const duplicatedRaw = await duplicated.text()
  const copy = JSON.parse(duplicatedRaw).data as SlipRef
  created.push(copy)
  expect(duplicated.status(), duplicatedRaw).toBe(201)
  return copy
}

async function openSalesEdit(page: Page, copy: SlipRef) {
  await page.goto(`${APP_BASE}/#/sales/${copy.id}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: new RegExp(`판매전표 상세.*${copy.slipNo.replaceAll('/', '\\/')}`) }))
    .toBeVisible({ timeout: 30_000 })
  await page.getByTestId('sales-slip-edit-button').click()
  await expect(page.getByTestId('sales-slip-edit-modal')).toBeVisible()
}

async function softDelete(request: APIRequestContext, token: string, copy: SlipRef) {
  const headers = { Authorization: `Bearer ${token}` }
  const detail = await request.get(`${API_BASE}/slips/${copy.id}`, { headers })
  const detailRaw = await detail.text()
  expect(detail.status(), detailRaw).toBe(200)
  const updatedAt = JSON.parse(detailRaw).data.updatedAt
  const deleted = await request.delete(`${API_BASE}/slips/${copy.id}/sales`, {
    headers,
    data: { updatedAt },
  })
  const deletedRaw = await deleted.text()
  expect([200, 204], deletedRaw).toContain(deleted.status())
  cleaned.push(copy.slipNo)
}

test.afterAll(async ({ request }) => {
  if (!login) return
  for (const copy of created) {
    if (!cleaned.includes(copy.slipNo)) await softDelete(request, login.token, copy)
  }
  console.log(`R5-CLEANUP|softDeleted=${cleaned.join(',')}`)
})

test('R5 라이브 — 수량 0의 422 안내와 실 DB 비정상 계보 정상편집 도달', async ({ context, page, request }) => {
  fs.mkdirSync(SHOTS, { recursive: true })
  login = await authenticate(page, context)
  const zeroHeadCopy = await duplicateSource(request, login.token, SOURCE_ZERO_HEAD)
  const twoInstanceCopy = await duplicateSource(request, login.token, SOURCE_TWO_INSTANCES)

  await openSalesEdit(page, zeroHeadCopy)
  // source -17의 5번 행이 AF17DX738WSS 0-head 그룹 첫 구성품이다.
  const zeroQuantity = page.getByRole('spinbutton', { name: '수량 5', exact: true })
  await zeroQuantity.fill('0')
  await expect(zeroQuantity).toHaveValue('0')
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === 'PUT' && response.url().endsWith(`/slips/${zeroHeadCopy.id}/sales`))
  await page.getByTestId('sales-slip-edit-save').click()
  const rejected = await responsePromise
  const rejectedRaw = await rejected.text()
  const payload = JSON.parse(rejected.request().postData() ?? '{}')
  expect(rejected.status(), rejectedRaw).toBe(422)
  expect(rejectedRaw).toContain('수량은 1 이상이어야 합니다.')
  const zeroPayloadLine = payload.lines.find((line: { quantity?: number }) => line.quantity === 0)
  expect(zeroPayloadLine).toBeTruthy()
  expect(zeroPayloadLine.lineId).toBeTruthy()
  await expect(page.getByText('매출 라인 입력값이 올바르지 않습니다. 수량과 단가를 확인해 주세요.'))
    .toBeVisible()
  console.log(`R5-QTY-ZERO|HTTP=422|payloadQuantity=${zeroPayloadLine.quantity}|lineIdPreserved=true|message=수량은 1 이상이어야 합니다.`)
  await page.screenshot({ path: path.join(SHOTS, '01-live-quantity-zero-422.png'), fullPage: true })

  await zeroQuantity.fill('3')
  await expect(zeroQuantity).toHaveValue('3')
  await expect(page.getByTestId('sales-slip-edit-save')).toBeEnabled()
  console.log(`R5-ZERO-HEAD-EDIT|source=${SOURCE_ZERO_HEAD}|quantity=3|saveEnabled=true|backendGuard=deployment-pending`)
  await page.screenshot({ path: path.join(SHOTS, '02-live-zero-head-positive-edit-before-save.png'), fullPage: true })
  await page.getByTestId('sales-slip-edit-cancel').click()

  await openSalesEdit(page, twoInstanceCopy)
  // source -20의 5번 행이 AC060CS6PBH1SY 첫 인스턴스의 canonical head다.
  const twoInstanceQuantity = page.getByRole('spinbutton', { name: '수량 5', exact: true })
  await twoInstanceQuantity.fill('2')
  await expect(twoInstanceQuantity).toHaveValue('2')
  await expect(page.getByTestId('sales-slip-edit-save')).toBeEnabled()
  console.log(`R5-TWO-INSTANCES-EDIT|source=${SOURCE_TWO_INSTANCES}|quantity=2|saveEnabled=true|backendGuard=deployment-pending`)
  await page.screenshot({ path: path.join(SHOTS, '03-live-two-set-instances-positive-edit-before-save.png'), fullPage: true })

  await softDelete(request, login.token, zeroHeadCopy)
  await softDelete(request, login.token, twoInstanceCopy)
})
