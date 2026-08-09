import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import type { SyncSummary } from '../../src/renderer/api/sheetSyncApi'

type SyncEnvelope = {
  data: {
    lastSyncAt: string | null
    summary: SyncSummary | null
  }
}

const dirname = path.dirname(fileURLToPath(import.meta.url))
const shots = resolveQaShotsDir(
  path.resolve(dirname, '../../../../docs/qa/2026-08-09-978-r12-sol-reconv'),
)
const baseUrl = process.env['QA_BASE_URL'] ?? 'http://127.0.0.1:5234'
const authApiBase = process.env['QA_AUTH_API_BASE'] ?? 'http://127.0.0.1:8080'
const productApiBase = process.env['QA_PRODUCT_API_BASE'] ?? 'http://127.0.0.1:18085'
const productUpstreamBase = process.env['QA_PRODUCT_UPSTREAM_BASE'] ?? 'http://127.0.0.1:18084'

test('PR #1127 R12 실동기화 결과가 오류·동일 카운트와 기존 집계를 함께 표시한다', async ({ page }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : String(error))
    return
  }

  mkdirSync(shots, { recursive: true })

  const loginResponse = await page.request.post(`${authApiBase}/auth/login`, {
    data: { loginId: 'dev_master', password },
  })
  expect(loginResponse.status(), 'dev_master 실 로그인 HTTP').toBe(200)
  const loginEnvelope = await loginResponse.json()
  const loginData = loginEnvelope.data ?? {}
  expect(loginData.token, '실 JWT 부재').toBeTruthy()

  const authHeaders = { Authorization: `Bearer ${loginData.token}` }
  const permissionResponse = await page.request.get(
    `${productApiBase}/auth/admin/permissions/my`,
    { headers: authHeaders },
  )
  expect(permissionResponse.status(), '실 permission HTTP').toBe(200)

  await page.addInitScript(
    ({ token, userId, role, fullName }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token, userId, role, fullName, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    {
      token: loginData.token,
      userId: loginData.userId,
      role: loginData.role,
      fullName: loginData.displayName ?? 'dev_master',
    },
  )

  const observedNetwork: Array<{ method: string; url: string; status: number }> = []
  page.on('response', (response) => {
    if (response.url().includes('/auth/admin/permissions/my')
      || response.url().includes('/api/v1/products/admin/sync')) {
      observedNetwork.push({
        method: response.request().method(),
        url: response.url(),
        status: response.status(),
      })
    }
  })

  const initialLastPromise = page.waitForResponse((response) =>
    response.url().includes('/api/v1/products/admin/sync/last')
      && response.request().method() === 'GET')
  await page.goto(`${baseUrl}/#/admin/sheet-sync`)
  const initialLast = await initialLastPromise
  expect(initialLast.status(), '초기 GET /sync/last HTTP').toBe(200)
  const lastEnvelope = await initialLast.json() as SyncEnvelope
  const summary = lastEnvelope.data.summary
  expect(summary, '직전 실동기화 summary 부재').toBeTruthy()
  writeFileSync(path.join(shots, 'last-response.json'), `${JSON.stringify(lastEnvelope, null, 2)}\n`)
  await expect(page.getByRole('heading', { name: '구글 시트 동기화', level: 3 })).toBeVisible()
  await expect(page.getByTestId('admin-sheetsync-trigger-btn')).toHaveText('지금 동기화')
  await page.screenshot({ path: path.join(shots, '01-before-sync.png'), fullPage: true })

  await page.getByTestId('admin-sheetsync-trigger-btn').click()
  await expect(page.getByTestId('admin-sheetsync-trigger-btn')).toHaveText('동기화 중…')
  await page.screenshot({ path: path.join(shots, '02-sync-in-progress.png'), fullPage: true })

  // R10과 같은 임시 proxy는 장시간 POST response 전달이 끝나지 않을 수 있다.
  // GUI POST가 만든 upstream snapshot 시각 전이를 직접 poll한 뒤 화면을 reload해 검증한다.
  let completedEnvelope: SyncEnvelope | undefined
  await expect.poll(async () => {
    const response = await page.request.get(`${productUpstreamBase}/api/v1/products/admin/sync/last`, {
      headers: {
        'x-is-system-master': 'true',
        'x-user-id': '00000000-0000-0000-0000-000000000001',
      },
    })
    expect(response.status(), 'upstream GET /sync/last HTTP').toBe(200)
    completedEnvelope = await response.json() as SyncEnvelope
    return completedEnvelope?.data?.lastSyncAt
  }, { timeout: 180_000, intervals: [1_000, 2_000, 5_000] }).not.toBe(lastEnvelope.data.lastSyncAt)

  const completedSummary = completedEnvelope?.data?.summary
  expect(completedSummary, '실 GUI POST 완료 snapshot summary 부재').toBeTruthy()
  if (!completedSummary) throw new Error('실 GUI POST 완료 snapshot summary 부재')
  writeFileSync(path.join(shots, 'sync-response.json'), `${JSON.stringify(completedEnvelope, null, 2)}\n`)

  const refreshedLastPromise = page.waitForResponse((response) =>
    response.url().includes('/api/v1/products/admin/sync/last')
      && response.request().method() === 'GET')
  await page.reload()
  expect((await refreshedLastPromise).status(), '완료 후 화면 GET /sync/last HTTP').toBe(200)
  await expect(page.getByTestId('admin-sheetsync-trigger-btn')).toHaveText('지금 동기화')

  const lookupExpected: Record<string, number> = {
    'lookup:싱글 자재가격': 28,
    'lookup:추천실외기': 32,
    'lookup:분기계산': 6,
  }
  for (const [tabName, activeRows] of Object.entries(lookupExpected)) {
    const tab = completedSummary.byTab[tabName]
    expect(tab, `${tabName} 응답 부재`).toBeTruthy()
    expect(tab.insertedRows, `${tabName} 신규`).toBe(0)
    expect(tab.updatedRows, `${tabName} 변경`).toBe(0)
    expect(tab.unchangedRows, `${tabName} 동일`).toBe(activeRows)
    expect(tab.softDeletedProductRows, `${tabName} 삭제`).toBe(0)

    const row = page.getByTestId('admin-sheetsync-tab-row').filter({ hasText: tabName })
    await expect(row).toHaveCount(1)
    const cells = row.locator('td')
    await expect(cells.nth(1)).toHaveText('0')
    await expect(cells.nth(2)).toHaveText('0')
    await expect(cells.nth(3)).toHaveText('0')
    if (tabName === 'lookup:추천실외기') {
      await expect(cells.nth(4)).toHaveText(
        '추천실외기 natural key 중복: key=HOME_MULTI|null|7|2.5HP, firstRow=3, duplicateRow=4 / 변경 없음 32 / skip occurrence 1',
      )
    } else {
      await expect(cells.nth(4)).toContainText(`변경 없음 ${activeRows}`)
    }
  }

  const componentRows = page.getByTestId('admin-sheetsync-tab-row').filter({ hasText: '구성품 ·' })
  let linkedOccurrences = 0
  let softDeletedComponentRows = 0
  for (let index = 0; index < (await componentRows.count()); index += 1) {
    const cells = componentRows.nth(index).locator('td')
    linkedOccurrences += Number((await cells.nth(1).innerText()).replaceAll(',', ''))
    softDeletedComponentRows += Number((await cells.nth(3).innerText()).replaceAll(',', ''))
  }
  expect(linkedOccurrences, '화면 구성품 연결 합계').toBe(1_601)
  expect(linkedOccurrences, '화면 구성품 연결 합계와 POST 응답').toBe(completedSummary.totalComponentLinkOccurrences)
  expect(softDeletedComponentRows, '화면 구성품 삭제 합계').toBe(0)
  expect(softDeletedComponentRows, '화면 구성품 삭제 합계와 POST 응답').toBe(completedSummary.totalSoftDeletedComponentRows)

  await page.screenshot({ path: path.join(shots, '03-after-sync-summary.png'), fullPage: true })
  await page.getByTestId('admin-sheetsync-result-table').screenshot({
    path: path.join(shots, '04-result-table.png'),
  })

  expect(completedSummary.byTab['lookup:싱글 자재가격'].unchangedRows).toBe(28)
  expect(completedSummary.byTab['lookup:추천실외기'].unchangedRows).toBe(32)
  expect(completedSummary.byTab['lookup:분기계산'].unchangedRows).toBe(6)
  writeFileSync(path.join(shots, 'network-calls.json'), `${JSON.stringify(observedNetwork, null, 2)}\n`)

  console.log(JSON.stringify({
    measuredAt: new Date().toISOString(),
    lookup: Object.fromEntries(Object.keys(lookupExpected).map((key) => [key, completedSummary.byTab[key]])),
    totalInsertedRows: completedSummary.totalInsertedRows,
    totalUpdatedRows: completedSummary.totalUpdatedRows,
    totalComponentLinkOccurrences: completedSummary.totalComponentLinkOccurrences,
    totalSoftDeletedComponentRows: completedSummary.totalSoftDeletedComponentRows,
    observedNetwork,
  }))
})
