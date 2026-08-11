import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { TextDecoder } from 'node:util'
import { describe, expect, it } from 'vitest'
import { getMockResponse } from '../api/mock'
import { PERMISSION_BITS_BY_ROLE } from './accounting-slip-permission-snapshot'
import { assertExactPermissionMatrix } from './permission-contract-checker'

const workspace = resolve(__dirname, '../../..')
const routes = readFileSync(resolve(workspace, 'src/renderer/routes/index.tsx'), 'utf8')
const layout = readFileSync(resolve(workspace, 'src/renderer/components/AppLayout.tsx'), 'utf8')
const mock = readFileSync(resolve(workspace, 'src/renderer/api/mock.ts'), 'utf8')
const dbSnapshot = readStrictUtf8('src/renderer/test-utils/accounting-slip-permission-db-snapshot.ts')
const refreshScript = readStrictUtf8('../../scripts/refresh-accounting-permission-db-snapshot.ps1')
const permissionChecker = readStrictUtf8('src/renderer/test-utils/permission-contract-checker.ts')
const salesAccountingSlipPage = readFileSync(resolve(workspace, 'src/renderer/routes/accounting/SalesAccountingSlipPage.tsx'), 'utf8')
const purchaseAccountingSlipPage = readFileSync(resolve(workspace, 'src/renderer/routes/accounting/PurchaseAccountingSlipPage.tsx'), 'utf8')
const taxInvoiceController = readFileSync(
  resolve(workspace, '../../services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/TaxInvoiceInboundController.java'),
  'utf8',
)
const migrationPath = resolve(
  workspace,
  '../../services/auth-service/src/main/resources/db/migration/V99__align_accounting_slip_permissions.sql',
)
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

const canonicalNonAsciiLines = {
  generator: [
    "  throw 'DB 파생 스냅샷 갱신 중단: docker 명령이 없습니다.'",
    "if (-not $pageMatch.Success) { throw 'PERMISSION_PAGE_CODES를 찾지 못했습니다.' }",
    '# 공유 auth_db의 적용 여부에 의존하지 않는다. 매번 일회성 PostgreSQL에 저장소의',
    '# migration 전체를 Flyway로 적용한 뒤 그 결과만 SELECT한다. 이 컨테이너/네트워크는',
    '# finally에서 제거되므로 운영 DB에는 쓰기가 발생하지 않는다.',
    "  if ($LASTEXITCODE -ne 0) { throw '임시 Docker 네트워크 생성에 실패했습니다.' }",
    "  if ($LASTEXITCODE -ne 0) { throw '임시 PostgreSQL 컨테이너 생성에 실패했습니다.' }",
    "  if (-not $databaseReady) { throw '임시 PostgreSQL이 준비되지 않았습니다.' }",
    "  if ($LASTEXITCODE -ne 0) { throw '전체 migration 적용에 실패했습니다. projection을 갱신하지 않습니다.' }",
    "    throw 'DB 파생 스냅샷 갱신 중단: 전체 migration DB SELECT가 실패했거나 결과가 비었습니다. 기존 체크인 산출물로 조용히 대체하지 않습니다.'",
    "    throw \"DB 파생 스냅샷 갱신 중단: 잘못된 projection row '$row'\"",
    "    throw \"DB 파생 스냅샷 갱신 중단: duplicate projection cell $cell first/second bits cannot be represented\"",
    "$lines.Add('// Scope: PERMISSION_ROLES × PERMISSION_PAGE_CODES. Missing DB rows are 0000000.')",
  ],
  dbSnapshot: [
    '// Scope: PERMISSION_ROLES × PERMISSION_PAGE_CODES. Missing DB rows are 0000000.',
  ],
  checker: [
    "  expect([...mockPageCodes].sort(), 'mock ↔ snapshot page-code catalog').toEqual([...snapshotPageCodes].sort())",
    "  expect([...mockRoles].sort(), 'mock ↔ snapshot role catalog').toEqual([...snapshotRoles].sort())",
    ' * Mock account endpoint와 auth_db role_page_permission_templates 스냅샷의',
    ' * 역할 × page code × 7-action 전체 곱을 비교한다. 누락 셀도 0000000으로',
    ' * 묵인하지 않고 page/role 집합 자체를 먼저 비교한다.',
    "      expect(cell, `${role} × ${pageCode} cell`).toBeDefined()",
    "      expect(actualBits, `${role} × ${pageCode}`).toBe(frozenDivergence?.mockBits ?? expectedBits)",
  ],
} as const

