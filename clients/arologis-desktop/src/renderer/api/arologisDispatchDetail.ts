/**
 * 아로로지스 배차 상세 API 클라이언트.
 *
 * <p>BE {@code DispatchDetailResponse} wire contract 를 1:1 raw 타입으로 받고,
 * DispatchDetailPage 가 소비하는 얇은 뷰모델로만 변환한다.
 *
 * <p>UUID 비공개 가드: vehicleId 는 raw/뷰모델 어디에도 보유하지 않는다. 차량 행 식별자는
 * sequence 를 사용하고, 기사 식별자는 assignedDriverCode 만 사용한다.
 */
import { apiClient, type ApiEnvelope } from './client'
import type {
  DispatchDetail,
  VehicleDetail,
} from '../routes/dispatches/DispatchDetailPage'
import type { VehicleMatchStatus } from '../components/VehicleMatchStatusBadge'

export type RawDispatchType = 'DAY' | 'NIGHT' | 'EXPRESS' | string

export type RawVehicleTonnage =
  | 'MOTORCYCLE'
  | 'DAMAS'
  | 'TONNAGE_1'
  | 'TONNAGE_1_5'
  | 'TONNAGE_2_5'
  | 'TONNAGE_3'
  | 'TONNAGE_5'
  | 'TONNAGE_10'
  | 'TONNAGE_20'
  | string

export interface RawDispatchDetailResponse {
  dispatchId: string
  dispatchDate: string
  dispatchType: RawDispatchType
  sandboxMode: boolean
  vehicles: RawVehicleDetail[]
}

export interface RawVehicleDetail {
  sequence: number
  tonnage: RawVehicleTonnage
  label: string | null
  assignedDriverCode: string | null
  matchSource: string | null
  externalRefId: string | null
  vendorOrderId: string | null
  status: string
  stops: RawStopDetail[]
}

export interface RawStopDetail {
  sequence: number
  rawText: string
  parsedAddress: string | null
  parsedPartnerName: string | null
  parsedKakaoSeq: number | null
  parsedPartnerCode: string | null
  notes: string | null
  status: string
}

export const TONNAGE_LABEL: Record<string, string> = {
  MOTORCYCLE: '오토바이',
  DAMAS: '다마스',
  TONNAGE_1: '1톤',
  TONNAGE_1_5: '1.5톤',
  TONNAGE_2_5: '2.5톤',
  TONNAGE_3: '3톤',
  TONNAGE_5: '5톤',
  TONNAGE_10: '10톤',
  TONNAGE_20: '20톤',
}

export const DISPATCH_TYPE_LABEL: Record<string, string> = {
  DAY: '주간',
  NIGHT: '야간',
  EXPRESS: '특송',
}

export function mapDispatchDetail(raw: RawDispatchDetailResponse): DispatchDetail {
  return {
    id: raw.dispatchId,
    dispatchDate: raw.dispatchDate,
    dispatchTypeLabel: labelOf(DISPATCH_TYPE_LABEL, raw.dispatchType),
    sandboxMode: raw.sandboxMode,
    vehicles: (raw.vehicles ?? []).map(mapVehicleDetail),
  }
}

function mapVehicleDetail(raw: RawVehicleDetail): VehicleDetail {
  const stops = raw.stops ?? []
  return {
    sequence: raw.sequence,
    tonnageLabel: labelOf(TONNAGE_LABEL, raw.tonnage),
    routeLabel: deriveRouteLabel(stops),
    stopCount: stops.length,
    matchStatus: raw.status as VehicleMatchStatus,
    driverCode: raw.assignedDriverCode,
    vendorOrderId: raw.vendorOrderId,
    notifyResults: undefined,
    gpsSources: undefined,
  }
}

function labelOf(labels: Record<string, string>, raw: string): string {
  return labels[raw] ?? '기타'
}

function deriveRouteLabel(stops: RawStopDetail[]): string {
  if (stops.length === 0) return ''
  const first = stops[0]
  const last = stops[stops.length - 1]
  if (!first || !last) return ''
  if (stops.length === 1) return stopLabel(first)
  return `${stopLabel(first)} → ${stopLabel(last)}`
}

function stopLabel(stop: RawStopDetail): string {
  return stop.parsedPartnerName || stop.parsedAddress || ''
}

function unwrapDispatchDetail(
  body: RawDispatchDetailResponse | ApiEnvelope<RawDispatchDetailResponse>,
): RawDispatchDetailResponse {
  if (body && typeof body === 'object' && 'data' in body) {
    return body.data
  }
  return body
}

/**
 * 배차 상세 조회.
 *
 * @param dispatchCode 라우팅용 dispatch UUID. 사용자 화면에는 직접 표시하지 않는다.
 */
export async function getDispatchDetail(dispatchCode: string): Promise<DispatchDetail> {
  const res = await apiClient.get<RawDispatchDetailResponse | ApiEnvelope<RawDispatchDetailResponse>>(
    `/admin/arologis/dispatches/${encodeURIComponent(dispatchCode)}`,
  )
  return mapDispatchDetail(unwrapDispatchDetail(res.data))
}
