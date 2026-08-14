import { expect, test, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:51131'
const GATEWAY = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const ISOLATED_SLIP = process.env['ISOLATED_SLIP_API'] ?? 'http://127.0.0.1:18186'
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/2026-08-11-1131-r10'))
const TARGET_NO = '2026/08/07-20'
const TARGET_ID = 'fe0a9968-0a0f-4fef-b0fd-f5671d261434'
const TARGET_PARENT = 'AC060CS6PBH1SY'
const EXPECTED_TOTAL_SUPPLY = 4_729_797
const EXPECTED_BUNDLE_SUPPLY = 3_018_182

type Login = { token: string; userId: string; role: string; displayName: string; groups?: Array<{ id: string }> }
type SetOptions = { instanceKey?: string | null }
type Line = {
  id: string
  productId: string
  modelName?: string | null
  quantity: number
  supplyAmount?: number | string | null
  parentSetModel?: string | null
  setHead?: boolean
  setOptions?: SetOptions | null
}
type Slip = {
  id: string
  slipNo: string
  status: string
  updatedAt: string
  lines: Line[]
}

let session: Login
const createdSlipIds: string[] = []

function directHeaders(current: Login): Record<string, string> {
  return {
    Authorization: `Bearer ${current.token}`,
    'X-User-Id': current.userId,
    'X-User-Role': current.role || 'MASTER',
    // gateway는 비 ASCII 표시명을 raw HTTP header로 전달하지 않는다. 분리 서비스 QA도
    // Node HTTP 헤더 규약을 지키는 ASCII 감사명으로 고정한다.
    'X-User-Name': 'SOL-R10',
    'X-User-Groups': (current.groups ?? []).map((group) => group.id).join(',')
      || '00000000-0000-0000-0000-000000000100',
    'X-Is-System-Master': 'true',
  }
}

async function authenticate(page: Page, context: BrowserContext): Promise<Login> {
  const response = await page.request.post(`${GATEWAY}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  const current = JSON.parse(raw).data as Login
  expect(current.token, 'LIVE_API_LOGIN token').toBeTruthy()
  console.log(`LOGIN_CONTEXT|userId=${current.userId}|role=${current.role}|groups=${(current.groups ?? []).map((group) => group.id).join(',')}`)
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
  console.log(`LIVE_API_LOGIN|HTTP ${response.status()}|token=${Boolean(current.token)}|code=OK`)
  return current
}

async function installIsolatedSlipRoute(page: Page, current: Login): Promise<void> {
  await page.route(`${GATEWAY}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/slips')) {
      await route.continue()
      return
    }
    if (url.pathname.includes('/realtime')) {
      await route.abort('blockedbyclient')
      return
    }
    const headers = { ...request.headers(), ...directHeaders(current) }
    delete headers.host
    delete headers['content-length']
    const response = await route.fetch({
      url: `${ISOLATED_SLIP}${url.pathname}${url.search}`,
      method: request.method(),
      headers,
      postData: request.postDataBuffer() ?? undefined,
    })
    console.log(`REAL_SLIP_PROXY|${request.method()} ${url.pathname}|HTTP ${response.status()}`)
    await route.fulfill({ response })
  })
}

async function directGet<T>(request: APIRequestContext, pathName: string): Promise<T> {
  const response = await request.get(`${ISOLATED_SLIP}${pathName}`, { headers: directHeaders(session) })
  const raw = await response.text()
  expect(response.status(), raw).toBe(200)
  return JSON.parse(raw).data as T
}

async function findTarget(request: APIRequestContext): Promise<Slip> {
  const target = await directGet<Slip>(request, `/slips/${TARGET_ID}`)
  expect(target.slipNo).toBe(TARGET_NO)
  return target
}

async function duplicate(request: APIRequestContext, source: Slip): Promise<Slip> {
  const response = await request.post(`${ISOLATED_SLIP}/slips/${source.id}/duplicate`, {
    headers: directHeaders(session),
  })
  const raw = await response.text()
  expect(response.status(), raw).toBe(201)
  const created = JSON.parse(raw).data as Slip
  createdSlipIds.push(created.id)
  return directGet<Slip>(request, `/slips/${created.id}`)
}

