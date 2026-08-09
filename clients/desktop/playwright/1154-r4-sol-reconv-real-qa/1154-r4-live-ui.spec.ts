import { expect, test, type Page } from '@playwright/test'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5224'
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const PHASE = process.env['QA_PHASE'] ?? 'baseline'
const QUERY = process.env['QA_QUERY'] ?? '1068689215'
const DIRNAME = path.dirname(fileURLToPath(import.meta.url))
const SHOTS = resolveQaShotsDir(path.resolve(DIRNAME, '../../../../docs/qa/2026-08-09-1154-r4-sol-reconv'))

interface LoginResult {
  token: string
  role: string
  userId: string
  displayName: string
}

async function login(page: Page, password: string): Promise<LoginResult> {
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: {
      loginId: 'dev_sales',
      password,
    },
  })
  expect(response.ok(), `실 auth 로그인 실패: HTTP ${response.status()}`).toBeTruthy()
  const body = (await response.json()).data ?? {}
  return {
    token: body.token ?? '',
    role: body.role ?? '',
    userId: body.userId ?? '',
    displayName: body.displayName ?? 'dev_sales',
  }
}

async function installAuth(page: Page, auth: LoginResult): Promise<void> {
  await page.addInitScript(
    ({ token, role, userId, displayName }: LoginResult) => {
      Object.defineProperty(window, 'samhanAuth', {
        configurable: true,
        value: {
          getToken: async () => ({ token, role, userId, fullName: displayName, partnerCode: null }),
          setToken: async () => undefined,
          clearToken: async () => undefined,
        },
      })
    },
    auth,
  )
}

test(`PR #1154 R4 ${PHASE} 실 거래처 화면`, async ({ page, browserName }) => {
  let password: string
  try {
    password = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
  } catch (error) {
    test.skip(true, error instanceof Error ? error.message : 'QA 자격이 없어 실서버 QA를 건너뜁니다.')
    return
  }
  expect(browserName).toBe('chromium')
  fs.mkdirSync(SHOTS, { recursive: true })
  const network: Array<{ method: string; status: number; url: string }> = []
  page.on('response', (response) => {
    const request = response.request()
    if (response.url().includes('/admin/partners')) {
      network.push({ method: request.method(), status: response.status(), url: response.url() })
    }
  })

  const auth = await login(page, password)
  expect(auth.role).toBe('SALES')
  await installAuth(page, auth)
  await page.goto(`${BASE_URL}/#/admin/partners`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('admin-partners-table')).toBeVisible({ timeout: 30_000 })

  const search = page.getByTestId('admin-partners-search-input')
  await search.fill(QUERY)
  await expect.poll(
    () => network.filter((item) => item.method === 'GET' && item.url.includes('/admin/partners/search') && item.url.includes(encodeURIComponent(QUERY))).length,
    { timeout: 20_000 },
  ).toBeGreaterThan(0)
  await expect(page.getByTestId('admin-partners-table').locator('tbody tr').first()).toBeVisible({ timeout: 20_000 })

  const matching = network.filter((item) => item.url.includes('/admin/partners/search'))
  expect(matching.at(-1)?.status).toBe(200)
  expect(matching.at(-1)?.url.startsWith('http://localhost:8080/')).toBeTruthy()
  fs.writeFileSync(path.join(SHOTS, `${PHASE}-network.json`), `${JSON.stringify(network, null, 2)}\n`, 'utf8')
  await page.screenshot({ path: path.join(SHOTS, `${PHASE}.png`), fullPage: false })
})
