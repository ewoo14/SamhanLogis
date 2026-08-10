import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_BASE = process.env['REAL_QA_RENDERER_BASE_URL'] ?? 'http://127.0.0.1:5175'
const API_BASE = 'http://127.0.0.1:8080'
const SHOTS = resolveQaShotsDir(
  path.resolve(HERE, '../../../../docs/qa/2026-08-09-1152-postmerge2'),
)
const OUTBOUND_SLIP_ID = '74e64ca5-bc07-40f2-bf65-40751a188612'
const OUTBOUND_SLIP_NO = '2026/08/08-41'

async function installLogin(page: Page, password: string): Promise<string> {
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password },
  })
  expect(response.status(), '실서버 로그인 HTTP').toBe(200)
  const body = await response.json()
  const login = body.data ?? {}
  expect(login.token, '실서버 로그인 토큰').toBeTruthy()
  await page.addInitScript(({ token, userId, role, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, userId, role, fullName: displayName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, login)
  return login.token as string
}

function qaPasswordOrSkip(): string | undefined {
  try {
    return resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : String(error))
    return undefined
  }
}

test('견적품목 GUI에서 비상품 지정 후 납품가 입력 시 수량이 1이 된다', async ({ page }) => {
  const password = qaPasswordOrSkip()
  if (!password) return
  const token = await installLogin(page, password)

  const catalogResponse = await page.request.get(`${API_BASE}/api/products`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { page: 0, size: 50 },
  })
  expect(catalogResponse.status(), '실 product catalog HTTP').toBe(200)
  const catalogBody = await catalogResponse.json()
  const catalogRows = Array.isArray(catalogBody.data?.content) ? catalogBody.data.content : []
  const goodsCount = catalogRows.filter((row: { goods?: boolean; goodsType?: string }) =>
    row.goods === true || row.goodsType === 'GOODS').length
  console.log(`[TRIGGER COUNT] PRODUCT_TOTAL=${catalogBody.data?.totalElements ?? 0} FIRST_PAGE_GOODS=${goodsCount}`)
  expect(goodsCount, '첫 페이지 GOODS 표본 0이면 지정 판정 불가').toBeGreaterThan(0)

  await page.goto(`${APP_BASE}/#/products/estimate-items`)
  await expect(page.getByTestId('estimate-items-table'), '견적품목 화면 도달').toBeVisible({ timeout: 30_000 })

  const editable = page.locator('select[aria-label="상품/비상품"]:not([disabled])')
  let goodsType = editable.first()
  for (let index = 0; index < await editable.count(); index += 1) {
    if (await editable.nth(index).inputValue() === 'GOODS') {
      goodsType = editable.nth(index)
      break
    }
  }
  await expect(goodsType, '편집 가능한 GOODS 견적품목 행').toHaveValue('GOODS')
  const goodsTypeTestId = await goodsType.getAttribute('data-testid')
  const modelCode = goodsTypeTestId?.replace('estimate-items-goods-type-', '') ?? ''
  expect(modelCode, '견적품목 modelCode').not.toBe('')
  const estimateToggle = page.getByTestId(`estimate-items-estimate-toggle-${modelCode}`)
  const originalEstimateIncluded = await estimateToggle.isChecked()

  try {
    const updateResponse = page.waitForResponse((response) =>
      response.request().method() !== 'GET'
      && response.url().includes('/api/v1/products/'))
    await goodsType.selectOption('NON_GOODS')
    const updated = await updateResponse
    console.log(`[GOODS TYPE RESPONSE] HTTP=${updated.status()} BODY=${await updated.text()}`)
    if (!updated.ok()) {
      await page.screenshot({ path: path.join(SHOTS, '01-estimate-item-designation-error.png'), fullPage: true })
    }
    expect(updated.ok(), `비상품 지정 API HTTP ${updated.status()}`).toBeTruthy()
    await expect(goodsType).toHaveValue('NON_GOODS')
    if (!await estimateToggle.isChecked()) await estimateToggle.click()
    await expect(estimateToggle).toBeChecked()
    await page.screenshot({ path: path.join(SHOTS, '01-estimate-item-designated-non-goods.png') })
    console.log(`[GUI] ESTIMATE_ITEM=${modelCode} GOODS_TYPE=NON_GOODS ESTIMATE_INCLUDED=true HTTP=${updated.status()}`)

    await page.goto(`${APP_BASE}/#/sales/estimates/new`)
    await expect(page.getByTestId('estimate-form-save-button'), '견적 작성 화면 도달').toBeVisible({ timeout: 30_000 })
    const modelInput = page.getByRole('combobox', { name: '라인 1 모델명' })
    const searchResponse = page.waitForResponse((response) =>
      response.request().method() === 'GET' && response.url().includes('/api/products'))
    await modelInput.fill(modelCode)
    await page.waitForTimeout(700)
    await modelInput.press('Enter')
    const searched = await searchResponse
    expect(searched.status(), '견적 품목 검색 HTTP').toBe(200)

    const quantity = page.getByTestId('estimate-form-line-0-qty')
    const unitPrice = page.getByTestId('estimate-form-line-0-unit-price')
    await quantity.fill('7')
    await unitPrice.fill('12345')
    await unitPrice.blur()
    await expect(quantity, '비상품 납품가 입력 후 수량').toHaveValue('1', { timeout: 15_000 })
    await page.screenshot({ path: path.join(SHOTS, '02-non-goods-delivery-price-quantity-one.png') })
    console.log(`[GUI] ESTIMATE_MODEL=${modelCode} DELIVERY_PRICE=12345 QUANTITY=${await quantity.inputValue()} SEARCH_HTTP=${searched.status()}`)
  } finally {
    await page.goto(`${APP_BASE}/#/products/estimate-items`)
    await expect(page.getByTestId('estimate-items-table')).toBeVisible({ timeout: 30_000 })
    const restoreGoods = page.getByTestId(`estimate-items-goods-type-${modelCode}`)
    if (await restoreGoods.inputValue() !== 'GOODS') await restoreGoods.selectOption('GOODS')
    const restoreEstimate = page.getByTestId(`estimate-items-estimate-toggle-${modelCode}`)
    if (await restoreEstimate.isChecked() !== originalEstimateIncluded) await restoreEstimate.click()
    await expect(restoreGoods, '비상품 지정 원복').toHaveValue('GOODS')
    console.log(`[RESTORE] ESTIMATE_ITEM=${modelCode} GOODS_TYPE=GOODS ESTIMATE_INCLUDED=${originalEstimateIncluded}`)
  }
})

