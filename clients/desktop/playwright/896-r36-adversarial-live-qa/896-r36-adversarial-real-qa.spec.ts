import { expect, test, type Page, type Route } from '@playwright/test'
import { createRequire } from 'node:module'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const require = createRequire(import.meta.url)
const { resolveQaCredential } = require('../../../../scripts/lib/qa-credentials.cjs') as {
  resolveQaCredential: (key: string, options?: { envFilePath?: string }) => string
}

const DESKTOP_BASE = process.env['QA_DESKTOP_BASE'] ?? 'http://127.0.0.1:5316'
const API_BASE = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const CREDENTIAL_FILE = process.env['QA_CREDENTIAL_FILE']
const dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/2026-08-10-896-r36-adversarial'))

const HOME_SOURCE = 'AM052BN6PBH1'
const HOME_SECOND_SOURCE = 'AJ060MXHNBC1'
const HOME_TARGET = 'PC6NUDK1NW'
const HOME_RULE = 'UI_HOME_MULTI_AM052BN6PBH1'
const REJECTED_MATERIAL = 'INDOOR-MATERIAL'
const REJECTED_NON_GOODS = 'PANEL-NON-GOODS'

type Category = 'HOME_MULTI' | 'SINGLE_SET'

interface LoginResult {
  token: string
  role: string
  userId: string
  displayName: string
}

interface Rule {
  ruleKey: string
  estimateCategory: string
  name: string
  enabled: boolean
  aggregation: 'SUM'
  when: Record<string, unknown>
  inactiveBehavior: 'ZERO'
  conflictPolicy: 'REPLACE'
  priority: number
  legacyRef: string
  sources: Array<{ productCode: string; productName: string; factor: number }>
  targets: Array<{
    productCode: string
    productName: string
    multiplier: number
    roundingMode: 'NONE'
    displayOrder: number
  }>
}

function product(
  modelCode: string,
  name: string,
  category: Category,
  options: {
    productCategory?: string
    catL?: string
    goodsType?: 'GOODS' | 'NON_GOODS'
    eligible?: boolean
  } = {},
) {
  return {
    modelCode,
    name,
    usageScope: 'BOTH',
    estimateCategory: category,
    estimateCategories: [{ category, displayOrder: 1 }],
    productCategory: options.productCategory ?? category,
    catL: { id: `cat-${modelCode}`, name: options.catL ?? '실외기' },
    catM: null,
    catS: null,
    usageScopeManual: false,
    displayOrder: 1,
    releasePrice: 1000,
    deliveryPrice: 900,
    goodsType: options.goodsType ?? 'GOODS',
    quantitySyncTargetEligible: options.eligible ?? false,
    fixedDiscountRate: null,
    hasVariableDiscount: false,
    variableDiscountManual: false,
    legacyDiscountFlag: false,
    status: 'ACTIVE',
    discountFlags: '',
    productType: 'SINGLE',
    componentCount: 0,
    componentSetToken: null,
  }
}

function pageOf(content: ReturnType<typeof product>[]) {
  return {
    content,
    totalElements: content.length,
    totalPages: 1,
    number: 0,
    size: Math.max(content.length, 1),
    first: true,
    last: true,
  }
}

async function login(page: Page): Promise<LoginResult> {
  const password = resolveQaCredential(
    'QA_DEV_DEFAULT_PASSWORD',
    CREDENTIAL_FILE ? { envFilePath: CREDENTIAL_FILE } : undefined,
  )
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password },
  })
  const text = await response.text()
  expect(response.ok(), `dev_master 로그인 실패: HTTP ${response.status()} ${text}`).toBeTruthy()
  const data = JSON.parse(text).data ?? {}
  const result = {
    token: data.token ?? '',
    role: data.role ?? '',
    userId: data.userId ?? '',
    displayName: data.displayName ?? 'dev_master',
  }
  expect(result.token).not.toBe('')
  await page.addInitScript(
    ({ token, role, userId, displayName }: LoginResult) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token, role, userId, fullName: displayName, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    result,
  )
  return result
}

async function fulfillJson(route: Route, json: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json; charset=utf-8', body: JSON.stringify(json) })
}

