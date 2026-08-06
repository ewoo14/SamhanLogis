import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('./client', () => ({ apiClient: apiClientMock }))

import { duplicateSlip, expandBundleLine, getPriceMemories, toApiBundleSetOptions } from './slip'

describe('slip price contract', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    apiClientMock.post.mockResolvedValue({ data: { data: {} } })
  })

  // R6-H2: 전표 복사는 BE POST /slips/{id}/duplicate 서버 복사로 전환 — FE 가 전개된
  // 구성품 라인을 평면 본문으로 재-POST 하면 세트 계보(setHead/parentSetModel)가 소실되고
  // 구성품 배분가가 복사 1클릭마다 가격기억에 각인된다. 구 계약(legacy VAT 분기 재조립)
  // 테스트 2건은 서버 복사 계약 테스트로 대체.
  it('duplicates through the BE endpoint without assembling a flat create body', async () => {
    const created = {
      id: 'slip-copy',
      slipType: 'OUTBOUND',
      status: 'DRAFT',
      lines: [{ id: 'line-copy-1', setHead: true, parentSetModel: 'SET-HM2WAY' }],
    }
    apiClientMock.post.mockResolvedValueOnce({ data: { data: created } })

    await expect(duplicateSlip('slip-source')).resolves.toBe(created)

    expect(apiClientMock.post).toHaveBeenCalledTimes(1)
    expect(apiClientMock.post).toHaveBeenCalledWith('/slips/slip-source/duplicate')
    // 구 결함 경로 회귀 가드 — 평면 POST /slips 재생성 호출이 없어야 한다.
    expect(apiClientMock.post).not.toHaveBeenCalledWith('/slips', expect.anything())
  })

  it('duplicate escapes the source id as a path param', async () => {
    await duplicateSlip('slip/../escape')

    expect(apiClientMock.post).toHaveBeenCalledWith('/slips/slip%2F..%2Fescape/duplicate')
  })

  it('bulk lookup posts unique productIds and returns partial hits unchanged', async () => {
    const hit = {
      productId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      unitPrice: 123000,
      source: 'LINE_SAVE',
      updatedAt: '2099-01-01T09:00:00',
    }
    apiClientMock.post.mockResolvedValueOnce({ data: { data: [hit] } })

    await expect(getPriceMemories(
      '11111111-1111-1111-1111-111111111111',
      [hit.productId, hit.productId, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'],
    )).resolves.toEqual({ hits: [hit], failedProductIds: [] })
    expect(apiClientMock.post).toHaveBeenCalledWith('/slips/price-memory/bulk', {
      partnerId: '11111111-1111-1111-1111-111111111111',
      productIds: [hit.productId, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'],
    })
  })

  // R4-F5: 고유 품목 101개↑ 에서 throw → 전 라인 조용히 CATALOG 강등되던 결함의 회귀 가드.
  it('bulk lookup chunks 101+ unique productIds into sequential 100-size calls', async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `product-${String(i).padStart(3, '0')}`)
    const hitFirstChunk = {
      productId: 'product-000',
      unitPrice: 1000,
      source: 'LINE_SAVE',
      updatedAt: '2099-01-01T09:00:00',
    }
    const hitSecondChunk = {
      productId: 'product-149',
      unitPrice: 2000,
      source: 'LINE_SAVE',
      updatedAt: '2099-01-02T09:00:00',
    }
    apiClientMock.post
      .mockResolvedValueOnce({ data: { data: [hitFirstChunk] } })
      .mockResolvedValueOnce({ data: { data: [hitSecondChunk] } })

    await expect(getPriceMemories('partner-1', ids)).resolves.toEqual({
      hits: [hitFirstChunk, hitSecondChunk],
      failedProductIds: [],
    })

    expect(apiClientMock.post).toHaveBeenCalledTimes(2)
    expect(apiClientMock.post).toHaveBeenNthCalledWith(1, '/slips/price-memory/bulk', {
      partnerId: 'partner-1',
      productIds: ids.slice(0, 100),
    })
    expect(apiClientMock.post).toHaveBeenNthCalledWith(2, '/slips/price-memory/bulk', {
      partnerId: 'partner-1',
      productIds: ids.slice(100),
    })
  })

  it('bulk lookup preserves successful chunk hits and reports only failed chunk productIds', async () => {
    // R5-M2: 후반 chunk 실패가 앞 chunk 정상 hit 를 버리면 기억단가가 판매가로 오염된다.
    const ids = Array.from({ length: 101 }, (_, i) => `product-${i}`)
    const firstChunkHit = {
      productId: ids[0],
      unitPrice: 123000,
      source: 'LINE_SAVE',
      updatedAt: '2099-01-01T09:00:00',
    }
    apiClientMock.post
      .mockResolvedValueOnce({ data: { data: [firstChunkHit] } })
      .mockRejectedValueOnce(new Error('bulk chunk failed'))

    await expect(getPriceMemories('partner-1', ids)).resolves.toEqual({
      hits: [firstChunkHit],
      failedProductIds: [ids[100]],
    })
    expect(apiClientMock.post).toHaveBeenCalledTimes(2)
  })

  it('bulk lookup still rejects an empty productIds list', async () => {
    await expect(getPriceMemories('partner-1', [])).rejects.toThrow(/at least 1 unique/)
    expect(apiClientMock.post).not.toHaveBeenCalled()
  })
})

describe('slip bundle expansion contract', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('passes the parent specification together with set options to the preview endpoint', async () => {
    apiClientMock.post.mockResolvedValueOnce({ data: { data: [] } })

    await expandBundleLine({
      parentModelCode: 'SET-1',
      quantity: 2,
      unitPrice: '10000',
      specification: '현장규격',
      setOptions: {
        remoteOption: 'REMOTE-X',
        remoteExcluded: false,
        panelOption: '블랙판넬',
        panelShape360: '사각',
        materialIncluded: true,
      },
    } as any)

    expect(apiClientMock.post).toHaveBeenCalledWith('/slips/expand-line', expect.objectContaining({
      specification: '현장규격',
      setOptions: expect.objectContaining({ remoteOption: 'REMOTE-X' }),
    }))
  })

  it('RED-A: 판넬 모델코드처럼 서버 도메인 밖의 값은 기본 옵션으로 정규화한다', () => {
    expect(toApiBundleSetOptions('BUNDLE', { panelOption: 'PC6NUCK1NW' })).toEqual(expect.objectContaining({
      panelOption: null,
    }))
  })
})
