import { expect, test, type Page } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const _dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const DESKTOP_BASE = process.env['QA_DESKTOP_BASE'] ?? 'http://127.0.0.1:5316'
const ESTIMATE_BASE = process.env['QA_ESTIMATE_BASE'] ?? 'http://127.0.0.1:5317'
const ORDER_BASE = process.env['QA_ORDER_BASE'] ?? 'http://127.0.0.1:5318'
const API_BASE = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/2026-08-09-896-chip-sol'))

const SOURCE = 'AM052BN6PBH1'
const TARGETS = ['PC6NUDK1NW', 'AWR-WE13N', 'FH-LFHLN'] as const
const UNRULED = 'AM060BN6PBH1'

interface LoginResult {
  token: string
  role: string
  userId: string
  displayName: string
}

let password = ''

test.beforeAll(() => {
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격을 읽지 못했습니다.')
  }
})

async function login(page: Page): Promise<LoginResult> {
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password },
  })
  expect(response.ok(), `dev_master 로그인 실패: HTTP ${response.status()}`).toBeTruthy()
  const data = (await response.json()).data ?? {}
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

function authHeaders(auth: LoginResult): Record<string, string> {
  return { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' }
}

async function capture(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false })
}

function numberFrom(text: string): number {
  return Number(text.replace(/[^0-9.-]/g, ''))
}

async function selectExactTarget(page: Page, modelCode: string): Promise<void> {
  const input = page.getByTestId(`estimate-items-quantity-sync-${SOURCE}-input`)
  await input.fill(modelCode)
  const chip = page.getByTestId(`estimate-items-quantity-sync-${SOURCE}-chip-${modelCode}`)
  const option = page.getByRole('option').filter({ hasText: modelCode }).first()
  const dialog = page.getByRole('dialog', { name: '품목 검색 결과' })
  await expect(chip.or(option).or(dialog)).toBeVisible({ timeout: 15_000 })
  if (await dialog.isVisible()) {
    await dialog.getByRole('checkbox', { name: modelCode, exact: true }).check()
    await dialog.getByRole('button', { name: '선택 확정' }).click()
  } else if (!(await chip.isVisible())) {
    await option.click()
  }
  await expect(chip).toBeVisible()
}

