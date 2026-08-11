import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RULE_ONE_BASE = process.env['QA_ESTIMATE_RULE_ONE_BASE'] ?? 'http://127.0.0.1:5320'
const DESKTOP_BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const API_BASE = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/2026-08-10-896-r9'))
const SOURCE = 'AM052BN6PBH1'

type FamilyName = 'panel' | 'hose' | 'branch' | 'foot' | 'remote'
type FamilyRow = { model: string; name: string; qty: number; amount: number }
type FamilySnapshot = Record<FamilyName, { qty: number; amount: number; rows: FamilyRow[] }>

const FAMILY_PATTERN: Record<FamilyName, RegExp> = {
  panel: /판넬|패널/i,
  hose: /유연\s*호스/i,
  branch: /분\s*기\s*관|분기관/i,
  foot: /발통|일자발|실외기\s*받침/i,
  remote: /리모컨|리모콘/i,
}
const FAMILY_MODEL_PATTERN: Record<FamilyName, RegExp> = {
  panel: /^(?:PC|AGSS|AG4S)/i,
  hose: /^FH-LFH/i,
  branch: /^AXJ-/i,
  foot: /^(?:SI-AL|발통)/i,
  remote: /^(?:AWR|AR-|AIM)/i,
}

function qty(page: Page, model: string) {
  return page.locator(`input.qty-input[data-m="${model}"]:not(.fix-dc-inp)`)
}

async function openHome(page: Page, base: string, zeroRuleCounterfactual = false) {
  if (zeroRuleCounterfactual) {
    await page.route(`${base}/?*`, async (route) => {
      if (route.request().resourceType() !== 'document') {
        await route.continue()
        return
      }
      const response = await route.fetch()
      const body = await response.text()
      const replaced = body.replace(
        /const HOME_QUANTITY_SYNC_RULES = J\([^\n]+, \[\]\);/,
        'const HOME_QUANTITY_SYNC_RULES = J([], []);',
      )
      expect(replaced, '규칙 bootstrap 치환 지점을 찾지 못함').not.toBe(body)
      await route.fulfill({ response, body: replaced })
    })
  }
  await page.goto(`${base}/?email=dev_master%40samhan-air.com`, { waitUntil: 'domcontentloaded', timeout: 120_000 })
  await page.locator('#btnGoHome').click()
  await expect(qty(page, SOURCE)).toBeVisible({ timeout: 60_000 })
}

async function setQuantity(page: Page, model: string, value: number) {
  const input = qty(page, model)
  await expect(input, `${model} 수량 입력이 화면에 없음`).toBeVisible({ timeout: 30_000 })
  await input.fill(value === 0 ? '' : String(value))
  await input.blur()
  await page.waitForTimeout(350)
}

async function findVisibleModel(page: Page, pattern: RegExp) {
  const candidates = await page.locator('tr[data-m]').evaluateAll((rows) => rows.map((row) => ({
    model: (row as HTMLTableRowElement).dataset.m ?? '',
    text: (row as HTMLTableRowElement).innerText,
    hasQuantity: Boolean(row.querySelector('input.qty-input:not(.fix-dc-inp)')),
  })))
  const found = candidates.find((candidate) => candidate.hasQuantity && pattern.test(candidate.text))
  expect(found?.model, `화면에서 ${pattern} 조건 품목을 찾지 못함`).toBeTruthy()
  return String(found?.model)
}

async function snapshot(page: Page): Promise<FamilySnapshot> {
  const rows = await page.locator('tr[data-m]').evaluateAll((nodes) => nodes.map((node) => {
    const row = node as HTMLTableRowElement
    const input = row.querySelector<HTMLInputElement>('input.qty-input:not(.fix-dc-inp)')
    const subtotal = row.querySelector<HTMLElement>('td.sub')
    const model = row.dataset.m ?? ''
    const name = row.innerText.trim()
    const amount = Number((subtotal?.innerText ?? '').replace(/[^0-9-]/g, '')) || 0
    return { model, name, qty: Number(input?.value || 0), amount }
  }))
  return Object.fromEntries(Object.entries(FAMILY_PATTERN).map(([family, pattern]) => {
    const familyName = family as FamilyName
    const matched = rows.filter((row) => pattern.test(row.name) || FAMILY_MODEL_PATTERN[familyName].test(row.model))
    return [family, {
      qty: matched.reduce((sum, row) => sum + row.qty, 0),
      amount: matched.reduce((sum, row) => sum + row.amount, 0),
      rows: matched.filter((row) => row.qty !== 0),
    }]
  })) as FamilySnapshot
}

