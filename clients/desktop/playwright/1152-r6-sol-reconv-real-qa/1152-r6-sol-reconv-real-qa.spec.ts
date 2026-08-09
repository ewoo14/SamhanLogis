import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import { expect, test, type APIRequestContext, type Page } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['REAL_QA_RENDERER_BASE_URL'] ?? 'http://127.0.0.1:5175'
const API_BASE = 'http://127.0.0.1:8080'
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1152-r6-sol-reconv-real-qa'))
const NEWEST_NONE_MODEL = 'S3-1111-GUARD-API-20260807-S3'
const KNOWN_NON_GOODS_MODEL = 'AAAA-00026'
const KNOWN_GOODS_MODEL = 'AF90H17D24GN'

type ProductRow = {
  modelCode?: string | null
  modelName?: string | null
  name?: string | null
  goodsType?: string | null
  usageScope?: string | null
  estimateCategories?: string[] | null
  productCategory?: string | null
}

async function loginAndInstallStub(page: Page): Promise<string> {
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  expect(response.ok(), `실서버 로그인 실패: HTTP ${response.status()}`).toBeTruthy()
  const body = await response.json()
  const token = body.data?.token ?? ''
  expect(token, '실서버 로그인 토큰이 비어 있음').not.toBe('')
  await page.addInitScript(({ token: tok, userId, role, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token: tok, userId, role, fullName: displayName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, {
    token,
    userId: body.data?.userId ?? '',
    role: body.data?.role ?? 'MASTER',
    displayName: body.data?.displayName ?? '개발마스터',
  })
  return token
}

async function products(
  request: APIRequestContext,
  token: string,
  params: Record<string, string | number>,
): Promise<{ rows: ProductRow[]; totalElements: number }> {
  const response = await request.get(`${API_BASE}/api/products`, {
    headers: { Authorization: `Bearer ${token}` },
    params,
  })
  expect(response.ok(), `품목 조회 실패: HTTP ${response.status()}`).toBeTruthy()
  const body = await response.json()
  return {
    rows: Array.isArray(body.data?.content) ? body.data.content : [],
    totalElements: Number(body.data?.totalElements ?? 0),
  }
}

async function gotoEstimateItems(page: Page): Promise<ReturnType<Page['getByRole']>> {
  await page.goto(`${BASE_URL}/#/products/estimate-items`)
  await expect(
    page.getByTestId('estimate-items-category-tabs'),
    '견적품목 관리 화면 고유 카테고리 탭이 없어 화면 도달 실패',
  ).toBeVisible({ timeout: 30000 })
  const input = page.getByRole('combobox', { name: '기초품목 선택' })
  await expect(input).toBeVisible()
  return input
}

async function countSearchRequests(page: Page, action: () => Promise<void>) {
  const requests: string[] = []
  const listener = (request: { method(): string; url(): string }) => {
    const url = new URL(request.url())
    if (request.method() === 'GET' && url.pathname === '/api/products') requests.push(url.toString())
  }
  page.on('request', listener)
  await action()
  await page.waitForTimeout(900)
  page.off('request', listener)
  return requests
}

test('실 검색 응답 3,083행 goodsType 전수와 50건 절단을 재측정한다', async ({ page }) => {
  const token = await loginAndInstallStub(page)
  const measuredAt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul', dateStyle: 'short', timeStyle: 'medium', hour12: false,
  }).format(new Date())
  const all = await products(page.request, token, { page: 0, size: 10000 })
  const goodsTypePresent = all.rows.filter((row) => row.goodsType === 'GOODS' || row.goodsType === 'NON_GOODS').length
  const goodsTypeMissing = all.rows.length - goodsTypePresent
  console.log(`MEASURED_AT_KST=${measuredAt}`)
  console.log(`TOTAL_ELEMENTS=${all.totalElements} CONTENT_ROWS=${all.rows.length} GOODS_TYPE_PRESENT=${goodsTypePresent} GOODS_TYPE_MISSING=${goodsTypeMissing}`)
  console.log(`FIRST_ROW_KEYS=${Object.keys(all.rows[0] ?? {}).sort().join(',')}`)
  expect(all.totalElements).toBe(3083)
  expect(all.rows).toHaveLength(3083)

  const broad = await products(page.request, token, { q: 'A', page: 0, size: 10000 })
  const first50 = await products(page.request, token, { q: 'A', page: 0, size: 50 })
  const visibleCodes = new Set(first50.rows.map((row) => row.modelCode ?? row.modelName))
  const outside = broad.rows.find((row) => {
    const code = row.modelCode ?? row.modelName
    return code && !visibleCodes.has(code) && row.productCategory !== 'MATERIAL'
      && !(row.estimateCategories ?? []).includes('HOME_MULTI')
  })
  expect(broad.totalElements, '한 글자 검색이 50건을 넘지 않아 경계 검증 불가').toBeGreaterThan(50)
  expect(outside, '50건 밖의 견적 추가 가능 품목을 찾지 못함').toBeTruthy()
  console.log(`BROAD_A_TOTAL=${broad.totalElements} FIRST_PAGE=${first50.rows.length} OUTSIDE_50_MODEL=${outside?.modelCode ?? outside?.modelName}`)
  expect(goodsTypeMissing).toBe(0)
})

