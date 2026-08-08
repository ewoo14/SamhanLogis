import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

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

    const accountantBlock = mock.match(/ACCOUNTANT: \[(.*?)\n  \],\n  WAREHOUSE:/s)?.[1] ?? ''

    expect(accountantBlock).toContain('accounting.sales-slip.accounting')
    expect(accountantBlock).toContain('accounting.purchase-slip.accounting')
    expect(accountantBlock).toContain('ecount.mig.ops-dashboard')
    expect(accountantBlock).toContain('messenger.send')
  })

  it('RED-B: MANAGER/SALES mock matrix keeps both accounting slip accounting codes denied', () => {
    const managerBlock = mock.match(/MANAGER: \[(.*?)\n  \],\n  DISPATCH:/s)?.[1] ?? ''
    const salesBlock = mock.match(/SALES: \[(.*?)\n  \],\n  ACCOUNTANT:/s)?.[1] ?? ''

    expect(managerBlock).not.toContain('accounting.sales-slip.accounting')
    expect(managerBlock).not.toContain('accounting.purchase-slip.accounting')
    expect(managerBlock).toContain('ecount.mig.ops-dashboard')
    expect(managerBlock).toContain('messenger.send')
    expect(salesBlock).not.toContain('accounting.sales-slip.accounting')
    expect(salesBlock).not.toContain('accounting.purchase-slip.accounting')
    expect(salesBlock).toContain('messenger.send')
    expect(salesBlock).not.toContain('ecount.mig.ops-dashboard')
  })
})