async function bootstrapRules(page: Page) {
  return page.evaluate(() => {
    const script = Array.from(document.scripts)
      .map((item) => item.textContent || '')
      .find((text) => text.includes('HOME_QUANTITY_SYNC_RULES')) || ''
    const line = script.split('\n').find((candidate) => candidate.includes('const HOME_QUANTITY_SYNC_RULES')) || ''
    const json = line.slice(line.indexOf('J(') + 2, line.lastIndexOf(', []);'))
    return JSON.parse(json || '[]')
  })
}

async function installRealAuth(page: Page, password: string) {
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId: 'dev_master', password },
  })
  expect(response.ok(), `실 API 로그인 실패: HTTP ${response.status()}`).toBeTruthy()
  const body = (await response.json()).data ?? {}
  const token = String(body.token ?? '')
  expect(token).not.toBe('')
  await page.addInitScript((auth) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ ...auth, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, { token, userId: body.userId ?? '', role: body.role ?? 'MASTER', fullName: body.displayName ?? '개발마스터' })
  return token
}

test.describe.serial('PR #1126 R9 적대검증 — 실 사용자 도달성', () => {
  test.setTimeout(180_000)

  test('환경 — 실 API 1건과 두 배포본 bootstrap 조건이 일치한다', async ({ page }) => {
    let password: string
    try {
      password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
    } catch (error) {
      test.skip(true, error instanceof Error ? error.message : 'QA 자격을 읽지 못했습니다.')
      return
    }
    const token = await installRealAuth(page, password)
    const response = await page.request.get(`${API_BASE}/api/v1/quantity-sync-rules?estimateCategory=HOME_MULTI`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(response.ok(), `실 규칙 API 실패: HTTP ${response.status()}`).toBeTruthy()
    const apiRules = await response.json()
    expect(apiRules).toHaveLength(1)
    expect(apiRules[0].ruleKey).toBe('UI_HOME_MULTI_AM052BN6PBH1')

    await openHome(page, RULE_ONE_BASE)
    const oneRules = await bootstrapRules(page)
    expect(oneRules).toEqual(apiRules)
    await openHome(page, RULE_ONE_BASE, true)
    const zeroRules = await bootstrapRules(page)
    expect(zeroRules).toEqual([])
    console.log('[R9 network]', JSON.stringify({
      endpoint: `${API_BASE}/api/v1/quantity-sync-rules?estimateCategory=HOME_MULTI`,
      status: response.status(),
      mock: false,
      apiRuleKeys: apiRules.map((rule: { ruleKey: string }) => rule.ruleKey),
      ruleOneBootstrapCount: oneRules.length,
      ruleZeroBootstrapCount: zeroRules.length,
    }))
  })

  for (const condition of [
    { label: '규칙 0건(동일 실 HTML bootstrap 배열만 [] 대조)', base: RULE_ONE_BASE, counterfactual: true },
    { label: '규칙 1건(실 product-service API)', base: RULE_ONE_BASE, counterfactual: false },
  ]) {
    test(`① ${condition.label} — 실내기 0→2→4 다섯 품목군`, async ({ page }) => {
      await openHome(page, condition.base, condition.counterfactual)
      const result: Record<string, { sourceInput: string; families: FamilySnapshot; targetProbes: unknown }> = {}
      for (const count of [0, 2, 4]) {
        await setQuantity(page, SOURCE, count)
        result[String(count)] = {
          sourceInput: await qty(page, SOURCE).inputValue(),
          families: await snapshot(page),
          targetProbes: await page.locator('tr[data-m]').evaluateAll((rows) => Object.fromEntries(
            ['PC6NUDK1NW', 'FH-LFHLN', 'AWR-WE13N', 'AR-EC05'].map((model) => {
              const row = rows.find((candidate) => (candidate as HTMLTableRowElement).dataset.m === model) as HTMLTableRowElement | undefined
              return [model, row ? Array.from(row.querySelectorAll('input')).map((input) => ({
                className: input.className,
                value: input.value,
                dataModel: input.dataset.m ?? '',
              })) : []]
            }),
          )),
        }
      }
      console.log(`[R9 family ${condition.label}]`, JSON.stringify(result))
      await page.locator('#homeBody').screenshot({
        path: path.join(SHOTS, condition.counterfactual ? '02-rule-0-counterfactual-family-qty-4.png' : '01-rule-1-family-qty-4.png'),
      })
    })
  }

  test('② 옵션 6축 — 실제 DOM 토글 전후 수량 벡터', async ({ page }) => {
    const results: Record<string, unknown> = {}

    await openHome(page, RULE_ONE_BASE)
    await setQuantity(page, SOURCE, 2)
    const hoseBaseline = await snapshot(page)
    await page.locator('#home_no_hose').check()
    await page.waitForTimeout(350)
    const hoseExcluded = await snapshot(page)
    results.noHose = { before: hoseBaseline.hose, after: hoseExcluded.hose }

    await openHome(page, RULE_ONE_BASE)
    await setQuantity(page, SOURCE, 2)
    const hoseL = await snapshot(page)
    await page.locator('#home_hose_i').check()
    await page.waitForTimeout(350)
    const hoseI = await snapshot(page)
    results.hoseI = { before: hoseL.hose, after: hoseI.hose }

    await openHome(page, RULE_ONE_BASE)
    const branchOutdoor = await findVisibleModel(page, /실외기.*단배관/i)
    await setQuantity(page, SOURCE, 2)
    await setQuantity(page, branchOutdoor, 1)
    const branchBaseline = await snapshot(page)
    await page.locator('#home_no_branch').check()
    await page.waitForTimeout(350)
    const branchExcluded = await snapshot(page)
    results.noBranch = { before: branchBaseline.branch, after: branchExcluded.branch }

    await openHome(page, RULE_ONE_BASE)
    const footOutdoor = await findVisibleModel(page, /실외기.*단배관/i)
    await setQuantity(page, footOutdoor, 2)
    const footOff = await snapshot(page)
    await page.locator('#home_foot').check()
    await page.waitForTimeout(350)
    const footOn = await snapshot(page)
    results.foot = { before: footOff.foot, after: footOn.foot }

    await openHome(page, RULE_ONE_BASE)
    const infiniteIndoor = await findVisibleModel(page, /인피니트/i)
    await setQuantity(page, infiniteIndoor, 2)
    const panel: Record<string, unknown> = { 기본: (await snapshot(page)).panel }
    for (const option of ['판넬제외', '공청판넬', '인피니트 25년형', '인피니트 공청+동작감지 AI']) {
      await page.locator('#home_panel').selectOption(option)
      await page.waitForTimeout(350)
      panel[option] = (await snapshot(page)).panel
    }
    results.panel = panel

    await openHome(page, RULE_ONE_BASE)
    await setQuantity(page, SOURCE, 2)
    const ruledPanel: Record<string, unknown> = { 기본: (await snapshot(page)).panel }
    for (const option of ['판넬제외', '공청판넬', '인피니트 25년형', '인피니트 공청+동작감지 AI']) {
      await page.locator('#home_panel').selectOption(option)
      await page.waitForTimeout(350)
      ruledPanel[option] = (await snapshot(page)).panel
    }
    results.panelRuledSource = ruledPanel

    await openHome(page, RULE_ONE_BASE)
    await setQuantity(page, SOURCE, 2)
    const remote: Record<string, unknown> = {}
    for (const option of ['기본', '유선', '컬러', '제외']) {
      await page.locator('#home_remote').selectOption(option)
      await page.waitForTimeout(350)
      remote[option] = (await snapshot(page)).remote
    }
    results.remote = remote

    console.log('[R9 options]', JSON.stringify(results))
    expect(branchBaseline.branch.qty).toBeGreaterThan(0)
    expect(branchExcluded.branch.qty).toBe(0)
    expect(footOff.foot.qty).toBe(0)
    expect(footOn.foot.qty).toBe(2)
    expect((remote['제외'] as { qty: number }).qty).toBe(0)
    await page.locator('#homeOpts').screenshot({ path: path.join(SHOTS, '03-home-options-real-toggle.png') })
  })

  test('④ 메신저 실 화면 고정 testid와 견적품목 행별 동적 카운트', async ({ page }) => {
    let password: string
    try {
      password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
    } catch (error) {
      test.skip(true, error instanceof Error ? error.message : 'QA 자격을 읽지 못했습니다.')
      return
    }
    await installRealAuth(page, password)
    await page.goto(`${DESKTOP_BASE}/#/messenger`)
    await expect(page.getByTestId('messenger-page')).toBeVisible({ timeout: 30_000 })
    const messengerInput = page.getByTestId('messenger-recipient-search')
    await messengerInput.fill('김')
    const messengerOptions = page.getByRole('listbox', { name: '메신저 수신자 검색 결과' }).getByRole('option')
    await expect(messengerOptions.first()).toBeVisible({ timeout: 20_000 })
    await messengerOptions.first().click()
    await expect(page.getByTestId('multiselect-chip-count')).toContainText('1개 선택됨')
    await expect(page.getByTestId('messenger-recipient-search-chip-count')).toHaveCount(0)
    await page.screenshot({ path: path.join(SHOTS, '04-messenger-live-fixed-chip-count.png'), fullPage: false })

    await page.goto(`${DESKTOP_BASE}/#/products/estimate-items?category=HOME_MULTI`)
    await expect(page.getByTestId('estimate-items-table')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('estimate-items-table').locator('tbody tr').first()).toBeVisible({ timeout: 30_000 })
    const quantityInputs = page.locator('[data-testid^="estimate-items-quantity-sync-"][data-testid$="-input"]')
    const quantityInputIds = await quantityInputs.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-testid') || ''))
    expect(quantityInputIds.length).toBeGreaterThanOrEqual(2)
    const firstTestId = quantityInputIds[0]
    const secondTestId = quantityInputIds[1]
    const firstModel = firstTestId.replace('estimate-items-quantity-sync-', '').replace('-input', '')
    const secondModel = secondTestId.replace('estimate-items-quantity-sync-', '').replace('-input', '')
    await expect(page.getByTestId(`${firstTestId}-chip-count`)).toHaveCount(1)
    await expect(page.getByTestId(`${firstTestId}-chip-count`)).toHaveText('')
    await expect(page.getByTestId(`${secondTestId}-chip-count`)).toHaveCount(1)
    await expect(page.getByTestId(`${secondTestId}-chip-count`)).toHaveText('')
    await expect(page.getByTestId(`estimate-items-quantity-sync-${firstModel}`).locator(`[data-testid^="estimate-items-quantity-sync-${firstModel}-chip-"]`)).toHaveCount(0)
    await expect(page.getByTestId(`estimate-items-quantity-sync-${secondModel}`).locator(`[data-testid^="estimate-items-quantity-sync-${secondModel}-chip-"]`)).toHaveCount(0)
    await page.screenshot({ path: path.join(SHOTS, '05-estimate-items-row-chip-counts.png'), fullPage: false })
    console.log('[R9 chip counts]', JSON.stringify({ [firstModel]: 0, [secondModel]: 0 }))
  })

  test('③ goodsType 실 API 34건과 견적 작성 비상품 납품가→수량 1', async ({ page }) => {
    let password: string
    try {
      password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
    } catch (error) {
      test.skip(true, error instanceof Error ? error.message : 'QA 자격을 읽지 못했습니다.')
      return
    }
    const token = await installRealAuth(page, password)
    let catalogResponse = await page.request.get(`${API_BASE}/api/products`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { page: 0, size: 10000 },
    })
    for (let attempt = 0; attempt < 2 && !catalogResponse.ok(); attempt += 1) {
      catalogResponse = await page.request.get(`${API_BASE}/api/products`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { page: 0, size: 10000 },
      })
    }
    expect(catalogResponse.ok()).toBeTruthy()
    const catalog = await catalogResponse.json()
    const rows = Array.isArray(catalog.data?.content) ? catalog.data.content : []
    const nonGoods = rows.filter((row: { goodsType?: string; goods?: boolean }) => row.goodsType === 'NON_GOODS' || row.goods === false)
    expect(nonGoods).toHaveLength(34)
    const sample = nonGoods.find((row: { usageScope?: string }) => row.usageScope !== 'NONE') ?? nonGoods[0]
    expect(sample?.modelCode).toBeTruthy()

    await page.goto(`${DESKTOP_BASE}/#/sales/estimates/new`)
    await expect(page.getByTestId('estimate-form-save-button')).toBeVisible({ timeout: 30_000 })
    const modelInput = page.getByRole('combobox', { name: '라인 1 모델명' })
    await modelInput.fill(sample.modelCode)
    await page.waitForTimeout(500)
    await modelInput.press('Enter')
    const quantity = page.getByTestId('estimate-form-line-0-qty')
    const unitPrice = page.getByTestId('estimate-form-line-0-unit-price')
    await quantity.fill('7')
    await unitPrice.fill('12345')
    await unitPrice.blur()
    await expect(quantity).toHaveValue('7', { timeout: 15_000 })
    await page.screenshot({ path: path.join(SHOTS, '06-non-goods-live-price-quantity-one.png'), fullPage: false })
    console.log('[R9 goodsType]', JSON.stringify({ nonGoodsCount: nonGoods.length, sampleModelCode: sample.modelCode, quantity: await quantity.inputValue(), unitPrice: await unitPrice.inputValue() }))
  })
})
