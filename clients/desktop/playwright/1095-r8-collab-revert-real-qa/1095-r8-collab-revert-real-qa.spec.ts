import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'

const require = createRequire(import.meta.url)
const { resolveQaShotsDir } = require('../../../../scripts/lib/qa-shots-dir.cjs')
const { resolveQaCredential } = require('../../../../scripts/lib/qa-credentials.cjs')
const here = path.dirname(fileURLToPath(import.meta.url))
const shotsDir = resolveQaShotsDir(here)
const desktopUrl = process.env['QA_DESKTOP_URL'] ?? 'http://127.0.0.1:5295'
const apiBase = process.env['QA_API_BASE'] ?? 'http://127.0.0.1:8080'
const estimateId = 'c027dd21-2661-4fc4-8167-0cbf5654acdb'
const qaRound = 'R8-1095-REVERT-COLLAB'

function redact(value: string): string {
  return value
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/ig, '<redacted-id>')
    .replace(/Bearer\s+[^\s"']+/ig, 'Bearer <redacted>')
}

async function login(page: Page, password: string): Promise<Record<string, any>> {
  const response = await page.request.post(`${apiBase}/auth/login`, {
    data: { loginId: 'dev_master', password },
  })
  const raw = await response.text()
  expect(response.ok(), `관리자 로그인 HTTP ${response.status()} ${redact(raw)}`).toBeTruthy()
  return JSON.parse(raw).data
}

async function installAuth(page: Page, session: Record<string, any>): Promise<void> {
  await page.addInitScript(({ token, userId, role, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: { getToken: async () => ({ token, userId, role, fullName: displayName }) },
    })
  }, session)
}

function directHeaders(session: Record<string, any>): Record<string, string> {
  const claims = JSON.parse(Buffer.from(session.token.split('.')[1], 'base64url').toString('utf8'))
  return {
    Authorization: `Bearer ${session.token}`,
    'X-User-Id': String(claims.sub ?? session.userId ?? ''),
    'X-User-Role': String(session.role ?? claims.role ?? 'MASTER'),
    'X-Is-System-Master': String(claims.isSystemMaster === true),
    'X-User-Groups': Array.isArray(claims.groups) ? claims.groups.join(',') : '',
  }
}

test('R8 R6 hydrate 되돌림 상태 협업 동기화 3회 연속 원문', async ({ browser, page }) => {
  test.setTimeout(360_000)
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return
  }

  const session = await login(page, password)
  await installAuth(page, session)
  const result: Record<string, unknown> = { qaRound, estimateId: '<redacted-id>', runs: [] }
  const runs: Array<Record<string, unknown>> = []
  const contextB = await browser.newContext()
  const pageB = await contextB.newPage()
  await installAuth(pageB, session)
  try {
    for (let run = 1; run <= 3; run += 1) {
      const calls: Array<Record<string, unknown>> = []
      const observe = (actor: string) => (response: any) => {
        if (response.request().method() === 'POST' && response.url().includes('/api/products/lookup')) {
          calls.push({ actor, http: response.status(), at: Date.now(), url: redact(response.url()) })
        }
      }
      const listenerA = observe('A')
      const listenerB = observe('B')
      page.on('response', listenerA)
      pageB.on('response', listenerB)
      await Promise.all([
        page.goto(`${desktopUrl}/#/sales/estimates/${estimateId}/edit`),
        pageB.goto(`${desktopUrl}/#/sales/estimates/${estimateId}/edit`),
      ])
      const memoA = page.getByLabel('비고')
      const memoB = pageB.getByLabel('비고')
      await expect(memoA).toBeVisible({ timeout: 30_000 })
      await expect(memoB).toBeVisible({ timeout: 30_000 })
      const value = `${qaRound}-${run}`
      const startedAt = Date.now()
      await memoB.fill(value)
      await expect(memoA).toHaveValue(value, { timeout: 20_000 })
      const durationMs = Date.now() - startedAt
      runs.push({ run, durationMs, calls: [...calls], syncedValue: await memoA.inputValue() })
      if (run === 3) await page.screenshot({ path: path.join(shotsDir, '01-reverted-collab-three-runs.png'), fullPage: true })
      page.removeListener('response', listenerA)
      pageB.removeListener('response', listenerB)
    }
  } finally {
    try {
      await pageB.getByLabel('비고').fill('')
      await page.getByLabel('비고').fill('')
    } catch (error) {
      runs.push({ cleanupError: redact(error instanceof Error ? error.message : String(error)) })
    }
    await contextB.close()
    result.runs = runs
    fs.writeFileSync(path.join(shotsDir, 'r8-reverted-collab-3-runs.json'), `${JSON.stringify(result, null, 2)}\n`, 'utf8')
  }
})