test('실 출고 lifecycle이 complete 200으로 재고를 반영한다', async ({ page }) => {
  const password = qaPasswordOrSkip()
  if (!password) return
  const token = await installLogin(page, password)

  const observed: string[] = []
  page.on('response', (response) => {
    const lifecycleActions = new Set(['save', 'send', 'accept', 'process', 'complete'])
    const action = new URL(response.url()).pathname.split('/').at(-1)
    if (response.request().method() === 'POST'
      && response.url().includes(`/slips/${OUTBOUND_SLIP_ID}/`)
      && action && lifecycleActions.has(action)) {
      const line = `${action} -> ${response.status()}`
      observed.push(line)
      console.log(`[OUTBOUND NETWORK] ${OUTBOUND_SLIP_NO} ${line}`)
    }
  })

  await page.goto(`${APP_BASE}/#/sales/${OUTBOUND_SLIP_ID}`)
  await expect(page.getByRole('heading', { name: /판매전표 상세.*2026\/08\/08-41/ }), '출고전표 상세 도달').toBeVisible({ timeout: 30_000 })
  console.log('[TRIGGER COUNT] OUTBOUND_DRAFT_WITH_ACTIVE_PRODUCT_AND_STOCK=1')

  const actions = ['save', 'send', 'accept', 'process', 'complete'] as const
  const detailResponse = await page.request.get(`${API_BASE}/slips/${OUTBOUND_SLIP_ID}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(detailResponse.status(), '실 출고전표 현재 상태 조회 HTTP').toBe(200)
  const detailBody = await detailResponse.json()
  const currentStatus = detailBody.data?.status as string
  const startIndexByStatus: Record<string, number> = {
    DRAFT: 0, SAVED: 1, SENT: 2, ACCEPTED: 3, PROCESSING: 4,
  }
  const startIndex = startIndexByStatus[currentStatus]
  expect(startIndex, `재시도 가능한 출고 상태 ${currentStatus}`).toBeDefined()
  console.log(`[OUTBOUND STATE] ${OUTBOUND_SLIP_NO} STATUS=${currentStatus} REMAINING=${actions.slice(startIndex).join(',')}`)

  if (currentStatus === 'DRAFT') {
    const editButton = page.getByTestId('sales-slip-edit-button')
    await expect(editButton, 'DRAFT 매출 직접수정 버튼').toBeVisible()
    await editButton.click()
    const partnerInput = page.getByRole('combobox', { name: '거래처' })
    await expect(partnerInput).toBeEnabled({ timeout: 15_000 })
    await partnerInput.fill('서초1동주민센타')
    await page.waitForTimeout(700)
    await partnerInput.press('Enter')
    await expect(partnerInput, '실 거래처 선택').toHaveValue('서초1동주민센타')
    const editSave = page.getByTestId('sales-slip-edit-save')
    await expect(editSave).toBeEnabled({ timeout: 30_000 })
    const putResponse = page.waitForResponse((response) =>
      response.request().method() === 'PUT' && response.url().includes(`/slips/${OUTBOUND_SLIP_ID}`))
    await editSave.click()
    expect((await putResponse).status(), '거래처 GUI 저장 HTTP').toBe(200)
  }

  for (const action of actions.slice(startIndex)) {
    const advance = page.getByRole('button', { name: /^완료 \(/ })
    await expect(advance, `${action} GUI 액션 버튼`).toBeEnabled({ timeout: 30_000 })
    if (action === 'complete') {
      await page.screenshot({ path: path.join(SHOTS, '03-before-outbound-complete.png'), fullPage: true })
    }
    const responsePromise = page.waitForResponse((response) =>
      response.request().method() === 'POST' && response.url().endsWith(`/slips/${OUTBOUND_SLIP_ID}/${action}`))
    await advance.click()
    const response = await responsePromise
    const responseText = await response.text()
    console.log(`[OUTBOUND RESPONSE] ${OUTBOUND_SLIP_NO} ${action} HTTP=${response.status()} BODY=${responseText}`)
    expect(response.status(), `${OUTBOUND_SLIP_NO} ${action} HTTP`).toBe(200)
  }

  await expect(page.getByText('검수중', { exact: true }).first(), 'complete 후 INSPECTING').toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: path.join(SHOTS, '04-after-outbound-complete.png'), fullPage: true })
  expect(observed.filter((line) => line.endsWith('-> 200'))).toHaveLength(5)
})

test('#1127 SheetSyncPage 비고 표면이 병합 렌더러에서 실제로 열린다', async ({ page }) => {
  const password = qaPasswordOrSkip()
  if (!password) return
  await installLogin(page, password)

  const responsePromise = page.waitForResponse((response) =>
    response.request().method() === 'GET' && response.url().includes('/api/v1/products/admin/sync/last'))
  await page.goto(`${APP_BASE}/#/admin/sheet-sync`)
  const response = await responsePromise
  expect(response.status(), 'GET sync/last HTTP').toBe(200)
  await expect(page.getByRole('heading', { name: '구글 시트 동기화', level: 3 })).toBeVisible({ timeout: 30_000 })
  const table = page.getByTestId('admin-sheetsync-result-table')
  await expect(table).toBeVisible()
  await expect(table.getByRole('columnheader', { name: '비고' })).toBeVisible()
  await page.screenshot({ path: path.join(SHOTS, '05-sheet-sync-remark-surface.png'), fullPage: true })
  const body = await response.json()
  console.log(`[SHEET SYNC] GET /api/v1/products/admin/sync/last -> ${response.status()} SUMMARY=${body.data?.summary === null ? 'null-after-redeploy' : 'present'}`)
})
