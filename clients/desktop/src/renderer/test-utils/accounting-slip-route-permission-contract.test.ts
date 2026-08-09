import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const workspace = resolve(__dirname, '../../..')
const routes = readFileSync(resolve(workspace, 'src/renderer/routes/index.tsx'), 'utf8')

function routeBlock(path: string): string {
  const start = routes.indexOf(`path: '${path}'`)
  expect(start, `${path} route is present`).toBeGreaterThanOrEqual(0)
  const end = routes.indexOf('\n      },', start)
  expect(end, `${path} route block is closed`).toBeGreaterThan(start)
  return routes.slice(start, end)
}

describe('accounting slip form route permission contract', () => {
  it('keeps both form routes behind create PermissionGuard actions', () => {
    expect(routeBlock('/accounting/sales-slips/new')).toMatch(
      /PermissionGuard pageCode="accounting\.sales-slip\.accounting" action="create"[\s\S]*SalesAccountingSlipFormPage/,
    )
    expect(routeBlock('/accounting/purchase-slips/new')).toMatch(
      /PermissionGuard pageCode="accounting\.purchase-slip\.accounting" action="create"[\s\S]*PurchaseAccountingSlipFormPage/,
    )
  })
})
