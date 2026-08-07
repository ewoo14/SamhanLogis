import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}))

vi.mock('./client', () => ({ apiClient: apiClientMock }))

import { getEstimate, listEstimates } from './estimateApi'

describe('estimate API money normalization', () => {
  beforeEach(() => vi.resetAllMocks())

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
