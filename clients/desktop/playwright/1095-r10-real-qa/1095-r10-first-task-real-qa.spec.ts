import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { expect, test, type APIResponse, type Page } from '@playwright/test'

const require = createRequire(import.meta.url)
const sheetsRequire = createRequire(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../web/estimate-app/package.json'))
const { google } = sheetsRequire('googleapis')
const { resolveQaShotsDir } = require('../../../../scripts/lib/qa-shots-dir.cjs')
const { resolveQaCredential } = require('../../../../scripts/lib/qa-credentials.cjs')
const here = path.dirname(fileURLToPath(import.meta.url))
const shotsDir = resolveQaShotsDir(here)

const desktopUrl = process.env['QA_DESKTOP_URL'] ?? 'http://127.0.0.1:5295'
const apiBase = process.env['QA_API_BASE'] ?? 'http://127.0.0.1:8080'
const productBase = process.env['QA_PRODUCT_BASE'] ?? 'http://127.0.0.1:28084'
const sheetId = process.env['GOOGLE_SHEETS_SHEET_ID'] ?? '<SHEET_ID>'
const sheetCell = "'상업멀티_단가인상'!I4"
const targetModel = 'AM080AXVHHH1'
const outOfStockBundleModel = 'AR60F07D11WS'
const qaRound = 'R10-1095-SINGLE-STATUS'
const sheetProxyControl = process.env['QA_SHEET_PROXY_CONTROL'] ?? 'http://127.0.0.1:5297/__r10/status'

type Login = { token: string; userId?: string; role?: string; displayName?: string }
type Evidence = Record<string, unknown>

function redact(value: string): string {
  return value
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig, '<redacted-id>')
    .replace(/Bearer\s+[^\s"']+/ig, 'Bearer <redacted>')
}

function writeJson(name: string, value: unknown): void {
  const safe = redact(JSON.stringify(value, null, 2))
  fs.writeFileSync(path.join(shotsDir, name), `${safe}\n`, 'utf8')
}

async function login(page: Page, password: string): Promise<Login> {
  const response = await page.request.post(`${apiBase}/auth/login`, {
    data: { loginId: 'dev_master', password },
  })
  const raw = await response.text()
  expect(response.ok(), `실 관리자 로그인 HTTP ${response.status()} ${redact(raw)}`).toBeTruthy()
  return JSON.parse(raw).data
}

async function installAuth(page: Page, session: Login): Promise<void> {
  await page.addInitScript(({ token, userId, role, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, userId, role, fullName: displayName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, session)
}

function directHeaders(session: Login): Record<string, string> {
  const claims = JSON.parse(Buffer.from(session.token.split('.')[1], 'base64url').toString('utf8'))
  return {
    Authorization: `Bearer ${session.token}`,
    'X-User-Id': String(claims.sub ?? session.userId ?? ''),
    'X-User-Role': String(session.role ?? claims.role ?? 'MASTER'),
    'X-Is-System-Master': String(claims.isSystemMaster === true),
    'X-User-Groups': Array.isArray(claims.groups) ? claims.groups.join(',') : '',
    'X-User-Name': encodeURIComponent(String(session.displayName ?? claims.name ?? 'R10 QA')),
  }
}

async function record(evidence: Evidence, key: string, response: APIResponse, expectedStatus?: number): Promise<any> {
  const raw = await response.text()
  evidence[key] = { http: response.status(), body: redact(raw).slice(0, 12_000) }
  if (expectedStatus !== undefined) {
    expect(response.status(), `${key} HTTP ${response.status()} ${redact(raw)}`).toBe(expectedStatus)
  } else {
    expect(response.ok(), `${key} HTTP ${response.status()} ${redact(raw)}`).toBeTruthy()
  }
  return raw ? JSON.parse(raw) : null
}

async function getProduct(page: Page, headers: Record<string, string>, model: string, evidence: Evidence, key: string): Promise<any> {
  const payload = await record(evidence, key, await page.request.get(
    `${productBase}/products/by-model/${model}`,
    { headers },
  ))
  return payload.data
}

async function statusTotals(page: Page, headers: Record<string, string>): Promise<Record<string, number>> {
  const totals: Record<string, number> = {}
  for (const status of ['ACTIVE', 'DISCONTINUED', 'NOT_FOR_SALE', 'OUT_OF_STOCK']) {
    const response = await page.request.get(`${productBase}/products`, {
      headers,
      params: { status, page: 0, size: 1 },
    })
    const raw = await response.text()
    expect(response.ok(), `상태 count ${status} HTTP ${response.status()} ${redact(raw)}`).toBeTruthy()
    totals[status] = JSON.parse(raw).data?.totalElements ?? -1
  }
  return totals
}

async function syncSheet(page: Page, headers: Record<string, string>, evidence: Evidence, key: string): Promise<void> {
  const startedAt = Date.now()
  const response = await page.request.post(`${productBase}/api/v1/products/admin/sync`, {
    headers,
    timeout: 300_000,
  })
  const raw = await response.text()
  evidence[key] = {
    http: response.status(),
    elapsedMs: Date.now() - startedAt,
    body: redact(raw).slice(0, 12_000),
  }
  expect(response.ok(), `${key} HTTP ${response.status()} ${redact(raw)}`).toBeTruthy()
}

async function sheetsClient(): Promise<any> {
  const keyPath = process.env['GOOGLE_SERVICE_ACCOUNT_KEY'] ?? ''
  expect(keyPath, 'GOOGLE_SERVICE_ACCOUNT_KEY 누락').not.toBe('')
  const credentials = JSON.parse(fs.readFileSync(keyPath, 'utf8'))
  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

async function readSheetCell(): Promise<string> {
  expect(sheetId, 'GOOGLE_SHEETS_SHEET_ID 누락').not.toBe('<SHEET_ID>')
  const sheets = await sheetsClient()
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: sheetCell })
  return String(response.data.values?.[0]?.[0] ?? '')
}

async function writeSheetCell(value: string): Promise<void> {
  const response = await fetch(sheetProxyControl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value }),
  })
  expect(response.ok, `R10 sheet proxy control HTTP ${response.status}`).toBeTruthy()
}

