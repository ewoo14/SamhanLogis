import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { expect, test, type APIResponse, type Page } from '@playwright/test'

const require = createRequire(import.meta.url)
const { resolveQaCredential } = require('../../../../scripts/lib/qa-credentials.cjs')
const { resolveQaShotsDir } = require('../../../../scripts/lib/qa-shots-dir.cjs')
const here = path.dirname(fileURLToPath(import.meta.url))
const committedShotsDir = path.resolve(here, '../../../../docs/qa/2026-08-10-1095-r12')
const shotsDir = resolveQaShotsDir(committedShotsDir)
const desktopUrl = process.env['QA_DESKTOP_URL'] ?? 'http://127.0.0.1:5295'
const apiBase = process.env['QA_API_BASE'] ?? 'http://127.0.0.1:8080'
const productBase = process.env['QA_PRODUCT_BASE'] ?? 'http://127.0.0.1:28084'
const inventoryBase = process.env['QA_INVENTORY_BASE'] ?? 'http://127.0.0.1:28085'
const activeModel = 'AM080AXVHHH1'

type Login = { token: string; userId?: string; role?: string; displayName?: string }
type Evidence = Record<string, unknown>

function redact(value: string): string {
  return value
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig, '<redacted-id>')
    .replace(/Bearer\s+[^\s"']+/ig, 'Bearer <redacted>')
}

async function writeEvidence(name: string, value: unknown): Promise<void> {
  await fs.writeFile(path.join(shotsDir, name), `${redact(JSON.stringify(value, null, 2))}\n`, 'utf8')
}

function headers(session: Login): Record<string, string> {
  const claims = JSON.parse(Buffer.from(session.token.split('.')[1], 'base64url').toString('utf8'))
  return {
    Authorization: `Bearer ${session.token}`,
    'X-User-Id': String(claims.sub ?? session.userId ?? ''),
    'X-User-Role': String(session.role ?? claims.role ?? 'MASTER'),
    'X-Is-System-Master': String(claims.isSystemMaster === true),
    'X-User-Groups': Array.isArray(claims.groups) ? claims.groups.join(',') : '',
    'X-User-Name': encodeURIComponent(String(session.displayName ?? claims.name ?? 'R12 QA')),
  }
}

async function login(page: Page, password: string): Promise<Login> {
  const response = await page.request.post(`${apiBase}/auth/login`, { data: { loginId: 'dev_master', password } })
  expect(response.ok(), `로그인 HTTP ${response.status()}`).toBeTruthy()
  return JSON.parse(await response.text()).data
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

async function payload(response: APIResponse): Promise<any> {
  const raw = await response.text()
  expect(response.ok(), `HTTP ${response.status()} ${redact(raw)}`).toBeTruthy()
  return raw ? JSON.parse(raw).data : null
}

async function getProduct(page: Page, auth: Record<string, string>, model: string): Promise<any> {
  return payload(await page.request.get(`${productBase}/products/by-model/${model}`, { headers: auth }))
}

test('R12 정상 저장 견적 5건 과차단 0건과 느린 조회 잠금 시간', async ({ page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  const session = await login(page, password)
  await installAuth(page, session)
  const auth = headers(session)
  const listed = await payload(await page.request.get(`${apiBase}/slips/estimates`, {
    headers: auth,
    params: { status: 'QUOTE_DRAFT', page: 0, size: 20 },
  }))
  const targets = (listed.content as any[])
    .filter((estimate) => ['2026/08/10-2', '2026/08/10-3', '2026/08/10-4', '2026/08/10-5', '2026/08/10-6'].includes(estimate.estimateNo))
    .sort((a, b) => a.estimateNo.localeCompare(b.estimateNo))
  expect(targets, '정상 저장 견적 표본 5건 미확보').toHaveLength(5)

  const observations: Array<Record<string, unknown>> = []
  let activeLines = 0
  let improperlyLocked = 0
  for (const estimate of targets) {
    const detail = await payload(await page.request.get(`${apiBase}/slips/estimates/${estimate.id}`, { headers: auth }))
    const products = await payload(await page.request.post(`${productBase}/products/lookup`, {
      headers: auth,
      data: { ids: detail.lines.map((line: any) => line.productId) },
    }))
    const statusById = new Map(products.map((product: any) => [product.id, product.status]))
    const expectedActive = detail.lines.filter((line: any) => statusById.get(line.productId) === 'ACTIVE').length
    activeLines += expectedActive
    const startedAt = Date.now()
    let lookupStartedAt = 0
    let lookupFinishedAt = 0
    const onRequest = (request: any) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/products/lookup') lookupStartedAt = Date.now()
    }
    const onResponse = (response: any) => {
      if (response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/products/lookup') lookupFinishedAt = Date.now()
    }
    page.on('request', onRequest)
    page.on('response', onResponse)
    await page.goto(`${desktopUrl}/sales/estimates/${estimate.id}/edit`)
    const quantities = detail.lines.map((_: unknown, index: number) => page.getByTestId(`estimate-form-line-${index}-qty`).first())
    await Promise.all(quantities.map((quantity) => expect(quantity).toBeVisible({ timeout: 30_000 })))
    await expect.poll(async () => {
      const editable = await Promise.all(quantities.map((quantity) => quantity.isEditable()))
      return editable.filter(Boolean).length
    }, { timeout: 30_000 }).toBe(expectedActive)
    const editable = await Promise.all(quantities.map((quantity) => quantity.isEditable()))
    const lockedActive = editable.filter((value, index) => !value && statusById.get(detail.lines[index].productId) === 'ACTIVE').length
    improperlyLocked += lockedActive
    observations.push({
      estimateNo: estimate.estimateNo,
      lines: detail.lines.length,
      activeLines: expectedActive,
      lockedActive,
      lookupHttpMs: lookupStartedAt && lookupFinishedAt ? lookupFinishedAt - lookupStartedAt : null,
      editableAfterMs: Date.now() - startedAt,
    })
    page.off('request', onRequest)
    page.off('response', onResponse)
  }
  await page.screenshot({ path: path.join(shotsDir, '01-normal-saved-estimate-editable.png'), fullPage: true })

  const delayed = targets[0]
  let lookupReleasedAt = 0
  await page.route('**/api/products/lookup', async (route) => {
    const response = await route.fetch()
    await new Promise((resolve) => setTimeout(resolve, 5_000))
    lookupReleasedAt = Date.now()
    await route.fulfill({ response })
  })
  const delayedStartedAt = Date.now()
  await page.goto(`${desktopUrl}/sales/estimates/${delayed.id}/edit`)
  const delayedQuantity = page.locator('[data-testid^="estimate-form-line-"][data-testid$="-qty"]:visible').first()
  await expect(delayedQuantity).toBeVisible({ timeout: 15_000 })
  const initiallyEditable = await delayedQuantity.isEditable()
  await expect(delayedQuantity).toBeEditable({ timeout: 30_000 })
  const editableAt = Date.now()
  await page.screenshot({ path: path.join(shotsDir, '02-delayed-lookup-unlocked.png'), fullPage: true })
  await page.unroute('**/api/products/lookup')

  const evidence = {
    targets: observations,
    totals: { estimates: targets.length, activeLines, improperlyLocked },
    delayedLookup: {
      configuredDelayMs: 5_000,
      initiallyEditable,
      releasedAfterMs: lookupReleasedAt - delayedStartedAt,
      editableAfterMs: editableAt - delayedStartedAt,
      postResponseUnlockMs: editableAt - lookupReleasedAt,
    },
  }
  await writeEvidence('r12-overblocking.json', evidence)
  expect(improperlyLocked, 'ACTIVE 정상 라인이 부당하게 잠김').toBe(0)
  expect(initiallyEditable, '지연 조회 도착 전 fail-closed 잠금이 아님').toBe(false)
})

test('R12 자기 표본 DISCONTINUED 잠금과 ACTIVE 복귀', async ({ page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  const session = await login(page, password)
  await installAuth(page, session)
  const auth = headers(session)
  const product = await getProduct(page, auth, activeModel)
  expect(product.status).toBe('ACTIVE')
  let estimateId = ''
  let changed = false
  const evidence: Evidence = { model: activeModel }
  try {
    await page.goto(`${desktopUrl}/sales/estimates/new`)
    await expect(page.getByTestId('estimate-form-save-button')).toBeVisible({ timeout: 30_000 })
    const partner = page.getByRole('combobox', { name: '거래처 검색' })
    await partner.fill('삼성')
    await page.getByRole('option').first().click()
    await page.getByRole('combobox', { name: '라인 1 모델명' }).fill(activeModel)
    await expect(page.getByLabel('라인 1 품목명')).not.toHaveValue('', { timeout: 20_000 })
    await page.getByTestId('estimate-form-line-0-qty').fill('12')
    await page.getByLabel('비고').fill('R12-1095-STATUS 실제 사용자 저장 표본')
    const createResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/slips/estimates')
    await page.getByTestId('estimate-form-save-button').click()
    const created = await payload(await createResponse)
    estimateId = created.id
    evidence.estimateNo = created.estimateNo

    const discontinued = await page.request.post(`${productBase}/products/${product.id}/discontinue`, { headers: auth })
    expect(discontinued.status()).toBe(204)
    changed = true
    await page.goto(`${desktopUrl}/sales/estimates/${estimateId}/edit`)
    const locked = page.getByTestId('estimate-form-line-0-qty')
    await expect(locked).not.toBeEditable({ timeout: 30_000 })
    evidence.discontinued = { editable: await locked.isEditable(), statusText: await page.getByText('상태 확인 중', { exact: true }).count() }
    await page.screenshot({ path: path.join(shotsDir, '03-discontinued-saved-line-locked.png'), fullPage: true })

    const reactivated = await page.request.post(`${productBase}/products/${product.id}/reactivate`, { headers: auth })
    expect(reactivated.status()).toBe(204)
    changed = false
    await page.reload()
    await expect(locked).toBeEditable({ timeout: 30_000 })
    evidence.activeAgain = { editable: await locked.isEditable() }
    await page.screenshot({ path: path.join(shotsDir, '04-reactivated-saved-line-editable.png'), fullPage: true })
  } finally {
    if (changed) await page.request.post(`${productBase}/products/${product.id}/reactivate`, { headers: auth })
    evidence.finalProductStatus = (await getProduct(page, auth, activeModel)).status
    await writeEvidence('r12-status-roundtrip.json', evidence)
  }
})

test('R12 reactivate 동일 이름 204와 중복 이름 409', async ({ page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  const session = await login(page, password)
  const auth = headers(session)
  const uniqueInactive = await getProduct(page, auth, 'AF17B6474GZRS')
  const duplicateInactive = await getProduct(page, auth, 'AR07C9180HZS')
  expect(uniqueInactive.status).toBe('DISCONTINUED')
  expect(duplicateInactive.status).toBe('DISCONTINUED')
  const evidence: Evidence = {}
  let uniqueActivated = false
  try {
    const uniqueResponse = await page.request.post(`${productBase}/products/${uniqueInactive.id}/reactivate`, { headers: auth })
    evidence.sameNameReactivate = { model: uniqueInactive.modelName, http: uniqueResponse.status() }
    expect(uniqueResponse.status()).toBe(204)
    uniqueActivated = true
    const duplicateResponse = await page.request.post(`${productBase}/products/${duplicateInactive.id}/reactivate`, { headers: auth })
    evidence.duplicateNameReactivate = { model: duplicateInactive.modelName, http: duplicateResponse.status(), body: redact(await duplicateResponse.text()) }
    expect(duplicateResponse.status()).toBe(409)
  } finally {
    if (uniqueActivated) {
      const restore = await page.request.post(`${productBase}/products/${uniqueInactive.id}/discontinue`, { headers: auth })
      expect(restore.status()).toBe(204)
    }
    evidence.final = {
      unique: (await getProduct(page, auth, 'AF17B6474GZRS')).status,
      duplicate: (await getProduct(page, auth, 'AR07C9180HZS')).status,
    }
    await writeEvidence('r12-name-reactivate.json', evidence)
  }
})

test('R12 안전재고 stale 혼합 실 API와 협업 동기화 3회', async ({ browser, page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  const session = await login(page, password)
  await installAuth(page, session)
  const auth = headers(session)
  const safetyResponse = await page.request.get(`${inventoryBase}/inventory/alerts/safety-stock`, { headers: auth })
  const safetyRaw = await safetyResponse.text()
  expect(safetyResponse.ok(), `안전재고 API HTTP ${safetyResponse.status()} ${redact(safetyRaw)}`).toBeTruthy()
  const safetyRows = JSON.parse(safetyRaw).data ?? []
  const identifiable = safetyRows.filter((row: any) => row.productCode || row.productName)
  const stale = safetyRows.filter((row: any) => !row.productCode && !row.productName)
  expect(identifiable.length).toBeGreaterThan(0)
  expect(stale.length).toBeGreaterThan(0)

  let target: any
  for (let listPage = 0; listPage < 10 && !target; listPage += 1) {
    const listed = await payload(await page.request.get(`${apiBase}/slips/estimates`, {
      headers: auth,
      params: { status: 'QUOTE_DRAFT', page: listPage, size: 20 },
    }))
    target = (listed.content as any[]).find((estimate) => ['2026/08/10-7', '2026/08/10-8'].includes(estimate.estimateNo))
    if (listed.last) break
  }
  expect(target, 'R12 협업 표본 미확보').toBeTruthy()
  const contextB = await browser.newContext()
  const pageB = await contextB.newPage()
  await installAuth(pageB, session)
  const runs: Array<Record<string, unknown>> = []
  let originalMemo = ''
  try {
    await Promise.all([
      page.goto(`${desktopUrl}/sales/estimates/${target.id}/edit`),
      pageB.goto(`${desktopUrl}/sales/estimates/${target.id}/edit`),
    ])
    const memoA = page.getByLabel('비고')
    const memoB = pageB.getByLabel('비고')
    await expect(memoA).toBeVisible({ timeout: 30_000 })
    await expect(memoB).toBeVisible({ timeout: 30_000 })
    originalMemo = await memoA.inputValue()
    for (let run = 1; run <= 3; run += 1) {
      const value = `R12-1095-COLLAB-${run}`
      const startedAt = Date.now()
      await memoB.fill(value)
      await expect(memoA).toHaveValue(value, { timeout: 20_000 })
      runs.push({ run, durationMs: Date.now() - startedAt, synced: true })
    }
    await page.screenshot({ path: path.join(shotsDir, '05-collaboration-three-runs.png'), fullPage: true })
  } finally {
    if (originalMemo) {
      await pageB.getByLabel('비고').fill(originalMemo).catch(() => undefined)
      await expect(page.getByLabel('비고')).toHaveValue(originalMemo, { timeout: 20_000 }).catch(() => undefined)
    }
    await contextB.close()
    await writeEvidence('r12-safety-and-collaboration.json', {
      safety: {
        http: safetyResponse.status(), total: safetyRows.length, identifiable: identifiable.length, stale: stale.length,
        rows: safetyRows.map((row: any) => ({ productId: '<redacted-id>', productCode: row.productCode ?? null, productName: row.productName ?? null })),
      },
      collaboration: { estimateNo: target?.estimateNo, runs, restoredMemo: originalMemo },
    })
  }
})

test('R12 R5 회귀 비상품 자동수량·ACTIVE BUNDLE 8행·품절 후보', async ({ page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  const session = await login(page, password)
  await installAuth(page, session)
  const evidence: Evidence = {}
  await page.goto(`${desktopUrl}/sales/estimates/new`)
  const modelInput = page.getByRole('combobox', { name: '라인 1 모델명' })
  await expect(modelInput).toBeVisible({ timeout: 30_000 })
  await modelInput.fill('운임')
  await expect(page.getByLabel('라인 1 품목명')).not.toHaveValue('', { timeout: 15_000 })
  const nonGoodsQuantity = page.getByLabel('라인 1 수량').first()
  await nonGoodsQuantity.fill('')
  await page.getByLabel('라인 1 단가').first().fill('10000')
  evidence.nonGoodsQuantity = await nonGoodsQuantity.inputValue()
  expect(evidence.nonGoodsQuantity).toBe('1')

  const expansionStatuses: number[] = []
  page.on('response', (response) => {
    if (response.url().endsWith('/slips/expand-line')) expansionStatuses.push(response.status())
  })
  await page.goto(`${desktopUrl}/sales/new`)
  const slipProduct = page.getByRole('combobox', { name: '라인 1 품목' })
  await expect(slipProduct).toBeVisible({ timeout: 30_000 })
  await slipProduct.fill('AC060CS6PBH1SY')
  await expect.poll(() => page.locator('[aria-label^="라인 "][aria-label$=" 품목"]:visible').count(), { timeout: 30_000 }).toBe(8)
  evidence.activeBundle = { http: expansionStatuses, visibleLines: 8 }
  expect(expansionStatuses).toContain(200)

  await page.goto(`${desktopUrl}/sales/estimates/new`)
  const outOfStockInput = page.getByRole('combobox', { name: '라인 1 모델명' })
  await outOfStockInput.fill('AR60F07D')
  const dialog = page.getByRole('dialog', { name: '품목 검색 결과' })
  await expect(dialog).toBeVisible({ timeout: 20_000 })
  const candidate = dialog.getByRole('row', { name: /AR60F07D11WS/ }).first()
  await expect(candidate).toBeVisible()
  evidence.outOfStockCandidate = await candidate.innerText()
  await page.screenshot({ path: path.join(shotsDir, '06-r5-regressions.png'), fullPage: true })
  await writeEvidence('r12-r5-regressions.json', evidence)
})
