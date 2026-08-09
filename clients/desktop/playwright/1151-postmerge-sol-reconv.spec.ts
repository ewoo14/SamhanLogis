import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import { resolveQaCredential } from '../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from './support/qa-screenshot-dir'

const APP_BASE = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5273'
const API_BASE = process.env['API_BASE'] ?? 'http://127.0.0.1:28082'
const MASTER_TARGET = process.env['QA_MASTER_TARGET'] ?? '38936dfd-2f4e-4c18-ae06-781af441837c'
const MANAGER_TARGET = process.env['QA_MANAGER_TARGET'] ?? 'dd0456d0-50f9-4c76-8bbe-c9672a20356d'
const SHOTS = resolveQaShotsDir(path.resolve(process.cwd(), '../../docs/qa/1151-postmerge-sol-reconv'))
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')

type Login = { token: string; role: string; userId: string; displayName: string }

test.describe.configure({ mode: 'serial' })

async function login(page: Page, loginId: string): Promise<Login> {
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId, password: PASSWORD },
  })
  expect(response.ok(), `${loginId} login HTTP ${response.status()}`).toBeTruthy()
  return (await response.json()).data as Login
}

async function installAuth(page: Page, auth: Login): Promise<void> {
  await page.addInitScript(({ token, role, userId, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, userId, role, fullName: displayName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, auth)
}

function observeApi(page: Page): string[] {
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
  return observed
}

async function advanceToProcessing(page: Page, target: string): Promise<void> {
  for (const action of ['save', 'send', 'accept', 'process']) {
    const next = page.locator('button[title^="다음 단계:"]')
    await expect(next, `${action} 버튼`).toBeEnabled({ timeout: 30_000 })
    const responsePromise = page.waitForResponse((response) =>
      response.url() === `${API_BASE}/slips/${target}/${action}`
        && response.request().method() === 'POST')
    await next.click()
    const response = await responsePromise
    if (response.status() !== 200) console.log(`[RESPONSE BODY] ${await response.text()}`)
    expect(response.status(), `${action} HTTP`).toBe(200)
    await expect(page.locator('button[title^="다음 단계:"]')).toBeEnabled({ timeout: 30_000 })
  }
}

test('MASTER 실 Desktop 입고 완료가 병합본 API를 호출한다', async ({ page }) => {
  const observed = observeApi(page)
  const master = await login(page, 'dev_master')
  await installAuth(page, master)
  await page.goto(`${APP_BASE}/#/purchases/${MASTER_TARGET}`)
  await advanceToProcessing(page, MASTER_TARGET)

  const complete = page.getByRole('button', { name: /완료 \(.+입고 완료.+\)/ })
  await expect(complete).toBeVisible({ timeout: 30_000 })
  await expect(complete).toBeEnabled()
  await page.screenshot({ path: path.join(SHOTS, '01-master-before-inbound-complete.png'), fullPage: true })

  const responsePromise = page.waitForResponse((response) =>
    response.url() === `${API_BASE}/slips/${MASTER_TARGET}/complete`
      && response.request().method() === 'POST')
  await complete.click()
  const response = await responsePromise
  if (response.status() !== 200) console.log(`[RESPONSE BODY] ${await response.text()}`)
  expect(response.status()).toBe(200)
  await expect(page.getByRole('button', { name: '완료 (처리 완료)' })).toBeVisible()
  await page.screenshot({ path: path.join(SHOTS, '02-master-after-inbound-complete.png'), fullPage: true })
  expect(observed.some((line) => line.includes(`${API_BASE}/slips/${MASTER_TARGET}/complete -> 200`))).toBeTruthy()
})

test('MANAGER 입고 완료는 journal 발화 경로를 거쳐 검수 완료까지 간다', async ({ page }) => {
  const observed = observeApi(page)
  const manager = await login(page, 'dev_manager')
  const permissionResponse = await page.request.get(`${API_BASE}/auth/admin/permissions/my`, {
    headers: { Authorization: `Bearer ${manager.token}` },
  })
  expect(permissionResponse.status()).toBe(200)
  const permissions = (await permissionResponse.json()).data as Record<string, string[]>
  expect(permissions['inbound.inspection']).toEqual(['VIEW', 'UPDATE'])

  await installAuth(page, manager)
  await page.goto(`${APP_BASE}/#/purchases/${MANAGER_TARGET}`)
  await advanceToProcessing(page, MANAGER_TARGET)
  const complete = page.getByRole('button', { name: /완료 \(.+입고 완료.+\)/ })
  await expect(complete).toBeEnabled({ timeout: 30_000 })
  await page.screenshot({ path: path.join(SHOTS, '03-manager-before-inbound-complete.png'), fullPage: true })

  const completeResponse = page.waitForResponse((response) =>
    response.url() === `${API_BASE}/slips/${MANAGER_TARGET}/complete`
      && response.request().method() === 'POST')
  await complete.click()
  expect((await completeResponse).status()).toBe(200)

  const inspect = page.getByRole('button', { name: '완료 (처리 완료)' })
  await expect(inspect).toBeEnabled({ timeout: 30_000 })
  const inspectResponse = page.waitForResponse((response) =>
    response.url() === `${API_BASE}/slips/${MANAGER_TARGET}/inspect`
      && response.request().method() === 'POST')
  await inspect.click()
  expect((await inspectResponse).status()).toBe(200)
  await expect(page.getByRole('button', { name: '완료 (확정)' })).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: path.join(SHOTS, '04-manager-after-inspection-complete.png'), fullPage: true })

  expect(observed.some((line) => line.includes(`${API_BASE}/slips/${MANAGER_TARGET}/complete -> 200`))).toBeTruthy()
  expect(observed.some((line) => line.includes(`${API_BASE}/slips/${MANAGER_TARGET}/inspect -> 200`))).toBeTruthy()
})

test('SALES는 동일 입고 검수 완료를 GUI와 API 양쪽에서 차단당한다', async ({ page }) => {
  const sales = await login(page, 'dev_sales')
  const permissionResponse = await page.request.get(`${API_BASE}/auth/admin/permissions/my`, {
    headers: { Authorization: `Bearer ${sales.token}` },
  })
  expect(permissionResponse.status()).toBe(200)
  const permissions = (await permissionResponse.json()).data as Record<string, string[]>
  expect(permissions['inbound.inspection'] ?? []).not.toContain('UPDATE')

  const denied = await page.request.post(`${API_BASE}/slips/${MASTER_TARGET}/inspect`, {
    headers: { Authorization: `Bearer ${sales.token}` },
    data: {},
  })
  expect(denied.status()).toBe(403)

  await installAuth(page, sales)
  await page.goto(`${APP_BASE}/#/purchases/${MASTER_TARGET}`)
  const inspect = page.getByRole('button', { name: '완료 (처리 완료)' })
  await expect(page.getByRole('heading', { name: '대시보드', level: 2 })).toBeVisible({ timeout: 30_000 })
  await expect(page).not.toHaveURL(new RegExp(`/purchases/${MASTER_TARGET}$`))
  await expect(inspect).toHaveCount(0)
  await page.screenshot({ path: path.join(SHOTS, '05-sales-inspection-denied.png'), fullPage: true })
  console.log(`[DENIED] SALES POST ${API_BASE}/slips/${MASTER_TARGET}/inspect -> ${denied.status()}`)
})
