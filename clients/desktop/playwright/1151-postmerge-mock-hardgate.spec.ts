import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import { resolveQaShotsDir } from './support/qa-screenshot-dir'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const ISOLATED_API = process.env['VITE_API_BASE_URL'] ?? 'http://127.0.0.1:1'
const SHOTS = resolveQaShotsDir(path.resolve(process.cwd(), '../../docs/qa/1151-postmerge-sol-reconv'))

async function installAuthMock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({
          token: 'playwright-token',
          userId: '00000000-0000-0000-0000-000000010001',
          role: 'MASTER',
          fullName: '오병승',
          partnerCode: 'P-MOCK-001',
        }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  })
}

test('격리 API에서 입고 상세 mock handler가 실 Axios 탈출 없이 동작한다', async ({ page }) => {
  const isolatedFailures: string[] = []
  page.on('requestfailed', (request) => {
    if (request.url().startsWith(ISOLATED_API)) {
      isolatedFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`)
    }
  })

  await installAuthMock(page)
  await page.goto(`${BASE_URL}/#/purchases/slip-003?mockRole=MASTER`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('입고전표 상세')).toBeVisible({ timeout: 15_000 })

  const checkboxes = page.getByRole('checkbox', { name: /재고조회 선택/ })
  await expect(checkboxes.first()).toBeVisible()
  await checkboxes.first().check()
  const lookup = page.getByTestId('slip-line-inventory-lookup-btn')
  await expect(lookup).toBeEnabled()
  await lookup.click()
  await expect(page.getByTestId('inventory-lookup-modal')).toBeVisible()

  await page.screenshot({ path: path.join(SHOTS, '06-mock-hardgate-isolated-api.png'), fullPage: true })
  console.log(`[MOCK HARDGATE] VITE_API_BASE_URL=${ISOLATED_API} isolatedFailures=${isolatedFailures.length}`)
  for (const failure of isolatedFailures) console.log(`[MOCK ESCAPE] ${failure}`)
  expect(isolatedFailures, `실 Axios 탈출: ${isolatedFailures.join('\n')}`).toEqual([])
})
