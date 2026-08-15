import { expect, test } from '@playwright/test'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(
  path.resolve(HERE, '../../../../docs/qa/2026-08-15-1220-adversarial'),
)

test('dev에서 두 판매 버튼은 각각 localhost fallback을 연다', async ({ page }) => {
  await page.addInitScript(() => {
    const auth = {
      token: 'qa-local-only',
      userId: '00000000-0000-0000-0000-000000010001',
      role: 'MASTER',
      fullName: '적대검증자',
      partnerCode: null,
    }
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => auth,
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
    Object.defineProperty(window, '__qaOpenedUrls', { configurable: true, value: [] })
    window.open = ((url?: string | URL) => {
      ;(window as typeof window & { __qaOpenedUrls: string[] }).__qaOpenedUrls.push(String(url))
      return null
    }) as typeof window.open
  })

  await page.goto('/#/sales/estimates?mockRole=MASTER', { waitUntil: 'domcontentloaded' })
  const nav = page.getByTestId('sales-subnav-external')
  await expect(nav).toBeVisible()
  await page.screenshot({ path: path.join(SHOTS, '02-dev-localhost-entry.png'), fullPage: true })
  await nav.getByRole('button', { name: /웹 종합견적서/ }).click()
  await nav.getByRole('button', { name: /웹 주문서/ }).click()
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { __qaOpenedUrls: string[] }).__qaOpenedUrls,
  )).toEqual(['http://localhost:5183', 'http://localhost:5180'])
})