test('R8 관리자 상태·tags 수정과 실제 이름 충돌 거부 원문', async ({ page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, `QA credential unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return
  }
  const session = await login(page, password)
  const headers = directHeaders(session)
  const productBase = process.env['QA_PRODUCT_BASE'] ?? 'http://127.0.0.1:28084'
  const evidence: Record<string, unknown> = { qaRound, targetModel: 'AR60F09C13WS' }
  const targetResponse = await page.request.get(`${productBase}/products/by-model/AR60F09C13WS`, { headers })
  const targetRaw = await targetResponse.text()
  expect(targetResponse.ok(), `target 조회 HTTP ${targetResponse.status()} ${redact(targetRaw)}`).toBeTruthy()
  const target = JSON.parse(targetRaw).data
  const originalTags = { ...(target.tags ?? {}) }
  const tagged = { ...originalTags, qaRound }
  try {
    const tagsResponse = await page.request.put(`${productBase}/products/${target.id}/tags`, { headers, data: tagged })
    const tagsRaw = await tagsResponse.text()
    evidence.tagsMutation = { http: tagsResponse.status(), body: redact(tagsRaw) }
    expect(tagsResponse.ok(), `tags 수정 HTTP ${tagsResponse.status()} ${redact(tagsRaw)}`).toBeTruthy()

    const reactivateResponse = await page.request.post(`${productBase}/products/${target.id}/reactivate`, { headers })
    const reactivateRaw = await reactivateResponse.text()
    evidence.reactivateAfterFix = { http: reactivateResponse.status(), body: redact(reactivateRaw) }
    expect(reactivateResponse.ok(), `reactivate HTTP ${reactivateResponse.status()} ${redact(reactivateRaw)}`).toBeTruthy()

    const conflictResponse = await page.request.get(`${productBase}/products/by-model/0000098`, { headers })
    const conflictRaw = await conflictResponse.text()
    expect(conflictResponse.ok(), `충돌 기준 조회 HTTP ${conflictResponse.status()} ${redact(conflictRaw)}`).toBeTruthy()
    const conflictName = JSON.parse(conflictRaw).data.name
    const renameResponse = await page.request.patch(`${productBase}/products/${target.id}`, {
      headers,
      data: { name: conflictName },
    })
    const renameRaw = await renameResponse.text()
    evidence.renameToDuplicate = { http: renameResponse.status(), body: redact(renameRaw) }
    expect(renameResponse.status()).toBe(409)
    expect(renameRaw).toContain('CONFLICT')
  } finally {
    const syncResponse = await page.request.post(`${productBase}/api/v1/products/admin/sync`, {
      headers,
      timeout: 240_000,
    })
    const syncRaw = await syncResponse.text()
    evidence.restoreFromSheetSync = { http: syncResponse.status(), body: redact(syncRaw).slice(0, 4000) }
    const afterSyncResponse = await page.request.get(`${productBase}/products/by-model/AR60F09C13WS`, { headers })
    const afterSync = JSON.parse(await afterSyncResponse.text()).data
    const discontinueResponse = afterSync.status === 'OUT_OF_STOCK'
      ? { status: () => 204, ok: () => true }
      : await page.request.post(`${productBase}/products/${target.id}/discontinue`, { headers })
    const restoreTagsResponse = await page.request.put(`${productBase}/products/${target.id}/tags`, {
      headers,
      data: originalTags,
    })
    evidence.cleanup = {
      statusAfterSync: afterSync.status,
      discontinueHttp: discontinueResponse.status(),
      tagsHttp: restoreTagsResponse.status(),
    }
    expect(discontinueResponse.ok()).toBeTruthy()
    expect(restoreTagsResponse.ok()).toBeTruthy()
    fs.writeFileSync(path.join(shotsDir, 'r8-admin-api-observations.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  }
})