async function installStaticRoutes(page: Page, category: Category, rows: ReturnType<typeof product>[], rules: Rule[]) {
  await page.route('**/api/v1/classifications?**', (route) => fulfillJson(route, []))
  await page.route('**/api/v1/quantity-sync-rules?**', (route) => fulfillJson(route, rules))
  await page.route('**/api/v1/products?**', async (route) => {
    const url = new URL(route.request().url())
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const visible = q === 'eligibility'
      ? rows.filter((row) => [HOME_TARGET, REJECTED_MATERIAL, REJECTED_NON_GOODS, 'QA_R36_T'].includes(row.modelCode))
      : rows.filter((row) => !q || row.modelCode.toLowerCase().includes(q) || row.name.toLowerCase().includes(q))
    await fulfillJson(route, pageOf(visible))
  })
  await page.route('**/api/products?**', (route) => {
    const candidates = [
      {
        id: 'material-guard', modelName: 'GENERAL-MATERIAL', modelCode: 'GENERAL-MATERIAL',
        name: '일반 picker 제외 MATERIAL', productCategory: 'MATERIAL', status: 'ACTIVE', estimateCategories: [],
      },
      {
        id: 'general-allowed', modelName: 'GENERAL-ALLOWED', modelCode: 'GENERAL-ALLOWED',
        name: '일반 picker 허용 본체', productCategory: category, status: 'ACTIVE', estimateCategories: [],
      },
    ]
    return fulfillJson(route, {
      success: true,
      code: 'OK',
      message: '성공',
      data: pageOf(candidates as never),
      timestamp: new Date().toISOString(),
    })
  })
}

