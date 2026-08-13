import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { postSalesSlip } from './salesAccountingSlipApi'
import { postPurchaseSlip } from './purchaseAccountingSlipApi'
import { getSignatureShare, recordDriverSignature, recordSignature } from './signature'
import { updateCollectionPlanStatus } from './accounting'
import {
  convertPartnerOrderToSlip,
  deletePartnerOrder,
  getEstimate,
  getPartnerOrder,
  holdPartnerOrder,
  releasePartnerOrder,
  updatePartnerOrder,
} from './sales'

vi.mock('./client', () => ({
  apiClient: {
    delete: vi.fn(),
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}))

vi.mock('./mock', async () => {
  const actual = await vi.importActual<typeof import('./mock')>('./mock')
  return {
    ...actual,
    isMockMode: () => false,
  }
})

describe('문서번호 URL path 변환', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset()
    vi.mocked(apiClient.delete).mockReset()
    vi.mocked(apiClient.patch).mockReset()
    vi.mocked(apiClient.post).mockReset()
    vi.mocked(apiClient.put).mockReset()
    vi.mocked(apiClient.delete).mockResolvedValue({ data: { data: null } })
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: {} } })
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { data: {} } })
    vi.mocked(apiClient.post).mockResolvedValue({ data: { data: {} } })
    vi.mocked(apiClient.put).mockResolvedValue({ data: { data: {} } })
  })

  it('매출 회계전표 확정은 슬래시 slipNo를 하이픈 단일 세그먼트로 보낸다', async () => {
    await postSalesSlip('2026/05/20-1')

    expect(apiClient.post).toHaveBeenCalledWith('/admin/sales-slips/2026-05-20-1/post', {})
  })

  it('매입 회계전표 확정은 슬래시 slipNo를 하이픈 단일 세그먼트로 보낸다', async () => {
    await postPurchaseSlip('2026/05/20-2')

    expect(apiClient.post).toHaveBeenCalledWith('/admin/purchase-slips/2026-05-20-2/post', {})
  })

  it('인수자 서명은 슬래시 slipNo를 하이픈 단일 세그먼트로 보낸다', async () => {
    await recordSignature('batch-token', '2026/05/20-3', {
      signerName: '김인수',
      signaturePngBase64: 'data:image/png;base64,AAAA',
      clientHash: 'a'.repeat(64),
    })

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/public/batches/batch-token/slips/2026-05-20-3/signature',
      expect.any(Object),
    )
  })

  it('기사 서명은 슬래시 slipNo를 하이픈 단일 세그먼트로 보낸다', async () => {
    await recordDriverSignature('batch-token', '2026/05/20-4', {
      signaturePngBase64: 'data:image/png;base64,AAAA',
      clientHash: 'b'.repeat(64),
    })

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/public/batches/batch-token/slips/2026-05-20-4/driver-signature',
      expect.any(Object),
    )
  })

  it('인수자 view 조회는 게이트웨이 공개 서명 경로(/api/public/...)로 호출한다', async () => {
    await getSignatureShare('some-token')

    expect(apiClient.get).toHaveBeenCalledWith('/api/public/signatures/some-token')
  })

  it('수금계획 상태 전이는 슬래시 planNo를 하이픈 단일 세그먼트로 보낸다', async () => {
    await updateCollectionPlanStatus('2026/05/20-6', 'OVERDUE')

    expect(apiClient.patch).toHaveBeenCalledWith(
      '/accounting/collection-plans/2026-05-20-6/status',
      { status: 'OVERDUE' },
    )
  })

  it('견적서 인쇄 조회는 슬래시 estimateNumber를 하이픈 단일 세그먼트로 보낸다', async () => {
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: {
        data: {
          estimateNo: '2026/05/20-13',
          estimateDate: '2026-05-20',
          partnerName: '거래처',
          partnerBusinessNo: null,
          partnerAddress: null,
          validUntil: null,
          totalAmount: '0',
          memo: null,
          lines: [],
        },
      },
    })

    await getEstimate('2026/05/20-13')

    expect(apiClient.get).toHaveBeenCalledWith('/slips/estimates/2026-05-20-13')
  })

  it('거래처 주문 상세 조회는 슬래시 orderNumber를 하이픈 단일 세그먼트로 보낸다', async () => {
    await getPartnerOrder('2026/05/20-7')

    expect(apiClient.get).toHaveBeenCalledWith('/api/v1/partner-orders/2026-05-20-7')
  })

  it('거래처 주문 수정은 슬래시 orderNumber를 하이픈 단일 세그먼트로 보낸다', async () => {
    await updatePartnerOrder('2026/05/20-8', {
      updatedAt: '2026-05-20T10:00:00',
      partnerCode: 'P-001',
      bizCode: '1234567890',
      dueDate: null,
      memo: null,
      lines: [],
    })

    expect(apiClient.put).toHaveBeenCalledWith(
      '/api/v1/partner-orders/2026-05-20-8',
      expect.any(Object),
    )
  })

  it('거래처 주문 부분전환은 슬래시 orderNumber를 하이픈 단일 세그먼트로 보낸다', async () => {
    await convertPartnerOrderToSlip('2026/05/20-9', {
      warehouseCode: 'WH-001',
      items: [],
    })

    expect(apiClient.post).toHaveBeenCalledWith(
      '/api/v1/partner-orders/2026-05-20-9/convert-to-slip',
      expect.any(Object),
    )
  })

  it('거래처 주문 삭제는 슬래시 orderNumber를 하이픈 단일 세그먼트로 보낸다', async () => {
    await deletePartnerOrder('2026/05/20-10')

    expect(apiClient.delete).toHaveBeenCalledWith('/api/v1/partner-orders/2026-05-20-10')
  })

  it('거래처 주문 보류/해제는 슬래시 orderNumber를 하이픈 단일 세그먼트로 보낸다', async () => {
    await holdPartnerOrder('2026/05/20-11')
    await releasePartnerOrder('2026/05/20-12')

    expect(apiClient.post).toHaveBeenNthCalledWith(
      1,
      '/api/v1/partner-orders/2026-05-20-11/hold',
    )
    expect(apiClient.post).toHaveBeenNthCalledWith(
      2,
      '/api/v1/partner-orders/2026-05-20-12/release',
    )
  })
})
