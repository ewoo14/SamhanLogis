/**
 * 배차 메뉴 (Samhan Public Phase A) — DispatchTask + VehicleGroup + Slip 매핑 API.
 *
 * <p>spec: docs/superpowers/specs/2026-05-14-samhan-dispatch-board-design.md § 6.
 * BE 출처 (Phase A BE Team):
 * <ul>
 *   <li>{@code POST /admin/dispatch-tasks}                                            — 신규 DispatchTask (DRAFT)</li>
 *   <li>{@code POST /admin/dispatch-tasks/today-draft}                                — 오늘의 DRAFT 조회 또는 생성</li>
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
 *   partnerCode / partnerName / driverCode / driverPhoneNumber / vehiclePlateNumber 한정.
 *
 * 차량 종류:
 *   FE 신규 계약은 vehicleBodyType(차종 12) + tonnage(톤수 10) 2축.
 *   현재 화면 선택지는 active subset(차종 9 + 톤수 6)만 노출한다.
 *   legacy vehicleType(9 enum) 은 arologis wire 호환 파생값으로 응답에만 남긴다.
 */
import { apiClient, type ApiEnvelope, type PageResponse } from './client'

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
 * 배차 차량 차종 12종. excluded 값도 응답/legacy 표시 호환 때문에 타입에는 유지한다.
 */
export type DispatchVehicleBodyType =
  | 'MOTORCYCLE'
  | 'SEDAN'
  | 'DAMAS'
  | 'LABO'
  | 'CARGO'
  | 'WINGBODY'
  | 'TOPCAR'
  | 'LIFT'
  | 'REEFER'
  | 'VIBRATION_FREE'
  | 'AXLE'
  | 'TRAILER'

/**
 * 배차 차량 톤수 10종. excluded 값도 응답/legacy 표시 호환 때문에 타입에는 유지한다.
 */
export type DispatchTonnage =
  | 'T_1'
  | 'T_1_2'
  | 'T_1_4'
  | 'T_2_5'
  | 'T_3_5'
  | 'T_5'
  | 'T_11'
  | 'T_14'
  | 'T_18'
  | 'T_25'

export const DISPATCH_VEHICLE_BODY_TYPE_LABEL: Record<DispatchVehicleBodyType, string> = {
  MOTORCYCLE: '오토바이',
  SEDAN: '승용차',
  DAMAS: '다마스',
  LABO: '라보',
  CARGO: '카고',
  WINGBODY: '윙바디',
  TOPCAR: '탑차',
  LIFT: '리프트',
  REEFER: '냉장냉동탑',
  VIBRATION_FREE: '무진동',
  AXLE: '축차',
  TRAILER: '추레라',
}

export const DISPATCH_TONNAGE_LABEL: Record<DispatchTonnage, string> = {
  T_1: '1톤',
  T_1_2: '1.2톤',
  T_1_4: '1.4톤',
  T_2_5: '2.5톤',
  T_3_5: '3.5톤',
  T_5: '5톤',
  T_11: '11톤',
  T_14: '14톤',
  T_18: '18톤',
  T_25: '25톤',
}

export const VEHICLE_BODY_TYPE_OPTIONS: DispatchVehicleBodyType[] = [
  'MOTORCYCLE',
  'DAMAS',
  'LABO',
  'CARGO',
  'WINGBODY',
  'TOPCAR',
  'LIFT',
  'REEFER',
  'VIBRATION_FREE',
]

export const TONNAGE_OPTIONS: DispatchTonnage[] = [
  'T_1',
  'T_1_4',
  'T_2_5',
  'T_3_5',
  'T_5',
  'T_11',
]

/**
 * BE DispatchVehicleTypeMatrix 와 동일한 active 차종별 유효 톤수.
 */
export const DISPATCH_VEHICLE_TYPE_MATRIX: Partial<Record<
  DispatchVehicleBodyType,
  readonly DispatchTonnage[]
>> = {
  MOTORCYCLE: [],
  DAMAS: [],
  LABO: [],
  CARGO: TONNAGE_OPTIONS,
  WINGBODY: TONNAGE_OPTIONS,
  TOPCAR: TONNAGE_OPTIONS,
  LIFT: TONNAGE_OPTIONS,
  REEFER: TONNAGE_OPTIONS,
  VIBRATION_FREE: TONNAGE_OPTIONS,
}