function readStrictUtf8(relativePath: string): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(resolve(workspace, relativePath)))
}

function nonAsciiLines(source: string): string[] {
  return source
    .split(/\r?\n/)
    .filter((line) => /[^\x00-\x7F]/u.test(line))
    .map((line) => line.replace(/^\uFEFF/u, ''))
}

function assertCanonicalNonAsciiInventory(label: keyof typeof canonicalNonAsciiLines, source: string): void {
  expect(nonAsciiLines(source), `${label} non-ASCII inventory`).toEqual(canonicalNonAsciiLines[label])
}

type PermissionCell = {
  view: boolean
  create?: boolean
  update?: boolean
  delete?: boolean
  canView?: boolean
  canEdit?: boolean
}

type MockEnvelope<T> = { data: T }

function getRolePermissionCell(role: string, pageCode: string): PermissionCell {
  const response = getMockResponse({
    method: 'GET',
    url: `/auth/admin/permissions/account/mock-account-${role.toLowerCase()}`,
  }) as MockEnvelope<Record<string, PermissionCell>> | null
  const cell = response?.data?.[pageCode]
  expect(cell, `${role} permission cell is missing for ${pageCode}`).toBeDefined()
  return cell as PermissionCell
}

function getMatrixPermissionCell(role: string, pageCode: string): PermissionCell {
  const response = getMockResponse({
    method: 'GET',
    url: '/auth/admin/permissions',
  }) as MockEnvelope<Record<string, Record<string, PermissionCell>>> | null
  const cell = response?.data?.[role]?.[pageCode]
  expect(cell, `${role} permission cell is missing for ${pageCode}`).toBeDefined()
  return cell as PermissionCell
}

