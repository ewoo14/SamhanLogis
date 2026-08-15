import { expect, test } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const _dirname = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url))
const BASE_URL = process.env['AUDIT_BASE_URL']
const API_BASE = process.env['API_BASE']
if (!BASE_URL || !API_BASE) throw new Error('AUDIT_BASE_URL and API_BASE are required for live QA')

const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/1218-arologis-menu-live'))
fs.mkdirSync(SHOTS, { recursive: true })

const dispatchRoutes = [
  '/dispatches/manual',
  '/dispatches/pre-classify',
  '/dispatches/unassigned',
  '/dispatches/reconcile',
] as const

test('실 QA 계정 로그인 후 배차 하위 4종이 사이드바에 노출된다', async ({ page }) => {
  const loginResponse = await page.request.post(`${API_BASE}/auth/admin/login`, {
    data: { loginId: 'admin', password: resolveQaCredential('QA_AROLOGIS_ADMIN_PASSWORD') },
  })
  expect(loginResponse.ok(), `실제 admin 로그인 실패: HTTP ${loginResponse.status()}`).toBeTruthy()

  const loginBody = await loginResponse.json() as {
    accessToken: string
    refreshToken?: string
    role?: string
    loginId?: string
    fullName?: string
    expiresAt?: string
  }
  const userId = JSON.parse(Buffer.from(loginBody.accessToken.split('.')[1] ?? '', 'base64url').toString('utf8')).sub
  const snapshot = {
    accessToken: loginBody.accessToken,
    refreshToken: loginBody.refreshToken ?? '',
    userId,
    role: loginBody.role ?? 'AROLOGIS_MASTER',
    loginId: loginBody.loginId ?? 'admin',
    fullName: loginBody.fullName ?? '아로로지스 관리자',
    expiresAt: loginBody.expiresAt ?? '',
  }
  const permissionProbe = await page.request.get(`${API_BASE}/admin/arologis/permissions/my`, {
    headers: { Authorization: `Bearer ${snapshot.accessToken}` },
  })
  console.log('[QA] direct permissions probe:', permissionProbe.status(), await permissionProbe.text())

  await page.addInitScript((authSnapshot) => {
    let current = authSnapshot
    Object.defineProperty(window, 'arologisAuth', {
      configurable: true,
      value: {
        getToken: async () => current,
        setToken: async (next: typeof authSnapshot) => { current = next },
        clearToken: async () => { current = null },
      },
    })
  }, snapshot)

  let catalogStatus: number | undefined
  let catalogBody: unknown
  const authResponses: string[] = []
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))
  page.on('response', async (response) => {
    if (response.url().includes('/auth/') || response.url().includes('/admin/arologis/')) {
      authResponses.push(`${response.status()} ${response.url()}`)
    }
    if (response.url().includes('/admin/arologis/permissions/my')) {
      console.log('[QA] browser permissions response:', response.status(), await response.text())
    }
    if (!response.url().includes('/auth/admin/menu-catalog')) return
    catalogStatus = response.status()
    try { catalogBody = await response.json() } catch { catalogBody = '[응답 JSON 관측 불가]' }
  })

  await page.goto(`${BASE_URL}/#/dispatches`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(5000)
  console.log('[QA] auth responses:', authResponses)
  console.log('[QA] page errors:', pageErrors)
  console.log('[QA] bridge token present:', Boolean(await page.evaluate(async () => (await window.arologisAuth.getToken())?.accessToken)))
  await expect(page).toHaveURL(/#\/dispatches(?:$|\/)/, { timeout: 10_000 })

  expect(catalogStatus, 'catalog HTTP status가 관측되어야 한다').toBe(200)
  console.log('[QA] catalog response:', JSON.stringify(catalogBody))

  for (const route of dispatchRoutes) {
    await expect(page.locator(`a[href="#${route}"]`), `${route} sidebar link`).toBeVisible()
  }

  const navigation = '사용자는 admin 로그인 후 /dispatches로 이동하고, 사이드바의 배차 하위 메뉴에서 각 화면으로 이동한다.'
  fs.writeFileSync(path.join(SHOTS, 'sidebar-4-dispatch-menus.txt'), `${navigation}\nCatalog HTTP: ${catalogStatus}\nCatalog response: ${JSON.stringify(catalogBody)}\n`, 'utf8')
  await page.screenshot({ path: path.join(SHOTS, 'sidebar-4-dispatch-menus.png'), fullPage: true })
  console.log(`[QA] screenshot: ${path.join(SHOTS, 'sidebar-4-dispatch-menus.png')}`)
  console.log(`[QA] how user gets here: ${navigation}`)
})
