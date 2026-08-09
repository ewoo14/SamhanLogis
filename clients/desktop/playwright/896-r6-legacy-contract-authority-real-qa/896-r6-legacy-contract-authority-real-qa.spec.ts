import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const BASE = process.env['QA_ESTIMATE_BASE'] ?? 'http://127.0.0.1:5317'
const API_BASE = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const SHOTS = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/2026-08-09-896-r6'))
const SOURCE = 'AM052BN6PBH1'
const REMOTE = 'AWR-WE13N'
const OPTIONS = ['기본', '유선', '컬러', '제외'] as const

function qty(page: Page, model: string) {
  return page.locator(`input.qty-input[data-m="${model}"]:not(.fix-dc-inp)`)
}

async function openHome(page: Page) {
  await page.goto(`${BASE}/?email=dev_master%40samhan-air.com`, { waitUntil: 'domcontentloaded' })
  await page.locator('#btnGoHome').click()
  await expect(qty(page, SOURCE)).toBeVisible({ timeout: 30_000 })
}

async function measure(page: Page, option: string, serverFailure = false) {
  await openHome(page)
  await page.locator('#home_remote').selectOption(option)
  if (serverFailure) {
    await page.evaluate(() => {
      ;(window as any).SamhanQuantitySync.evaluateQuantitySyncRules = () => null
    })
  }
  await qty(page, SOURCE).fill('2')
  await qty(page, SOURCE).blur()
  await page.waitForTimeout(500)
  const mode = serverFailure ? 'failure' : 'after'
  await page.locator('#homeOpts').screenshot({ path: path.join(SHOTS, `r6-${mode}-${option}.png`) })
  await page.locator(`tr[data-m="${REMOTE}"]`).screenshot({ path: path.join(SHOTS, `r6-${mode}-${option}-row.png`) })
  return {
    qty: (await qty(page, REMOTE).inputValue()) || '0',
    amount: await page.locator(`td.sub[data-sub="${REMOTE}"]`).innerText(),
  }
}

