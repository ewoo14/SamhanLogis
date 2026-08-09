import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import { expect, test, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const baseUrl = process.env['REAL_QA_RENDERER_BASE_URL'] ?? 'http://127.0.0.1:51145'
const apiBase = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const shots = resolveQaShotsDir(path.resolve(dirname, '../../../../docs/qa/1145-r12-real-qa'))
fs.mkdirSync(shots, { recursive: true })

const roles = [
  { role: 'MASTER', loginId: 'dev_master', expectedVisible: true },
  { role: 'MANAGER', loginId: 'dev_manager', expectedVisible: true },
  { role: 'ACCOUNTANT', loginId: 'dev_accountant', expectedVisible: true },
  { role: 'SALES', loginId: 'dev_sales', expectedVisible: true },
  { role: 'PARTNER', loginId: 'dev_partner', expectedVisible: false },
] as const

type Login = { token: string; role: string; userId: string; displayName: string }

async function login(page: Page, loginId: string): Promise<{ response: number; data?: Login }> {
  const response = await page.request.post(`${apiBase}/auth/login`, {
    data: { loginId, password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD') },
  })
  if (!response.ok()) return { response: response.status() }
  const data = (await response.json()).data ?? {}
  return {
    response: response.status(),
    data: {
      token: data.token ?? '',
      role: data.role ?? '',
      userId: data.userId ?? '',
      displayName: data.displayName ?? loginId,
    },
  }
}

async function installAuth(page: Page, session: Login): Promise<void> {
  await page.addInitScript(({ token, role, userId, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, userId, role, fullName: displayName, partnerCode: null }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, session)
}

async function observePage(page: Page, role: string, route: string, shotName: string): Promise<void> {
  const responses: string[] = []
  page.on('response', (response) => {
    if (response.url().includes('/admin/sales-slips') || response.url().includes('/admin/purchase-slips')) {
      responses.push(`${response.request().method()} ${response.status()} ${response.url()}`)
    }
  })
  await page.goto(`${baseUrl}/#${route}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const salesMenu = await page.getByTestId('sidebar-accounting-sales-slips').count()
  const purchaseMenu = await page.getByTestId('sidebar-accounting-purchase-slips').count()
  const buttons = await page.getByRole('button').allTextContents()
  await page.screenshot({ path: path.join(shots, `${shotName}.png`), fullPage: true })
  console.log(JSON.stringify({ role, route, url: page.url(), salesMenu, purchaseMenu, buttons, responses }))
  fs.writeFileSync(path.join(shots, `${shotName}.txt`), await page.locator('body').innerText(), 'utf8')
}

test('PR #1145 R12 — 역할별 회계전표 메뉴·화면·응답 실측(실 API, mock OFF)', async ({ page }) => {
  const observations: Array<Record<string, unknown>> = []
  for (const candidate of roles) {
    const session = await login(page, candidate.loginId)
    if (!session.data) {
      observations.push({ ...candidate, loginStatus: session.response, accountAvailable: false })
      console.log(JSON.stringify(observations.at(-1)))
      continue
    }
    expect(session.data.role, `${candidate.loginId} role`).toBe(candidate.role)
    observations.push({ ...candidate, loginStatus: session.response, accountAvailable: true })
    await installAuth(page, session.data)
    await observePage(page, candidate.role, '/accounting/sales-slips', `${candidate.role.toLowerCase()}-sales-slips`)
    await observePage(page, candidate.role, '/accounting/purchase-slips', `${candidate.role.toLowerCase()}-purchase-slips`)
  }
  fs.writeFileSync(path.join(shots, 'role-observations.json'), JSON.stringify(observations, null, 2), 'utf8')
  expect(observations).toHaveLength(roles.length)
})