export function getAllowedDispatchTonnages(
  vehicleBodyType: DispatchVehicleBodyType,
): readonly DispatchTonnage[] | null {
  return DISPATCH_VEHICLE_TYPE_MATRIX[vehicleBodyType] ?? null
}

export interface AddVehicleGroupPayload {
  vehicleBodyType: DispatchVehicleBodyType
  tonnage: DispatchTonnage | null
}

export function formatDispatchVehicleGroupLabel(
  group: Pick<
    DispatchVehicleGroupResponse,
    'vehicleType' | 'vehicleBodyType' | 'vehicleBodyTypeDisplay' | 'tonnage' | 'tonnageDisplay'
  >,
): string {
  if (group.vehicleBodyType) {
    const bodyLabel =
      group.vehicleBodyTypeDisplay ?? DISPATCH_VEHICLE_BODY_TYPE_LABEL[group.vehicleBodyType]
    const tonnageLabel =
      group.tonnageDisplay ??
      (group.tonnage ? DISPATCH_TONNAGE_LABEL[group.tonnage] : null)
    return tonnageLabel ? `${bodyLabel} ${tonnageLabel}` : bodyLabel
  }
  return DISPATCH_VEHICLE_TYPE_LABEL[group.vehicleType]
}

/**
 * DispatchTask 11 상태 — Phase A 4 + Phase C 7 (6 신규 + CANCELLED 최종).
 *
 * <p>spec docs/superpowers/specs/2026-05-14-samhan-dispatch-modification-design.md § 4.1.
 *
 * Phase C 신규 상태 흐름 (D-DC-03):
 *  - DISPATCHED → MODIFICATION_REQUESTED → MODIFICATION_ACCEPTED → start-redispatch → DRAFT → DISPATCHING → DISPATCHED
 *  - DISPATCHED → MODIFICATION_REQUESTED → MODIFICATION_REJECTED (DISPATCHED 유지, rejectionReason 표시)
 *  - DISPATCHED → CANCEL_REQUESTED → CANCEL_ACCEPTED → CANCELLED
 *  - DISPATCHED → CANCEL_REQUESTED → CANCEL_REJECTED (DISPATCHED 유지)
 */
export type DispatchTaskStatus =
  | 'DRAFT'
  | 'DISPATCHING'
  | 'DISPATCHED'
  | 'FAILED'
  | 'MODIFICATION_REQUESTED'
  | 'MODIFICATION_ACCEPTED'
  | 'MODIFICATION_REJECTED'
  | 'CANCEL_REQUESTED'
  | 'CANCEL_ACCEPTED'
  | 'CANCEL_REJECTED'
  | 'CANCELLED'

/**
 * DispatchTask 상태 한국어 배지 라벨.
 */
export const DISPATCH_TASK_STATUS_LABEL: Record<DispatchTaskStatus, string> = {
  DRAFT: '작성 중',
  DISPATCHING: '발송 완료, 매칭 대기',
  DISPATCHED: '배차 완료',
  FAILED: '배차 불가',
  MODIFICATION_REQUESTED: '수정 요청 중',
  MODIFICATION_ACCEPTED: '수정 수락됨',
  MODIFICATION_REJECTED: '수정 거부됨',
  CANCEL_REQUESTED: '취소 요청 중',
  CANCEL_ACCEPTED: '취소 수락됨',
  CANCEL_REJECTED: '취소 거부됨',
  CANCELLED: '배차 취소 완료',
}

export const DISPATCH_TASK_STATUS_TONE: Record<
  DispatchTaskStatus,
  { background: string; color: string; borderColor: string }
