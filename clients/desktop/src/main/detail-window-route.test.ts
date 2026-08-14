import { describe, expect, it } from 'vitest'
import { isAllowedDetailWindowRoute } from './detail-window-route'

describe('detail-window IPC route contract', () => {
  it.each([
    ['/sales/slip-1', 'OUTBOUND_SLIP'],
    ['/purchases/slip-2', 'INBOUND_SLIP'],
    ['/accounting/tax-invoices/tax-3', 'TAX_INVOICE'],
    ['/transfers/transfer-4', 'TRANSFER'],
    ['/warehouse/audit/audit-5', 'INVENTORY_AUDIT'],
    ['/sales/estimates/estimate-6', 'ESTIMATE'],
    ['/sales/partner-orders/order-7', 'PARTNER_ORDER'],
  ])('accepts the %s route used by %s', (route) => {
    expect(isAllowedDetailWindowRoute(route), route).toBe(true)
  })

  it.each(['/sales', '/sales/estimates', '/sales/estimates/web-snapshots/1/items', 'https://example.test/sales/1'])('rejects non-detail route %s', (route) => {
    expect(isAllowedDetailWindowRoute(route), route).toBe(false)
  })
})
