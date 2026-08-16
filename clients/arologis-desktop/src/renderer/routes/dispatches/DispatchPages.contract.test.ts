import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const routeDir = resolve(__dirname)

describe('아로로지스 배차 5개 메뉴 화면 계약', () => {
  it('각 메뉴가 다른 화면 구현을 직접 가리키며 화면 간 re-export를 사용하지 않는다', () => {
    const sources = {
      manual: readFileSync(resolve(routeDir, 'ManualDispatchPage.tsx'), 'utf8'),
      preClassify: readFileSync(resolve(routeDir, 'PreClassifyPage.tsx'), 'utf8'),
      unassigned: readFileSync(resolve(routeDir, 'UnassignedPage.tsx'), 'utf8'),
      reconcile: readFileSync(resolve(routeDir, 'DispatchReconcilePage.tsx'), 'utf8'),
      receivedGroups: readFileSync(resolve(routeDir, 'ReceivedGroupsPage.tsx'), 'utf8'),
    }

    expect(sources.manual).toContain("usePageTitle('arologis 수동 배차')")
    expect(sources.preClassify).toContain("usePageTitle('가배차 분류')")
    expect(sources.unassigned).toContain("usePageTitle('미배차 리스트')")
    expect(sources.reconcile).toContain("usePageTitle('운송사 실배차 비교')")
    expect(sources.receivedGroups).toContain("usePageTitle('수신 배차 그룹')")

    expect(sources.preClassify).not.toMatch(/export\s*\{[^}]*ReceivedGroupsPage/)
    expect(Object.values(sources).filter((source) => /export\s*\{/.test(source))).toHaveLength(0)
  })
})
