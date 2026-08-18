import { expect, test, type Page, type Route } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const GATEWAY = process.env['QA_GATEWAY_BASE'] ?? 'http://127.0.0.1:8080'
const PRODUCT = process.env['QA_PRODUCT_BASE'] ?? 'http://127.0.0.1:18184'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(HERE, '../../../../docs/qa/1267-sol-reverdict-2'))
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const DUPLICATE_NAME = '냉난방 무풍 벽걸이 실내기'
const EXPECTED_CODES = [
  'AR07C9180HZN', 'AR07C9181HZN', 'AR07D9181HZN', 'AR09C9180HZN',
  'AR11C9180HZN', 'AR13C9180HZN', 'AR16C9180HZN', 'AR60F07C11WNKO',
  'AR60F07C12WNKO', 'AR60F07C14WNKO', 'AR60F09C13WNKO', 'AR60F11C13WNKO',
  'AR60F13C13WNKO', 'AR60F16C14WNKO',
]

async function assertNoDisplayedUuid(page: Page): Promise<void> {
  const exposed = await page.locator('body').evaluate((body) => {
    const attributes = ['title', 'placeholder', 'aria-label']
    const values = [body.innerText]
    for (const element of body.querySelectorAll('*')) {
      for (const attribute of attributes) {
        const value = element.getAttribute(attribute)
        if (value) values.push(value)
      }
    }
    return values.join('\n')
  })
  expect(exposed).not.toMatch(UUID_RE)
}

test('PR #1267 최대 14행 기존 동명 그룹을 기초표와 검색 모달에서 코드로 구분한다', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1600 })
  const login = await page.request.post(`${GATEWAY}/auth/login`, {
    data: { loginId: 'dev_master', password: PASSWORD },
  })
  expect(login.ok(), `직원 로그인 HTTP ${login.status()}`).toBeTruthy()
  const userId = ((await login.json()).data.userId ?? '') as string
  expect(userId).not.toBe('')

  await page.route(`${GATEWAY}/api/v1/products**`, async (route: Route) => {
    if (route.request().url().endsWith('/catalog-realtime')) {
      await route.abort()
      return
    }
    const upstream = await page.request.fetch(route.request().url().replace(GATEWAY, PRODUCT), {
      method: route.request().method(),
      headers: {
        'X-User-Id': userId,
        'X-Is-System-Master': 'true',
        'X-Samhan-Gateway-Attestation': process.env['QA_GATEWAY_ATTESTATION'] ?? '',
      },
      data: route.request().postDataBuffer() ?? undefined,
    })
    await route.fulfill({
      status: upstream.status(),
      headers: { 'content-type': upstream.headers()['content-type'] ?? 'application/json; charset=utf-8' },
      body: await upstream.body(),
    })
  })

  await page.goto('/#/products/catalog', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('product-catalog-table')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('product-catalog-search-input').fill(DUPLICATE_NAME)
  await page.getByTestId('product-catalog-query-button').click()
  const catalogRows = page.locator('[data-testid="product-catalog-table"] tbody tr')
  await expect(catalogRows).toHaveCount(14, { timeout: 20_000 })
  const catalogText = (await catalogRows.allTextContents()).join('\n')
  const catalogRowCount = await catalogRows.count()
  for (const code of EXPECTED_CODES) expect(catalogText).toContain(code)
  await assertNoDisplayedUuid(page)
  await page.screenshot({ path: path.join(SHOTS, '01-existing-duplicate-catalog-14-rows.png'), fullPage: true })

  await page.goto('/#/products/estimate-items', { waitUntil: 'domcontentloaded' })
  const combo = page.getByRole('combobox').first()
  await expect(combo).toBeVisible({ timeout: 20_000 })
  await combo.fill(DUPLICATE_NAME)
  const modal = page.getByRole('dialog')
  const options = modal.locator('input[type="checkbox"]')
  await expect(options).toHaveCount(14, { timeout: 20_000 })
  const modalText = (await modal.textContent()) ?? ''
  for (const code of EXPECTED_CODES) expect(modalText).toContain(code)
  await assertNoDisplayedUuid(page)
  await page.screenshot({ path: path.join(SHOTS, '02-existing-duplicate-search-modal-14-rows-with-code-column.png'), fullPage: true })
  await modal.evaluate((dialog) => {
    const scrollable = Array.from(dialog.querySelectorAll<HTMLElement>('*'))
      .find(element => element.scrollHeight > element.clientHeight + 10)
    if (!scrollable) throw new Error('검색 결과 스크롤 컨테이너를 찾지 못함')
    scrollable.scrollTop = scrollable.scrollHeight
  })
  await expect(modal.getByText('AR60F16C14WNKO', { exact: false })).toBeVisible()
  await page.screenshot({ path: path.join(SHOTS, '03-existing-duplicate-search-modal-bottom-codes.png'), fullPage: true })

  console.log(`[1267-r2] 기초품목=${catalogRowCount}행, 검색 모달=${await options.count()}행, UUID 표시=0`)
  await page.unrouteAll({ behavior: 'ignoreErrors' })
})