> = {
  DRAFT: {
    background: 'var(--color-neutral-100, #F3F4F6)',
    color: 'var(--color-neutral-700, #374151)',
    borderColor: 'var(--color-neutral-300, #D1D5DB)',
  },
  DISPATCHING: {
    background: 'var(--color-info-50, #EFF6FF)',
    color: 'var(--color-info-700, #1E40AF)',
    borderColor: 'var(--color-info-200, #BFDBFE)',
  },
  DISPATCHED: {
    background: 'var(--color-success-50, #ECFDF5)',
    color: 'var(--color-success-700, #047857)',
    borderColor: 'var(--color-success-200, #A7F3D0)',
  },
  FAILED: {
    background: 'var(--color-danger-50, #FEF2F2)',
    color: 'var(--color-danger-700, #B91C1C)',
    borderColor: 'var(--color-danger-200, #FECACA)',
  },
  MODIFICATION_REQUESTED: {
    background: 'var(--color-purple-50, #FAF5FF)',
    color: 'var(--color-purple-700, #6B21A8)',
    borderColor: 'var(--color-purple-200, #E9D5FF)',
  },
  MODIFICATION_ACCEPTED: {
    background: 'var(--color-success-50, #ECFDF5)',
    color: 'var(--color-success-700, #047857)',
    borderColor: 'var(--color-success-200, #A7F3D0)',
  },
  MODIFICATION_REJECTED: {
    background: 'var(--color-danger-50, #FEF2F2)',
    color: 'var(--color-danger-700, #B91C1C)',
    borderColor: 'var(--color-danger-200, #FECACA)',
  },
  CANCEL_REQUESTED: {
    background: 'var(--color-purple-50, #FAF5FF)',
    color: 'var(--color-purple-700, #6B21A8)',
    borderColor: 'var(--color-purple-200, #E9D5FF)',
  },
  CANCEL_ACCEPTED: {
    background: 'var(--color-success-50, #ECFDF5)',
    color: 'var(--color-success-700, #047857)',
    borderColor: 'var(--color-success-200, #A7F3D0)',
  },
  CANCEL_REJECTED: {
    background: 'var(--color-danger-50, #FEF2F2)',
    color: 'var(--color-danger-700, #B91C1C)',
    borderColor: 'var(--color-danger-200, #FECACA)',
  },
  CANCELLED: {
    background: 'var(--color-neutral-100, #F3F4F6)',
    color: 'var(--color-neutral-700, #374151)',
    borderColor: 'var(--color-neutral-300, #D1D5DB)',
  },
}

export type DispatchVehicleGroupDispatchStatus = 'PENDING' | 'DISPATCHED'

export const DISPATCH_VEHICLE_GROUP_DISPATCH_STATUS_LABEL: Record<
  DispatchVehicleGroupDispatchStatus,
  string
> = {
  PENDING: '미발송',
  DISPATCHED: '발송완료',
}

export const DISPATCH_VEHICLE_GROUP_DISPATCH_STATUS_TONE: Record<
  DispatchVehicleGroupDispatchStatus,
  { background: string; color: string; borderColor: string }
> = {
  PENDING: DISPATCH_TASK_STATUS_TONE.DRAFT,
  DISPATCHED: DISPATCH_TASK_STATUS_TONE.DISPATCHED,
}

/**
 * 배차 구성 편집 가능 상태 — DRAFT.
 *
 * <p>MODIFICATION_ACCEPTED 는 [재배차 시작] mutation 으로 DRAFT 복귀 후 편집한다.
 * drag-and-drop 활성 + [배차 완료] 버튼 노출 여부 판정에 사용.
 */
export function isEditableStatus(status: DispatchTaskStatus): boolean {
  return status === 'DRAFT'
}

export type MatchedDriverSource =
  | 'AROLOGIS'
  | 'GYEONGGI_QUICK'
  | 'JEONGUK_HWAMUL'
  | 'OTHER'

export const MATCHED_DRIVER_SOURCE_LABEL: Record<MatchedDriverSource, string> = {
  AROLOGIS: '아로로지스',
  GYEONGGI_QUICK: '경기퀵',
  JEONGUK_HWAMUL: '전국화물',
  OTHER: '기타',
}

export const MANUAL_MATCHED_DRIVER_SOURCE_OPTIONS: MatchedDriverSource[] = [
  'GYEONGGI_QUICK',
  'JEONGUK_HWAMUL',
  'OTHER',
]

