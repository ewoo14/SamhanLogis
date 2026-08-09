import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { expect, test, type APIResponse, type Page } from '@playwright/test'

const require = createRequire(import.meta.url)
const { resolveQaShotsDir } = require('../../../../scripts/lib/qa-shots-dir.cjs')
const { resolveQaCredential } = require('../../../../scripts/lib/qa-credentials.cjs')
const here = path.dirname(fileURLToPath(import.meta.url))
const shotsDir = resolveQaShotsDir(here)

const desktopUrl = process.env['QA_DESKTOP_URL'] ?? 'http://127.0.0.1:5295'
const apiBase = process.env['QA_API_BASE'] ?? 'http://127.0.0.1:8080'
const productBase = process.env['QA_PRODUCT_BASE'] ?? 'http://127.0.0.1:28084'
const inventoryBase = process.env['QA_INVENTORY_BASE'] ?? 'http://127.0.0.1:28085'
const targetModel = 'AR60F09C13WS'
const qaRound = 'R7-1095-SAVED-REOPEN'

type Login = { token: string; userId?: string; role?: string; displayName?: string }
type Evidence = Record<string, unknown>

function redact(value: string): string {
  return value
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig, '<redacted-id>')
    .replace(/Bearer\s+[^\s"']+/ig, 'Bearer <redacted>')
}

function writeJson(name: string, value: unknown): void {
  fs.writeFileSync(path.join(shotsDir, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function login(page: Page, password: string): Promise<Login> {
  const response = await page.request.post(`${apiBase}/auth/login`, {
    data: { loginId: 'dev_master', password },
  })
  const raw = await response.text()
  expect(response.ok(), `실 관리자 로그인 HTTP ${response.status()} ${redact(raw)}`).toBeTruthy()
  const payload = JSON.parse(raw)
  expect(payload.data?.token, '실 관리자 로그인 토큰 누락').toBeTruthy()
  return payload.data
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
    'X-User-Name': encodeURIComponent(String(session.displayName ?? claims.name ?? 'R7 QA')),
  }
}

async function recordJson(
  evidence: Evidence,
  key: string,
  response: APIResponse,
): Promise<any> {
  const raw = await response.text()
  evidence[key] = { http: response.status(), body: redact(raw).slice(0, 6000) }
  expect(response.ok(), `${key} HTTP ${response.status()} ${redact(raw)}`).toBeTruthy()
  return raw ? JSON.parse(raw) : null
}

async function recordNoContent(
  evidence: Evidence,
  key: string,
  response: APIResponse,
): Promise<void> {
  const raw = await response.text()
  evidence[key] = { http: response.status(), body: redact(raw).slice(0, 3000) }
  expect(response.ok(), `${key} HTTP ${response.status()} ${redact(raw)}`).toBeTruthy()
}

async function getProduct(page: Page, headers: Record<string, string>, evidence: Evidence, key: string): Promise<any> {
  const payload = await recordJson(evidence, key, await page.request.get(
    `${productBase}/products/by-model/${targetModel}`,
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
    timeout: 240_000,
  })
  const raw = await response.text()
  evidence[key] = {
    http: response.status(),
    elapsedMs: Date.now() - startedAt,
    body: redact(raw).slice(0, 12_000),
  }
  expect(response.ok(), `${key} HTTP ${response.status()} ${redact(raw)}`).toBeTruthy()
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

function attachLookupCounter(page: Page, sink: Array<Record<string, unknown>>, actor: string): void {
  page.on('response', async (response) => {
    const url = response.url()
    if (response.request().method() !== 'POST' || !url.includes('/api/products/lookup')) return
    sink.push({ actor, http: response.status(), at: Date.now(), url: redact(url) })
  })
  page.on('requestfailed', (request) => {
    if (request.method() !== 'POST' || !request.url().includes('/api/products/lookup')) return
    sink.push({ actor, http: 'FAILED', at: Date.now(), url: redact(request.url()), error: request.failure()?.errorText })
  })
}

test('R7 저장본 상태 재열기와 두 사용자 협업 동기화 실측', async ({ browser, page }) => {
  test.setTimeout(600_000)
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return
  }

  const evidence: Evidence = { qaRound, targetModel, calls: [] }
  const session = await login(page, password)
  await installAuth(page, session)
  const headers = directHeaders(session)
  const original = await getProduct(page, headers, evidence, 'productBefore')
  // 직전 R7 환경 실패가 status 복구 뒤 tag cleanup 전에 중단됐을 수 있다. 같은 라운드의
  // qaRound만 우리 잔재이므로 제거하고, 그 밖의 원래 tag는 그대로 보존한다.
  const originalTags = { ...(original.tags ?? {}) }
  if (originalTags.qaRound === qaRound) delete originalTags.qaRound
  evidence['countsBeforeApi'] = await statusTotals(page, headers)
  expect(original.status, 'R7 표본 정본이 OUT_OF_STOCK이 아님').toBe('OUT_OF_STOCK')

  let estimateId = ''
  let finalRestored = false
  try {
    await recordJson(evidence, 'tagR7', await page.request.put(`${productBase}/products/${original.id}/tags`, {
      headers,
      data: { ...originalTags, qaRound },
    }))
    await recordNoContent(evidence, 'reactivateForSave', await page.request.post(
      `${productBase}/products/${original.id}/reactivate`,
      { headers },
    ))
    expect((await getProduct(page, headers, evidence, 'productActiveForSave')).status).toBe('ACTIVE')

    await page.goto(`${desktopUrl}/#/sales/estimates/new`)
    await expect(page.getByTestId('estimate-form-save-button'), '견적 신규 화면 미도달').toBeVisible({ timeout: 30_000 })
    await pickAutocomplete(page, '거래처 검색', '거래처 목록', '서초1동주민센타')
    const modelInput = page.getByRole('combobox', { name: '라인 1 모델명' })
    await modelInput.fill(targetModel)
    await page.waitForTimeout(800)
    await modelInput.press('Enter')
    await expect(page.getByLabel('라인 1 품목명'), '실 품목 lookup 미도달').not.toHaveValue('', { timeout: 20_000 })
    const quantity = page.getByTestId('estimate-form-line-0-qty')
    await expect(quantity, 'ACTIVE 품목 수량이 잠김').toBeEditable()
    await quantity.fill('7')
    await page.getByLabel('비고').fill(`${qaRound} 실제 사용자 저장 표본`)
    await page.screenshot({ path: path.join(shotsDir, '01-active-before-save.png'), fullPage: true })

    const createResponse = page.waitForResponse((response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/slips/estimates')
    await page.getByTestId('estimate-form-save-button').click()
    const created = await createResponse
    const createdRaw = await created.text()
    evidence['estimateCreate'] = { http: created.status(), body: redact(createdRaw).slice(0, 6000) }
    expect(created.ok(), `견적 저장 HTTP ${created.status()} ${redact(createdRaw)}`).toBeTruthy()
    const createdPayload = JSON.parse(createdRaw)
    estimateId = createdPayload.data?.id ?? ''
    evidence['estimateNo'] = createdPayload.data?.estimateNo
    expect(estimateId, '견적 저장 응답 id 누락').not.toBe('')
    await expect(page.getByTestId('estimate-detail-no'), '저장 후 견적 상세 미도달').toBeVisible({ timeout: 30_000 })
    await page.screenshot({ path: path.join(shotsDir, '02-saved-detail.png'), fullPage: true })

    await syncSheet(page, headers, evidence, 'syncToOutOfStock')
    expect((await getProduct(page, headers, evidence, 'productAfterOutOfStockSync')).status).toBe('OUT_OF_STOCK')
    evidence['countsAfterOutOfStockApi'] = await statusTotals(page, headers)

    const lookupCalls: Array<Record<string, unknown>> = []
    attachLookupCounter(page, lookupCalls, 'A')
    await page.goto(`${desktopUrl}/#/sales/estimates/${estimateId}/edit`)
    const lockedQuantity = page.getByLabel('라인 1 수량 품절')
    await expect(lockedQuantity, '저장본 재열기 후 품절 수량 input 미도달').toBeVisible({ timeout: 30_000 })
    await expect(lockedQuantity, '저장본 재열기 후 OUT_OF_STOCK 수량이 편집 가능').not.toBeEditable()
    evidence['reopenOutOfStock'] = {
      value: await lockedQuantity.inputValue(),
      editable: await lockedQuantity.isEditable(),
      lookupCalls: lookupCalls.length,
    }
    await page.screenshot({ path: path.join(shotsDir, '03-saved-reopen-out-of-stock-locked.png'), fullPage: true })

    await recordNoContent(evidence, 'reactivateForUnlock', await page.request.post(
      `${productBase}/products/${original.id}/reactivate`,
      { headers },
    ))
    expect((await getProduct(page, headers, evidence, 'productActiveForUnlock')).status).toBe('ACTIVE')
    await page.reload()
    const unlockedQuantity = page.getByLabel('라인 1 수량')
    await expect(unlockedQuantity, 'ACTIVE 복구 후 수량 input 미도달').toBeVisible({ timeout: 30_000 })
    await expect(unlockedQuantity, 'ACTIVE 복구 후 수량 잠금 미해제').toBeEditable()
    evidence['reopenActive'] = { value: await unlockedQuantity.inputValue(), editable: await unlockedQuantity.isEditable() }
    await page.screenshot({ path: path.join(shotsDir, '04-saved-reopen-active-unlocked.png'), fullPage: true })

    const contextB = await browser.newContext()
    const pageB = await contextB.newPage()
    await installAuth(pageB, session)
    attachLookupCounter(pageB, lookupCalls, 'B')
    await pageB.goto(`${desktopUrl}/#/sales/estimates/${estimateId}/edit`)
    await expect(pageB.getByLabel('라인 1 수량'), '두 번째 사용자 견적 편집 미도달').toBeVisible({ timeout: 30_000 })
    await expect.poll(() => lookupCalls.filter((call) => call.actor === 'B').length, {
      timeout: 20_000,
      message: '두 번째 사용자 초기 hydrate lookup 미관측',
    }).toBeGreaterThanOrEqual(1)
    const initialLookupCount = lookupCalls.length

    await unlockedQuantity.fill('13')
    await expect(pageB.getByLabel('라인 1 수량')).toHaveValue('13', { timeout: 20_000 })
    for (const value of [`${qaRound}-SYNC-1`, `${qaRound}-SYNC-2`, `${qaRound}-SYNC-3`]) {
      await pageB.getByLabel('비고').fill(value)
      await expect(page.getByLabel('비고')).toHaveValue(value, { timeout: 20_000 })
      await expect(unlockedQuantity, '협업 동기화가 사용자 미저장 수량을 덮음').toHaveValue('13')
    }
    const afterThreeSyncLookupCount = lookupCalls.length
    evidence['collab'] = {
      initialLookupCount,
      afterThreeSyncLookupCount,
      addedByThreeSync: afterThreeSyncLookupCount - initialLookupCount,
      unsavedQuantityAfterSync: await unlockedQuantity.inputValue(),
      calls: lookupCalls,
    }
    await page.screenshot({ path: path.join(shotsDir, '05-collab-unsaved-input-preserved.png'), fullPage: true })

    await syncSheet(page, headers, evidence, 'syncWhileTwoUsersOpen')
    expect((await getProduct(page, headers, evidence, 'productOutOfStockWhileOpen')).status).toBe('OUT_OF_STOCK')
    const beforePostStatusSync = lookupCalls.length
    await pageB.getByLabel('비고').fill(`${qaRound}-SYNC-AFTER-OOS`)
    await expect(page.getByLabel('비고')).toHaveValue(`${qaRound}-SYNC-AFTER-OOS`, { timeout: 20_000 })
    await page.waitForTimeout(1500)
    evidence['openSessionAfterStatusChange'] = {
      lookupCallsBefore: beforePostStatusSync,
      lookupCallsAfter: lookupCalls.length,
      editableWithoutReload: await unlockedQuantity.isEditable(),
      valueWithoutReload: await unlockedQuantity.inputValue(),
    }
    await page.screenshot({ path: path.join(shotsDir, '06-open-session-after-oos-collab-sync.png'), fullPage: true })

    await page.reload()
    await expect(page.getByLabel('라인 1 수량 품절'), 'reload 후 품절 상태 미반영').not.toBeEditable({ timeout: 30_000 })
    await recordNoContent(evidence, 'reactivateAfterCollabProbe', await page.request.post(
      `${productBase}/products/${original.id}/reactivate`,
      { headers },
    ))
    await page.reload()
    await expect(page.getByLabel('라인 1 수량'), '협업 probe 뒤 ACTIVE 복구 미반영').toBeEditable({ timeout: 30_000 })
    await contextB.close()

    await syncSheet(page, headers, evidence, 'finalSyncRestoreOutOfStock')
    finalRestored = (await getProduct(page, headers, evidence, 'productFinal')).status === 'OUT_OF_STOCK'
    evidence['countsAfterApi'] = await statusTotals(page, headers)
  } finally {
    if (!finalRestored) {
      await syncSheet(page, headers, evidence, 'finallyEmergencySyncRestoreOutOfStock')
    }
    await recordJson(evidence, 'restoreOriginalTags', await page.request.put(
      `${productBase}/products/${original.id}/tags`,
      { headers, data: originalTags },
    ))
    evidence['productFinalAfterCleanup'] = redact(JSON.stringify(await getProduct(page, headers, evidence, 'productFinalAfterCleanup')))
    evidence['countsFinalApi'] = await statusTotals(page, headers)
    writeJson('r7-status-reopen-observations.json', evidence)
  }
})

test('R7 기존 저장 견적 두 사용자 협업 lookup 호출 횟수와 미저장 입력 보존', async ({ browser, page }) => {
  test.setTimeout(180_000)
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return
  }

  const existingEstimateId = 'c027dd21-2661-4fc4-8167-0cbf5654acdb'
  const session = await login(page, password)
  await installAuth(page, session)
  const calls: Array<Record<string, unknown>> = []
  const result: Evidence = { qaRound, estimateNo: '2026/08/07-12', lineCount: 4, calls }
  attachLookupCounter(page, calls, 'A')

  const contextB = await browser.newContext()
  const pageB = await contextB.newPage()
  await installAuth(pageB, session)
  attachLookupCounter(pageB, calls, 'B')

  await Promise.all([
    page.goto(`${desktopUrl}/#/sales/estimates/${existingEstimateId}/edit`),
    pageB.goto(`${desktopUrl}/#/sales/estimates/${existingEstimateId}/edit`),
  ])
  const quantityA = page.getByLabel('라인 1 수량')
  const quantityB = pageB.getByLabel('라인 1 수량')
  await expect(quantityA, '사용자 A 기존 견적 편집 미도달').toBeVisible({ timeout: 30_000 })
  await expect(quantityB, '사용자 B 기존 견적 편집 미도달').toBeVisible({ timeout: 30_000 })
  await expect.poll(() => calls.length, {
    timeout: 30_000,
    message: '두 사용자 초기 status hydrate lookup 미관측',
  }).toBeGreaterThanOrEqual(2)

  const originalMemo = await page.getByLabel('비고').inputValue()
  const originalQuantity = await quantityA.inputValue()
  const initialCalls = calls.length
  result['initialLookupCalls'] = initialCalls
  result['initialQuantityFromCoedit'] = originalQuantity
  const syncDurationsMs: number[] = []
  try {
    await quantityA.fill('13')
    await expect(quantityB, '사용자 A 수량 입력이 사용자 B에 동기화되지 않음').toHaveValue('13', { timeout: 20_000 })

    for (let index = 1; index <= 6; index += 1) {
      const actor = index % 2 === 0 ? page : pageB
      const observer = index % 2 === 0 ? pageB : page
      const value = `${qaRound}-COLLAB-${index}`
      const startedAt = Date.now()
      await actor.getByLabel('비고').fill(value)
      await expect(observer.getByLabel('비고')).toHaveValue(value, { timeout: 20_000 })
      syncDurationsMs.push(Date.now() - startedAt)
      await expect(quantityA, '협업 동기화가 사용자 미저장 수량을 덮음(A)').toHaveValue('13')
      await expect(quantityB, '협업 동기화가 사용자 미저장 수량을 덮음(B)').toHaveValue('13')
    }

    await page.screenshot({ path: path.join(shotsDir, '07-collab-two-users-preserved.png'), fullPage: true })
    Object.assign(result, {
      lookupCallsAfterSixSyncs: calls.length,
      lookupCallsAddedBySixSyncs: calls.length - initialCalls,
      syncDurationsMs,
      maxSyncDurationMs: Math.max(...syncDurationsMs),
      quantityAfterSixSyncsA: await quantityA.inputValue(),
      quantityAfterSixSyncsB: await quantityB.inputValue(),
    })
  } finally {
    const cleanup: Evidence = {}
    try {
      await pageB.getByLabel('비고').fill(originalMemo)
      await expect(page.getByLabel('비고')).toHaveValue(originalMemo, { timeout: 20_000 })
      cleanup['memo'] = 'restored'
    } catch (error) {
      cleanup['memo'] = error instanceof Error ? error.message : String(error)
    }
    // 이 저장 견적의 실 DB 원문은 line 1 quantity=1이다. 직전 중단으로 Y.Doc에 13이
    // 남았어도 양 소비자 모두 1을 써서 R7 CRDT 잔재를 제거한다.
    try {
      await quantityA.fill('1')
      await quantityB.fill('1')
      cleanup['quantityA'] = await quantityA.inputValue()
      cleanup['quantityB'] = await quantityB.inputValue()
    } catch (error) {
      cleanup['quantity'] = error instanceof Error ? error.message : String(error)
    }
    result['cleanup'] = cleanup
    result['calls'] = calls
    writeJson('r7-collab-observations.json', result)
    await contextB.close()
  }
})

test('R7 cleanup tag 잔재 제거', async ({ page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  const session = await login(page, password)
  const headers = directHeaders(session)
  const evidence: Evidence = {}
  const product = await getProduct(page, headers, evidence, 'beforeCleanup')
  const tags = { ...(product.tags ?? {}) }
  if (tags.qaRound === qaRound) delete tags.qaRound
  await recordJson(evidence, 'cleanupTag', await page.request.put(
    `${productBase}/products/${product.id}/tags`,
    { headers, data: tags },
  ))
  const cleaned = await getProduct(page, headers, evidence, 'afterCleanup')
  expect(cleaned.tags?.qaRound, 'R7 qaRound tag 잔재').toBeUndefined()
  expect(cleaned.status, 'cleanup이 상태를 바꿈').toBe('OUT_OF_STOCK')
})

test('R7 safety stale 혼합에서 정상 식별자 보존', async ({ page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  const session = await login(page, password)
  const response = await page.request.get(`${inventoryBase}/inventory/alerts/safety-stock`, {
    headers: directHeaders(session),
  })
  const raw = await response.text()
  expect(response.ok(), `R7 inventory HEAD safety API HTTP ${response.status()} ${redact(raw)}`).toBeTruthy()
  const rows = JSON.parse(raw).data ?? []
  const identifiable = rows.filter((row: any) => row.productCode || row.productName)
  const stale = rows.filter((row: any) => !row.productCode && !row.productName)
  expect(identifiable.length, 'stale 혼합 batch에서 정상 항목 식별자까지 유실됨').toBeGreaterThan(0)
  expect(stale.length, 'stale 항목이 결과에서 조용히 사라짐').toBeGreaterThan(0)
  writeJson('r7-safety-stale-observations.json', {
    qaRound,
    http: response.status(),
    total: rows.length,
    identifiable: identifiable.length,
    stale: stale.length,
    rows: rows.map((row: any) => ({
      productId: '<redacted-id>',
      productCode: row.productCode ?? null,
      productName: row.productName ?? null,
      threshold: row.threshold,
      note: row.note,
    })),
    raw: redact(raw),
  })
})
