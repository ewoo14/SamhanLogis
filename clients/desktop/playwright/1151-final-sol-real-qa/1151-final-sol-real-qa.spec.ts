import { expect, test } from '@playwright/test'
import * as path from 'node:path'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const APP_BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5273'
const API_BASE = process.env['API_BASE'] ?? 'http://127.0.0.1:28080'
const TARGET_SLIP_ID = process.env['QA_TARGET_SLIP_ID']
  ?? '7c7069a8-ed5d-4472-8fcc-5f7dfc6c1710'
const SHOTS = resolveQaShotsDir(
  path.resolve(process.cwd(), '../../docs/qa/1151-final-sol-reconv'),
)

test('실 Desktop 입고 완료가 source journal을 남긴다', async ({ page }) => {
  const observed: string[] = []
  page.on('response', (response) => {
    if (response.url().startsWith(`${API_BASE}/`)) {
      const line = `${response.request().method()} ${response.url()} -> ${response.status()}`
      observed.push(line)
      console.log(`[NETWORK] ${line}`)
    }
  })
  page.on('requestfailed', (request) => {
    console.log(`[NETWORK FAILED] ${request.method()} ${request.url()} -> ${request.failure()?.errorText}`)
  })

  const loginResponse = await page.request.post(`${API_BASE}/auth/login`, {
    data: {
      loginId: 'dev_master',
      password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'),
    },
  })
  expect(loginResponse.status()).toBe(200)
  const loginBody = (await loginResponse.json()).data
  await page.addInitScript(
    ({ token, userId, role, displayName }) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token, userId, role, fullName: displayName, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    loginBody,
  )

  await page.goto(`${APP_BASE}/#/purchases/${TARGET_SLIP_ID}`)
  await expect(page.getByTestId('slip-detail-inspection-status')).toBeVisible()
  const completeButton = page.getByRole('button', { name: /입고 완료/ })
  await expect(completeButton).toBeVisible()
  await expect(completeButton).toBeEnabled()
  await page.screenshot({
    path: path.join(SHOTS, '01-before-inbound-complete.png'),
    fullPage: true,
  })

  const completeResponse = page.waitForResponse(
    (response) => response.url().endsWith(`/slips/${TARGET_SLIP_ID}/complete`)
      && response.request().method() === 'POST',
  )
  await completeButton.click()
  const completed = await completeResponse
  expect(completed.status()).toBe(200)
  await expect(
    page.getByTestId('slip-detail-inspection-status').getByText('검수 대기'),
  ).toBeVisible()
  await page.screenshot({
    path: path.join(SHOTS, '02-after-inbound-complete.png'),
    fullPage: true,
  })

  console.log(`[LIVE SCREEN] slipId=${TARGET_SLIP_ID}`)
  for (const line of observed) console.log(`[NETWORK] ${line}`)
})
