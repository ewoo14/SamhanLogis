import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')

describe('#1210 RED — 창고 담당자 출고전표 도달 경로', () => {
  it('전표번호 진입은 전체 목록/상세 대신 최소 scan-context 조회를 사용해야 한다', () => {
    const page = read('./StockSlipByNumberPage.tsx')
    expect(page).toContain('getOutboundSlipScanContextByNumber')
    expect(page).toContain("enabled: mode === 'INBOUND'")
    expect(page).toContain("enabled: mode === 'OUTBOUND'")
  })

  it('출고전표 번호 경로는 sales.slip.list 권한으로 막히면 안 된다', () => {
    const routes = read('../index.tsx')
    const routeStart = routes.indexOf("path: '/sales/by-number'")
    const routeEnd = routes.indexOf("path: '/purchases/by-number'")
    expect(routeStart).toBeGreaterThanOrEqual(0)
    expect(routeEnd).toBeGreaterThan(routeStart)
    const outboundRoute = routes.slice(routeStart, routeEnd)
    expect(outboundRoute).not.toContain('pageCode="sales.slip.list"')
  })
})
