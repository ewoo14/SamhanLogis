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
const targetModel = 'AR60F07D11WS'
const qaRound = 'R9-1095-SAVED-REOPEN'

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
    'X-User-Name': encodeURIComponent(String(session.displayName ?? claims.name ?? 'R9 QA')),
  }
}

async function record(
  evidence: Evidence,
  key: string,
  response: APIResponse,
  expectedStatus?: number,
): Promise<any> {
  const raw = await response.text()
  evidence[key] = { http: response.status(), body: redact(raw).slice(0, 12_000) }
  if (expectedStatus !== undefined) {
    expect(response.status(), `${key} HTTP ${response.status()} ${redact(raw)}`).toBe(expectedStatus)
  } else {
    expect(response.ok(), `${key} HTTP ${response.status()} ${redact(raw)}`).toBeTruthy()
  }
  return raw ? JSON.parse(raw) : null
}

async function getProduct(page: Page, headers: Record<string, string>, evidence: Evidence, key: string): Promise<any> {
  const payload = await record(evidence, key, await page.request.get(
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

test('R9 첫 과제 저장 품절 견적 재열기 잠금과 ACTIVE 복구', async ({ page }) => {
  test.setTimeout(600_000)
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return
  }

  const evidence: Evidence = { qaRound, targetModel }
  const session = await login(page, password)
  await installAuth(page, session)
  const headers = directHeaders(session)
  const original = await getProduct(page, headers, evidence, 'step0ProductBefore')
  const originalTags = { ...(original.tags ?? {}) }
  evidence['countsBeforeApi'] = await statusTotals(page, headers)
  expect(original.status, 'R9 표본의 시트 정본이 OUT_OF_STOCK이 아님').toBe('OUT_OF_STOCK')

  let finalRestored = false
  try {
    await record(evidence, 'tagR9', await page.request.put(`${productBase}/products/${original.id}/tags`, {
      headers,
      data: { ...originalTags, qaRound },
    }))
    await record(evidence, 'step1Reactivate', await page.request.post(
      `${productBase}/products/${original.id}/reactivate`,
      { headers },
    ), 204)
    expect((await getProduct(page, headers, evidence, 'step1ProductActive')).status).toBe('ACTIVE')

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
    await page.screenshot({ path: path.join(shotsDir, '01-active-api-and-gui.png'), fullPage: true })

    const createResponse = page.waitForResponse((response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/slips/estimates')
    await page.getByTestId('estimate-form-save-button').click()
    const created = await createResponse
    const createdPayload = await record(evidence, 'step2EstimateCreate', created)
    const estimateId = createdPayload.data?.id ?? ''
    evidence['estimateId'] = '<redacted-id>'
    evidence['estimateNo'] = createdPayload.data?.estimateNo
    expect(estimateId, '견적 저장 응답 id 누락').not.toBe('')
    await expect(page.getByTestId('estimate-detail-no'), '저장 후 견적 상세 미도달').toBeVisible({ timeout: 30_000 })
    await page.screenshot({ path: path.join(shotsDir, '02-estimate-saved.png'), fullPage: true })

    await syncSheet(page, headers, evidence, 'step3AdminSyncToOutOfStock')
    expect((await getProduct(page, headers, evidence, 'step3ProductOutOfStock')).status).toBe('OUT_OF_STOCK')
    evidence['countsAfterOutOfStockApi'] = await statusTotals(page, headers)
    await page.reload()
    await page.screenshot({ path: path.join(shotsDir, '03-admin-api-out-of-stock.png'), fullPage: true })

    await page.goto(`${desktopUrl}/#/sales/estimates/${estimateId}/edit`)
    const lockedQuantity = page.getByLabel('라인 1 수량 품절')
    await expect(lockedQuantity, '저장본 재열기 후 품절 수량 input 미도달').toBeVisible({ timeout: 30_000 })
    await expect(lockedQuantity, '저장본 재열기 후 OUT_OF_STOCK 수량이 편집 가능').not.toBeEditable()
    evidence['step4ReopenOutOfStock'] = {
      value: await lockedQuantity.inputValue(),
      editable: await lockedQuantity.isEditable(),
    }
    await page.screenshot({ path: path.join(shotsDir, '04-saved-reopen-out-of-stock-locked.png'), fullPage: true })

    await record(evidence, 'step5Reactivate', await page.request.post(
      `${productBase}/products/${original.id}/reactivate`,
      { headers },
    ), 204)
    expect((await getProduct(page, headers, evidence, 'step5ProductActive')).status).toBe('ACTIVE')
    await page.reload()
    const unlockedQuantity = page.getByLabel('라인 1 수량')
    await expect(unlockedQuantity, 'ACTIVE 복구 후 수량 input 미도달').toBeVisible({ timeout: 30_000 })
    await expect(unlockedQuantity, 'ACTIVE 복구 후 수량 잠금 미해제').toBeEditable()
    evidence['step5ReopenActive'] = {
      value: await unlockedQuantity.inputValue(),
      editable: await unlockedQuantity.isEditable(),
    }
    await page.screenshot({ path: path.join(shotsDir, '05-active-unlocked-not-snapshot.png'), fullPage: true })

    await syncSheet(page, headers, evidence, 'step6AdminSyncRestoreOriginal')
    finalRestored = (await getProduct(page, headers, evidence, 'step6ProductRestored')).status === 'OUT_OF_STOCK'
    evidence['countsAfterRestoreApi'] = await statusTotals(page, headers)
    await page.reload()
    await expect(page.getByLabel('라인 1 수량 품절'), '최종 원복 후 품절 잠금 미복구').not.toBeEditable({ timeout: 30_000 })
    await page.screenshot({ path: path.join(shotsDir, '06-original-status-distribution-restored.png'), fullPage: true })
  } finally {
    if (!finalRestored) {
      await syncSheet(page, headers, evidence, 'finallyEmergencySyncRestoreOriginal')
    }
    await record(evidence, 'restoreOriginalTags', await page.request.put(
      `${productBase}/products/${original.id}/tags`,
      { headers, data: originalTags },
    ))
    evidence['productFinal'] = redact(JSON.stringify(await getProduct(page, headers, evidence, 'productFinalAfterCleanup')))
    evidence['countsFinalApi'] = await statusTotals(page, headers)
    writeJson('r9-first-task-observations.json', evidence)
  }
})

test('R9 첫 과제 실패 화면 재캡처', async ({ page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  const estimateId = process.env['QA_R9_ESTIMATE_ID'] ?? ''
  expect(estimateId, 'QA_R9_ESTIMATE_ID 누락').not.toBe('')
  const session = await login(page, password)
  await installAuth(page, session)
  await page.goto(`${desktopUrl}/#/sales/estimates/${estimateId}/edit`)
  const quantity = page.getByLabel('라인 1 수량')
  await expect(quantity, 'R9 저장 견적 편집 화면 미도달').toBeVisible({ timeout: 30_000 })
  await expect(quantity, 'R9 저장 견적 수량이 잠겨 예상과 다름').toBeEditable()
  await expect(quantity).toHaveValue('7')
  await page.screenshot({ path: path.join(shotsDir, '04-failure-expanded-active-line-editable.png'), fullPage: true })
  writeJson('r9-first-task-failure-screen.json', {
    qaRound,
    estimateId: '<redacted-id>',
    estimateNo: '2026/08/10-1',
    targetModel,
    persistedFirstLineModel: await page.getByRole('combobox', { name: '라인 1 모델명' }).inputValue(),
    quantity: await quantity.inputValue(),
    editable: await quantity.isEditable(),
  })
})