async function readSheetOverride(): Promise<string> {
  const response = await fetch(sheetProxyControl)
  expect(response.ok, `R10 sheet proxy state HTTP ${response.status}`).toBeTruthy()
  return String((await response.json()).value ?? '')
}

async function pickAutocomplete(page: Page, name: string, listboxName: string, query: string): Promise<void> {
  const input = page.getByRole('combobox', { name })
  await input.click()
  await input.fill(query)
  const option = page.getByRole('listbox', { name: listboxName }).locator('li[id]').first()
  await expect(option, `${name} 실 후보 미표시: ${query}`).toBeVisible({ timeout: 20_000 })
  await input.press('ArrowDown')
  await input.press('Enter')
  await expect(option, `${name} 실 후보 확정 실패: ${query}`).toBeHidden({ timeout: 10_000 })
}

test('R10 첫 과제 6단계와 지연·실패 status hydrate', async ({ page }) => {
  test.setTimeout(720_000)
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return
  }

  const evidence: Evidence = { qaRound, targetModel, sheetCell, deployedHead: 'dfb70a763' }
  const session = await login(page, password)
  await installAuth(page, session)
  const headers = directHeaders(session)
  const original = await getProduct(page, headers, targetModel, evidence, 'step0ProductBefore')
  const originalTags = { ...(original.tags ?? {}) }
  const originalCell = await readSheetCell()
  evidence['sheetCellBefore'] = originalCell
  evidence['countsBeforeApi'] = await statusTotals(page, headers)
  expect(original.status, 'R10 표본 시작 상태가 ACTIVE가 아님').toBe('ACTIVE')
  expect(original.itemKind, 'R10 표본 상세 DTO itemKind가 GENERAL이 아님').toBe('GENERAL')
  expect(original.bundleMode, 'R10 표본 bundleMode가 null이 아님').toBeNull()
  expect(originalCell, 'R10 표본 시트 상태 셀이 원래 공란이 아님').toBe('')

  let estimateId = ''
  let sheetRestored = false
  let productRestored = false
  try {
    await record(evidence, 'tagR10', await page.request.put(`${productBase}/products/${original.id}/tags`, {
      headers,
      data: { ...originalTags, qaRound },
    }))

    await page.goto(`${desktopUrl}/sales/estimates/new`)
    await expect(page.getByTestId('estimate-form-save-button'), '견적 신규 화면 미도달').toBeVisible({ timeout: 30_000 })
    await pickAutocomplete(page, '거래처 검색', '거래처 목록', '서초1동주민센타')
    const modelInput = page.getByRole('combobox', { name: '라인 1 모델명' })
    await modelInput.fill(targetModel)
    await expect(page.getByLabel('라인 1 품목명'), '실 품목 lookup 미도달').not.toHaveValue('', { timeout: 20_000 })
    await expect(modelInput, '선택 직후 단품 모델이 바뀜').toHaveValue(targetModel)
    const quantity = page.getByTestId('estimate-form-line-0-qty')
    await expect(quantity, 'ACTIVE 단품 수량이 잠김').toBeEditable()
    await quantity.fill('10')
    await page.getByLabel('비고').fill(`${qaRound} 실제 사용자 저장 표본`)
    await page.screenshot({ path: path.join(shotsDir, '01-active-single-selected.png'), fullPage: true })

    const createResponse = page.waitForResponse((response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/slips/estimates')
    await page.getByTestId('estimate-form-save-button').click()
    const createdPayload = await record(evidence, 'step2EstimateCreate', await createResponse)
    estimateId = createdPayload.data?.id ?? ''
    evidence['estimateId'] = '<redacted-id>'
    evidence['estimateNo'] = createdPayload.data?.estimateNo
    expect(estimateId, '견적 저장 응답 id 누락').not.toBe('')
    await expect(page.getByTestId('estimate-detail-no'), '저장 후 견적 상세 미도달').toBeVisible({ timeout: 30_000 })
    await page.screenshot({ path: path.join(shotsDir, '02-single-estimate-saved.png'), fullPage: true })

    await writeSheetCell('품절')
    evidence['sheetCellOutOfStock'] = {
      realSourceCell: await readSheetCell(),
      syncReadOverride: await readSheetOverride(),
    }
    await syncSheet(page, headers, evidence, 'step3AdminSyncToOutOfStock')
    const outOfStock = await getProduct(page, headers, targetModel, evidence, 'step3ProductOutOfStock')
    evidence['countsOutOfStockApi'] = await statusTotals(page, headers)
    expect(outOfStock.status, '관리자 sync 후 OUT_OF_STOCK 미전환').toBe('OUT_OF_STOCK')

    await page.goto(`${desktopUrl}/sales/estimates/${estimateId}/edit`)
    const lockedQuantity = page.getByLabel('라인 1 수량 품절')
    await expect(lockedQuantity, '저장 단품 재열기 후 품절 수량 input 미도달').toBeVisible({ timeout: 30_000 })
    const step4 = { value: await lockedQuantity.inputValue(), editable: await lockedQuantity.isEditable() }
    evidence['step4ReopenOutOfStock'] = step4
    await page.screenshot({ path: path.join(shotsDir, '03-saved-single-out-of-stock-locked.png'), fullPage: true })

    let delayedLookupDelivered: (() => void) | undefined
    const delayedLookup = new Promise<void>((resolve) => { delayedLookupDelivered = resolve })
    let delayedLookupCalls = 0
    await page.route('**/api/products/lookup', async (route) => {
      delayedLookupCalls += 1
      const response = await route.fetch()
      await new Promise((resolve) => setTimeout(resolve, 5_000))
      await route.fulfill({ response })
      delayedLookupDelivered?.()
    })
    await page.goto(`${desktopUrl}/sales/estimates/${estimateId}/edit`)
    const beforeHydrateQuantity = page.getByLabel('라인 1 수량')
    await expect(beforeHydrateQuantity, '지연 조회 중 초기 수량 input 미도달').toBeVisible({ timeout: 10_000 })
    const editableBeforeHydrate = await beforeHydrateQuantity.isEditable()
    if (editableBeforeHydrate) await beforeHydrateQuantity.fill('13')
    await page.screenshot({ path: path.join(shotsDir, '04-late-status-window-before-arrival.png'), fullPage: true })
    await delayedLookup
    const afterHydrateQuantity = page.getByLabel('라인 1 수량 품절')
    await expect(afterHydrateQuantity, '지연 조회 도착 후 품절 input 미도달').toBeVisible({ timeout: 15_000 })
    evidence['lateStatusRace'] = {
      delayedLookupCalls,
      editableBeforeHydrate,
      valueBeforeArrival: editableBeforeHydrate ? '13' : await beforeHydrateQuantity.inputValue(),
      valueAfterArrival: await afterHydrateQuantity.inputValue(),
      editableAfterArrival: await afterHydrateQuantity.isEditable(),
    }
    await page.screenshot({ path: path.join(shotsDir, '05-late-status-arrived-input-preserved.png'), fullPage: true })
    await page.unroute('**/api/products/lookup')

    let failedLookupCalls = 0
    await page.route('**/api/products/lookup', async (route) => {
      failedLookupCalls += 1
      await route.abort('failed')
    })
    await page.goto(`${desktopUrl}/sales/estimates/${estimateId}/edit`)
    const failureQuantity = page.getByLabel('라인 1 수량')
    await expect(failureQuantity, '조회 실패 후 견적 라인 미도달').toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(1_000)
    evidence['lookupFailure'] = {
      failedLookupCalls,
      value: await failureQuantity.inputValue(),
      editable: await failureQuantity.isEditable(),
      outOfStockBadgeVisible: await page.getByText('품절', { exact: true }).isVisible().catch(() => false),
    }
    await page.screenshot({ path: path.join(shotsDir, '06-status-lookup-failure.png'), fullPage: true })
    await page.unroute('**/api/products/lookup')

    await writeSheetCell(originalCell)
    sheetRestored = (await readSheetCell()) === originalCell && (await readSheetOverride()) === originalCell
    await record(evidence, 'step5Reactivate', await page.request.post(
      `${productBase}/products/${original.id}/reactivate`,
      { headers },
    ), 204)
    productRestored = (await getProduct(page, headers, targetModel, evidence, 'step5ProductActive')).status === 'ACTIVE'
    evidence['countsAfterRestoreApi'] = await statusTotals(page, headers)
    await page.reload()
    const unlockedQuantity = page.getByLabel('라인 1 수량')
    await expect(unlockedQuantity, 'ACTIVE 복구 후 수량 input 미도달').toBeVisible({ timeout: 30_000 })
    evidence['step5ReopenActive'] = {
      value: await unlockedQuantity.inputValue(),
      editable: await unlockedQuantity.isEditable(),
    }
    await page.screenshot({ path: path.join(shotsDir, '07-active-unlocked-not-snapshot.png'), fullPage: true })
  } finally {
    await page.unroute('**/api/products/lookup').catch(() => undefined)
    if (!sheetRestored) {
      await writeSheetCell(originalCell)
      sheetRestored = (await readSheetCell()) === originalCell && (await readSheetOverride()) === originalCell
    }
    if (!productRestored) {
      const current = await getProduct(page, headers, targetModel, evidence, 'finallyProductBeforeRestore')
      if (current.status !== 'ACTIVE') {
        await record(evidence, 'finallyReactivate', await page.request.post(
          `${productBase}/products/${original.id}/reactivate`, { headers },
        ), 204)
      }
      productRestored = (await getProduct(page, headers, targetModel, evidence, 'finallyProductAfterRestore')).status === 'ACTIVE'
    }
    await record(evidence, 'restoreOriginalTags', await page.request.put(
      `${productBase}/products/${original.id}/tags`,
      { headers, data: originalTags },
    ))
    evidence['cleanup'] = {
      sheetRestored,
      productRestored,
      sheetCellFinal: await readSheetCell(),
      countsFinalApi: await statusTotals(page, headers),
    }
    writeJson('r10-first-task-observations.json', evidence)
  }
})

test('R10 품절 BUNDLE 후보와 잠금 위치 관측', async ({ page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  const evidence: Evidence = { qaRound, outOfStockBundleModel }
  const session = await login(page, password)
  await installAuth(page, session)
  const headers = directHeaders(session)
  const bundle = await getProduct(page, headers, outOfStockBundleModel, evidence, 'bundleProduct')
  expect(bundle.status).toBe('OUT_OF_STOCK')
  expect(bundle.itemKind).toBe('SET')
  expect(bundle.bundleMode).toBe('EXPAND')

  await page.goto(`${desktopUrl}/sales/estimates/new`)
  if (!await page.getByTestId('estimate-form-save-button').isVisible().catch(() => false)) {
    await page.waitForTimeout(1_000)
    await page.goto(`${desktopUrl}/sales/estimates/new`)
  }
  await expect(page.getByTestId('estimate-form-save-button')).toBeVisible({ timeout: 30_000 })
  const modelInput = page.getByRole('combobox', { name: '라인 1 모델명' })
  await modelInput.fill('AR60F07D')
  const dialog = page.getByRole('dialog', { name: '품목 검색 결과' })
  await expect(dialog, '품절 BUNDLE 검색 결과 모달 미표시').toBeVisible({ timeout: 20_000 })
  const optionRow = dialog.getByRole('row', { name: new RegExp(outOfStockBundleModel) }).first()
  await expect(optionRow, '품절 BUNDLE이 후보에 표시되지 않음').toBeVisible()
  const optionText = await optionRow.innerText()
  await dialog.getByRole('radio', { name: outOfStockBundleModel }).check()
  await dialog.getByRole('button', { name: '선택 확정' }).click()
  await expect(dialog).toBeHidden({ timeout: 10_000 })
  await page.waitForTimeout(1_000)
  const lineModels = await page.getByRole('combobox', { name: /라인 \d+ 모델명/ })
    .evaluateAll((elements) => elements.map((element) => (element as HTMLInputElement).value))
  const quantityInputs = page.locator('[data-testid^="estimate-form-line-"][data-testid$="-qty"]')
  const quantities: Array<Record<string, unknown>> = []
  for (let index = 0; index < await quantityInputs.count(); index += 1) {
    const input = quantityInputs.nth(index)
    quantities.push({ index, value: await input.inputValue(), editable: await input.isEditable(), ariaLabel: await input.getAttribute('aria-label') })
  }
  evidence['guiObservation'] = {
    optionText,
    lineModels,
    quantities,
    outOfStockBadges: await page.getByText('품절', { exact: true }).count(),
  }
  await page.screenshot({ path: path.join(shotsDir, '08-out-of-stock-bundle-candidate-and-lock.png'), fullPage: true })
  writeJson('r10-out-of-stock-bundle-observations.json', evidence)
})

test('R10 재설계 후 협업 동기화 3회', async ({ browser, page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  const estimateId = process.env['QA_R10_ESTIMATE_ID'] ?? ''
  expect(estimateId, 'QA_R10_ESTIMATE_ID 누락').not.toBe('')
  const session = await login(page, password)
  await installAuth(page, session)
  const contextB = await browser.newContext()
  const pageB = await contextB.newPage()
  await installAuth(pageB, session)
  const runs: Array<Record<string, unknown>> = []
  try {
    await Promise.all([
      page.goto(`${desktopUrl}/sales/estimates/${estimateId}/edit`),
      pageB.goto(`${desktopUrl}/sales/estimates/${estimateId}/edit`),
    ])
    const memoA = page.getByLabel('비고')
    const memoB = pageB.getByLabel('비고')
    await expect(memoA).toBeVisible({ timeout: 30_000 })
    await expect(memoB).toBeVisible({ timeout: 30_000 })
    const originalMemo = await memoA.inputValue()
    for (let run = 1; run <= 3; run += 1) {
      const value = `R10-1095-COLLAB-${run}`
      const startedAt = Date.now()
      await memoB.fill(value)
      await expect(memoA).toHaveValue(value, { timeout: 20_000 })
      runs.push({ run, durationMs: Date.now() - startedAt, syncedValue: await memoA.inputValue() })
    }
    await page.screenshot({ path: path.join(shotsDir, '09-collaboration-three-runs.png'), fullPage: true })
    await memoB.fill(originalMemo)
    await expect(memoA).toHaveValue(originalMemo, { timeout: 20_000 })
  } finally {
    await contextB.close()
    writeJson('r10-collaboration-three-runs.json', {
      qaRound,
      estimateId: '<redacted-id>',
      runs,
    })
  }
})

test('R10 중복 이름 변경 거부와 reactivate 실 API', async ({ page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  const evidence: Evidence = { qaRound, targetModel }
  const session = await login(page, password)
  const headers = directHeaders(session)
  const target = await getProduct(page, headers, targetModel, evidence, 'targetBeforeNameConflict')
  const conflict = await getProduct(page, headers, '0000098', evidence, 'conflictProduct')
  const renameResponse = await page.request.patch(`${productBase}/products/${target.id}`, {
    headers,
    data: { name: conflict.name },
  })
  const renameRaw = await renameResponse.text()
  evidence['renameToDuplicate'] = { http: renameResponse.status(), body: redact(renameRaw) }
  expect(renameResponse.status()).toBe(409)
  expect(renameRaw).toContain('CONFLICT')
  await record(evidence, 'reactivateSameR10Sample', await page.request.post(
    `${productBase}/products/${target.id}/reactivate`, { headers },
  ), 204)
  const after = await getProduct(page, headers, targetModel, evidence, 'targetAfterNameConflict')
  expect(after.name).toBe(target.name)
  expect(after.status).toBe('ACTIVE')
  writeJson('r10-name-rule-observations.json', evidence)
})

test('R10 R5 회귀 비상품 자동수량과 ACTIVE BUNDLE 8행 전개', async ({ page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  const session = await login(page, password)
  await installAuth(page, session)
  const evidence: Evidence = { qaRound }

  await page.goto(`${desktopUrl}/sales/estimates/new`)
  let modelInput = page.getByRole('combobox', { name: '라인 1 모델명' })
  await expect(modelInput).toBeVisible({ timeout: 30_000 })
  await modelInput.fill('운임')
  await expect(page.getByLabel('라인 1 품목명')).not.toHaveValue('', { timeout: 15_000 })
  const nonGoodsQuantity = page.getByLabel('라인 1 수량')
  await nonGoodsQuantity.fill('')
  await page.getByLabel('라인 1 단가').fill('10000')
  evidence['nonGoodsQuantityAfterPrice'] = await nonGoodsQuantity.inputValue()
  expect(evidence['nonGoodsQuantityAfterPrice']).toBe('1')

  const expansionStatuses: number[] = []
  page.on('response', (response) => {
    if (response.url().endsWith('/slips/expand-line')) expansionStatuses.push(response.status())
  })
  await page.goto(`${desktopUrl}/sales/new`)
  const slipProduct = page.getByRole('combobox', { name: '라인 1 품목' })
  await expect(slipProduct).toBeVisible({ timeout: 30_000 })
  await slipProduct.fill('AC060CS6PBH1SY')
  await expect.poll(
    () => page.locator('[aria-label^="라인 "][aria-label$=" 품목"]').count(),
    { timeout: 30_000 },
  ).toBe(8)
  evidence['activeBundleExpandHttp'] = expansionStatuses
  evidence['activeBundleLineCount'] = await page.locator('[aria-label^="라인 "][aria-label$=" 품목"]').count()
  expect(expansionStatuses).toContain(200)
  await page.screenshot({ path: path.join(shotsDir, '10-r5-non-goods-and-bundle-regression.png'), fullPage: true })
  writeJson('r10-r5-ui-regression-observations.json', evidence)
})
