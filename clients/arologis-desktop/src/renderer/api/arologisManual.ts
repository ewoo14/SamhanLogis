/**
 * arologis 수동 배차 API 클라이언트 — Phase 10 P1-5.
 *
 * 매뉴얼: docs/manual/05-arologis/02-수동-배차.md §2 정식 admin 폼.
 *
 * 노출 endpoint:
 * - `POST /admin/arologis/dispatches/manual/preview` — 입력 검증 + echo (저장 X)
 * - `POST /admin/arologis/dispatches/manual`         — Dispatch + Vehicle + VehicleStop 일괄 저장
 *
 * BE 출처: services/arologis-service/.../controller/ArologisAdminController.java
 *         + dto/ManualDispatchRequest.java + dto/ManualDispatchPreviewResponse.java
 *
 * UUID 비공개 가드 (feedback_uuid_no_user_visibility.md):
 * - 응답에는 dispatchId UUID 만 포함 (path routing 용)
 * - 본 모듈 사용자 노출 식별자는 차량 sequence / partnerName / 톤수 라벨 / 주소 만 사용
 */
import { apiClient, type ApiEnvelope } from './client'

/** BE `DispatchType` enum 과 1:1. */
export type ArologisDispatchType = 'DAY' | 'NIGHT' | 'EXPRESS'

/** BE `VehicleTonnage` enum 과 1:1. */
export type ArologisVehicleTonnage =
  | 'MOTORCYCLE'
  | 'DAMAS'
  | 'TONNAGE_1'
  | 'TONNAGE_1_5'
  | 'TONNAGE_2_5'
  | 'TONNAGE_3'
  | 'TONNAGE_5'
  | 'TONNAGE_10'
  | 'TONNAGE_20'

/** DispatchType → 한국어 표시 라벨 (운영자 시점). */
export const DISPATCH_TYPE_LABEL: Record<ArologisDispatchType, string> = {
  DAY: '주간',
  NIGHT: '야간',
  EXPRESS: '특급',
}

/** VehicleTonnage → 한국어 표시 라벨. */
export const TONNAGE_LABEL: Record<ArologisVehicleTonnage, string> = {
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

/** 모든 DispatchType 옵션 — 폼 select 용. */
export const DISPATCH_TYPE_OPTIONS: ArologisDispatchType[] = [
  'DAY',
  'NIGHT',
  'EXPRESS',
]

/** 모든 VehicleTonnage 옵션 — 폼 select 용. */
export const TONNAGE_OPTIONS: ArologisVehicleTonnage[] = [
  'MOTORCYCLE',
  'DAMAS',
  'TONNAGE_1',
  'TONNAGE_1_5',
  'TONNAGE_2_5',
  'TONNAGE_3',
  'TONNAGE_5',
  'TONNAGE_10',
  'TONNAGE_20',
]

/**
 * 수동 배차 정차 입력 — BE `ManualDispatchRequest.ManualStop`.
 *
 * @property sequence 정차 순서 (1 이상)
 * @property partnerName 거래처명 (옵션 — 입력 시 사용자 노출 식별자)
 * @property address 주소 (필수, 매뉴얼 §2-2)
 * @property kakaoSeq 카톡 슬립번호 (옵션, W10-4 자동 bridge)
 * @property notes 도착시각 / 특이사항 (옵션)
 */
export interface ManualStopInput {
  sequence: number
  partnerName?: string
  address: string
  kakaoSeq?: number
  partnerCode?: string
  notes?: string
}

/**
 * 수동 배차 차량 입력 — BE `ManualDispatchRequest.ManualVehicle`.
 */
export interface ManualVehicleInput {
  sequence: number
  tonnage: ArologisVehicleTonnage
  /** 차량 별명 / 차량번호 등 라벨 (옵션, 사용자 노출). */
  label?: string
  stops: ManualStopInput[]
}

/**
 * 수동 배차 요청 body — BE `ManualDispatchRequest`.
 *
 * driverCode 미지정 시 BE 가 기사 자동 매칭을 수행한다.
 */
export interface ManualDispatchRequest {
  /** yyyy-MM-dd. */
  dispatchDate: string
  dispatchType: ArologisDispatchType
  /** null/undefined 시 자동 매칭. */
  driverCode?: string
  vehicles: ManualVehicleInput[]
}

/** 미리보기 정차 echo. */
export interface PreviewStop {
  sequence: number
  partnerName: string | null
  address: string
  kakaoSeq: number | null
  partnerCode: string | null
  notes: string | null
}

/** 미리보기 차량 echo. */
export interface PreviewVehicle {
  sequence: number
  tonnage: ArologisVehicleTonnage
  label: string | null
  stops: PreviewStop[]
}

/** 미리보기 응답 — BE `ManualDispatchPreviewResponse`. */
export interface ManualDispatchPreviewResponse {
  dispatchDate: string
  dispatchType: ArologisDispatchType
  vehicles: PreviewVehicle[]
  totalVehicles: number
  totalStops: number
  /** null 이면 자동 매칭 예정. */
  driverCodeApplied: string | null
}

/** 저장 응답 envelope. */
export interface ManualDispatchCreateResponse {
  /** Dispatch UUID — 비공개. routing 용도만. */
  dispatchId: string
}

/**
 * 수동 배차 미리보기 호출 — 저장 X.
 *
 * @param body 입력 폼 동일 형식
 * @return 검증 통과 시 echo + 합계
 */
export async function previewManualDispatch(
  body: ManualDispatchRequest,
): Promise<ManualDispatchPreviewResponse> {
  const res = await apiClient.post<ApiEnvelope<ManualDispatchPreviewResponse>>(
    '/admin/arologis/dispatches/manual/preview',
    body,
  )
  return res.data.data
}

/**
 * 수동 배차 저장 호출.
 *
 * @param body 입력 폼 동일 형식
 * @return 생성된 Dispatch UUID
 */
export async function createManualDispatch(
  body: ManualDispatchRequest,
): Promise<ManualDispatchCreateResponse> {
  const res = await apiClient.post<ApiEnvelope<ManualDispatchCreateResponse>>(
    '/admin/arologis/dispatches/manual',
    body,
  )
  return res.data.data
}

/**
 * arologis 수동 배차 admin UI 진입 권한.
 *
 * 아로로지스 자체 admin role 과 1:1 매핑.
 */
export const ARO_MANUAL_DISPATCH_ROLES = [
  'AROLOGIS_MASTER',
  'AROLOGIS_MANAGER',
] as const
