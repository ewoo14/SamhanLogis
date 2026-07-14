import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiClient } from './client'
import {
  mapDispatchDetail,
  getDispatchDetail,
  recordManualLocation,
  type RawDispatchDetailResponse,
} from './arologisDispatchDetail'

vi.mock('./client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const mockedGet = vi.mocked(apiClient.get)
const mockedPost = vi.mocked(apiClient.post)

describe('arologisDispatchDetail', () => {
  beforeEach(() => {
    mockedGet.mockReset()
    mockedPost.mockReset()
  })

  it('maps raw BE dispatch detail into DispatchDetail view model', () => {
    const raw: RawDispatchDetailResponse = {
      dispatchId: 'dispatch-804',
      dispatchDate: '2026-07-14',
      dispatchType: 'EXPRESS',
      sandboxMode: true,
      vehicles: [
        {
          sequence: 1,
          tonnage: 'TONNAGE_1',
          label: '상일+초월',
          assignedDriverCode: 'INSUNG-001',
          matchSource: 'EXTERNAL_INSUNG_QUICK',
          externalRefId: 'EXT-804',
          vendorOrderId: 'INSUNG-ORDER-804',
          status: 'ASSIGNED',
          gpsSources: [
            {
              source: 'APP_GPS_ACTIVE',
              latitude: 37.5665,
              longitude: 126.978,
              lastReceivedAt: '2026-07-14T10:00:00',
              active: true,
            },
          ],
          stops: [
            {
              sequence: 1,
              rawText: '-상일',
              parsedAddress: '서울 강동구 상일동',
              parsedPartnerName: '상일공조',
              parsedKakaoSeq: 214,
              parsedPartnerCode: 'P-2026-0001',
              notes: null,
              status: 'PENDING',
            },
            {
              sequence: 2,
              rawText: '-초월',
              parsedAddress: '경기 광주시 초월읍',
              parsedPartnerName: '초월공조',
              parsedKakaoSeq: null,
              parsedPartnerCode: null,
              notes: null,
              status: 'PENDING',
            },
          ],
        },
      ],
    }

    const mapped = mapDispatchDetail(raw)

    expect(mapped).toEqual({
      id: 'dispatch-804',
      dispatchDate: '2026-07-14',
      dispatchTypeLabel: '특송',
      sandboxMode: true,
      vehicles: [
        {
          sequence: 1,
          tonnageLabel: '1톤',
          routeLabel: '상일공조 → 초월공조',
          stopCount: 2,
          matchStatus: 'ASSIGNED',
          matchSource: 'EXTERNAL_INSUNG_QUICK',
          driverCode: 'INSUNG-001',
          vendorOrderId: 'INSUNG-ORDER-804',
          notifyResults: undefined,
          gpsSources: [
            {
              source: 'APP_GPS_ACTIVE',
              latitude: 37.5665,
              longitude: 126.978,
              lastReceivedAt: '2026-07-14T10:00:00',
              active: true,
            },
          ],
        },
      ],
    })
  })

  it('falls back unknown enums to 기타 and derives routeLabel for empty or single stops', () => {
    const raw: RawDispatchDetailResponse = {
      dispatchId: 'dispatch-unknown',
      dispatchDate: '2026-07-14',
      dispatchType: 'UNKNOWN',
      sandboxMode: false,
      vehicles: [
        {
          sequence: 1,
          tonnage: 'UNKNOWN',
          label: null,
          assignedDriverCode: null,
          matchSource: null,
          externalRefId: null,
          vendorOrderId: null,
          status: 'NEW_STATUS',
          stops: [],
        },
        {
          sequence: 2,
          tonnage: 'DAMAS',
          label: null,
          assignedDriverCode: null,
          matchSource: null,
          externalRefId: null,
          vendorOrderId: null,
          status: 'PENDING',
          stops: [
            {
              sequence: 1,
              rawText: '-주소만',
              parsedAddress: '서울 송파구',
              parsedPartnerName: null,
              parsedKakaoSeq: null,
              parsedPartnerCode: null,
              notes: null,
              status: 'PENDING',
            },
          ],
        },
      ],
    }

    const mapped = mapDispatchDetail(raw)

    expect(mapped.dispatchTypeLabel).toBe('기타')
    expect(mapped.vehicles[0]).toMatchObject({
      tonnageLabel: '기타',
      routeLabel: '',
      stopCount: 0,
      matchStatus: 'NEW_STATUS',
      matchSource: null,
      notifyResults: undefined,
      gpsSources: [],
    })
    expect(mapped.vehicles[1]).toMatchObject({
      tonnageLabel: '다마스',
      routeLabel: '서울 송파구',
      stopCount: 1,
    })
  })

  it('unwraps ApiEnvelope before mapping dispatch detail', async () => {
    const raw: RawDispatchDetailResponse = {
      dispatchId: 'dispatch-804',
      dispatchDate: '2026-07-14',
      dispatchType: 'DAY',
      sandboxMode: false,
      vehicles: [],
    }
    mockedGet.mockResolvedValueOnce({
      data: {
        success: true,
        code: 'SUCCESS',
        message: 'OK',
        data: raw,
        timestamp: '2026-07-14T00:00:00Z',
      },
    })

    await expect(getDispatchDetail('dispatch/804')).resolves.toMatchObject({
      id: 'dispatch-804',
      dispatchTypeLabel: '주간',
      vehicles: [],
    })
    expect(mockedGet).toHaveBeenCalledWith('/admin/arologis/dispatches/dispatch%2F804')
  })

  it('posts manual location to the dispatch sequence endpoint without exposing vehicle UUID', async () => {
    mockedPost.mockResolvedValueOnce({ data: { success: true } })

    await recordManualLocation('dispatch/804', 3, 37.1234567, 127.1234567)

    expect(mockedPost).toHaveBeenCalledWith(
      '/admin/arologis/dispatches/dispatch%2F804/vehicles/3/manual-location',
      { latitude: 37.1234567, longitude: 127.1234567 },
    )
  })

  it('avoids orphan separator/arrow for empty or partial route endpoints and falls back deprecated tonnages to 기타', () => {
    const emptyStop = (sequence: number) => ({
      sequence,
      rawText: `-${sequence}`,
      parsedAddress: null,
      parsedPartnerName: null,
      parsedKakaoSeq: null,
      parsedPartnerCode: null,
      notes: null,
      status: 'PENDING',
    })
    const raw: RawDispatchDetailResponse = {
      dispatchId: 'dispatch-edge',
      dispatchDate: '2026-07-14',
      dispatchType: 'NIGHT',
      sandboxMode: false,
      vehicles: [
        {
          // 양끝 stop 모두 미파싱 → routeLabel 빈 문자열(" → " 맨 화살표 없음)
          sequence: 1,
          tonnage: 'TONNAGE_1_4',
          label: null,
          assignedDriverCode: null,
          matchSource: null,
          externalRefId: null,
          vendorOrderId: null,
          status: 'PENDING',
          stops: [emptyStop(1), emptyStop(2)],
        },
        {
          // 첫 stop 만 파싱 → 유효 끝점만(맨 화살표 없음)
          sequence: 2,
          tonnage: 'TONNAGE_BIG',
          label: null,
          assignedDriverCode: null,
          matchSource: null,
          externalRefId: null,
          vendorOrderId: null,
          status: 'PENDING',
          stops: [
            { ...emptyStop(1), parsedPartnerName: '가나공조' },
            emptyStop(2),
          ],
        },
      ],
    }

    const mapped = mapDispatchDetail(raw)
    // deprecated 톤수(TONNAGE_1_4/BIG)는 BE VehicleTonnage "UI 노출 금지" 사전결정에 따라 '기타' fallback.
    // routeLabel: 양끝 미파싱→''(고아 화살표 없음)·한쪽만 파싱→유효 끝점만.
    expect(mapped.vehicles[0]).toMatchObject({ tonnageLabel: '기타', routeLabel: '', stopCount: 2 })
    expect(mapped.vehicles[1]).toMatchObject({ tonnageLabel: '기타', routeLabel: '가나공조', stopCount: 2 })
  })

  it('preserves non-Insung matchSource values so the UI can avoid false INSUNG badges', () => {
    const raw: RawDispatchDetailResponse = {
      dispatchId: 'dispatch-source',
      dispatchDate: '2026-07-14',
      dispatchType: 'DAY',
      sandboxMode: false,
      vehicles: [
        {
          sequence: 1,
          tonnage: 'TONNAGE_1',
          label: null,
          assignedDriverCode: 'DRV-KAKAO',
          matchSource: 'EXTERNAL_KAKAO',
          externalRefId: 'KAKAO-1',
          vendorOrderId: null,
          status: 'ASSIGNED',
          stops: [],
        },
        {
          sequence: 2,
          tonnage: 'TONNAGE_1',
          label: null,
          assignedDriverCode: 'DRV-MANUAL',
          matchSource: 'MANUAL',
          externalRefId: null,
          vendorOrderId: null,
          status: 'ASSIGNED',
          stops: [],
        },
      ],
    }

    const mapped = mapDispatchDetail(raw)

    expect(mapped.vehicles[0]).toMatchObject({
      matchStatus: 'ASSIGNED',
      matchSource: 'EXTERNAL_KAKAO',
    })
    expect(mapped.vehicles[1]).toMatchObject({
      matchStatus: 'ASSIGNED',
      matchSource: 'MANUAL',
    })
  })
})
