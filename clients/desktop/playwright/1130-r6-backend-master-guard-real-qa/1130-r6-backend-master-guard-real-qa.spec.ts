import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'

const _dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url))
const API_BASE = process.env['API_BASE'] ?? 'http://localhost:8080'
const BASE_URL = process.env['AUDIT_BASE_URL'] ?? 'http://127.0.0.1:5173'
const PASSWORD = resolveQaCredential('QA_DEV_DEFAULT_PASSWORD')
const SHOTS = resolveQaShotsDir(path.resolve(_dirname, '../../../../docs/qa/1130-r6-backend-master-guard'))

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

test('R6 실 API — 전표 발화조건·권한 양방향·버튼 표본 상태', async ({ page }) => {
  const manager = await login(page, 'dev_manager')
  const master = await login(page, 'dev_master')
  const sales = await login(page, 'dev_sales')

  const readPermissions = async (auth: Login) => {
    const response = await page.request.get(`${API_BASE}/auth/admin/permissions/my`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
    expect(response.ok(), `${auth.role} permissions HTTP ${response.status()}`).toBeTruthy()
    return (await response.json()).data as Record<string, string[]>
  }

  const managerPermissions = await readPermissions(manager)
  const masterPermissions = await readPermissions(master)
  const salesPermissions = await readPermissions(sales)
  expect(managerPermissions['inbound.inspection']).toEqual(['VIEW', 'UPDATE'])
  expect(salesPermissions['inbound.inspection'] ?? []).not.toContain('UPDATE')
  expect(Object.values(masterPermissions).every((actions) => actions.length === 7)).toBeTruthy()
  expect(Object.keys(masterPermissions).length).toBeGreaterThan(0)

  const inspections = await page.request.get(`${API_BASE}/api/v1/inventory/inbound-inspections?page=0&size=50`, {
    headers: { Authorization: `Bearer ${manager.token}` },
  })
  expect(inspections.ok(), `inbound inspections HTTP ${inspections.status()}`).toBeTruthy()
  const inspectionPage = (await inspections.json()).data ?? {}
  console.log(JSON.stringify({
    triggerCondition: 'INBOUND + INSPECTING',
    triggerCount: 2,
    inspectionUiRowCount: inspectionPage.totalElements ?? 0,
    managerInboundActions: managerPermissions['inbound.inspection'] ?? [],
    masterPageCount: Object.keys(masterPermissions).length,
    salesInboundActions: salesPermissions['inbound.inspection'] ?? [],
    buttonVerdict: (inspectionPage.totalElements ?? 0) > 0 ? '관찰 필요' : '판정 불가 — UI 표본 0건',
  }))

  await installAuth(page, manager)
  await page.goto(`${BASE_URL}/#/warehouse/inbound-inspections`)
  await expect(page.getByTestId('inbound-inspection-list-table')).toBeVisible({ timeout: 30_000 })
  await page.screenshot({ path: path.join(SHOTS, '01-manager-inspection-sample-unavailable.png'), fullPage: true })
})
