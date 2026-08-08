import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspace = resolve(__dirname, '../../..')
const routes = readFileSync(resolve(workspace, 'src/renderer/routes/index.tsx'), 'utf8')
const layout = readFileSync(resolve(workspace, 'src/renderer/components/AppLayout.tsx'), 'utf8')
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
    expect(migration).toContain('role_page_permissions')
    expect(migration).toContain('role_page_permission_templates')
    expect(migration).toContain('group_page_permissions')
    expect(migration).toContain('account_page_permissions')
    expect(migration).toContain('accounting.sales-slip.list')
    expect(migration).toContain('accounting.sales-slip.accounting')
    expect(migration).toContain('accounting.purchase-slip.list')
    expect(migration).toContain('accounting.purchase-slip.accounting')
    expect(migration).toContain('ON CONFLICT')
    expect(migration).not.toMatch(/DELETE\s+FROM\s+(?:role_page_permission_templates|group_page_permissions|account_page_permissions)/i)
  })
})
