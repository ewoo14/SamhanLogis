import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const routesSource = readFileSync(resolve(__dirname, 'index.tsx'), 'utf8')

describe('S3 expanded detail routes', () => {
  it.each([
    ['estimate', 'EstimateDetailPage'],
    ['partner order', 'SalesPartnerOrderDetailPage'],
    ['transfer', 'TransferDetailPage'],
    ['inventory audit', 'InventoryAuditDetailPage'],
  ])('wraps the %s detail in DetailWindowRoute', (_label, component) => {
    expect(routesSource).toMatch(new RegExp(`<DetailWindowRoute>[\\s\\S]{0,500}<${component}`))
  })
})
