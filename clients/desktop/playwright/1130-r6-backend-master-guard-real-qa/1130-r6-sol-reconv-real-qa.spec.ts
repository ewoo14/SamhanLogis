import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const _dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const API_BASE = process.env['API_BASE'] ?? 'http://127.0.0.1:8080'
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/1130-r6-sol-reconv'))

type Login = { token: string; role: string; userId: string; displayName: string }

async function login(page: Page, loginId: string): Promise<Login> {
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: { loginId, password: PASSWORD },
  })
  expect(response.ok(), `${loginId} login HTTP ${response.status()}`).toBeTruthy()
  const data = (await response.json()).data ?? {}
  return {
    token: data.token ?? '',
    role: data.role ?? '',
    userId: data.userId ?? '',
    displayName: data.displayName ?? loginId,
  }
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

function authHeaders(auth: Login): Record<string, string> {
  return { Authorization: `Bearer ${auth.token}` }
}

test('MANAGER — 입고 검수 메뉴와 빈 목록에 실 API로 진입한다', async ({ page }) => {
  const manager = await login(page, 'dev_manager')
  await installAuth(page, manager)
  await page.goto(`${BASE_URL}/warehouse/inbound-inspections`)

  await expect(page.getByTestId('sidebar-warehouse-inbound-inspections')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('inbound-inspection-list-table')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('등록된 입고 검수가 없습니다.')).toBeVisible()
  await page.screenshot({ path: path.join(SHOTS, '01-manager-inbound-list.png'), fullPage: true })
})

test('MANAGER — INBOUND+INSPECTING 실 전표의 처리 완료 버튼이 활성이다', async ({ page }) => {
  const manager = await login(page, 'dev_manager')
  const response = await page.request.get(
    `${API_BASE}/slips?slipType=INBOUND&status=INSPECTING&page=0&size=20`,
    { headers: authHeaders(manager) },
  )
  expect(response.ok(), `INSPECTING slips HTTP ${response.status()}`).toBeTruthy()
  const slipPage = (await response.json()).data ?? {}
  expect(slipPage.totalElements).toBe(2)
  const target = slipPage.content?.[0]
  expect(target?.id).toBeTruthy()

  await installAuth(page, manager)
  await page.goto(`${BASE_URL}/purchases/${target.id}`)
  const action = page.getByRole('button', { name: '완료 (처리 완료)' })
  await expect(action).toBeVisible({ timeout: 30_000 })
  await expect(action).toBeEnabled()
  await page.screenshot({ path: path.join(SHOTS, '02-manager-inspecting-action.png'), fullPage: true })
})

test('SALES — 입고 검수 메뉴·라우트·목록 API가 계속 차단된다', async ({ page }) => {
  const sales = await login(page, 'dev_sales')
  const api = await page.request.get(
    `${API_BASE}/api/v1/inventory/inbound-inspections?page=0&size=20`,
    { headers: authHeaders(sales) },
  )
  expect(api.status()).toBe(403)

  await installAuth(page, sales)
  await page.goto(`${BASE_URL}/warehouse/inbound-inspections`)
  await expect(page).not.toHaveURL(/\/warehouse\/inbound-inspections$/, { timeout: 30_000 })
  await expect(page.getByTestId('sidebar-warehouse-inbound-inspections')).toHaveCount(0)
  await page.screenshot({ path: path.join(SHOTS, '03-sales-inbound-denied.png'), fullPage: true })
})

test('MASTER — system.permission-admin 실 권한으로 권한설정 화면이 열린다', async ({ page }) => {
  const master = await login(page, 'dev_master')
  const permissions = await page.request.get(`${API_BASE}/auth/admin/permissions/my`, {
    headers: authHeaders(master),
  })
  expect(permissions.ok(), `MASTER permissions HTTP ${permissions.status()}`).toBeTruthy()
  const matrix = (await permissions.json()).data as Record<string, string[]>
  expect(matrix['system.permission-admin']).toEqual([
    'VIEW', 'CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'DOWNLOAD', 'PRINT',
  ])

  await installAuth(page, master)
  await page.goto(`${BASE_URL}/admin/permission-matrix`)
  await expect(page.getByRole('heading', { name: '권한설정', level: 3 })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('permission-matrix-table')).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: path.join(SHOTS, '04-master-permission-admin.png'), fullPage: true })
})
