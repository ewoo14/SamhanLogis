import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
}))

vi.mock('./client', () => ({ apiClient: apiClientMock }))

import {
  acceptEstimate,
  changeEstimateOwner,
  convertEstimate,
  getEstimate,
  listAssignedEstimates,
  listEstimates,
  rejectEstimate,
  restoreEstimate,
  sendEstimate,
  updateEstimate,
} from './estimateApi'

describe('estimate API money normalization', () => {
  beforeEach(() => vi.resetAllMocks())

  it('견적 상세 조회는 슬래시 문서번호를 단일 하이픈 path id로 보낸다', async () => {
    apiClientMock.get.mockResolvedValue({ data: { data: { lines: [] } } })

    await getEstimate('2026/08/10-9')

    expect(apiClientMock.get).toHaveBeenCalledWith('/slips/estimates/2026-08-10-9')
  })

  it('normalizes BigDecimal JSON numbers to canonical strings at the response boundary', async () => {
    apiClientMock.get.mockResolvedValue({
      data: {
        data: {
          id: 'estimate-1',
          totalSupply: 10000,
          totalVat: 1000,
          totalAmount: 11000,
          lines: [{
            id: 'line-1',
            unitPrice: 10000,
            unitPriceWithVat: null,
            supplyAmount: 10000,
            vatAmount: 1000,
            lineTotal: 11000,
          }],
        },
      },
    })

    const estimate = await getEstimate('estimate-1')

    expect(estimate).toMatchObject({
      totalSupply: '10000',
      totalVat: '1000',
      totalAmount: '11000',
      lines: [{
        unitPrice: '10000',
        unitPriceWithVat: null,
        supplyAmount: '10000',
        vatAmount: '1000',
        lineTotal: '11000',
      }],
    })
  })
})

describe('estimate API soft-delete population', () => {
  beforeEach(() => vi.resetAllMocks())

  it('sends includeDeleted only for an explicit deleted-document view', async () => {
    apiClientMock.get.mockResolvedValue({ data: { data: { content: [], totalElements: 0 } } })

    await listEstimates({ page: 0, size: 50 })
    expect(apiClientMock.get).toHaveBeenLastCalledWith('/slips/estimates', {
      params: { page: 0, size: 50 },
    })

    await listEstimates({ page: 0, size: 50, includeDeleted: true })
    expect(apiClientMock.get).toHaveBeenLastCalledWith('/slips/estimates', {
      params: { page: 0, size: 50, includeDeleted: 'true' },
    })
  })
})

describe('estimate owner surface contract', () => {
  beforeEach(() => vi.resetAllMocks())

  it('uses assigned-only endpoint for web and estimate-only owner mutation for desktop', async () => {
    apiClientMock.get.mockResolvedValue({ data: { data: { content: [], totalElements: 0 } } })
    apiClientMock.patch.mockResolvedValue({ data: { data: {
      id: 'estimate-1', totalSupply: 0, totalVat: 0, totalAmount: 0, lines: [],
    } } })

    await listAssignedEstimates({ page: 0, size: 20 })
    expect(apiClientMock.get).toHaveBeenLastCalledWith('/slips/estimates/assigned', {
      params: { page: 0, size: 20 },
    })

    await changeEstimateOwner('estimate-1', { requesterId: 'owner-2', documentType: 'ESTIMATE' })
    expect(apiClientMock.patch).toHaveBeenCalledWith('/slips/estimates/estimate-1/owner', {
      requesterId: 'owner-2', documentType: 'ESTIMATE',
    })
  })
})

describe('estimate document-number path family', () => {
  beforeEach(() => vi.resetAllMocks())

  it('all estimate item requests use the same hyphen path id conversion', async () => {
    apiClientMock.get.mockResolvedValue({ data: { data: { lines: [] } } })
    apiClientMock.put.mockResolvedValue({ data: { data: { lines: [] } } })
    apiClientMock.post.mockResolvedValue({ data: { data: { lines: [] } } })
    apiClientMock.patch.mockResolvedValue({ data: { data: { lines: [] } } })
    const id = '2026/08/10-9'

    await updateEstimate(id, { lines: [] } as never)
    await sendEstimate(id)
    await acceptEstimate(id)
    await rejectEstimate(id)
    await convertEstimate(id)
    await restoreEstimate(id)

    const paths = [
      '/slips/estimates/2026-08-10-9',
      '/slips/estimates/2026-08-10-9/send',
      '/slips/estimates/2026-08-10-9/accept',
      '/slips/estimates/2026-08-10-9/reject',
      '/slips/estimates/2026-08-10-9/convert',
      '/slips/estimates/2026-08-10-9/restore',
    ]
    expect([
      ...apiClientMock.put.mock.calls,
      ...apiClientMock.post.mock.calls,
    ].map(([path]) => path)).toEqual(paths)
  })
})