test('한 글자·여러 글자·빠른 연속 입력은 각각 검색 요청 1회이며 size=50이다', async ({ page }) => {
  await loginAndInstallStub(page)

  let input = await gotoEstimateItems(page)
  const one = await countSearchRequests(page, () => input.fill('A'))
  expect(one).toHaveLength(1)
  expect(new URL(one[0]!).searchParams.get('size')).toBe('50')
  await page.keyboard.press('Escape')

  input = await gotoEstimateItems(page)
  const several = await countSearchRequests(page, () => input.fill('AF90'))
  expect(several).toHaveLength(1)
  expect(new URL(several[0]!).searchParams.get('size')).toBe('50')
  await page.keyboard.press('Escape')

  input = await gotoEstimateItems(page)
  const rapid = await countSearchRequests(page, () => input.pressSequentially('AF90H17D24GN', { delay: 20 }))
  expect(rapid).toHaveLength(1)
  expect(new URL(rapid[0]!).searchParams.get('size')).toBe('50')
  console.log(`NETWORK_CALLS_ONE=${one.length} MULTI=${several.length} RAPID=${rapid.length}`)
})

test('50건 밖 품목은 한 글자 검색 선택창에서 도달 불가하지만 최신 usageScope NONE 품목은 정확 검색된다', async ({ page }) => {
  const token = await loginAndInstallStub(page)
  const broad = await products(page.request, token, { q: 'A', page: 0, size: 10000 })
  const first50 = await products(page.request, token, { q: 'A', page: 0, size: 50 })
  const visibleCodes = new Set(first50.rows.map((row) => row.modelCode ?? row.modelName))
  const outside = broad.rows.find((row) => {
    const code = row.modelCode ?? row.modelName
    return code && !visibleCodes.has(code) && row.productCategory !== 'MATERIAL'
      && !(row.estimateCategories ?? []).includes('HOME_MULTI')
  })
  const outsideCode = outside?.modelCode ?? outside?.modelName ?? ''
  expect(outsideCode).not.toBe('')

  let input = await gotoEstimateItems(page)
  await input.fill('A')
  const dialog = page.getByRole('dialog')
  await expect(dialog, '한 글자 다건 검색의 선택 모달이 열리지 않음').toBeVisible({ timeout: 15000 })
  await expect(dialog.getByText(outsideCode, { exact: true }), '50건 밖 품목이 뜻밖에 모달에 노출됨').toHaveCount(0)
  await page.screenshot({ path: path.join(SHOTS, '01-size-50-outside-unreachable.png'), fullPage: false })
  console.log(`UNREACHABLE_OUTSIDE_50_MODEL=${outsideCode}`)
  await page.keyboard.press('Escape')

  input = await gotoEstimateItems(page)
  await input.fill(NEWEST_NONE_MODEL)
  await expect(page.getByRole('group', { name: '선택한 항목' }).getByText(NEWEST_NONE_MODEL, { exact: true }),
    'usageScope NONE 최신 기초품목을 정확 검색해 선택하지 못함').toBeVisible({ timeout: 15000 })
  await page.screenshot({ path: path.join(SHOTS, '02-newest-none-searchable.png'), fullPage: false })
})