async function openCategory(page: Page, category: Category) {
  await page.goto(`${DESKTOP_BASE}/#/products/estimate-items?category=${category}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '견적품목 관리', exact: true })).toBeVisible({ timeout: 30_000 })
}

async function searchRow(page: Page, modelCode: string) {
  await page.getByTestId('estimate-items-search-input').fill(modelCode)
  await page.getByTestId('estimate-items-query-button').click()
  await expect(page.getByRole('row').filter({ hasText: modelCode })).toBeVisible({ timeout: 20_000 })
}

async function addOnlyEligibleTarget(page: Page, source: string, expectedTarget: string) {
  const input = page.getByTestId(`estimate-items-quantity-sync-${source}-input`)
  await input.fill('eligibility')
  await expect(page.getByTestId(`estimate-items-quantity-sync-${source}-chip-${expectedTarget}`)).toBeVisible({ timeout: 20_000 })
}

test.beforeAll(() => fs.mkdirSync(SHOTS, { recursive: true }))

test.describe.serial('PR #1126 R35 fix 이후 2차 적대검증 — HEAD 프런트 실 조작', () => {
  test('현재 라이브 product-service 503 원문을 브라우저에서 보존한다', async ({ page }) => {
    await login(page)
    const productsResponse = page.waitForResponse((response) =>
      response.url().includes('/api/v1/products?') && response.request().method() === 'GET',
    )
    const rulesResponse = page.waitForResponse((response) =>
      response.url().includes('/api/v1/quantity-sync-rules?') && response.request().method() === 'GET',
    )
    await openCategory(page, 'HOME_MULTI')
    const products = await productsResponse
    const rules = await rulesResponse
    const productsBody = await products.text()
    const rulesBody = await rules.text()
    expect(products.status()).toBe(503)
    expect(rules.status()).toBe(503)
    await expect(page.getByTestId('estimate-items-list-error')).toBeVisible()
    await page.screenshot({ path: path.join(SHOTS, '00-live-product-service-503.png'), fullPage: false })
    console.log(`R36_LIVE_PRODUCTS http=${products.status()} body=${productsBody}`)
    console.log(`R36_LIVE_RULES http=${rules.status()} body=${rulesBody}`)
  })

  test('역방향 표시와 picker 과노출 방지, 일반 picker MATERIAL 가드를 사용자 경로로 밟는다', async ({ page }) => {
    await login(page)
    const rows = [
      product(HOME_SOURCE, '본체 AM052', 'HOME_MULTI'),
      product(HOME_SECOND_SOURCE, '본체 AJ060', 'HOME_MULTI'),
      product(HOME_TARGET, '판넬 PC6', 'HOME_MULTI', { productCategory: 'HOME_MULTI', catL: '판넬', eligible: true }),
      product(REJECTED_MATERIAL, '검증 실내기 MATERIAL', 'HOME_MULTI', { productCategory: 'MATERIAL', catL: '실내기', eligible: false }),
      product(REJECTED_NON_GOODS, '검증 판넬 NON_GOODS', 'HOME_MULTI', { productCategory: 'MATERIAL', catL: '판넬', goodsType: 'NON_GOODS', eligible: false }),
    ]
    const rules: Rule[] = [{
      ruleKey: HOME_RULE,
      estimateCategory: 'HOME_MULTI',
      name: '홈멀티 활성 규칙',
      enabled: true,
      aggregation: 'SUM',
      when: {},
      inactiveBehavior: 'ZERO',
      conflictPolicy: 'REPLACE',
      priority: 1000,
      legacyRef: 'UI:HOME_MULTI',
      sources: [{ productCode: HOME_SOURCE, productName: '본체 AM052', factor: 1 }],
      targets: [
        { productCode: HOME_TARGET, productName: '판넬 PC6', multiplier: 1, roundingMode: 'NONE', displayOrder: 1 },
        { productCode: 'AWR-WE13N', productName: '리모컨', multiplier: 1, roundingMode: 'NONE', displayOrder: 2 },
        { productCode: 'FH-LFHLN', productName: '호스', multiplier: 1, roundingMode: 'NONE', displayOrder: 3 },
      ],
    }]
    await installStaticRoutes(page, 'HOME_MULTI', rows, rules)
    await openCategory(page, 'HOME_MULTI')

    await searchRow(page, HOME_TARGET)
    const inbound = page.getByTestId(`estimate-items-quantity-sync-inbound-${HOME_TARGET}`)
    await expect(inbound).toContainText('나를 부르는 본체')
    await expect(inbound).toContainText('본체 AM052:1')
    await expect(inbound).toContainText(HOME_RULE)
    await expect(page.getByTestId(`estimate-items-quantity-sync-${HOME_TARGET}-input`)).toHaveCount(0)
    await expect(page.getByTestId(`estimate-items-quantity-sync-${HOME_TARGET}-save`)).toHaveCount(0)
    await page.screenshot({ path: path.join(SHOTS, '01-pc6-inbound-source-readonly.png'), fullPage: false })

    await searchRow(page, HOME_SECOND_SOURCE)
    await addOnlyEligibleTarget(page, HOME_SECOND_SOURCE, HOME_TARGET)
    await expect(page.getByText(REJECTED_MATERIAL, { exact: true })).toHaveCount(0)
    await expect(page.getByText(REJECTED_NON_GOODS, { exact: true })).toHaveCount(0)
    await page.screenshot({ path: path.join(SHOTS, '02-eligible-only-target-picker.png'), fullPage: false })

    const generalSection = page.getByTestId('estimate-items-add-product')
    await generalSection.getByPlaceholder('모델명 또는 품목명 입력').fill('GENERAL')
    await expect(generalSection).toContainText('GENERAL-ALLOWED', { timeout: 20_000 })
    await expect(generalSection).not.toContainText('GENERAL-MATERIAL')
    await page.screenshot({ path: path.join(SHOTS, '03-general-picker-material-still-excluded.png'), fullPage: false })

    console.log('R36_FRONT_FILTER eligible=PC6NUDK1NW rejected=INDOOR-MATERIAL,PANEL-NON-GOODS')
    console.log('R36_INBOUND target=PC6NUDK1NW source=AM052BN6PBH1 readonly=true')
    console.log('R36_GENERAL_PICKER allowed=GENERAL-ALLOWED excluded=GENERAL-MATERIAL')
  })

  test('D15 다중 source에서 한 source 제거 후 마지막 source 제거를 실제 버튼으로 완주한다', async ({ page }) => {
    await login(page)
    const sourceA = 'QA_R36_SA'
    const sourceB = 'QA_R36_SB'
    const target = 'QA_R36_T'
    const rows = [
      product(sourceA, 'R36 본체 A', 'SINGLE_SET'),
      product(sourceB, 'R36 본체 B', 'SINGLE_SET'),
      product(target, 'R36 부자재 T', 'SINGLE_SET', { productCategory: 'MATERIAL', catL: '부자재', eligible: true }),
    ]
    let rules: Rule[] = []
    const writes: Array<{ method: string; body?: unknown }> = []

    await page.route('**/api/v1/classifications?**', (route) => fulfillJson(route, []))
    await page.route('**/api/v1/products?**', async (route) => {
      const url = new URL(route.request().url())
      const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
      const visible = q === 'eligibility'
        ? rows.filter((row) => row.modelCode === target)
        : rows.filter((row) => !q || row.modelCode.toLowerCase().includes(q) || row.name.toLowerCase().includes(q))
      await fulfillJson(route, pageOf(visible))
    })
    await page.route('**/api/v1/quantity-sync-rules**', async (route) => {
      const request = route.request()
      const method = request.method()
      if (method === 'GET') return fulfillJson(route, rules)
      if (method === 'DELETE') {
        writes.push({ method })
        rules = []
        return route.fulfill({ status: 204, body: '' })
      }
      const body = request.postDataJSON()
      writes.push({ method, body })
      const sourceNames = new Map([[sourceA, 'R36 본체 A'], [sourceB, 'R36 본체 B']])
      rules = [{
        ...body,
        sources: body.sources.map((source: { productCode: string; factor: number }) => ({
          ...source,
          productName: sourceNames.get(source.productCode) ?? source.productCode,
        })),
        targets: body.targets.map((item: { productCode: string; multiplier: number; roundingMode: 'NONE'; displayOrder: number }) => ({
          ...item,
          productName: 'R36 부자재 T',
        })),
      }]
      return fulfillJson(route, rules[0], method === 'POST' ? 201 : 200)
    })

    await openCategory(page, 'SINGLE_SET')

    await searchRow(page, sourceA)
    await addOnlyEligibleTarget(page, sourceA, target)
    await page.getByTestId(`estimate-items-quantity-sync-${sourceA}-save`).click()
    await expect.poll(() => rules[0]?.sources.map((source) => source.productCode)).toEqual([sourceA])

    await searchRow(page, sourceB)
    await addOnlyEligibleTarget(page, sourceB, target)
    await page.getByTestId(`estimate-items-quantity-sync-${sourceB}-save`).click()
    await expect.poll(() => rules[0]?.sources.map((source) => source.productCode)).toEqual([sourceA, sourceB])
    await page.getByTestId('estimate-items-search-input').fill('QA_R36_S')
    await page.getByTestId('estimate-items-query-button').click()
    await expect(page.getByRole('row').filter({ hasText: 'QA_R36_S' })).toHaveCount(2)
    await page.screenshot({ path: path.join(SHOTS, '04-multi-source-created.png'), fullPage: false })

    await searchRow(page, sourceB)
    await page.getByRole('button', { name: `${target} 동기화 제거` }).click()
    await page.getByTestId(`estimate-items-quantity-sync-${sourceB}-save`).click()
    await expect.poll(() => rules[0]?.sources.map((source) => source.productCode)).toEqual([sourceA])
    expect(rules[0]?.targets.map((item) => item.productCode)).toEqual([target])
    await searchRow(page, sourceA)
    await expect(page.getByTestId(`estimate-items-quantity-sync-${sourceA}-chip-${target}`)).toBeVisible()
    await page.screenshot({ path: path.join(SHOTS, '05-one-source-remains.png'), fullPage: false })

    await page.getByRole('button', { name: `${target} 동기화 제거` }).click()
    await page.getByTestId(`estimate-items-quantity-sync-${sourceA}-save`).click()
    await expect.poll(() => rules).toEqual([])
    expect(writes.map((write) => write.method)).toEqual(['POST', 'PUT', 'PUT', 'DELETE'])
    await page.screenshot({ path: path.join(SHOTS, '06-last-source-deletes-rule.png'), fullPage: false })

    console.log('R36_D15 writes=POST,PUT,PUT,DELETE sources=1>2>1>0 target=QA_R36_T')
  })
})