/**
 * 그룹 안 slip row — BE {@code DispatchVehicleGroupSlipResponse} 와 1:1.
 *
 * @property slip 전표 헤더 (slipNo/partnerCode/partnerName 포함).
 * @property sequence 그룹 안 정차 순서 (1 base).
 */
export interface DispatchVehicleGroupSlipResponse {
  id: string
  slipId: string
  sequence: number
  slip: DispatchTaskSlipHeaderResponse
}

/**
 * DispatchTask 상세 전용 전표 헤더 — Java detail DTO 필드명과 1:1.
 */
export interface DispatchTaskSlipHeaderResponse {
  slipNo: string
  partnerCode: string
  partnerName: string
  deliveryAddress: string | null
  recipientPhone: string | null
  dispatchStatus: string | null
}

/**
 * 매칭 완료 회신 후 BE 가 채우는 기사 정보 — spec § 6.2.
 *
 * <p>UI 표시: DISPATCHED 배지 옆에 `driverCode (driverName) phoneNumber vehiclePlateNumber` 인라인.
 * UUID 비공개 — driverId 등 UUID 는 응답에 포함 X.
 */
export interface MatchedDriverResponse {
  vehicleGroupSequence: number
  driverCode: string
  driverName: string
  driverPhoneNumber: string | null
  driverSource: MatchedDriverSource
  vehiclePlateNumber?: string | null
}

export interface SetMatchedDriverPayload {
  driverName: string
  driverPhoneNumber: string
  vehiclePlateNumber: string
  driverSource: MatchedDriverSource
}

/**
 * 차량 그룹 응답 — BE {@code DispatchVehicleGroupResponse} 와 1:1.
 *
 * @property id 그룹 UUID — drop target ID + API path 에만 사용 (UUID 비공개).
 * @property sequence 그룹 추가 순서 (1 base, 헤더 `#{sequence}` 노출).
 * @property vehicleType legacy 9 enum 값 (arologis wire 호환 파생값).
 * @property vehicleBodyType 신 차종 12 enum 값.
 * @property tonnage 신 톤수 10 enum 값. 소형 차종은 null.
 * @property dispatchStatus 그룹 단위 arologis 발송 상태.
 * @property slips 그룹 안 slip rows (sequence 순서 보장).
 */
export interface DispatchVehicleGroupResponse {
  id: string
  sequence: number
  vehicleType: DispatchVehicleType
  vehicleTypeDisplay?: string
  vehicleBodyType: DispatchVehicleBodyType
  vehicleBodyTypeDisplay: string
  tonnage: DispatchTonnage | null
  tonnageDisplay: string | null
  dispatchStatus: DispatchVehicleGroupDispatchStatus
  slips: DispatchVehicleGroupSlipResponse[]
}

/**
 * DispatchTask 응답 — BE {@code DispatchTaskResponse} 와 1:1.
 *
 * @property id task UUID — API path 에만 사용.
 * @property taskCode 사용자 노출 식별자 (예: "2026/05/14-1").
 * @property dispatchDate 배차 일자 (yyyy-MM-dd).
 * @property status 11 상태 (Phase A 4 + Phase C 7).
 * @property arologisDispatchId 아로로지스 배차 식별자 — API path 에만 사용.
 * @property vehicleGroups 차량 그룹 리스트 (sequence 순서 보장).
 * @property matchedDrivers DISPATCHED 시점 채워지는 기사 매칭 결과.
 * @property failureReason FAILED 시점 사유 (UI 빨강 배지 노출).
 * @property modificationReason MODIFICATION_REQUESTED / CANCEL_REQUESTED 시점 사유 (Phase C).
 * @property rejectionReason MODIFICATION_REJECTED / CANCEL_REJECTED 시점 사유 (Phase C).
 * @property modificationRequestedAt 수정/취소 요청 시각 (ISO instant).
 * @property modificationDecidedAt 아로로지스 수락/거부 시각 (ISO instant).
 */