async function openSalesEdit(page: Page, slip: Slip): Promise<void> {
  await page.goto(`${APP_BASE}/#/sales/${slip.id}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: new RegExp(`출고전표 상세.*${slip.slipNo.replaceAll('/', '\\/')}`) }))
    .toBeVisible({ timeout: 30_000 })
  await page.getByTestId('sales-slip-edit-button').click()
  await expect(page.getByTestId('sales-slip-edit-modal')).toBeVisible()
}

function bundleLines(slip: Slip): Line[] {
  return slip.lines.filter((line) => line.parentSetModel === TARGET_PARENT)
}

function keyCount(lines: Line[]): number {
  return new Set(lines.map((line) => line.setOptions?.instanceKey?.trim()).filter(Boolean)).size
}

async function clickSaveAndWait(page: Page, slipId: string) {
  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === 'PUT'
      && new URL(response.url()).pathname === `/slips/${slipId}/sales`)
  await page.getByTestId('sales-slip-edit-save').click()
  return responsePromise
}

async function pickPartner(page: Page): Promise<void> {
  const input = page.getByRole('combobox', { name: '거래처 검색' })
  await input.fill('파인')
  const listbox = page.getByRole('listbox', { name: '거래처 목록' })
  await expect(listbox).toBeVisible({ timeout: 20_000 })
  await listbox.getByRole('option').filter({ hasText: '파인씨엔디' }).first().click()
}

async function selectBundle(page: Page, lineNo: number): Promise<void> {
  const model = page.getByRole('combobox', { name: `라인 ${lineNo} 모델명` })
  await model.fill(TARGET_PARENT)
  await expect(page.getByLabel(`라인 ${lineNo} 품목명`)).not.toHaveValue('', { timeout: 20_000 })
  await expect(model).toHaveValue(TARGET_PARENT)
}

async function dismissBrowserOnlyUpdateStatus(page: Page): Promise<void> {
  const notice = page.getByTestId('app-auto-update-status')
  if (await notice.isVisible().catch(() => false)) {
    const close = notice.getByRole('button', { name: '닫기' })
    if (await close.isVisible().catch(() => false)) await close.click()
  }
}

test.beforeEach(async ({ context, page }) => {
  fs.mkdirSync(SHOTS, { recursive: true })
  session = await authenticate(page, context)
  await installIsolatedSlipRoute(page, session)
  page.on('dialog', (dialog) => dialog.accept())
})

test('V119 이관 대상은 실 응답으로 보이고 금액 불변·편집 계약이 유지된다', async ({ page, request }) => {
  const target = await findTarget(request)
  const bundles = bundleLines(target)
  expect(bundles).toHaveLength(8)
  expect(bundles.filter((line) => line.setHead)).toHaveLength(2)
  expect(keyCount(bundles)).toBe(2)
  expect(target.lines.reduce((sum, line) => sum + Number(line.supplyAmount ?? 0), 0)).toBe(EXPECTED_TOTAL_SUPPLY)
  expect(bundles.reduce((sum, line) => sum + Number(line.supplyAmount ?? 0), 0)).toBe(EXPECTED_BUNDLE_SUPPLY)

  await page.goto(`${APP_BASE}/#/sales/${target.id}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /출고전표 상세.*2026\/08\/07-20/ })).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: path.join(SHOTS, '01-v119-migrated-real-slip.png'), fullPage: true })
  console.log(`LIVE_API_QUERY|HTTP 200|slip_no=${target.slipNo}|status=${target.status}|rows=${bundles.length}|heads=${bundles.filter((line) => line.setHead).length}|keys=${keyCount(bundles)}|supply=${EXPECTED_TOTAL_SUPPLY}`)

  const quantityCopy = await duplicate(request, target)
  await openSalesEdit(page, quantityCopy)
  await page.getByRole('spinbutton', { name: '수량 5', exact: true }).fill('2')
  const quantitySaved = await clickSaveAndWait(page, quantityCopy.id)
  expect(quantitySaved.status(), await quantitySaved.text()).toBe(200)
  const quantityAfter = await directGet<Slip>(request, `/slips/${quantityCopy.id}`)
  expect(bundleLines(quantityAfter)).toHaveLength(8)
  expect(bundleLines(quantityAfter).filter((line) => line.setHead)).toHaveLength(2)
  expect(keyCount(bundleLines(quantityAfter))).toBe(2)
  expect(bundleLines(quantityAfter).find((line) => line.setHead)?.quantity).toBe(2)
  await page.screenshot({ path: path.join(SHOTS, '02-keyed-head-quantity-two-http-200.png'), fullPage: true })

  const deleteCopy = await duplicate(request, target)
  await openSalesEdit(page, deleteCopy)
  await page.getByRole('button', { name: '6번 행 삭제' }).click()
  const componentDeleted = await clickSaveAndWait(page, deleteCopy.id)
  expect(componentDeleted.status(), await componentDeleted.text()).toBe(200)
  const deleteAfter = await directGet<Slip>(request, `/slips/${deleteCopy.id}`)
  expect(bundleLines(deleteAfter)).toHaveLength(7)
  expect(bundleLines(deleteAfter).filter((line) => line.setHead)).toHaveLength(2)
  await page.screenshot({ path: path.join(SHOTS, '03-keyed-component-delete-http-200.png'), fullPage: true })

  const allInstanceCopy = await duplicate(request, target)
  await openSalesEdit(page, allInstanceCopy)
  for (let i = 0; i < 4; i += 1) await page.getByRole('button', { name: '5번 행 삭제' }).click()
  const instanceDeleted = await clickSaveAndWait(page, allInstanceCopy.id)
  expect(instanceDeleted.status(), await instanceDeleted.text()).toBe(200)
  const instanceAfter = await directGet<Slip>(request, `/slips/${allInstanceCopy.id}`)
  expect(bundleLines(instanceAfter)).toHaveLength(4)
  expect(bundleLines(instanceAfter).filter((line) => line.setHead)).toHaveLength(1)
  expect(keyCount(bundleLines(instanceAfter))).toBe(1)
  await page.screenshot({ path: path.join(SHOTS, '04-keyed-whole-instance-delete-http-200.png'), fullPage: true })

  const zeroCopy = await duplicate(request, target)
  await openSalesEdit(page, zeroCopy)
  await page.getByRole('spinbutton', { name: '수량 5', exact: true }).fill('0')
  const zeroRejected = await clickSaveAndWait(page, zeroCopy.id)
  expect(zeroRejected.status(), await zeroRejected.text()).toBe(422)
  await expect(page.getByText('매출 라인 입력값이 올바르지 않습니다. 수량과 단가를 확인해 주세요.')).toBeVisible()
  await page.screenshot({ path: path.join(SHOTS, '05-keyed-quantity-zero-http-422.png'), fullPage: true })
})

