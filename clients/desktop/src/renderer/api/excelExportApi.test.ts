import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { exportJournals, exportPartners, exportSlips, exportStocks } from './excelExportApi'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}))

describe('excelExportApi gateway 경로', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset()
    vi.mocked(apiClient.get).mockResolvedValue({ data: new Blob() })
  })

  it('4개 export 는 현재 gateway 의 no-prefix controller 경로를 호출한다', async () => {
    await exportPartners({ q: 'P-2026-0001' })
    await exportSlips()
    await exportJournals({ from: '2026-01-01', to: '2026-12-31' })
    await exportStocks()

    expect(vi.mocked(apiClient.get).mock.calls.map(([path]) => path)).toEqual([
      '/admin/partners/export.xlsx',
      '/slips/export.xlsx',
      '/accounting/journals/export.xlsx',
      '/inventory/stocks/export.xlsx',
    ])
  })

  // #907 재수렴 R — 화면 검색/필터가 export 파라미터에서 전량 누락되어 있던 결함(발견 1)
  // 회귀 가드. SalesQueryPage/PurchaseQueryPage 검색모달 필드 + SlipListPage 배송태그가
  // 실제로 axios params 에 실려나가는지 계약 수준에서 고정한다.
  it('exportSlips 는 검색모달 필드(searchSlipNo 등)를 params 로 그대로 전달한다', async () => {
    await exportSlips({
      slipType: 'OUTBOUND',
      from: '2026-01-01',
      to: '2026-01-31',
      searchSlipNo: '2026/07/18-4',
      searchPartnerName: '강릉HVAC솔루션',
      searchBusinessNumber: '334-26-10558',
      searchDeliveryAddress: '서울 강남',
      searchProjectName: '잠실 주상복합',
    })

    const [, config] = vi.mocked(apiClient.get).mock.calls[0]
    expect(config?.params).toMatchObject({
      slipType: 'OUTBOUND',
      searchSlipNo: '2026/07/18-4',
      searchPartnerName: '강릉HVAC솔루션',
      searchBusinessNumber: '334-26-10558',
      searchDeliveryAddress: '서울 강남',
      searchProjectName: '잠실 주상복합',
    })
  })

  it('exportSlips 는 deliveryTag/includeDeleted 를 params 로 전달한다(SlipListPage 파리티)', async () => {
    await exportSlips({
      slipType: 'OUTBOUND',
      deliveryTag: 'DAY',
      includeDeleted: true,
    })

    const [, config] = vi.mocked(apiClient.get).mock.calls[0]
    expect(config?.params).toMatchObject({
      slipType: 'OUTBOUND',
      deliveryTag: 'DAY',
      includeDeleted: true,
    })
    // from/to 는 화면에 기간 UI 가 없으므로 보내지 않는다 — 당월로 임의로 좁히지 않는다(P-2).
    expect(config?.params).not.toHaveProperty('from')
    expect(config?.params).not.toHaveProperty('to')
  })

  it('exportJournals 는 from/to 없이도 호출 가능하다(분개장 화면에 기간 UI 없음, P-2)', async () => {
    await exportJournals({ status: 'POSTED' })

    const [, config] = vi.mocked(apiClient.get).mock.calls[0]
    expect(config?.params).toMatchObject({ status: 'POSTED' })
    expect(config?.params).not.toHaveProperty('from')
    expect(config?.params).not.toHaveProperty('to')
  })
})