export interface DispatchTaskResponse {
  id: string
  taskCode: string
  dispatchDate: string
  status: DispatchTaskStatus
  arologisDispatchId: string | null
  vehicleGroups: DispatchVehicleGroupResponse[]
  matchedDrivers: MatchedDriverResponse[]
  duplicateSlipIds: string[]
  failureReason: string | null
  modificationReason?: string | null
  rejectionReason?: string | null
  modificationRequestedAt?: string | null
  modificationDecidedAt?: string | null
}

/**
 * BE 슬림 DispatchTaskResponse — task 단위 mutation ack (start-redispatch / 수정·취소 요청 등).
 *
 * <p>상세 read model 인 {@link DispatchTaskResponse} 와 달리 {@code vehicleGroups} /
 * {@code matchedDrivers} / {@code duplicateSlipIds} 를 포함하지 않는다 (BE
 * {@code DispatchTaskResponse.from(task)}). 상세 cache 갱신은
 * {@code useDispatchTask.ts} 의 슬림 병합 헬퍼가 담당한다.
 */
export interface DispatchTaskSlimResponse {
  id: string
  taskCode: string
  dispatchDate: string
  status: DispatchTaskStatus
  arologisDispatchId: string | null
  failureReason: string | null
  modificationReason?: string | null
  rejectionReason?: string | null
  modificationRequestedAt?: string | null
  modificationDecidedAt?: string | null
}

/**
 * 완료배차 내역 목록 요약 행 — id 는 상세 진입/query key 내부용, 화면 표시는 taskCode 중심.
 */
export interface DispatchTaskSummaryResponse {
  id: string
  taskCode: string
  dispatchDate: string
  status: DispatchTaskStatus
  vehicleGroupCount: number
  slipCount: number
  partnerNames: string
  driverCount: number
  arologisDispatchId: string | null
}