test('실 견적 화면에서 비상품 수량 1과 상품 수량 보존이 양방향으로 도달한다', async ({ page }) => {
  const token = await loginAndInstallStub(page)
  const nonGoodsResult = await products(page.request, token, { q: KNOWN_NON_GOODS_MODEL, page: 0, size: 50 })
  const goodsResult = await products(page.request, token, { q: KNOWN_GOODS_MODEL, page: 0, size: 50 })
  const nonGoods = nonGoodsResult.rows.find((row) => (row.modelCode ?? row.modelName) === KNOWN_NON_GOODS_MODEL)
  const goods = goodsResult.rows.find((row) => (row.modelCode ?? row.modelName) === KNOWN_GOODS_MODEL)
  expect(nonGoods, 'DB에서 확인한 NON_GOODS 품목의 검색 응답이 없음').toBeTruthy()
  expect(goods, 'DB에서 확인한 GOODS 품목의 검색 응답이 없음').toBeTruthy()

  await page.goto(`${BASE_URL}/#/sales/estimates/new`)
  await expect(page.getByTestId('estimate-form-save-button'),
    '견적 작성 화면 고유 저장 버튼이 없어 화면 도달 실패').toBeVisible({ timeout: 30000 })
  const partnerInput = page.getByRole('combobox', { name: '거래처 검색' })
  await partnerInput.fill('서초1동주민센타')
  await page.waitForTimeout(700)
  await partnerInput.press('Enter')
  await expect(partnerInput, '실 거래처가 견적에 확정되지 않음').toHaveValue('서초1동주민센타')
  const modelInput = page.getByRole('combobox', { name: '라인 1 모델명' })
  const quantity = page.getByTestId('estimate-form-line-0-qty')
  const unitPrice = page.getByTestId('estimate-form-line-0-unit-price')

  await modelInput.fill(KNOWN_GOODS_MODEL)
  await page.waitForTimeout(700)
  await modelInput.press('Enter')
  await quantity.fill('3')
  await unitPrice.fill('54321')
  await unitPrice.blur()
  await expect(quantity, '상품 수량 3이 보존되지 않음').toHaveValue('3')

  await modelInput.fill(KNOWN_NON_GOODS_MODEL)
  await page.waitForTimeout(700)
  await modelInput.press('Enter')
  await unitPrice.fill('12345')
  await unitPrice.blur()
  await expect(quantity, '비상품 납품가 입력 후 수량이 1이 아님').toHaveValue('1')

  await modelInput.fill(KNOWN_GOODS_MODEL)
  await page.waitForTimeout(700)
  await modelInput.press('Enter')
  await quantity.fill('4')
  await unitPrice.fill('65432')
  await unitPrice.blur()
  await expect(quantity, '비상품을 거친 뒤 상품 수량 4가 보존되지 않음').toHaveValue('4')

  await modelInput.fill(KNOWN_NON_GOODS_MODEL)
  await page.waitForTimeout(700)
  await modelInput.press('Enter')
  await unitPrice.fill('12345')
  await unitPrice.blur()
  await expect(quantity, '최종 견적 포함 대상 비상품 수량이 1이 아님').toHaveValue('1')

  let capturedBody: { lines?: Array<{ modelName?: string; quantity?: number }> } | undefined
  await page.route('**/slips/estimates', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    capturedBody = route.request().postDataJSON()
    await route.abort('blockedbyclient')
  })
  await expect(page.getByTestId('estimate-form-save-button'), '견적 저장 버튼이 비활성이라 payload 도달 불가').toBeEnabled()
  const post = page.waitForRequest((request) =>
    request.method() === 'POST' && new URL(request.url()).pathname === '/slips/estimates')
  await page.getByTestId('estimate-form-save-button').click()
  await post
  expect(capturedBody?.lines?.some((line) =>
    line.modelName === KNOWN_NON_GOODS_MODEL && line.quantity === 1),
  '실 DB 전송 직전 견적 payload에 비상품 수량 1 라인이 없음').toBeTruthy()
  await page.screenshot({ path: path.join(SHOTS, '03-bidirectional-quantity.png'), fullPage: false })
})
