import { describe, expect, it, vi } from 'vitest'
import { refreshDpsHistoryQueries } from './dpsHistoryRefresh'

describe('DPS 저장내역 갱신', () => {
  it('저장 성공 후 DPS_COMPARE 목록 query를 무효화한다', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined)

    await refreshDpsHistoryQueries({ invalidateQueries } as never)

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['dps-history-list', 'DPS_COMPARE'],
    })
  })
})
