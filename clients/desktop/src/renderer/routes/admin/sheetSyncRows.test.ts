import { describe, expect, it } from 'vitest'
import { buildSheetSyncRows, type SheetSyncSummary } from './sheetSyncRows'

const result = (overrides: Record<string, unknown> = {}) => ({
  insertedRows: 1,
  updatedRows: 2,
  unchangedRows: 3,
  softDeletedProductRows: 4,
  skippedOccurrences: 0,
  ...overrides,
})

describe('buildSheetSyncRows', () => {
  it('API의 softDeletedComponentRows 3건을 화면에 3건으로 표시한다', () => {
    const rows = buildSheetSyncRows({
      byTab: {},
      byComponentTab: {
        구성품: { softDeletedComponentRows: 3 } as never,
      },
      failedTabs: 0,
    })

    expect(rows[0]?.result.softDeletedComponentRows).toBe(3)
  })

  it('RED-A: 전체 실패 11건을 failedTabs와 같은 11행으로 만든다', () => {
    const summary: SheetSyncSummary = {
      byTab: Object.fromEntries(
        Array.from({ length: 9 }, (_, index) => [`일반 탭 ${index + 1}`, result({ error: '일반 실패' })]),
      ),
      byComponentTab: {
        '싱글 구성품_단가인상': { error: '구성품 실패' },
        '상업멀티 구성품_단가인상': { error: '구성품 실패' },
      },
      failedTabs: 11,
    }

    const rows = buildSheetSyncRows(summary)

    expect(rows).toHaveLength(11)
    expect(rows.filter((row) => row.result.error)).toHaveLength(summary.failedTabs)
  })

  it('RED-B: 구성품을 구분하고 skip은 실패 행으로 중복하지 않으며 빈 구성품도 숨긴다', () => {
    const summary: SheetSyncSummary = {
      byTab: {
        성공: result(),
        'manual 보존': result({ skippedOccurrences: 2 }),
        부분실패: result({ error: '실패' }),
      },
      byComponentTab: {
        구성품실패: { error: '구성품 실패' },
        구성품성공: { linkedOccurrences: 2, bundlesMarkedProducts: 1, softDeletedComponentRows: 0, skippedOccurrences: 0 },
      },
      failedTabs: 2,
    }

    const rows = buildSheetSyncRows(summary)

    expect(rows).toHaveLength(5)
    expect(rows.filter((row) => row.result.error)).toHaveLength(2)
    expect(rows.find((row) => row.tabName === '구성품 · 구성품실패')).toBeDefined()
    expect(rows.find((row) => row.tabName === 'manual 보존')?.result.error).toBeUndefined()
    expect(buildSheetSyncRows({ byTab: summary.byTab, byComponentTab: {}, failedTabs: 1 })).toHaveLength(3)
  })
})