test.describe.serial('#896 SOL 5.6 첫 적대검증 — 실 GUI 수량 동기화 칩', () => {
  test('각도 1·4 — UI로 규칙 생성, 서버 저장·새로고침 복원, 기존 노출 토글 왕복', async ({ page }) => {
    const auth = await login(page)
    const beforeRules = await page.request.get(
      `${API_BASE}/api/v1/quantity-sync-rules?estimateCategory=HOME_MULTI`,
      { headers: authHeaders(auth) },
    )
    expect(beforeRules.ok(), `규칙 사전조회 실패: HTTP ${beforeRules.status()}`).toBeTruthy()
    const existingRules = await beforeRules.json()
    expect(existingRules.length).toBeLessThanOrEqual(1)
    if (existingRules.length === 1) {
      expect(existingRules[0]).toMatchObject({ ruleKey: `UI_HOME_MULTI_${SOURCE}`, enabled: true })
    }

    await page.goto(`${DESKTOP_BASE}/#/products/estimate-items?category=HOME_MULTI`, {
      waitUntil: 'domcontentloaded',
    })
    await expect(page.getByRole('heading', { name: '견적품목 관리', exact: true })).toBeVisible({ timeout: 30_000 })
    await page.getByTestId('estimate-items-search-input').fill(SOURCE)
    await page.getByTestId('estimate-items-query-button').click()
    const row = page.getByRole('row').filter({ hasText: SOURCE })
    await expect(row).toBeVisible({ timeout: 20_000 })

    const homeChip = page.getByTestId(`estimate-items-estimate-category-${SOURCE}-chip-HOME_MULTI`)
    const orderToggle = page.getByTestId(`estimate-items-order-toggle-${SOURCE}`)
    await expect(homeChip).toContainText('홈멀티')
    await expect(orderToggle).toBeChecked()
    await capture(page, '01-before-rule-existing-category-and-toggle')

    const offResponse = page.waitForResponse((response) =>
      response.url().includes(`/api/v1/products/${SOURCE}/usage`) && response.request().method() === 'PATCH',
    )
    await orderToggle.click()
    expect((await offResponse).ok()).toBeTruthy()
    await expect(orderToggle).not.toBeChecked()

    const onResponse = page.waitForResponse((response) =>
      response.url().includes(`/api/v1/products/${SOURCE}/usage`) && response.request().method() === 'PATCH',
    )
    await orderToggle.click()
    expect((await onResponse).ok()).toBeTruthy()
    await expect(orderToggle).toBeChecked()

    for (const target of TARGETS) await selectExactTarget(page, target)
    await capture(page, '02-three-target-chips-before-save')

    const saveResponse = page.waitForResponse((response) =>
      response.url().includes('/api/v1/quantity-sync-rules')
        && ['POST', 'PUT'].includes(response.request().method()),
    )
    await page.getByTestId(`estimate-items-quantity-sync-${SOURCE}-save`).click()
    const saved = await saveResponse
    expect(saved.ok(), `규칙 저장 실패: HTTP ${saved.status()} ${await saved.text()}`).toBeTruthy()

    const apiRuleResponse = await page.request.get(
      `${API_BASE}/api/v1/quantity-sync-rules?estimateCategory=HOME_MULTI`,
      { headers: authHeaders(auth) },
    )
    expect(apiRuleResponse.ok()).toBeTruthy()
    const rules = await apiRuleResponse.json()
    expect(rules).toHaveLength(1)
    expect(rules[0]).toMatchObject({
      ruleKey: `UI_HOME_MULTI_${SOURCE}`,
      estimateCategory: 'HOME_MULTI',
      enabled: true,
      sources: [{ productCode: SOURCE }],
    })
    expect(rules[0].targets.map((target: { productCode: string }) => target.productCode)).toEqual(TARGETS)

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByTestId('estimate-items-search-input').fill(SOURCE)
    await page.getByTestId('estimate-items-query-button').click()
    await expect(page.getByRole('row').filter({ hasText: SOURCE })).toBeVisible({ timeout: 30_000 })
    for (const target of TARGETS) {
      await expect(page.getByTestId(`estimate-items-quantity-sync-${SOURCE}-chip-${target}`)).toBeVisible()
    }
    await expect(page.getByTestId(`estimate-items-order-toggle-${SOURCE}`)).toBeChecked()
    await expect(page.getByTestId(`estimate-items-estimate-category-${SOURCE}-chip-HOME_MULTI`)).toContainText('홈멀티')
    await capture(page, '03-after-refresh-rule-persisted')
  })

  test('각도 2·3 — 종합견적서의 부분 발화 결함과 비규칙 품목 불변 재현', async ({ page }) => {
    await page.goto(`${ESTIMATE_BASE}/?email=dev_master%40samhan-air.com`, { waitUntil: 'domcontentloaded' })
    await page.locator('#btnGoHome').click()

    const qty = (model: string) => page.locator(`input.qty-input[data-m="${model}"]:not(.fix-dc-inp)`)
    const price = (model: string) => page.locator(`tr[data-m="${model}"] input.price-input`)
    const subtotal = (model: string) => page.locator(`td.sub[data-sub="${model}"]`)
    await expect(qty(SOURCE)).toBeVisible({ timeout: 30_000 })

    const unrelatedBefore = {
      qty: await qty(UNRULED).inputValue(),
      price: await price(UNRULED).inputValue(),
      subtotal: numberFrom(await subtotal(UNRULED).innerText()),
    }
    expect(numberFrom(unrelatedBefore.price)).toBe(575_960)
    expect(unrelatedBefore.subtotal).toBe(0)

    await qty(SOURCE).fill('2')
    await qty(SOURCE).blur()
    await page.waitForTimeout(1_000)
    const targetValues = Object.fromEntries(await Promise.all(TARGETS.map(async target => [target, {
      qty: await qty(target).inputValue(),
      unitPrice: numberFrom(await price(target).inputValue()),
      subtotal: numberFrom(await subtotal(target).innerText()),
    }])))
    console.log('[estimate 실제 대상값]', JSON.stringify(targetValues))
    expect(TARGETS.every(target => targetValues[target].qty === '2')).toBeTruthy()
    expect(targetValues['AWR-WE13N'].qty).toBe('2')
    expect(await qty(UNRULED).inputValue()).toBe(unrelatedBefore.qty)
    expect(await price(UNRULED).inputValue()).toBe(unrelatedBefore.price)
    expect(numberFrom(await subtotal(UNRULED).innerText())).toBe(unrelatedBefore.subtotal)
    console.log('[estimate 비규칙 품목 전후]', JSON.stringify({ before: unrelatedBefore, after: {
      qty: await qty(UNRULED).inputValue(),
      price: await price(UNRULED).inputValue(),
      subtotal: numberFrom(await subtotal(UNRULED).innerText()),
    }}))

    await qty(SOURCE).screenshot({ path: path.join(SHOTS, '04-estimate-source-qty-2.png') })
    for (const [index, target] of TARGETS.entries()) {
      await qty(target).screenshot({ path: path.join(SHOTS, `0${index + 5}-estimate-${target}-qty-2.png`) })
    }
    await page.locator(`tr[data-m="${UNRULED}"]`).screenshot({
      path: path.join(SHOTS, '08-estimate-unruled-quantity-price-unchanged.png'),
    })
  })

  test('각도 2 — 주문서 홈멀티 실 사용자 경로의 차단 상태 재현', async ({ page }) => {
    const partnerPin = process.env['QA_PARTNER_PIN'] ?? ''
    test.skip(!partnerPin, 'QA_PARTNER_PIN이 없어 주문서 실 로그인을 건너뜁니다.')
    const quantityRuleRequests: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/api/v1/quantity-sync-rules')) quantityRuleRequests.push(request.url())
    })

    await page.goto(ORDER_BASE, { waitUntil: 'domcontentloaded' })
    await page.locator('#bizGateInput').fill('2118712345')
    await page.locator('#btnBizQuery').click()
    await page.locator('#authPw1').fill(partnerPin)
    await page.locator('#btnAuthAction').click()
    await expect(page.locator('#btnEnterHome')).toBeVisible({ timeout: 30_000 })
    const tutorialNo = page.locator('#tutBtns button').nth(1)
    await tutorialNo.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined)
    if (await tutorialNo.isVisible()) await tutorialNo.click()
    await page.locator('#welcomeAnimLayer').waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => undefined)
    await page.locator('#btnEnterHome').click()
    await expect(page.locator('body')).toHaveClass(/home-active/, { timeout: 30_000 })
    await page.waitForTimeout(1_000)

    expect(await qtyCount(page, SOURCE)).toBe(0)
    expect(quantityRuleRequests.some((url) => url.includes('estimateCategory=SINGLE_SET'))).toBeTruthy()
    expect(quantityRuleRequests.some((url) => url.includes('estimateCategory=HOME_MULTI'))).toBeFalsy()
    await capture(page, '09-order-home-empty-single-set-rule-request')
  })
})

async function qtyCount(page: Page, model: string): Promise<number> {
  return page.locator(`input.qty-input[data-m="${model}"]:not(.fix-dc-inp)`).count()
}
