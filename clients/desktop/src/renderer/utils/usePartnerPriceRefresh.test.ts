// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { usePartnerPriceRefresh, type PartnerRepriceCandidate } from './usePartnerPriceRefresh'
import * as partnerPriceRefreshModule from './usePartnerPriceRefresh'

/** 재조회 후보 팩토리 — 필드만 덮어써서 테스트 의도를 좁게 표현한다. */
const candidate = (over: Partial<PartnerRepriceCandidate> = {}): PartnerRepriceCandidate => ({
  key: 'l1',
  productId: 'p1',
  currentUnitPrice: '1000',
  catalogFallback: '900',
  ...over,
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => { resolve = next })
  return { promise, resolve }
}

describe('usePartnerPriceRefresh (D-R8-10 공용 재조회 훅)', () => {
  it('소비자 적용 가드는 최신 seq·현재 거래처·훅 current가 모두 일치할 때만 통과한다', () => {
    const isCurrent = (
      partnerPriceRefreshModule as unknown as {
        partnerRepriceSessionIsCurrent?: (
          requestSeq: number,
          currentSeq: number,
          requestedPartnerId: string,
          currentPartnerId: string,
          hookIsCurrent: boolean,
        ) => boolean
      }
    ).partnerRepriceSessionIsCurrent

    expect(isCurrent?.(2, 2, 'B', 'B', true)).toBe(true)
    expect(isCurrent?.(1, 2, 'A', 'B', true)).toBe(false)
    expect(isCurrent?.(2, 2, 'A', 'B', true)).toBe(false)
    expect(isCurrent?.(2, 2, 'B', 'B', false)).toBe(false)
  })

  it('hit=REMEMBERED·miss=CATALOG fallback 로 해석하고 changed 를 판정한다', async () => {
    const fetchMemories = vi.fn().mockResolvedValue({
      hits: [{ productId: 'p1', unitPrice: 2000, source: 'LINE_SAVE', updatedAt: '2026-07-16' }],
      failedProductIds: [],
    })
    const { result } = renderHook(() => usePartnerPriceRefresh({ fetchMemories }))

    const run = await result.current.run('partnerX', [
      candidate({ key: 'l1', productId: 'p1', currentUnitPrice: '1000' }),
      candidate({ key: 'l2', productId: 'p2', currentUnitPrice: '500', catalogFallback: '500' }),
    ])

    expect(fetchMemories).toHaveBeenCalledWith('partnerX', ['p1', 'p2'])
    expect(run.isCurrent()).toBe(true)
    const byKey = Object.fromEntries(run.outcomes.map((o) => [o.key, o]))
    expect(byKey['l1']).toMatchObject({ unitPrice: '2000', source: 'REMEMBERED', changed: true, updatedAt: '2026-07-16' })
    expect(byKey['l2']).toMatchObject({ unitPrice: '500', source: 'CATALOG', changed: false, updatedAt: null })
  })

  it('최근단가 miss는 유효한 고정/전역DC를 판매가보다 우선해 해석한다', async () => {
    const fetchMemories = vi.fn().mockResolvedValue({ hits: [], failedProductIds: [] })
    const { result } = renderHook(() => usePartnerPriceRefresh({ fetchMemories }))

    const run = await result.current.run('partnerX', [candidate({
      currentUnitPrice: '1355640',
      catalogFallback: '2607000',
      discountInput: {
        fixedDiscountRate: null,
        category: 'HOMEMULTI',
        hasVariableDiscount: true,
      },
    })], { homeMultiDc: '45%', commercialMultiDc: null })

    expect(run.outcomes[0]).toMatchObject({
      unitPrice: '1433850',
      source: 'CATALOG',
      discountInfo: '거래처 전역DC 45% 적용',
    })
  })

  it('fetch 자체가 실패하면 전량 CATALOG fallback 으로 수렴한다', async () => {
    const fetchMemories = vi.fn().mockRejectedValue(new Error('forbidden'))
    const { result } = renderHook(() => usePartnerPriceRefresh({ fetchMemories }))

    const run = await result.current.run('partnerX', [candidate({ currentUnitPrice: '1000', catalogFallback: '900' })])

    expect(run.isCurrent()).toBe(true)
    expect(run.outcomes[0]).toMatchObject({ unitPrice: '900', source: 'CATALOG', changed: true, updatedAt: null })
  })

  it('카탈로그 판매가가 미확보면 옛 거래처 단가를 보존하지 않고 UNAVAILABLE 로 반환한다', async () => {
    const fetchMemories = vi.fn().mockResolvedValue({ hits: [], failedProductIds: [] })
    const { result } = renderHook(() => usePartnerPriceRefresh({ fetchMemories }))

    const run = await result.current.run('partnerX', [candidate({
      currentUnitPrice: '777000',
      catalogFallback: null,
    })])

    expect(run.outcomes[0]).toMatchObject({
      unitPrice: '',
      source: 'UNAVAILABLE',
      changed: true,
      updatedAt: null,
    })
  })

  it('재조회 Promise 가 끝날 때까지 isPending=true 를 유지한다', async () => {
    const pending = deferred<{ hits: []; failedProductIds: string[] }>()
    const fetchMemories = vi.fn().mockReturnValue(pending.promise)
    const { result } = renderHook(() => usePartnerPriceRefresh({ fetchMemories }))

    let runPromise!: ReturnType<typeof result.current.run>
    act(() => { runPromise = result.current.run('partnerX', [candidate()]) })
    expect(result.current.isPending).toBe(true)

    await act(async () => {
      pending.resolve({ hits: [], failedProductIds: [] })
      await runPromise
    })
    expect(result.current.isPending).toBe(false)
  })

  it('재조회가 끝나지 않아도 제한시간 후 CATALOG fallback 으로 저장을 막지 않는다', async () => {
    vi.useFakeTimers()
    try {
      const fetchMemories = vi.fn().mockReturnValue(new Promise(() => undefined))
      const { result } = renderHook(() => usePartnerPriceRefresh({ fetchMemories }))

      let runPromise!: ReturnType<typeof result.current.run>
      act(() => { runPromise = result.current.run('partnerX', [candidate()]) })
      expect(result.current.isPending).toBe(true)

      let settled = false
      void runPromise.then(() => { settled = true })
      await act(async () => { vi.advanceTimersByTime(5001) })

      expect(settled).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('후속 run 이 이전 run 을 supersede 한다 (isCurrent 로 stale 폐기)', async () => {
    const fetchMemories = vi.fn().mockResolvedValue({ hits: [], failedProductIds: [] })
    const { result } = renderHook(() => usePartnerPriceRefresh({ fetchMemories }))

    const first = await result.current.run('A', [candidate()])
    const second = await result.current.run('B', [candidate()])

    expect(first.isCurrent()).toBe(false)
    expect(second.isCurrent()).toBe(true)
  })

  it('invalidate 후에는 진행 중 run 의 isCurrent 가 false 가 된다 (거래처 해제)', async () => {
    const fetchMemories = vi.fn().mockResolvedValue({ hits: [], failedProductIds: [] })
    const { result } = renderHook(() => usePartnerPriceRefresh({ fetchMemories }))

    const run = await result.current.run('A', [candidate()])
    result.current.invalidate()

    expect(run.isCurrent()).toBe(false)
  })

  it('후보 0건이면 fetch 하지 않고 빈 outcome 을 반환한다', async () => {
    const fetchMemories = vi.fn()
    const { result } = renderHook(() => usePartnerPriceRefresh({ fetchMemories }))

    const run = await result.current.run('A', [])

    expect(run.outcomes).toEqual([])
    expect(run.isCurrent()).toBe(true)
    expect(fetchMemories).not.toHaveBeenCalled()
  })
})
