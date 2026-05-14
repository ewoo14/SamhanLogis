/**
 * 배차 메뉴 (Samhan Public Phase A) — DispatchTask + VehicleGroup + Slip 매핑 API.
 *
 * <p>spec: docs/superpowers/specs/2026-05-14-samhan-dispatch-board-design.md § 6.
 * BE 출처 (Phase A BE Team):
 * <ul>
 *   <li>{@code POST /admin/dispatch-tasks}                                            — 신규 DispatchTask (DRAFT)</li>
 *   <li>{@code POST /admin/dispatch-tasks/{taskId}/vehicle-groups}                    — 차량 그룹 추가</li>
 *   <li>{@code DELETE /admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}}        — 빈 그룹 삭제</li>
 *   <li>{@code POST /admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/slips}    — slip 그룹 할당</li>
 *   <li>{@code PUT  /admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/slips/order} — 그룹 안 slip 순서 변경</li>
 *   <li>{@code DELETE /admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}/slips/{slipId}} — slip 제거</li>
 *   <li>{@code POST /admin/dispatch-tasks/{taskId}/dispatch}                          — 배차 완료 → arologis 발송</li>
 * </ul>
 *
 * UUID 비공개 (feedback_uuid_no_user_visibility.md):
 * - 응답에 포함된 UUID 는 React state / API path 에만 사용. 사용자 노출은 taskCode / slipNumber /
 *   partnerCode / partnerName / driverCode / driverPhoneNumber 한정.
 *
 * 차량 종류 (9 active enum, spec § 4.3):
 *   MOTORCYCLE / DAMAS / TONNAGE_1 / TONNAGE_1_5 / TONNAGE_2_5 / TONNAGE_3 / TONNAGE_5 / TONNAGE_10 / TONNAGE_20.
 *   legacy 2 (TONNAGE_1_4 / TONNAGE_BIG) 는 backward compat 만 — UI 에는 노출 X.
 */
import { apiClient, type ApiEnvelope } from './client'
import type { SlipBoardResponse } from './dispatchBoard'

/**
 * Phase A 배차 메뉴 차량 종류 (9 active 값, spec § 4.3).
 *
 * <p>arologis {@code VehicleTonnage} 11 enum 중 legacy 2 (TONNAGE_1_4 / TONNAGE_BIG) 제외.
 * 카톡 파싱은 legacy 유지하므로 BE enum 은 11개이지만, 배차 메뉴 UI 는 9개만 노출.
 */
export type DispatchVehicleType =
  | 'MOTORCYCLE'
  | 'DAMAS'
  | 'TONNAGE_1'
  | 'TONNAGE_1_5'
  | 'TONNAGE_2_5'
  | 'TONNAGE_3'
  | 'TONNAGE_5'
  | 'TONNAGE_10'
  | 'TONNAGE_20'

/**
 * 차량 종류 한국어 라벨 (사용자 노출 — 차량 추가 modal carousel + 그룹 헤더).
 */
