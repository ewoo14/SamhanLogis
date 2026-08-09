import { describe, expect, it, vi } from 'vitest'
import { hydrateCurrentProductStatuses, isQuantityEditable } from './estimateLineStatus'

describe('hydrateCurrentProductStatuses', () => {
  it('저장본 라인도 현재 OUT_OF_STOCK 상태를 주입한다', async () => {
    const lines = await hydrateCurrentProductStatuses(
      [{ productId: 'out', status: null }, { productId: 'active', status: null }],
      async () => [
        { id: 'out', status: 'OUT_OF_STOCK' },
        { id: 'active', status: 'ACTIVE' },
      ],
    )

    expect(lines.map((line) => line.status)).toEqual(['OUT_OF_STOCK', 'ACTIVE'])
  })

  it('현재 상태가 ACTIVE이면 저장본의 stale 품절 상태를 해제한다', async () => {
    const lines = await hydrateCurrentProductStatuses(
      [{ productId: 'restored', status: 'OUT_OF_STOCK' }],
      async () => [{ id: 'restored', status: 'ACTIVE' }],
    )

    expect(lines[0].status).toBe('ACTIVE')
  })

  it('조회 실패는 상태를 미확정으로 낮춰 수량 편집을 막고 경고를 남긴다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const original = [{ productId: 'stale', status: 'ACTIVE' }]
    await expect(hydrateCurrentProductStatuses(original, async () => { throw new Error('lookup failed') }))
      .resolves.toEqual([{ productId: 'stale', status: null }])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('응답에 없는 품목도 미확정으로 낮춰 편집을 막는다', async () => {
    await expect(hydrateCurrentProductStatuses(
      [{ productId: 'missing', status: 'ACTIVE' }],
      async () => [],
    )).resolves.toEqual([{ productId: 'missing', status: null }])
  })

  it('수량은 품목 상태가 ACTIVE로 확정된 라인만 편집할 수 있다', () => {
    expect(isQuantityEditable(null, null)).toBe(true)
    expect(isQuantityEditable('product-1', 'ACTIVE')).toBe(true)
    expect(isQuantityEditable('product-1', 'OUT_OF_STOCK')).toBe(false)
    expect(isQuantityEditable('product-1', null)).toBe(false)
  })
})
