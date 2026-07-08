import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import {
  getPriceChangeScheduleAdmin,
  updatePriceChangeSchedule,
  updateProductFixedDiscount,
} from './productCatalogApi'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
  },
}))

describe('productCatalogApi fixed discount contract', () => {
  beforeEach(() => {
    vi.mocked(apiClient.patch).mockReset()
  })

  it('PATCH /fixed-discount body에 null 고정DC를 그대로 전송한다', async () => {
    const row = { modelCode: 'AC100' }
    vi.mocked(apiClient.patch).mockResolvedValueOnce({ data: row })

    await expect(updateProductFixedDiscount('AC100', null)).resolves.toBe(row)

    expect(apiClient.patch).toHaveBeenCalledWith(
      '/api/v1/products/AC100/fixed-discount',
      { fixedDiscountRate: null },
    )
  })

  it('PATCH /fixed-discount body에 0~100 문자열 고정DC를 전송한다', async () => {
    const row = { modelCode: 'AC/100' }
    vi.mocked(apiClient.patch).mockResolvedValueOnce({ data: row })

    await expect(updateProductFixedDiscount('AC/100', '12.50')).resolves.toBe(row)

    expect(apiClient.patch).toHaveBeenCalledWith(
      '/api/v1/products/AC%2F100/fixed-discount',
      { fixedDiscountRate: '12.50' },
    )
  })
})

describe('productCatalogApi 단가변동 스케줄 admin 계약 (S4b #17)', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset()
    vi.mocked(apiClient.put).mockReset()
  })

  it('GET price-change-schedule admin 목록을 ApiResponse에서 unwrap 한다', async () => {
    const rows = [
      { category: 'homemulti', effectiveDate: '2026-08-01', defaultPreChange: false },
      { category: 'singleSets', effectiveDate: '2026-08-01', defaultPreChange: true },
      { category: 'commercialMulti', effectiveDate: '2026-08-01', defaultPreChange: false },
      { category: 'oldProducts', effectiveDate: '2026-08-01', defaultPreChange: false },
    ]
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: { success: true, code: 'OK', message: '', data: rows, timestamp: '' },
    })

    await expect(getPriceChangeScheduleAdmin()).resolves.toEqual(rows)

    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/products/admin/price-change-schedule')
  })

  it('PUT price-change-schedule/{category} 는 null-keep 부분수정 patch를 그대로 전송한다', async () => {
    const updated = { category: 'homemulti', effectiveDate: '2026-09-01', defaultPreChange: false }
    vi.mocked(apiClient.put).mockResolvedValueOnce({
      data: { success: true, code: 'OK', message: '', data: updated, timestamp: '' },
    })

    await expect(
      updatePriceChangeSchedule('homemulti', { effectiveDate: '2026-09-01', defaultPreChange: null }),
    ).resolves.toEqual(updated)

    expect(apiClient.put).toHaveBeenCalledWith(
      '/api/v1/products/admin/price-change-schedule/homemulti',
      { effectiveDate: '2026-09-01', defaultPreChange: null },
    )
  })

  it('PUT price-change-schedule/{category} 는 category 를 URI 인코딩한다', async () => {
    const updated = { category: 'singleSets', effectiveDate: '2026-09-01', defaultPreChange: true }
    vi.mocked(apiClient.put).mockResolvedValueOnce({
      data: { success: true, code: 'OK', message: '', data: updated, timestamp: '' },
    })

    await updatePriceChangeSchedule('singleSets', { defaultPreChange: true })

    expect(apiClient.put).toHaveBeenCalledWith(
      '/api/v1/products/admin/price-change-schedule/singleSets',
      { defaultPreChange: true },
    )
  })
})
