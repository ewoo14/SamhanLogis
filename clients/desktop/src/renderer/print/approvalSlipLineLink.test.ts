import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SlipLineDetail } from '../api/slip'
import { getOutboundSlipBySlipNo } from '../api/slip'
import { buildApprovalRenderModel, projectSlipLineItems } from './approvalRenderModel'
import { loadApprovalSlipLineItems } from './approvalSlipLineItems'

vi.mock('../api/slip', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/slip')>()),
  getOutboundSlipBySlipNo: vi.fn(),
}))

const getOutboundSlipBySlipNoMock = vi.mocked(getOutboundSlipBySlipNo)

const line = (overrides: Partial<SlipLineDetail> = {}): SlipLineDetail => ({
  id: '11111111-1111-4111-8111-111111111111',
  productId: '22222222-2222-4222-8222-222222222222',
  productName: '테스트 품목',
  modelName: 'MODEL-01',
  specification: '규격-A',
  quantity: 2,
  unitPrice: '1000',
  lineTotal: '2000',
  note: '비고',
  supplyAmount: '1818',
  vatAmount: '182',
  ...overrides,
})

beforeEach(() => vi.resetAllMocks())

describe('결재문서 출고전표 참조 품목 연결', () => {
  it('참조 출고전표의 SlipDetail.lines를 인쇄 품목 행으로 보여준다', () => {
    const lines: SlipLineDetail[] = [line()]

    const projected = projectSlipLineItems(lines)

    expect(projected).toEqual([
      {
        productName: '테스트 품목',
        modelName: 'MODEL-01',
        specification: '규격-A',
        quantity: 2,
        supplyAmount: '1818',
        vatAmount: '182',
        lineTotal: '2000',
        note: '비고',
      },
    ])
  })

  it('연결된 라인은 결재 렌더 모델의 detail source가 되고 UUID는 제거된다', () => {
    const model = buildApprovalRenderModel({
      approval: {
        approvalNo: 'GW-1',
        title: '품목 연결 테스트',
        content: null,
        fieldValues: {},
        steps: [],
      } as never,
      templateFields: [],
      attachments: [],
      slipLineItems: [line()],
    })

    expect(model.body.lineItemsAvailability).toBe('CONNECTED')
    expect(model.body.lineItems[0]).toEqual({
      productName: '테스트 품목',
      modelName: 'MODEL-01',
      specification: '규격-A',
      quantity: 2,
      supplyAmount: '1818',
      vatAmount: '182',
      lineTotal: '2000',
      note: '비고',
    })
    expect(JSON.stringify(model)).not.toContain('11111111-1111-4111-8111-111111111111')
    expect(JSON.stringify(model)).not.toContain('22222222-2222-4222-8222-222222222222')
  })

  it('참조가 없으면 기존 결재문서를 막지 않고 연결 불가 결과를 반환한다', async () => {
    await expect(loadApprovalSlipLineItems([
      {
        id: 'attachment-id',
        attachmentType: 'FILE',
        label: null,
        displayOrder: 1,
        refSlipNo: null,
        refSlipType: null,
        refPartnerCode: null,
        refPartnerName: null,
        refPeriod: null,
        refDocType: null,
        refDocNo: null,
        refDocLabel: null,
        fileName: 'document.pdf',
        contentType: 'application/pdf',
        fileSize: 1,
        downloadUrl: null,
      },
    ])).resolves.toBeNull()
    expect(getOutboundSlipBySlipNoMock).not.toHaveBeenCalled()
  })

  it('끊긴 참조는 문서 전체를 막지 않고 품목 연결 불가로 수렴한다', async () => {
    getOutboundSlipBySlipNoMock.mockRejectedValue(new Error('forbidden or missing'))

    const result = await loadApprovalSlipLineItems([{
      id: 'attachment-id',
      attachmentType: 'SLIP_REF',
      label: '출고전표',
      displayOrder: 1,
      refSlipNo: null,
      refSlipType: null,
      refPartnerCode: null,
      refPartnerName: null,
      refPeriod: null,
      refDocType: 'OUTBOUND_SLIP',
      refDocNo: '2026/08/12-1',
      refDocLabel: '2026/08/12-1',
      fileName: null,
      contentType: null,
      fileSize: null,
      downloadUrl: null,
    }])

    expect(result).toBeNull()
  })
})
