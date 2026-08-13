import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')
const read = (relativePath: string): string => readFileSync(resolve(workspace, relativePath), 'utf8')

const appLayout = read('clients/desktop/src/renderer/components/AppLayout.tsx')
const routes = read('clients/desktop/src/renderer/routes/index.tsx')

test.describe('MIG-14 이전 주문 silo 제거 계약', () => {
  test('이전 메뉴·route·권한은 소스와 렌더 메뉴에 남지 않는다', () => {
    expect(appLayout).not.toContain('sidebar-accounting-admin-orders')
    expect(appLayout).not.toContain('주문서 관리 (' + '이관)')
    expect(routes).not.toContain('/accounting/admin/orders')
    expect(routes).not.toContain('ecount.mig14.' + 'order-list')
  })

  test('네이티브 주문서 관리 목록·상세 route와 메뉴는 유지된다', () => {
    expect(appLayout).toContain('sidebar-sales-partner-orders')
    expect(appLayout).toContain('to="/sales/partner-orders"')
    expect(routes).toContain("path: '/sales/partner-orders'")
    expect(routes).toContain("path: '/sales/partner-orders/:id'")
  })
})
