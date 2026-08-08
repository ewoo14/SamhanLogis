import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getMockResponse } from '../api/mock'

const workspace = resolve(__dirname, '../../..')
const routes = readFileSync(resolve(workspace, 'src/renderer/routes/index.tsx'), 'utf8')
const layout = readFileSync(resolve(workspace, 'src/renderer/components/AppLayout.tsx'), 'utf8')
const mock = readFileSync(resolve(workspace, 'src/renderer/api/mock.ts'), 'utf8')
const taxInvoiceController = readFileSync(
  resolve(workspace, '../../services/accounting-service/src/main/java/com/samhanair/logis/accounting/web/TaxInvoiceInboundController.java'),
  'utf8',
)
const migrationPath = resolve(
  workspace,
  '../../services/auth-service/src/main/resources/db/migration/V97__align_accounting_slip_permissions.sql',
)
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

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

  it('copies list permissions to accounting permissions for all permission stores and keeps list rows', () => {
    expect(existsSync(migrationPath)).toBe(true)
    expect(migration).toContain('권한을 새로 부여하지 않는다')
    expect(migration).not.toMatch(/INSERT\s+INTO|UPDATE\s+.+\s+SET|DELETE\s+FROM/i)
    expect(migration).not.toContain('accounting.sales-slip.list')
    expect(migration).not.toContain('accounting.purchase-slip.list')
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

  it('RED-B: MANAGER/SALES mock matrix keeps both accounting slip accounting codes denied', () => {
    for (const role of ['manager', 'sales']) {
      for (const pageCode of [
        'accounting.sales-slip.accounting',
        'accounting.purchase-slip.accounting',
      ]) {
        const cell = getRolePermissionCell(role, pageCode)
        expect(cell.view).toBe(false)
        expect(cell.create).toBe(false)
        expect(cell.update).toBe(false)
        expect(cell.delete).toBe(false)
      }
    }

    expect(getRolePermissionCell('manager', 'ecount.mig.ops-dashboard').view).toBe(true)
    expect(getRolePermissionCell('manager', 'messenger.send').view).toBe(true)
    expect(getRolePermissionCell('sales', 'messenger.send').view).toBe(true)
    expect(getRolePermissionCell('sales', 'ecount.mig.ops-dashboard').view).toBe(false)
  })
})
