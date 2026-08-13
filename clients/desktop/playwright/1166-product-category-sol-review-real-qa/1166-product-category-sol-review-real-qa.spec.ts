import { expect, test, type Page, type Route } from '@playwright/test'
// Real QA: dedicated services are required; the *-real-qa name keeps this out of the mock hard gate.
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5316'
const DIRNAME = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(DIRNAME, '../../../../docs/qa/2026-08-11-category-rename2'))

const envelope = (data: unknown) => ({
  success: true,
  code: 'OK',
  message: '성공',
  data,
  timestamp: '2026-08-11T00:00:00Z',
})

async function installAuth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({
          token: 'sol-1166-review-token',
          userId: '00000000-0000-0000-0000-000000010001',
          role: 'MASTER',
          fullName: 'SOL 검토자',
          partnerCode: null,
        }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  })
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  })
}

async function installApiFixture(page: Page): Promise<void> {
  await page.route('http://127.0.0.1:1/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/auth/admin/permissions/my') {
      await fulfillJson(route, envelope({
        'products.list': ['VIEW'],
        'products.admin': ['VIEW', 'CREATE', 'UPDATE', 'DELETE'],
      }))
      return
    }
    if (url.pathname === '/api/products/categories') {
      await fulfillJson(route, envelope([
        {
          id: '00000000-0000-0000-0000-000000001100',
          code: 'UNCLASSIFIED',
          name: '미분류',
          parentId: null,
          displayOrder: 91,
          children: [],
        },
      ]))
      return
    }
    if (url.pathname === '/api/v1/spec-key-templates') {
      await fulfillJson(route, [])
      return
    }
    if (url.pathname === '/api/v1/products') {
      const categoryId = url.searchParams.get('categoryId')
      const isUnclassified = categoryId === '00000000-0000-0000-0000-000000001100'
      await fulfillJson(route, {
        content: [{
          modelCode: isUnclassified ? 'UNCLASSIFIED-001' : 'AM180AXVUHH1',
          name: isUnclassified ? '미분류 품목' : 'DVM S2 프레스티지 18HP',
          physicalCategory: isUnclassified
            ? { code: 'UNCLASSIFIED', name: '미분류' }
            : { code: 'COMMERCIAL_MULTI', name: '상업 멀티' },
          usageScope: 'BOTH',
          estimateCategories: [{ category: 'COMMERCIAL_MULTI', displayOrder: 1 }],
          productCategory: 'COMMERCIAL_MULTI',
          usageScopeManual: false,
          releasePrice: 1_000_000,
          deliveryPrice: 800_000,
          goodsType: 'GOODS',
          hasVariableDiscount: false,
          variableDiscountManual: false,
          productType: 'SINGLE',
          componentCount: 0,
        }],
        totalElements: isUnclassified ? 2_126 : 3_084,
        totalPages: isUnclassified ? 43 : 62,
        number: 0,
        size: 50,
        first: true,
        last: false,
      })
      return
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json; charset=utf-8',
      body: JSON.stringify(envelope(null)),
    })
  })
}

async function dismissUnrelatedUpdateBanner(page: Page): Promise<void> {
  const close = page.getByTestId('app-auto-update-dismiss')
  const appeared = await close.waitFor({ state: 'visible', timeout: 1_500 })
    .then(() => true)
    .catch(() => false)
  if (appeared) await close.click()
}

test.beforeEach(async ({ page }) => {
  fs.mkdirSync(SHOTS, { recursive: true })
  await installAuth(page)
  await installApiFixture(page)
})

test('등록 폼의 필수 카테고리 선택에서 미분류를 선택할 수 있다', async ({ page, browserName }) => {
  expect(browserName).toBe('chromium')
  await page.goto(`${BASE_URL}/#/products/new`, { waitUntil: 'domcontentloaded' })
  await dismissUnrelatedUpdateBanner(page)
  const category = page.getByTestId('product-form-category')
  await expect(category).toBeVisible()
  await expect(category.locator('option', { hasText: '미분류 (UNCLASSIFIED)' })).toHaveCount(1)
  await category.selectOption({ label: '미분류 (UNCLASSIFIED)' })
  await expect(category).toHaveValue('00000000-0000-0000-0000-000000001100')
  await page.screenshot({ path: path.join(SHOTS, '01-form-unclassified-selected.png'), fullPage: true })
})

test('기초품목 화면에서 미분류 필터와 2,126건 카운트를 제공한다', async ({ page }) => {
  await page.goto(`${BASE_URL}/#/products/catalog`, { waitUntil: 'domcontentloaded' })
  await dismissUnrelatedUpdateBanner(page)
  await expect(page.getByTestId('product-catalog-table')).toBeVisible()
  const summary = page.getByTestId('product-catalog-summary')
  await expect(summary).toContainText('총 3,084건')
  await summary.scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(SHOTS, '02-catalog-before-category-filter.png'), fullPage: true })

  const categoryFilter = page.getByRole('combobox', { name: '제품구분' })
  await expect(categoryFilter, '기초품목 화면에 제품구분 필터가 없습니다.').toBeVisible()
  await categoryFilter.selectOption('00000000-0000-0000-0000-000000001100')
  await expect(summary).toContainText('총 2,126건')
  await expect(page.getByText(/미분류\s*2,126건/)).toBeVisible()
  await expect(page.getByTestId('product-catalog-physical-category-UNCLASSIFIED-001'))
    .toContainText('미분류')
  await summary.scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(SHOTS, '03-catalog-unclassified-filtered.png'), fullPage: true })

  await categoryFilter.selectOption('')
  await expect(summary).toContainText('총 3,084건')
  await summary.scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(SHOTS, '04-catalog-filter-cleared.png'), fullPage: true })
})
