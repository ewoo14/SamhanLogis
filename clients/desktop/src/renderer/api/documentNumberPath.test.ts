import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import { postSalesSlip } from './salesAccountingSlipApi'
import { postPurchaseSlip } from './purchaseAccountingSlipApi'
import { recordDriverSignature, recordSignature } from './signature'
import { getAccountingOrder } from './accountingAdminApi'
import { updateCollectionPlanStatus } from './accounting'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    patch: vi.fn(),
    post: vi.fn(),
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
    vi.mocked(apiClient.patch).mockReset()
    vi.mocked(apiClient.post).mockReset()
    vi.mocked(apiClient.get).mockResolvedValue({ data: { data: {} } })
    vi.mocked(apiClient.patch).mockResolvedValue({ data: { data: {} } })
    vi.mocked(apiClient.post).mockResolvedValue({ data: '' })
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
      '/public/batches/batch-token/slips/2026-05-20-3/signature',
      expect.any(Object),
    )
  })

  it('기사 서명은 슬래시 slipNo를 하이픈 단일 세그먼트로 보낸다', async () => {
    await recordDriverSignature('batch-token', '2026/05/20-4', {
      signaturePngBase64: 'data:image/png;base64,AAAA',
      clientHash: 'b'.repeat(64),
    })

    expect(apiClient.post).toHaveBeenCalledWith(
      '/public/batches/batch-token/slips/2026-05-20-4/driver-signature',
      expect.any(Object),
    )
  })

  it('회계 admin 주문 상세는 슬래시 orderNo를 하이픈 단일 세그먼트로 보낸다', async () => {
    await getAccountingOrder('2026/05/20-5')

    expect(apiClient.get).toHaveBeenCalledWith('/accounting/orders/2026-05-20-5')
  })

  it('수금계획 상태 전이는 슬래시 planNo를 하이픈 단일 세그먼트로 보낸다', async () => {
    await updateCollectionPlanStatus('2026/05/20-6', 'OVERDUE')

    expect(apiClient.patch).toHaveBeenCalledWith(
      '/accounting/collection-plans/2026-05-20-6/status',
      { status: 'OVERDUE' },
    )
  })
})
