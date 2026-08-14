import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiClientMock = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
}))

vi.mock('./client', () => ({ apiClient: apiClientMock }))

import { updatePurchaseSlip, updateSalesSlip, type SlipUpdateRequest } from './slip'
import { updateEstimate, type UpdateEstimateRequest } from './estimateApi'
import { withLineIdContract } from './lineIdContract'

/**
 * #809 D-R8-9 — lineId 계약 마커의 FE 가드.
 *
 * <p><b>왜 이 파일이 필요한가</b>: 마커는 <b>payload 에 실제로 실릴 때만</b> 의미가 있다. BE 는
 * 마커 없는 요청을 구 클라이언트로 판정해 400 으로 거부하므로, 스탬프가 빠진 저장 경로는
 * <b>전량 400</b> 이 된다 — 그런데 그 사실은 라이브에서야 드러난다. 여기서 각 저장 경로의
 * wire payload 를 직접 열어 마커를 확인한다.
 *
 * <p>이 PR 의 간판 계약(lineId 왕복)은 도입 커밋의 FE diff 가 18줄·테스트 0 이었고, 그 결과
 * BLOCKING 결함이 vitest 749건을 그대로 통과했다. 같은 실수를 반복하지 않는다.
 */

const SLIP_BODY: SlipUpdateRequest = {
  updatedAt: '2026-07-16T09:00:00',
  partnerId: '44f0cfc1-4a5f-4206-85cd-04ad5fa70922',
  partnerName: '한울냉열시스템',
  lines: [
    {
      lineId: '11111111-1111-1111-1111-111111111111',
      productId: 'aaaaaaaa-0000-0000-0000-000000000001',
      quantity: 1,
      unitPrice: '330000',
    },
  ],
}

const ESTIMATE_BODY: UpdateEstimateRequest = {
  partnerId: '44f0cfc1-4a5f-4206-85cd-04ad5fa70922',
  partnerName: '한울냉열시스템',
  lines: [
    {
      lineId: '11111111-1111-1111-1111-111111111111',
      productId: 'aaaaaaaa-0000-0000-0000-000000000001',
      quantity: 1,
      unitPrice: '330000',
    },
  ],
}

/** 마지막 PUT 의 body 를 꺼낸다. */
function lastPutBody(): Record<string, unknown> {
  const call = apiClientMock.put.mock.calls.at(-1)
  return call?.[1] as Record<string, unknown>
}

describe('lineId 계약 마커 — 저장 payload 스탬프 (D-R8-9)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    apiClientMock.put.mockResolvedValue({ data: { data: { id: 'doc-1', lines: [] } } })
  })

  it('입고 전표 PUT 이 마커를 싣는다', async () => {
    await updatePurchaseSlip('slip-1', SLIP_BODY)

    expect(apiClientMock.put).toHaveBeenCalledTimes(1)
    expect(lastPutBody()['lineIdContract']).toBe(true)
  })

  it('출고 전표 PUT 이 마커를 싣는다 (매입/매출 비대칭 가드)', async () => {
    await updateSalesSlip('slip-1', SLIP_BODY)

    expect(apiClientMock.put).toHaveBeenCalledWith(
      '/slips/slip-1/sales',
      expect.objectContaining({ lineIdContract: true }),
    )
  })

  it('견적 PUT 이 마커를 싣는다 (전표/견적 비대칭 가드)', async () => {
    await updateEstimate('estimate-1', ESTIMATE_BODY)

    expect(apiClientMock.put).toHaveBeenCalledWith(
      '/slips/estimates/estimate-1',
      expect.objectContaining({ lineIdContract: true }),
    )
  })

  it('마커를 얹어도 기존 payload 필드가 그대로 보존된다', async () => {
    await updateSalesSlip('slip-1', SLIP_BODY)

    const body = lastPutBody()
    // 마커 스탬프가 라인/거래처를 갈아엎으면 안 된다 — spread 사고 가드.
    expect(body).toMatchObject({
      updatedAt: '2026-07-16T09:00:00',
      partnerId: '44f0cfc1-4a5f-4206-85cd-04ad5fa70922',
      partnerName: '한울냉열시스템',
      lineIdContract: true,
    })
    expect(body['lines']).toEqual(SLIP_BODY.lines)
  })

  /**
   * 🔴 전 라인 교체(lineId 0개) 저장에도 마커가 실려야 한다 — D-R8-9 오탐 제거의 FE 측.
   *
   * <p>이 요청은 lineId 가 하나도 없어 서버가 라인만 보고는 구 클라이언트와 구분할 수 없다.
   * 마커가 곧 그 구분이므로, 이 경로에서 마커가 빠지면 정상 저장이 400 이 된다.
   */
  it('전 라인을 새 라인으로 교체하는 저장(lineId 0개)에도 마커가 실린다', async () => {
    await updateSalesSlip('slip-1', {
      ...SLIP_BODY,
      lines: [
        { productId: 'aaaaaaaa-0000-0000-0000-000000000002', quantity: 2, unitPrice: '150000' },
        { productId: 'aaaaaaaa-0000-0000-0000-000000000003', quantity: 1, unitPrice: '90000' },
      ],
    })

    const body = lastPutBody()
    expect(body['lineIdContract']).toBe(true)
    expect((body['lines'] as Array<Record<string, unknown>>).every((l) => l['lineId'] === undefined))
      .toBe(true)
  })

  /**
   * 마커는 호출자가 고를 수 있는 옵션이 아니다 — 호출자가 false 를 넣어도 true 로 덮는다.
   *
   * <p>마커는 "이 클라이언트가 lineId 계약을 구현했는가" 라는 <b>사실</b>에 대한 선언이지
   * 요청별 취향이 아니다. 덮어쓰지 않으면 호출자 한 곳의 실수가 그 경로만 조용히 구
   * 클라이언트로 강등시킨다.
   */
  it('호출자가 마커를 끄려 해도 true 로 덮는다', () => {
    expect(withLineIdContract({ lineIdContract: false, memo: 'x' }).lineIdContract).toBe(true)
  })
})