test('정상 견적 화면의 같은 세트 두 개는 서버에서 키가 생기고 변환 후 편집된다', async ({ page, request }) => {
  await page.goto(`${APP_BASE}/#/sales/estimates/new`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('estimate-form-save-button')).toBeVisible({ timeout: 30_000 })
  await pickPartner(page)
  await selectBundle(page, 1)
  await selectBundle(page, 2)
  await page.getByLabel('비고').fill('SOL R10 LUNA 수정 후 동일 세트 2개 키 보강')
  await dismissBrowserOnlyUpdateStatus(page)
  await page.screenshot({ path: path.join(SHOTS, '10-fixed-real-estimate-two-bundles-before-save.png'), fullPage: true })

  const createdPromise = page.waitForResponse((response) =>
    response.request().method() === 'POST' && new URL(response.url()).pathname === '/slips/estimates')
  await page.getByTestId('estimate-form-save-button').click()
  const createdResponse = await createdPromise
  const createdRaw = await createdResponse.text()
  expect(createdResponse.status(), createdRaw).toBe(201)
  const posted = JSON.parse(createdResponse.request().postData() ?? '{}') as { lines?: Array<{ setOptions?: SetOptions }> }
  expect(posted.lines).toHaveLength(2)
  expect(posted.lines?.every((line) => !line.setOptions?.instanceKey)).toBe(true)
  const estimate = JSON.parse(createdRaw).data as { id: string; estimateNo: string; lines: Line[] }
  const estimateBundles = estimate.lines.filter((line) => line.parentSetModel === TARGET_PARENT)
  expect(estimateBundles).toHaveLength(8)
  expect(estimateBundles.filter((line) => line.setHead)).toHaveLength(2)
  expect(keyCount(estimateBundles)).toBe(2)
  const estimateInstances = new Map<string, Line[]>()
  for (const line of estimateBundles) {
    const instanceKey = line.setOptions?.instanceKey ?? ''
    estimateInstances.set(instanceKey, [...(estimateInstances.get(instanceKey) ?? []), line])
  }
  expect(estimateInstances.size).toBe(2)
  for (const lines of estimateInstances.values()) {
    expect(lines).toHaveLength(4)
    expect(lines.filter((line) => line.setHead)).toHaveLength(1)
  }
  await expect(page.getByTestId('estimate-detail-no')).toHaveText(estimate.estimateNo, { timeout: 30_000 })
  await dismissBrowserOnlyUpdateStatus(page)
  await page.screenshot({ path: path.join(SHOTS, '11-fixed-real-estimate-keyed-eight-lines-after-save.png'), fullPage: true })

  const convertedPromise = page.waitForResponse((response) =>
    response.request().method() === 'POST'
      && new URL(response.url()).pathname === `/slips/estimates/${estimate.id}/convert`)
  await page.getByTestId('estimate-detail-convert-button').click()
  const convertedResponse = await convertedPromise
  const convertedRaw = await convertedResponse.text()
  expect(convertedResponse.status(), convertedRaw).toBe(200)
  const convertedSlipId = JSON.parse(convertedRaw).data.convertedSlipId as string
  expect(convertedSlipId).toBeTruthy()
  createdSlipIds.push(convertedSlipId)
  await expect(page).toHaveURL(new RegExp(`/#/sales/${convertedSlipId}$`), { timeout: 30_000 })

  const convertedSlip = await directGet<Slip>(request, `/slips/${convertedSlipId}`)
  const convertedBundles = bundleLines(convertedSlip)
  expect(convertedBundles).toHaveLength(8)
  expect(convertedBundles.filter((line) => line.setHead)).toHaveLength(2)
  expect(keyCount(convertedBundles)).toBe(2)
  await dismissBrowserOnlyUpdateStatus(page)
  await page.screenshot({ path: path.join(SHOTS, '12-fixed-real-converted-slip-keyed-two-instances.png'), fullPage: true })
  console.log(`FIXED_KEYED|estimate_no=${estimate.estimateNo}|slip_no=${convertedSlip.slipNo}|rows=${convertedBundles.length}|heads=${convertedBundles.filter((line) => line.setHead).length}|keys=${keyCount(convertedBundles)}`)

  await openSalesEdit(page, convertedSlip)
  await page.getByRole('spinbutton', { name: '수량 1', exact: true }).fill('2')
  const saved = await clickSaveAndWait(page, convertedSlip.id)
  const savedRaw = await saved.text()
  expect(saved.status(), savedRaw).toBe(200)
  const after = await directGet<Slip>(request, `/slips/${convertedSlip.id}`)
  const afterBundles = bundleLines(after)
  expect(afterBundles).toHaveLength(8)
  expect(afterBundles.filter((line) => line.setHead)).toHaveLength(2)
  expect(keyCount(afterBundles)).toBe(2)
  expect(afterBundles.find((line) => line.setHead)?.quantity).toBe(2)
  await dismissBrowserOnlyUpdateStatus(page)
  await page.screenshot({ path: path.join(SHOTS, '13-fixed-real-converted-slip-head-quantity-two-http-200.png'), fullPage: true })
})