test.describe.serial('#896 R6 — 레거시 홈 리모컨 계약 8칸', () => {
  const successExpected = { 기본: ['0', '0'], 유선: ['2', '90,750'], 컬러: ['0', '0'], 제외: ['0', '0'] }
  const failureExpected = successExpected

  for (const option of OPTIONS) {
    test(`서버 규칙 성공 ${option}`, async ({ page }) => {
      const measured = await measure(page, option)
      console.log(`[R6 after option=${option}] ${SOURCE}=2 ${REMOTE}=${measured.qty} amount=${measured.amount}`)
      expect([measured.qty, measured.amount]).toEqual(successExpected[option])
    })
  }

  for (const option of OPTIONS) {
    test(`서버 규칙 실패 ${option}`, async ({ page }) => {
      const measured = await measure(page, option, true)
      console.log(`[R6 failure option=${option}] ${SOURCE}=2 ${REMOTE}=${measured.qty} amount=${measured.amount}`)
      expect([measured.qty, measured.amount]).toEqual(failureExpected[option])
    })
  }

  test('서버 규칙 원문과 비리모컨 target 소비를 확인한다', async ({ page }) => {
    await openHome(page)
    const bootstrapLine = await page.evaluate(() => {
      const script = Array.from(document.scripts).map(item => item.textContent || '').find(text => text.includes('HOME_QUANTITY_SYNC_RULES')) || ''
      return script.split('\n').find(line => line.includes('const HOME_QUANTITY_SYNC_RULES')) || ''
    })
    const json = bootstrapLine.slice(bootstrapLine.indexOf('J(') + 2, bootstrapLine.lastIndexOf(', []);'))
    const rules = JSON.parse(json)
    const targets = Array.isArray(rules) ? rules.flatMap((rule: any) => rule.targets ?? []) : []
    const targetCodes = targets.map((target: any) => String(target.productCode || '')).filter(Boolean)
    const nonRemoteCodes: string[] = []
    for (const code of targetCodes) {
      const rowText = await page.locator(`tr[data-m="${code}"]`).innerText().catch(() => '')
      if (rowText && !/리모컨|remote/i.test(rowText)) nonRemoteCodes.push(code)
    }
    await qty(page, SOURCE).fill('2')
    await qty(page, SOURCE).blur()
    await page.waitForTimeout(500)
    const nonRemoteQuantities = await Promise.all(nonRemoteCodes.map(async code => [code, await qty(page, code).inputValue()] as const))
    console.log(`[R6 server-rule] bootstrap payload=${JSON.stringify({ ruleCount: rules?.length ?? 0, targetCount: targets.length, nonRemoteQuantities })}`)
    expect(Array.isArray(rules)).toBe(true)
    expect(rules.length).toBeGreaterThan(0)
    expect(targets.length).toBeGreaterThanOrEqual(3)
    expect(nonRemoteCodes.length).toBeGreaterThan(0)
    expect(nonRemoteQuantities.some(([, quantity]) => Number(quantity) > 0)).toBe(true)
  })

  test('R6 리모컨 target 추가 후 옵션 계약을 확인하고 원상복구한다', async ({ page }) => {
    let password: string
    try {
      password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
    } catch (error) {
      test.skip(true, error instanceof Error ? error.message : 'QA 자격을 읽지 못했습니다.')
      return
    }
    const loginResponse = await page.request.post(`${API_BASE}/auth/login`, {
      data: { loginId: 'dev_master', password },
    })
    expect(loginResponse.ok(), `관리자 로그인 실패: HTTP ${loginResponse.status()}`).toBeTruthy()
    const loginData = (await loginResponse.json()).data ?? {}
    const token = String(loginData.token ?? '')
    expect(token).not.toBe('')
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    const list = await page.request.get(`${API_BASE}/api/v1/quantity-sync-rules?estimateCategory=HOME_MULTI`, { headers })
    expect(list.ok(), `R6 규칙 사전조회 실패: HTTP ${list.status()}`).toBeTruthy()
    const existingRules = await list.json()
    expect(existingRules.length).toBeGreaterThan(0)
    const original = existingRules[0]
    const originalTargets = original.targets
    const extraTarget = 'AR-CH01'
    const expandedTargets = originalTargets.some((target: any) => target.productCode === extraTarget)
      ? originalTargets
      : [...originalTargets, { productCode: extraTarget, multiplier: 1, roundingMode: 'NONE', displayOrder: originalTargets.length + 1 }]
    const request = {
      ruleKey: original.ruleKey,
      estimateCategory: original.estimateCategory,
      name: `${original.name} R6`,
      enabled: original.enabled,
      aggregation: original.aggregation,
      when: original.when ?? {},
      inactiveBehavior: original.inactiveBehavior,
      conflictPolicy: original.conflictPolicy,
      priority: original.priority,
      legacyRef: `${original.legacyRef}:R6`.slice(0, 255),
      sources: original.sources.map((source: any) => ({ productCode: source.productCode, factor: Number(source.factor ?? 1) })),
      targets: expandedTargets.map((target: any, index: number) => ({
        productCode: target.productCode,
        multiplier: Number(target.multiplier ?? 1),
        roundingMode: target.roundingMode ?? 'NONE',
        displayOrder: index + 1,
      })),
    }
    try {
      const put = await page.request.put(`${API_BASE}/api/v1/quantity-sync-rules/${encodeURIComponent(original.ruleKey)}`, { headers, data: request })
      expect(put.ok(), `R6 리모컨 target 추가 실패: HTTP ${put.status()} ${await put.text()}`).toBeTruthy()
      const afterAdd = await (await page.request.get(`${API_BASE}/api/v1/quantity-sync-rules?estimateCategory=HOME_MULTI`, { headers })).json()
      const addedRule = afterAdd.find((rule: any) => rule.ruleKey === original.ruleKey)
      expect(addedRule.targets.map((target: any) => target.productCode)).toContain(extraTarget)
      console.log(`[R6 admin API] rule=${original.ruleKey} addedTarget=${extraTarget} targetCount=${addedRule.targets.length}`)
    } finally {
      const restore = await page.request.put(`${API_BASE}/api/v1/quantity-sync-rules/${encodeURIComponent(original.ruleKey)}`, {
        headers,
        data: {
          ...request,
          name: original.name,
          legacyRef: original.legacyRef,
          targets: originalTargets.map((target: any, index: number) => ({
            productCode: target.productCode,
            multiplier: Number(target.multiplier ?? 1),
            roundingMode: target.roundingMode ?? 'NONE',
            displayOrder: index + 1,
          })),
        },
      })
      expect(restore.ok(), `R6 규칙 원상복구 실패: HTTP ${restore.status()}`).toBeTruthy()
      const restored = await (await page.request.get(`${API_BASE}/api/v1/quantity-sync-rules?estimateCategory=HOME_MULTI`, { headers })).json()
      const restoredRule = restored.find((rule: any) => rule.ruleKey === original.ruleKey)
      expect(restoredRule.targets).toEqual(originalTargets)
      console.log(`[R6 admin API] rule=${original.ruleKey} restored=true targetCount=${restoredRule.targets.length}`)
    }
  })
})