export interface ListDispatchTasksParams {
  from?: string
  to?: string
  status?: DispatchTaskStatus[]
  page?: number
  size?: number
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
 * 오늘의 미발송 DRAFT 보장 — `POST /admin/dispatch-tasks/today-draft`.
 *
 * <p>보드 F5/메뉴 재진입 시 기존 DRAFT 를 재사용해 cross-task 전표 배정 교착을 방지한다.
 */
export async function ensureTodayDraftTask(
  dispatchDate: string,
): Promise<DispatchTaskResponse> {
  const res = await apiClient.post<ApiEnvelope<DispatchTaskResponse>>(
    '/admin/dispatch-tasks/today-draft',
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

/**
 * 완료배차 내역 목록 조회 — `GET /admin/dispatch-tasks`.
 */
export async function getDispatchTasks(
  params: ListDispatchTasksParams,
): Promise<PageResponse<DispatchTaskSummaryResponse>> {
  const query = new URLSearchParams()
  if (params.from) query.set('from', params.from)
  if (params.to) query.set('to', params.to)
  for (const status of params.status ?? ['DISPATCHED']) {
    query.append('status', status)
  }
  query.set('page', String(params.page ?? 0))
  query.set('size', String(params.size ?? 20))

  const res = await apiClient.get<ApiEnvelope<PageResponse<DispatchTaskSummaryResponse>>>(
    '/admin/dispatch-tasks',
    { params: query },
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
 * @param payload 차종/톤수 2축 payload.
 */
export async function addVehicleGroup(
  taskId: string,
  payload: AddVehicleGroupPayload,
): Promise<DispatchVehicleGroupResponse> {
  const res = await apiClient.post<ApiEnvelope<DispatchVehicleGroupResponse>>(
    `/admin/dispatch-tasks/${taskId}/vehicle-groups`,
    payload,
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

/**
 * 타사 기사/차량 수동 기입 — `PUT .../vehicle-groups/{groupId}/matched-driver`.
 *
 * <p>수동 입력의 driverCode 는 BE 가 `MANUAL` 로 고정 저장한다.
 */
export async function setMatchedDriver(
  taskId: string,
  groupId: string,
  payload: SetMatchedDriverPayload,
): Promise<DispatchTaskResponse> {
  const res = await apiClient.put<ApiEnvelope<DispatchTaskResponse>>(
    `/admin/dispatch-tasks/${taskId}/vehicle-groups/${groupId}/matched-driver`,
    payload,
  )
  return res.data.data
}

/**
 * 타사 수동 발송완료 표시 — `POST .../manual-dispatch-complete`.
 */
export async function markManualDispatchComplete(
  taskId: string,
  groupId: string,
): Promise<DispatchTaskResponse> {
  const res = await apiClient.post<ApiEnvelope<DispatchTaskResponse>>(
    `/admin/dispatch-tasks/${taskId}/vehicle-groups/${groupId}/manual-dispatch-complete`,
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// VehicleGroupSlip 매핑
// ---------------------------------------------------------------------------

/**
 * slip 그룹 할당 — `POST .../vehicle-groups/{groupId}/slips`.
 *
 * @param taskId DispatchTask UUID.
 * @param groupId 그룹 UUID.
 * @param slipId 할당 대상 전표 UUID.
 */
export async function assignSlipToGroup(
  taskId: string,
  groupId: string,
  slipId: string,
): Promise<DispatchVehicleGroupSlipResponse> {
  const res = await apiClient.post<ApiEnvelope<DispatchVehicleGroupSlipResponse>>(
    `/admin/dispatch-tasks/${taskId}/vehicle-groups/${groupId}/slips`,
    { slipId },
  )
  return res.data.data
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
  groupIds?: string[],
): Promise<DispatchTaskResponse> {
  const res = await apiClient.post<ApiEnvelope<DispatchTaskResponse>>(
    `/admin/dispatch-tasks/${taskId}/dispatch`,
    groupIds ? { groupIds } : undefined,
  )
  return res.data.data
}

/**
 * 재배차 시작 — `POST /admin/dispatch-tasks/{taskId}/start-redispatch`.
 *
 * <p>MODIFICATION_ACCEPTED 상태에서 DRAFT 로 되돌리고 기존 발송 그룹을 다시 편집 가능하게 연다.
 * 응답은 BE 슬림 ack — 그룹 PENDING / slip UNDISPATCHED 즉시 반영은
 * {@code useStartRedispatchMutation} 의 상세 cache 병합이 수행한다.
 */
export async function startRedispatch(
  taskId: string,
): Promise<DispatchTaskSlimResponse> {
  const res = await apiClient.post<ApiEnvelope<DispatchTaskSlimResponse>>(
    `/admin/dispatch-tasks/${taskId}/start-redispatch`,
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// Phase C — 수정/취소 요청 (DISPATCHED 상태에서 활성)
// ---------------------------------------------------------------------------

/**
 * 수정 요청 발송 — `POST /admin/dispatch-tasks/{taskId}/modification-request`.
 *
 * <p>spec § 5.1 / plan BE B6.1. DISPATCHED 상태에서만 호출 가능 (BE 가드).
 * 호출 후 task.status = MODIFICATION_REQUESTED 로 갱신. arologis 가 비동기 회신 시 ACCEPTED 또는 REJECTED.
 *
 * @param taskId DispatchTask UUID (API path 만 사용, UI 노출 X).
 * @param reason 사유 텍스트 (500자 이하). BE @NotBlank 가드.
 */
export async function requestModification(
  taskId: string,
  reason: string,
): Promise<DispatchTaskSlimResponse> {
  const res = await apiClient.post<ApiEnvelope<DispatchTaskSlimResponse>>(
    `/admin/dispatch-tasks/${taskId}/modification-request`,
    { reason },
  )
  return res.data.data
}

/**
 * 취소 요청 발송 — `POST /admin/dispatch-tasks/{taskId}/cancellation-request`.
 *
 * <p>spec § 5.1 / plan BE B6.1. DISPATCHED 상태에서만 호출 가능.
 * 호출 후 task.status = CANCEL_REQUESTED 로 갱신. arologis 회신 시 CANCEL_ACCEPTED → CANCELLED 또는 CANCEL_REJECTED.
 */
export async function requestCancellation(
  taskId: string,
  reason: string,
): Promise<DispatchTaskSlimResponse> {
  const res = await apiClient.post<ApiEnvelope<DispatchTaskSlimResponse>>(
    `/admin/dispatch-tasks/${taskId}/cancellation-request`,
    { reason },
  )
  return res.data.data
}