export const DISPATCH_VEHICLE_TYPE_LABEL: Record<DispatchVehicleType, string> = {
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

/**
 * 모든 차량 종류 옵션 (carousel 노출 순서 — 가벼운 → 무거운 순).
 */
export const DISPATCH_VEHICLE_TYPE_OPTIONS: DispatchVehicleType[] = [
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
 * DispatchTask 4 상태 — spec § 4.1.
 */
export type DispatchTaskStatus = 'DRAFT' | 'DISPATCHING' | 'DISPATCHED' | 'FAILED'

/**
 * DispatchTask 상태 한국어 배지 라벨.
 */
export const DISPATCH_TASK_STATUS_LABEL: Record<DispatchTaskStatus, string> = {
  DRAFT: '작성 중',
  DISPATCHING: '발송 완료, 매칭 대기',
  DISPATCHED: '배차 완료',
  FAILED: '배차 불가',
}

/**
 * 그룹 안 slip row — BE {@code DispatchVehicleGroupSlipResponse} 와 1:1.
 *
 * @property slip 전체 SlipBoardResponse (slipNumber/partnerCode/partnerName 포함).
 * @property sequence 그룹 안 정차 순서 (1 base).
 */
export interface DispatchVehicleGroupSlipResponse {
  slip: SlipBoardResponse
  sequence: number
}

/**
 * 매칭 완료 회신 후 BE 가 채우는 기사 정보 — spec § 6.2.
 *
 * <p>UI 표시: DISPATCHED 배지 옆에 `driverCode (driverName) phoneNumber` 인라인.
 * UUID 비공개 — driverId 등 UUID 는 응답에 포함 X.
 */
export interface MatchedDriverResponse {
  vehicleGroupSequence: number
  vehicleType: DispatchVehicleType
  driverCode: string
  driverName: string
  driverPhoneNumber: string
  source: string
}

/**
 * 차량 그룹 응답 — BE {@code DispatchVehicleGroupResponse} 와 1:1.
 *
 * @property id 그룹 UUID — drop target ID + API path 에만 사용 (UUID 비공개).
 * @property sequence 그룹 추가 순서 (1 base, 헤더 `#{sequence}` 노출).
 * @property vehicleType 9 enum 값 (헤더 한국어 라벨 변환).
 * @property slips 그룹 안 slip rows (sequence 순서 보장).
 */
export interface DispatchVehicleGroupResponse {
  id: string
  sequence: number
  vehicleType: DispatchVehicleType
  slips: DispatchVehicleGroupSlipResponse[]
}

/**
 * DispatchTask 응답 — BE {@code DispatchTaskResponse} 와 1:1.
 *
 * @property id task UUID — API path 에만 사용.
 * @property taskCode 사용자 노출 식별자 (예: "DT-20260514-001").
 * @property dispatchDate 배차 일자 (yyyy-MM-dd).
 * @property status 4 상태 (DRAFT/DISPATCHING/DISPATCHED/FAILED).
 * @property vehicleGroups 차량 그룹 리스트 (sequence 순서 보장).
 * @property matchedDrivers DISPATCHED 시점 채워지는 기사 매칭 결과.
 * @property failureReason FAILED 시점 사유 (UI 빨강 배지 노출).
 */
export interface DispatchTaskResponse {
  id: string
  taskCode: string
  dispatchDate: string
  status: DispatchTaskStatus
  vehicleGroups: DispatchVehicleGroupResponse[]
  matchedDrivers: MatchedDriverResponse[]
  failureReason: string | null
}

// ---------------------------------------------------------------------------
// DispatchTask CRUD
// ---------------------------------------------------------------------------

/**
 * 신규 DispatchTask (DRAFT) 생성 — `POST /admin/dispatch-tasks`.
 *
 * @param dispatchDate 배차 일자 (yyyy-MM-dd, default 오늘).
 */
export async function createDispatchTask(
  dispatchDate: string,
): Promise<DispatchTaskResponse> {
  const res = await apiClient.post<ApiEnvelope<DispatchTaskResponse>>(
    '/admin/dispatch-tasks',
    { dispatchDate },
  )
  return res.data.data
}

/**
 * DispatchTask 단건 조회 — `GET /admin/dispatch-tasks/{taskId}`.
 *
 * <p>BE Team 가 동시에 endpoint 를 노출하므로 FE 도 client 만 사전 작성 (TM 통합 시 검증).
 */
export async function getDispatchTask(
  taskId: string,
): Promise<DispatchTaskResponse> {
  const res = await apiClient.get<ApiEnvelope<DispatchTaskResponse>>(
    `/admin/dispatch-tasks/${taskId}`,
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// VehicleGroup CRUD
// ---------------------------------------------------------------------------

/**
 * 차량 그룹 추가 — `POST /admin/dispatch-tasks/{taskId}/vehicle-groups`.
 *
 * @param taskId 부모 DispatchTask UUID.
 * @param vehicleType 9 active enum 값.
 */
export async function addVehicleGroup(
  taskId: string,
  vehicleType: DispatchVehicleType,
): Promise<DispatchVehicleGroupResponse> {
  const res = await apiClient.post<ApiEnvelope<DispatchVehicleGroupResponse>>(
    `/admin/dispatch-tasks/${taskId}/vehicle-groups`,
    { vehicleType },
  )
  return res.data.data
}

/**
 * 차량 그룹 삭제 — `DELETE /admin/dispatch-tasks/{taskId}/vehicle-groups/{groupId}`.
 *
 * <p>그룹이 비어 있는 경우만 BE 가 허용 (404/409 가드).
 */
export async function deleteVehicleGroup(
  taskId: string,
  groupId: string,
): Promise<void> {
  await apiClient.delete(
    `/admin/dispatch-tasks/${taskId}/vehicle-groups/${groupId}`,
  )
}

// ---------------------------------------------------------------------------
// VehicleGroupSlip 매핑
// ---------------------------------------------------------------------------

/**
 * slip 그룹 할당 — `POST .../vehicle-groups/{groupId}/slips`.
 *
 * @param taskId DispatchTask UUID.
 * @param groupId 그룹 UUID.
 * @param slipId 할당 대상 슬립 UUID.
 */
export async function assignSlipToGroup(
  taskId: string,
  groupId: string,
  slipId: string,
): Promise<void> {
  await apiClient.post(
    `/admin/dispatch-tasks/${taskId}/vehicle-groups/${groupId}/slips`,
    { slipId },
  )
}

/**
 * 그룹 안 slip 순서 변경 — `PUT .../vehicle-groups/{groupId}/slips/order`.
 *
 * @param orderedSlipIds 새 순서 (sequence 1 base 로 BE 가 재할당).
 */
export async function reorderGroupSlips(
  taskId: string,
  groupId: string,
  orderedSlipIds: string[],
): Promise<void> {
  await apiClient.put(
    `/admin/dispatch-tasks/${taskId}/vehicle-groups/${groupId}/slips/order`,
    { orderedSlipIds },
  )
}

/**
 * 그룹에서 slip 제거 — `DELETE .../vehicle-groups/{groupId}/slips/{slipId}`.
 */
export async function removeSlipFromGroup(
  taskId: string,
  groupId: string,
  slipId: string,
): Promise<void> {
  await apiClient.delete(
    `/admin/dispatch-tasks/${taskId}/vehicle-groups/${groupId}/slips/${slipId}`,
  )
}

// ---------------------------------------------------------------------------
// 배차 완료 — arologis 발송
// ---------------------------------------------------------------------------

/**
 * 배차 완료 → arologis 발송 — `POST /admin/dispatch-tasks/{taskId}/dispatch`.
 *
 * <p>BE 가 X-Internal-Token + arologis dispatch endpoint 호출 후 DISPATCHING 상태 반환.
 * UI 는 응답의 DISPATCHING 으로 배지 갱신 → arologis 회신 후 DISPATCHED.
 */
export async function dispatchToArologis(
  taskId: string,
): Promise<DispatchTaskResponse> {
  const res = await apiClient.post<ApiEnvelope<DispatchTaskResponse>>(
    `/admin/dispatch-tasks/${taskId}/dispatch`,
  )
  return res.data.data
}
