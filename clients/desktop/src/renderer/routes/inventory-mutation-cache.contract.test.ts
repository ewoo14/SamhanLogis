import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function read(route: string): string {
  return readFileSync(new URL(`./${route}`, import.meta.url), 'utf8')
}

describe('inventory-adjacent mutation list cache contracts', () => {
  it('invalidates each successful create against its own list family', () => {
    const auditForm = read('InventoryAuditFormPage.tsx')
    const slipForm = read('SlipFormPage.tsx')
    const salesAccountingForm = read('accounting/SalesAccountingSlipFormPage.tsx')
    const purchaseAccountingForm = read('accounting/PurchaseAccountingSlipFormPage.tsx')
    const adminWarehouses = read('admin/WarehousesPage.tsx')

    expect(auditForm).toContain("queryClient.invalidateQueries({ queryKey: ['inventory', 'audits'] })")
    expect(slipForm).toContain("queryClient.invalidateQueries({ queryKey: ['slips', 'query', mode] })")
    expect(salesAccountingForm).toContain("queryClient.invalidateQueries({ queryKey: ['sales-accounting-slips'] })")
    expect(purchaseAccountingForm).toContain("queryClient.invalidateQueries({ queryKey: ['purchase-accounting-slips'] })")
    expect(adminWarehouses).toContain("queryClient.invalidateQueries({ queryKey: ['warehouses'] })")
  })

  it('invalidates stock balances and ledger after every physical stock mutation', () => {
    const transferDetail = read('TransferDetailPage.tsx')
    const slipDetail = read('SlipDetailPage.tsx')
    const auditDetail = read('InventoryAuditDetailPage.tsx')

    expect(transferDetail).toContain("queryClient.invalidateQueries({ queryKey: ['inventory-balances'] })")
    expect(transferDetail).toContain("queryClient.invalidateQueries({ queryKey: ['inventory-ledger'] })")
    expect(slipDetail).toContain("queryClient.invalidateQueries({ queryKey: ['inventory-balances'] })")
    expect(slipDetail).toContain("queryClient.invalidateQueries({ queryKey: ['inventory-ledger'] })")
    expect(auditDetail).toContain("queryClient.invalidateQueries({ queryKey: ['inventory-balances'] })")
    expect(auditDetail).toContain("queryClient.invalidateQueries({ queryKey: ['inventory-ledger'] })")
  })

  it('does not cross-invalidate unrelated list families', () => {
    const auditForm = read('InventoryAuditFormPage.tsx')
    const slipForm = read('SlipFormPage.tsx')
    const salesAccountingForm = read('accounting/SalesAccountingSlipFormPage.tsx')
    const purchaseAccountingForm = read('accounting/PurchaseAccountingSlipFormPage.tsx')
    const adminWarehouses = read('admin/WarehousesPage.tsx')

    expect(auditForm).not.toContain("queryKey: ['transfers']")
    expect(auditForm).not.toContain("queryKey: ['slips'")
    expect(slipForm).not.toContain("queryKey: ['inventory', 'audits']")
    expect(salesAccountingForm).not.toContain("queryKey: ['purchase-accounting-slips']")
    expect(purchaseAccountingForm).not.toContain("queryKey: ['sales-accounting-slips']")
    expect(adminWarehouses).not.toContain("queryKey: ['inventory', 'audits']")
    expect(adminWarehouses).not.toContain("queryKey: ['transfers']")
  })
})
