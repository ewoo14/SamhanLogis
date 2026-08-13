import { describe, expect, it } from 'vitest'
import {
  buildSalesEditLinePayloads,
  removeSalesEditLine,
} from './SlipDetailPage'

const PRODUCT_1 = 'aaaaaaaa-0000-0000-0000-000000000001'
const PRODUCT_2 = 'aaaaaaaa-0000-0000-0000-000000000002'

describe('PR #1131 R4 fix — 기존 행 수량과 명시 삭제의 projection 경계', () => {
  it('RED-A-1: 기존 lineId 행의 수량 0을 payload에서 누락하지 않는다', () => {
    const payload = buildSalesEditLinePayloads([
      {
        key: 'existing-a', lineId: 'server-line-1', productId: PRODUCT_1,
        productName: '품목 A', modelName: 'A', quantity: 0, unitPrice: '1000',
      },
      {
        key: 'existing-b', lineId: 'server-line-2', productId: PRODUCT_2,
        productName: '품목 B', modelName: 'B', quantity: 2, unitPrice: '2000',
      },
    ])
    const lineIds = payload.map((line) => line.lineId)
    if (!lineIds.includes('server-line-1')) {
      console.log(
        `R4-QTY-ZERO|uiQuantity=0|payloadLines=${payload.length}`
          + `|omittedLineId=server-line-1|remainingLineId=${lineIds[0]}`,
      )
    }

    expect(payload).toEqual(expect.arrayContaining([
      expect.objectContaining({ lineId: 'server-line-1', quantity: 0 }),
    ]))
  })

  it('RED-B-3: 양수 수량 기존 lineId는 보존하고 신규 trailing draft는 제외한다', () => {
    const payload = buildSalesEditLinePayloads([
      {
        key: 'existing-a', lineId: 'server-line-1', productId: PRODUCT_1,
        productName: '품목 A', quantity: 3, unitPrice: '3000',
      },
      { key: 'draft', lineId: null, productId: '', productName: '', quantity: 1, unitPrice: '0' },
    ])

    expect(payload).toHaveLength(1)
    expect(payload[0]).toMatchObject({ lineId: 'server-line-1', quantity: 3 })
  })

  it('RED-B-5: 의도적 삭제는 삭제 함수로 행을 제거한 뒤 payload에서도 사라진다', () => {
    const rows = removeSalesEditLine([
      {
        key: 'existing-a', lineId: 'server-line-1', productId: PRODUCT_1,
        productName: '품목 A', quantity: 0, unitPrice: '1000',
      },
      {
        key: 'existing-b', lineId: 'server-line-2', productId: PRODUCT_2,
        productName: '품목 B', quantity: 2, unitPrice: '2000',
      },
    ], 'existing-a')

    expect(buildSalesEditLinePayloads(rows).map((line) => line.lineId))
      .toEqual(['server-line-2'])
  })
})
