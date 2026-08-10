import { resolveQaCredential } from '../../../../scripts/lib/qa-credentials.cjs'
import { resolveQaShotsDir } from '../support/qa-screenshot-dir'
import { expect, test, type Page } from '@playwright/test'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_BASE = process.env['REAL_QA_RENDERER_BASE_URL'] ?? 'http://127.0.0.1:4174'
const API_BASE = 'http://127.0.0.1:8080'
const SHOTS = resolveQaShotsDir(path.resolve(
  HERE,
  '../../../../docs/qa/2026-08-11-1163-r4/screenshots',
))

type Warehouse = { id: string; code: string; name: string }
type AuditRow = {
  revisionNo: number
  actorId: string | null
  actorName: string | null
  fieldName: string | null
  oldValue: string | null
  newValue: string | null
}

const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FIELD_LABELS: Record<string, string> = {
  name: '창고명',
  type: '분류',
  address: '주소',
  displayOrder: '표시 순서',
  description: '설명',
  isDeleted: '비활성화',
}

function expectedActorLabel(row: AuditRow): string {
  if (row.actorId === SYSTEM_ACTOR_ID) return '시스템'
  const actorName = row.actorName?.trim() ?? ''
  if (!actorName || UUID_RE.test(actorName)) return '변경자 미상'
  return row.actorName!
}

function buildWarehouseUrl(baseUrl: string): string {
  const url = new URL(baseUrl)
  url.hash = '/admin/warehouses'
  return url.toString()
}

async function login(page: Page) {
  const response = await page.request.post(`${API_BASE}/auth/login`, {
    data: {
      loginId: 'dev_master',
      password: resolveQaCredential('QA_DEV_DEFAULT_PASSWORD'),
    },
  })
  expect(response.ok(), `실 로그인 실패: HTTP ${response.status()}`).toBeTruthy()
  const body = await response.json()
  const session = body.data ?? {}
  expect(session.token, '실 로그인 token 누락').toBeTruthy()
  await page.addInitScript(({ token, userId, role, displayName }) => {
    Object.defineProperty(window, 'samhanAuth', {
      configurable: true,
      value: {
        getToken: async () => ({ token, userId, role, fullName: displayName }),
        setToken: async () => undefined,
        clearToken: async () => undefined,
      },
    })
  }, session)
  return session as {
    token: string
    userId: string
    role: string
    displayName: string
  }
}

test('PR #1164 R4 — 구배포본 read-only 실 로그인·실 창고 이력 UI', async ({ page }) => {
  fs.mkdirSync(SHOTS, { recursive: true })
  const session = await login(page)
  const headers = { Authorization: `Bearer ${session.token}` }

  const searchResponse = await page.request.get(`${API_BASE}/inventory/warehouses/search`, {
    headers,
    params: { page: 0, size: 20 },
  })
  expect(searchResponse.ok(), `실 창고 목록 실패: HTTP ${searchResponse.status()}`).toBeTruthy()
  const searchBody = await searchResponse.json()
  const warehouses: Warehouse[] = searchBody.data?.items ?? []
  expect(warehouses.length, '실 창고 목록이 비어 있음').toBeGreaterThan(0)

  let target = warehouses[0]!
  let auditRows: AuditRow[] = []
  for (const warehouse of warehouses) {
    const auditResponse = await page.request.get(
      `${API_BASE}/inventory/warehouses/${encodeURIComponent(warehouse.id)}/audit-logs`,
      { headers },
    )
    if (!auditResponse.ok()) continue
    const auditBody = await auditResponse.json()
    const rows: AuditRow[] = auditBody.data ?? []
    if (rows.length > 0) {
      target = warehouse
      auditRows = rows
      break
    }
  }

  expect(auditRows.length, 'live evidence: 감사행을 찾지 못해 빈 패널을 성공으로 처리함').toBeGreaterThan(0)
  const selectedRow = auditRows[0]!
  const selectedRevisionRows = auditRows.filter((row) => row.revisionNo === selectedRow.revisionNo)
  expect(selectedRevisionRows.length, `revision ${selectedRow.revisionNo}의 감사행이 없음`).toBeGreaterThan(0)

  console.log(JSON.stringify({
    evidence: 'REAL_LOGIN_REAL_GATEWAY_REAL_OLD_BACKEND_READ_ONLY',
    warehouseCode: target.code,
    auditRowCount: auditRows.length,
    actorNames: auditRows.map((row) => row.actorName),
    fieldNames: auditRows.map((row) => row.fieldName),
  }))

  await page.goto(buildWarehouseUrl(APP_BASE))
  const editButton = page.getByTestId(`admin-warehouses-edit-${target.code}`)
  await expect(editButton).toBeVisible({ timeout: 30_000 })
  await editButton.click()
  await page.getByTestId('edit-warehouse-audit-toggle').click()
  const panel = page.getByTestId('edit-warehouse-audit-panel')
  await expect(panel).toBeVisible({ timeout: 15_000 })

  const revision = page.getByTestId(`edit-warehouse-audit-revision-${selectedRow.revisionNo}`)
  await expect(revision, `API revision ${selectedRow.revisionNo}가 UI에서 소실됨`).toBeVisible()
  const revisionText = await revision.innerText()
  const expectedActor = expectedActorLabel(selectedRevisionRows[0]!)
  expect(expectedActor.trim(), '감사 revision 기대 변경자 라벨이 비어 있음').not.toBe('')
  expect(revisionText, '감사 revision 변경자 라벨이 비어 있음').toContain(`· ${expectedActor}`)
  for (const row of selectedRevisionRows) {
    if (row.fieldName) {
      expect(revisionText).toContain(FIELD_LABELS[row.fieldName] ?? row.fieldName)
    }
    if (row.oldValue !== null) expect(revisionText).toContain(row.oldValue)
    if (row.newValue !== null) expect(revisionText).toContain(row.newValue)
  }
  const panelText = await panel.innerText()
  expect(panelText).not.toMatch(UUID_RE)
  await page.screenshot({
    path: path.join(SHOTS, 'warehouse-audit-readonly-live-ui.png'),
    fullPage: true,
  })
})
