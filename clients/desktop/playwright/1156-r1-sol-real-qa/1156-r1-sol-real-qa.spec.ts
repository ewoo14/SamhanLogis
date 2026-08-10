import { expect, test, type APIRequestContext, type BrowserContext, type Page, type Route } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE_URL = process.env['REAL_QA_RENDERER_BASE_URL'] ?? 'http://127.0.0.1:5316'
const AUTH_API = 'http://127.0.0.1:8081'
const HEAD_SLIP_API = 'http://127.0.0.1:18106'
const appUrl = (route: string) => process.env['REAL_QA_WEB_ROUTER'] === '1'
  ? `${BASE_URL}${route}`
  : `${BASE_URL}/#${route}`
const dirname = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/2026-08-09-1155-r1-sol'))

type Login = {
  token: string
  role: string
  userId: string
  displayName: string
  groups?: Array<{ id: string }>
}

async function login(request: APIRequestContext, password: string): Promise<Login> {
  const response = await request.post(`${AUTH_API}/auth/login`, {
    data: { loginId: 'dev_master', password },
  })
  expect(response.status(), 'dev_master login').toBe(200)
  return (await response.json()).data as Login
}

function userHeaders(session: Login): Record<string, string> {
  return {
    'x-user-id': session.userId,
    'x-user-name': 'SOL 1156 R1 GUI',
    'x-user-role': session.role,
    'x-user-groups': (session.groups ?? []).map((group) => group.id).join(','),
    'x-is-system-master': 'true',
  }
}

async function proxyApi(route: Route, session: Login): Promise<void> {
  const request = route.request()
  const source = new URL(request.url())
  const isCreateSlip = source.pathname === '/slips' && request.method() === 'POST'
  const target = isCreateSlip
    ? `${HEAD_SLIP_API}${source.pathname}${source.search}`
    : source.href
  const response = await route.fetch({
    url: target,
    headers: { ...request.headers(), ...userHeaders(session) },
  })
  const body = await response.body()
  await route.fulfill({ response, body })
}

async function appPage(context: BrowserContext, session: Login): Promise<Page> {
  const page = await context.newPage()
  await page.addInitScript(({ token, role, userId, displayName, groups }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, userId, role, fullName: displayName, partnerCode: null, groups }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, session)
  await page.route('http://localhost:8080/**', (route) => proxyApi(route, session))
  await page.route('http://127.0.0.1:8080/**', (route) => proxyApi(route, session))
  return page
}

test('실 GUI INBOUND 생성은 partner_id와 partner_code를 함께 저장한다', async ({ browser, request }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch {
    test.skip(true, 'QA_DEV_DEFAULT_PASSWORD를 해소할 수 없어 라이브 QA를 건너뜁니다.')
    throw new Error('unreachable after test.skip')
  }

  fs.mkdirSync(SHOTS, { recursive: true })
  const session = await login(request, password)
  expect(session.role).toBe('MASTER')
  const context = await browser.newContext()
  const page = await appPage(context, session)
  page.on('response', (response) => {
    if (response.url().includes('/permissions/my') || response.status() >= 400) {
      console.log(`[live-response] ${response.status()} ${response.request().method()} ${response.url()}`)
    }
  })

  await page.goto(appUrl('/purchases/new'), { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '새 입고전표' }).first()).toBeVisible({ timeout: 30_000 })

  const warehouse = page.getByRole('combobox', { name: '입고 창고' })
  await warehouse.fill('HQ-001')
  await page.waitForTimeout(200)
  await warehouse.press('ArrowDown')
  await warehouse.press('Enter')

  const partner = page.getByRole('combobox', { name: '거래처', exact: true })
  await partner.fill('파인씨엔디')
  const partnerOption = page.getByRole('listbox', { name: '거래처 목록' })
    .getByRole('option')
    .filter({ hasText: '파인씨엔디' })
  await expect(partnerOption).toBeVisible({ timeout: 15_000 })
  await partnerOption.click()
  await expect(partner).toHaveValue('파인씨엔디', { timeout: 15_000 })

  const product = page.getByRole('combobox', { name: '라인 1 품목' })
  await product.fill('AJ060MXHNBC1')
  await page.waitForTimeout(1_000)
  await expect(product).toHaveValue('AJ060MXHNBC1', { timeout: 15_000 })

  await page.getByLabel('메모').fill('SOL #1156 R1 실 GUI 신규 INBOUND')
  const save = page.getByRole('button', { name: '저장', exact: true })
  await expect(save).toBeEnabled({ timeout: 30_000 })
  await page.screenshot({ path: path.join(SHOTS, '01-inbound-before-save.png'), fullPage: true })

  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/slips' && response.request().method() === 'POST'
  })
  await save.click()
  const response = await responsePromise
  expect(response.status()).toBe(201)
  const responseBody = await response.json()
  expect(responseBody.data.slipType).toBe('INBOUND')
  expect(responseBody.data.partnerId).toBeTruthy()
  expect(responseBody.data.partnerCode).toBe('00')

  await expect(page).toHaveURL(appUrl('/purchases'), { timeout: 30_000 })
  await page.screenshot({ path: path.join(SHOTS, '02-inbound-after-save.png'), fullPage: true })
  fs.writeFileSync(path.join(SHOTS, 'gui-create-evidence.json'), JSON.stringify({
    status: response.status(),
    slipNo: responseBody.data.slipNo,
    slipType: responseBody.data.slipType,
    partnerId: '<redacted-uuid>',
    partnerCode: responseBody.data.partnerCode,
    finalUrl: page.url(),
  }, null, 2), 'utf8')

  await page.unrouteAll({ behavior: 'ignoreErrors' })
  await context.close()
})
