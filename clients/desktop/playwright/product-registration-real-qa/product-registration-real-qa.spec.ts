import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
/**
 * 품목 등록/관리 고도화 (PR #485) Docker 실서버 QA Playwright spec.
 *
 * 대상: 신규 품목 등록 폼 — 종류 2구분(단일/세트) + 상품/비상품.
 * 실서버: http://localhost:8080 (api-gateway), http://localhost:5175 (FE dev)
 * 인증: dev_master / QA_DEV_DEFAULT_PASSWORD 환경변수 (MASTER role, products.admin CREATE)
 *
 * 실행:
 *   cd C:\dev\Samhan-Public\clients\desktop
 *   node_modules\.bin\playwright test --config=playwright.real-qa.config.ts playwright/product-registration-real-qa --reporter=line --timeout=60000
 */
import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import { fileURLToPath } from 'url'

const _dirname = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url))

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://localhost:5175'
const API_BASE = 'http://localhost:8080'

const SCREENSHOTS_DIR = resolveQaShotsDir(path.resolve(
  _dirname,
  '../../../../docs/qa/product-master-registration/screenshots',
))
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true })

async function screenshot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`), fullPage: true })
}

async function loginAndInstallStub(page: Page, loginId: string, password: string): Promise<void> {
  const res = await page.request.post(`${API_BASE}/auth/login`, { data: { loginId, password } })
  const body = await res.json()
  const token: string = body.data?.token ?? ''
  const role: string = body.data?.role ?? 'MASTER'
  const userId: string = body.data?.userId ?? ''
  const displayName: string = body.data?.displayName ?? loginId
  await page.addInitScript(({ tok, r, uid, name }: { tok: string; r: string; uid: string; name: string }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token: tok, userId: uid, role: r, fullName: name, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, { tok: token, r: role, uid: userId, name: displayName })
}

test('품목 등록 폼 — 종류 2구분·상품/비상품', async ({ page }) => {
  await loginAndInstallStub(page, 'dev_master', (resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')))

  await page.goto(`${BASE_URL}/#/products/new`)
  await page.waitForSelector('[data-testid="product-form-model-name"]', { timeout: 30000 })
  // 1) 기본(단일) — 종류 라디오 + 상품/비상품 토글 + 필드
  await expect(page.getByRole('radio', { name: '단일' })).toBeVisible()
  await expect(page.getByRole('radio', { name: '세트' })).toBeVisible()
  await expect(page.getByRole('radio', { name: '세트구성품' })).toHaveCount(0)
  await screenshot(page, '01-form-general')

  // 1b) 사양 추가 → 사양명/값 입력 행 등장 (동적 사양 등록 위치)
  await page.getByTestId('product-form-add-spec').click()
  await page.getByTestId('product-form-add-spec').click()
  await screenshot(page, '01b-spec-rows')

  // 2) 비상품 선택 (상품/비상품 토글)
  await page.selectOption('[data-testid="product-form-goods-type"]', 'NON_GOODS')
  await screenshot(page, '02-non-goods')

  // 3) 종류는 단일/세트만 제공 — 제품 쪽 부모 세트/구성 분류는 없음
  await page.selectOption('[data-testid="product-form-goods-type"]', 'GOODS')
  await expect(page.locator('input[name="itemKind"][value="SET_COMPONENT"]')).toHaveCount(0)
  await expect(page.getByText('부모 세트')).toHaveCount(0)
  await expect(page.locator('[data-testid="product-form-component-kind"]')).toHaveCount(0)
  await screenshot(page, '03-kind-single-set-only')

  // 4) 종류 = 세트(SET) → 세트 처리(bundleMode)
  await page.locator('input[name="itemKind"][value="SET"]').click()
  await page.waitForSelector('[data-testid="product-form-bundle-mode"]', { timeout: 5000 })
  await screenshot(page, '04-set-bundle-mode')

  console.log('[product-registration-real-qa] screenshots captured to', SCREENSHOTS_DIR)
})