describe('accounting slip permission contract', () => {
  it('guards sales and purchase list/create routes with the BE accounting page codes and matching actions', () => {
    expect(routes).toContain('pageCode="accounting.sales-slip.accounting" action="view"')
    expect(routes).toContain('pageCode="accounting.sales-slip.accounting" action="create"')
    expect(routes).toContain('pageCode="accounting.purchase-slip.accounting" action="view"')
    expect(routes).toContain('pageCode="accounting.purchase-slip.accounting" action="create"')
    expect(routes).not.toContain('pageCode="accounting.sales-slip.list" action="edit"')
    expect(routes).not.toContain('pageCode="accounting.purchase-slip.list" action="edit"')
    expect(layout).toContain("dynamicCanAccess('accounting.sales-slip.accounting', 'view')")
    expect(layout).toContain("dynamicCanAccess('accounting.purchase-slip.accounting', 'view')")
  })

  it('keeps the MASTER runtime seven-action derivation in the official refresh generator', () => {
    expect(refreshScript).toContain("$lines.Add('const TEMPLATE_PERMISSION_DB_BITS_BY_ROLE")
    expect(refreshScript).toContain("$lines.Add('// DynamicPermissionService bypasses role templates for MASTER")
    expect(refreshScript).toContain("MASTER: Object.fromEntries(PERMISSION_PAGE_CODES.map((pageCode) => [pageCode, '1111111']))")
    expect(refreshScript).toContain('$seenCells = [System.Collections.Generic.HashSet[string]]::new()')
    expect(refreshScript).toContain('duplicate projection cell')
  })

  it('writes a PowerShell 5.1 refresh artifact with LF and one readable error line', () => {
    expect(refreshScript).not.toContain('[Environment]::NewLine')
    expect(refreshScript).toContain('($lines -join "`n") + "`n"')
    expect(refreshScript).toContain('[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)')
    expect(refreshScript).toContain('$OutputEncoding = [Text.UTF8Encoding]::new($false)')
    expect(refreshScript).toContain('[Console]::Error.WriteLine($_.Exception.Message)')
    expect(refreshScript).toContain('exit 1')
  })

  it('strictly decodes and pins every non-ASCII generator, snapshot, and checker line', () => {
    assertCanonicalNonAsciiInventory('generator', refreshScript)
    assertCanonicalNonAsciiInventory('dbSnapshot', dbSnapshot)
    assertCanonicalNonAsciiInventory('checker', permissionChecker)

    const mutations = [
      ['generator multiplication sign', 'generator', refreshScript.replace('×', '�')],
      ['generator Korean error text', 'generator', refreshScript.replace('DB 파생 스냅샷 갱신 중단', 'DB ?뚯깮 스냅샷 갱신 중단')],
      ['checker arrow symbol', 'checker', permissionChecker.replace('↔', '→')],
      ['checker Korean JSDoc', 'checker', permissionChecker.replace('역할', '役割')],
      ['snapshot multiplication sign', 'dbSnapshot', dbSnapshot.replace('×', '…')],
    ] as const

    for (const [name, label, mutatedSource] of mutations) {
      expect(() => assertCanonicalNonAsciiInventory(label, mutatedSource), name).toThrow()
    }
  })

  it('gates every accounting slip write CTA by the canonical accounting permission action', () => {
    for (const [page, source, path] of [
      ['sales', salesAccountingSlipPage, 'accounting.sales-slip.accounting'],
      ['purchase', purchaseAccountingSlipPage, 'accounting.purchase-slip.accounting'],
    ] as const) {
      expect(source, `${page} page imports usePermissions`).toContain("from '../../hooks/usePermissions'")
      expect(source, `${page} create CTA`).toContain(`canAccess('${path}', 'create')`)
      expect(source, `${page} post CTA`).toContain(`canAccess('${path}', 'update')`)
      expect(source, `${page} create button conditional`).toMatch(/canCreate[\s\S]*navigate\('\/accounting\/(sales|purchase)-slips\/new'\)/)
      expect(source, `${page} post button conditional`).toMatch(/canPost[\s\S]*row\.status === 'DRAFT'/)
    }
  })

  it('grants accounting permissions by inheriting list bits across role, group, and account stores', () => {
    expect(existsSync(migrationPath)).toBe(true)
    expect(migration).toContain('accounting.sales-slip.list')
    expect(migration).toContain('accounting.purchase-slip.list')
    expect(migration).toContain('role_page_permissions')
    expect(migration).toContain('role_page_permission_templates')
    expect(migration).toContain('group_page_permissions')
    expect(migration).toContain('account_page_permissions')
    expect(migration).toContain("'00000000-0000-0000-0000-000000000101'::uuid")
    expect(migration).toContain("'00000000-0000-0000-0000-000000000102'::uuid")
    expect(migration).toContain("'dev_manager', 'janyeonggu', 'manager@samhan.test'")
    expect(migration).toContain('accounting.tax-invoice.inbound.manage')
    expect(migration).toMatch(/ON CONFLICT\s*\([^)]*page_code[^)]*\)[\s\S]*DO UPDATE/i)
    expect(migration).not.toMatch(/DELETE\s+FROM/i)
    expect(migration).not.toContain('SELECT 1;')
    expect(migrationPath).toContain('V99__align_accounting_slip_permissions.sql')
  })

  it('uses the BE inbound.manage page code for the inbound tax invoice screen', () => {
    expect(routes).toContain('pageCode="accounting.tax-invoice.inbound.manage" action="view"')
    expect(layout).toContain("dynamicCanAccess('accounting.tax-invoice.inbound.manage', 'view')")
    expect(routes).not.toContain('pageCode="accounting.tax-invoice.inbound" action="view"')
    expect(layout).not.toContain("dynamicCanAccess('accounting.tax-invoice.inbound', 'view')")
    expect(taxInvoiceController).toContain('page = "accounting.tax-invoice.inbound.manage"')
  })

  it('RED-A: MASTER/ACCOUNTANT mock matrix grants both accounting slip accounting codes', () => {
    expect(mock).toContain("'accounting.sales-slip.accounting'")
    expect(mock).toContain("'accounting.purchase-slip.accounting'")
    expect(mock).toContain("'ecount.mig.ops-dashboard'")
    expect(mock).toContain("'messenger.send'")
    expect(mock).toContain("'system.permission-admin'")
    expect(mock).toContain("'accounting.sales-slip.list'")
    expect(mock).toContain("'accounting.purchase-slip.list'")

    for (const role of ['MASTER', 'ACCOUNTANT']) {
      for (const pageCode of [
        'accounting.sales-slip.accounting',
        'accounting.purchase-slip.accounting',
      ]) {
        const cell = getMatrixPermissionCell(role, pageCode)
        expect(cell.canView).toBe(true)
        expect(cell.canEdit).toBe(true)
      }
    }

    expect(getRolePermissionCell('accountant', 'ecount.mig.ops-dashboard').view).toBe(true)
    expect(getRolePermissionCell('accountant', 'messenger.send').view).toBe(true)
  })

  it('RED-A: MANAGER/SALES mock matrix grants accounting slip accounting codes with list bits', () => {
    for (const role of ['manager', 'sales']) {
      for (const pageCode of [
        'accounting.sales-slip.accounting',
        'accounting.purchase-slip.accounting',
      ]) {
        const cell = getRolePermissionCell(role, pageCode)
        expect(cell.view).toBe(true)
        expect(cell.create).toBe(role === 'manager')
        expect(cell.update).toBe(role === 'manager')
        expect(cell.delete).toBe(role === 'manager')
      }
    }

    for (const role of ['MANAGER', 'SALES']) {
      for (const pageCode of [
        'accounting.sales-slip.accounting',
        'accounting.purchase-slip.accounting',
      ]) {
        const cell = getMatrixPermissionCell(role, pageCode)
        expect(cell.canView).toBe(true)
        expect(cell.canEdit).toBe(role === 'MANAGER')
      }
    }

    expect(getRolePermissionCell('manager', 'ecount.mig.ops-dashboard').view).toBe(true)
    expect(getRolePermissionCell('manager', 'messenger.send').view).toBe(true)
    expect(getRolePermissionCell('sales', 'messenger.send').view).toBe(true)
    expect(getRolePermissionCell('sales', 'ecount.mig.ops-dashboard').view).toBe(false)
  })

  it('RED-B: every role outside MANAGER/SALES/ACCOUNTANT/MASTER remains denied', () => {
    for (const role of ['developer', 'driver', 'partner', 'staff', 'dispatch', 'inventory', 'warehouse']) {
      for (const pageCode of [
        'accounting.sales-slip.accounting',
        'accounting.purchase-slip.accounting',
      ]) {
        const cell = getRolePermissionCell(role, pageCode)
        expect(cell.view, `${role} unexpectedly has ${pageCode}`).toBe(false)
        expect(cell.create).toBe(false)
        expect(cell.update).toBe(false)
        expect(cell.delete).toBe(false)
      }
    }
  })

  it('R7: every mock page changed by R6 preserves the real model 7-bit action boundary', () => {
    const expected: Record<string, Record<string, PermissionCell>> = {
      manager: {
        'accounting.tax-invoice.inbound.manage': { view: true, create: true, update: true, delete: true, restore: false, download: false, print: false },
        'accounting.sales-slip.accounting': { view: true, create: true, update: true, delete: true, restore: false, download: false, print: false },
        'accounting.purchase-slip.accounting': { view: true, create: true, update: true, delete: true, restore: false, download: false, print: false },
        'messenger.send': { view: true, create: true, update: true, delete: true, restore: false, download: false, print: false },
        'ecount.mig.ops-dashboard': { view: true, create: true, update: true, delete: true, restore: false, download: false, print: false },
      },
      sales: {
        'accounting.sales-slip.accounting': { view: true, create: false, update: false, delete: false, restore: false, download: false, print: false },
        'accounting.purchase-slip.accounting': { view: true, create: false, update: false, delete: false, restore: false, download: false, print: false },
        'messenger.send': { view: true, create: true, update: true, delete: true, restore: false, download: false, print: false },
      },
      accountant: {
        'accounting.tax-invoice.inbound.manage': { view: true, create: true, update: true, delete: true, restore: false, download: false, print: false },
        'accounting.sales-slip.accounting': { view: true, create: true, update: true, delete: true, restore: false, download: false, print: false },
        'accounting.purchase-slip.accounting': { view: true, create: true, update: true, delete: true, restore: false, download: false, print: false },
        'messenger.send': { view: true, create: true, update: true, delete: true, restore: false, download: false, print: false },
        'ecount.mig.ops-dashboard': { view: true, create: false, update: false, delete: false, restore: false, download: false, print: false },
      },
      warehouse: {
        'messenger.send': { view: true, create: true, update: true, delete: true, restore: false, download: false, print: false },
      },
      inventory: {
        'messenger.send': { view: true, create: true, update: true, delete: true, restore: false, download: false, print: false },
      },
      developer: {
        'messenger.send': { view: true, create: true, update: true, delete: true, restore: false, download: false, print: false },
      },
    }

    for (const [role, pages] of Object.entries(expected)) {
      for (const [pageCode, expectedCell] of Object.entries(pages)) {
        expect(getRolePermissionCell(role, pageCode), `${role} ${pageCode}`).toEqual(expectedCell)
      }
    }

    expect(getRolePermissionCell('manager', 'system.permission-admin')).toEqual({
      view: false, create: false, update: false, delete: false, restore: false, download: false, print: false,
    })
    expect(getMatrixPermissionCell('MASTER', 'system.permission-admin')).toMatchObject({
      canView: true, canEdit: true,
    })
  })

  it('R8: every mock page and every role matches the canonical 7-bit matrix', () => {
    assertExactPermissionMatrix({ getMockResponse, mockSource: mock, snapshotSource: dbSnapshot })
  })

  it('RED-A: rejects a snapshot page duplicated across two bit buckets', () => {
    const duplicatedSnapshot = structuredClone(PERMISSION_BITS_BY_ROLE)
    duplicatedSnapshot.ACCOUNTANT['1000000'] = [
      ...duplicatedSnapshot.ACCOUNTANT['1000000'],
      'accounting.sales-commission-settlement',
    ]

    expect(() => (assertExactPermissionMatrix as (options: Record<string, unknown>) => void)({
      getMockResponse,
      mockSource: mock,
      snapshotBitsByRole: duplicatedSnapshot,
    })).toThrow(/ACCOUNTANT\|accounting\.sales-commission-settlement/)
  })

  it('RED-A: rejects duplicate keys in the raw DB projection source before import', () => {
    const marker = [
      "    'accounting.bank-matching': '1110000',",
      "    'accounting.deposit-match': '1000000',",
      "    'accounting.cash-receipts': '1111000',",
      "    'accounting.sales-commission-settlement': '1110000',",
      "    'accounting.period-close': '1000000',",
    ].join('\n')
    const duplicatedSource = dbSnapshot.replace(marker, [
      "    'accounting.bank-matching': '1110000',",
      "    'accounting.deposit-match': '1000000',",
      "    'accounting.cash-receipts': '1111000',",
      "    'accounting.sales-commission-settlement': '0000000',",
      "    'accounting.sales-commission-settlement': '1110000',",
      "    'accounting.period-close': '1000000',",
    ].join('\n'))

    expect(duplicatedSource).not.toBe(dbSnapshot)
    expect(() => (assertExactPermissionMatrix as (options: Record<string, unknown>) => void)({
      getMockResponse,
      mockSource: mock,
      snapshotSource: duplicatedSource,
    })).toThrow(/MANAGER\|accounting\.sales-commission-settlement/)
  })

  it('rejects duplicate page rows in the mock role edit source before membership lookup', () => {
    const editSource = mock.match(/const SP_D1_DEFAULT_EDIT[\s\S]*?= \{([\s\S]*?)\n\}\n\n/)?.[1]
    expect(editSource, 'SP_D1_DEFAULT_EDIT source').toBeTruthy()
    const duplicateCells: string[] = []
    const roles = /([A-Z]+): \[([\s\S]*?)\n  \],/g
    let roleMatch: RegExpExecArray | null
    while ((roleMatch = roles.exec(editSource ?? '')) !== null) {
      const pages = Array.from(roleMatch[2].matchAll(/'([^']+)'/g), (match) => match[1])
      const seen = new Set<string>()
      for (const page of pages) {
        if (seen.has(page)) duplicateCells.push(`${roleMatch[1]}|${page}`)
        seen.add(page)
      }
    }
    expect(duplicateCells, 'mock role/page source must be duplicate-free').toEqual([])
  })
})
