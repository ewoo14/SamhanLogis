import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import {
  type PriceChangeScheduleCategory,
  getPriceChangeScheduleAdmin,
  updateClassificationFixedDiscount,
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

describe('productCatalogApi classification fixed discount contract', () => {
  beforeEach(() => {
    vi.mocked(apiClient.patch).mockReset()
  })

  it('분류 단계 정액DC율 PATCH는 ID를 인코딩하고 null 해제를 전송한다', async () => {
    const classification = { id: 'cat/1', fixedDiscountRate: null }
    vi.mocked(apiClient.patch).mockResolvedValueOnce({ data: classification })

    await expect(updateClassificationFixedDiscount('cat/1', null)).resolves.toBe(classification)

    expect(apiClient.patch).toHaveBeenCalledWith(
      '/api/v1/classifications/cat%2F1/fixed-discount',
      { fixedDiscountRate: null },
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

  it('PUT price-change-schedule/{category} 는 URL 에 category 세그먼트를 포함하며 실제로 encodeURIComponent 를 거친다', async () => {
    // 실제 4개 카테고리 키(homemulti/singleSets/commercialMulti/oldProducts)는 모두
    // URI 인코딩이 불필요한 안전 식별자라 위 테스트만으로는 encodeURIComponent 호출
    // 여부를 판별할 수 없다(판별력 0 — QA-M3). encodeURIComponent 가 실제로 적용되는지
    // 증명하기 위해 인코딩이 필요한 값을 타입 단언으로 주입해 URL 을 직접 검증한다.
    const updated = { category: 'singleSets', effectiveDate: '2026-09-01', defaultPreChange: true }
    vi.mocked(apiClient.put).mockResolvedValueOnce({
      data: { success: true, code: 'OK', message: '', data: updated, timestamp: '' },
    })

    await updatePriceChangeSchedule(
      'single/Sets' as unknown as PriceChangeScheduleCategory,
      { defaultPreChange: true },
    )

    const [url] = vi.mocked(apiClient.put).mock.calls[0]!
    expect(url).toBe('/api/v1/products/admin/price-change-schedule/single%2FSets')
    expect(url).not.toContain('single/Sets')
  })
})
