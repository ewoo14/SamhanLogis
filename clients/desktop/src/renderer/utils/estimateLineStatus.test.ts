import { describe, expect, it, vi } from 'vitest'
import { hydrateCurrentProductStatuses } from './estimateLineStatus'

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

  it('조회 실패는 라인을 보존하고 경고를 남긴다', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const original = [{ productId: 'stale', status: null }]
    await expect(hydrateCurrentProductStatuses(original, async () => { throw new Error('lookup failed') }))
      .resolves.toEqual(original)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
