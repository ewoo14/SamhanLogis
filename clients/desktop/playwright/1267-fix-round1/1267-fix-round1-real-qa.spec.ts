import { expect, test, type Page, type Route } from '@playwright/test'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const GATEWAY = process.env['QA_GATEWAY_BASE'] ?? 'http://127.0.0.1:8080'
const PRODUCT = process.env['QA_PRODUCT_BASE'] ?? 'http://127.0.0.1:18184'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1267-fix-round1'))
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

test('PR #1267 동명 품목은 기존 행·코드로 기초표와 검색 모달에서 구분된다', async ({ page }) => {
  fs.mkdirSync(SHOTS, { recursive: true })
  const login = await page.request.post(`${GATEWAY}/auth/login`, {
    data: { loginId: 'dev_master', password: PASSWORD },
  })
  expect(login.ok(), `직원 로그인 HTTP ${login.status()}`).toBeTruthy()
  const loginData = (await login.json()).data
  const userId = loginData.userId as string

  // 캡처 대상은 목록/검색의 실 HTTP 응답이다. 페이지가 여는 장기 SSE는 테스트 종료 시
  // route callback을 매달아 두지 않도록 끊는다.
  await page.route(`${GATEWAY}/api/v1/products/catalog-realtime`, route => route.abort())
  await page.route(`${GATEWAY}/api/v1/products**`, async (route: Route) => {
    const request = route.request()
    const target = request.url().replace(GATEWAY, PRODUCT)
    const upstream = await page.request.get(target, {
      headers: {
        'X-User-Id': userId,
        'X-Is-System-Master': 'true',
        'X-Samhan-Gateway-Attestation': process.env['QA_GATEWAY_ATTESTATION'] ?? '',
      },
    })
    await route.fulfill({
      status: upstream.status(),
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: await upstream.body(),
    })
  })

  await page.goto('/#/products/catalog', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('product-catalog-table')).toBeVisible({ timeout: 20_000 })
  const search = page.getByTestId('product-catalog-search-input')
  await search.fill('Y형 분기관')
  await page.getByTestId('product-catalog-query-button').click()
  const rows = page.locator('[data-testid="product-catalog-table"] tbody tr')
  await expect(rows).toHaveCount(5, { timeout: 20_000 })
  const rowText = await rows.allTextContents()
  expect(rowText.join('\n')).toContain('AXJ-YA2812M')
  expect(rowText.join('\n')).toContain('AXJ-YA4422M')
  expect(rowText.join('\n')).not.toMatch(UUID_RE)
  await page.screenshot({ path: path.join(SHOTS, '01-existing-duplicate-catalog-5-rows.png'), fullPage: true })

  await page.goto('/#/products/estimate-items', { waitUntil: 'domcontentloaded' })
  const combo = page.getByRole('combobox').first()
  await expect(combo).toBeVisible({ timeout: 20_000 })
  await combo.fill('Y형 분기관')
  const modal = page.getByRole('dialog')
  const options = modal.locator('input[type="checkbox"]')
  await expect(options).toHaveCount(5, { timeout: 20_000 })
  const optionText = [(await modal.textContent()) ?? '']
  for (const code of ['AXJ-YA2812M', 'AXJ-YA2815M', 'AXJ-YA3419M', 'AXJ-YA4119M', 'AXJ-YA4422M']) {
    expect(optionText.join('\n')).toContain(code)
  }
  expect(optionText.join('\n')).not.toMatch(UUID_RE)
  await page.screenshot({ path: path.join(SHOTS, '02-existing-duplicate-search-modal-5-rows-with-codes.png'), fullPage: true })
  console.log(`[1267] 기초품목 행 수=${rowText.length}, 검색 모달 행 수=${await options.count()}`)
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})
