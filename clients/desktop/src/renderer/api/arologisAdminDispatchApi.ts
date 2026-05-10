/**
 * arologis 배차 admin API 클라이언트 — P1-5 신규 3개 화면 전용.
 *
 * 담당 화면:
 * - `/arologis/admin/auto-dispatch`     — KakaoAutoDispatchPage (카카오톡 자동 매칭)
 * - `/arologis/admin/manual-dispatch`   — ManualDispatchAdminPage (수동 배차)
 * - `/arologis/admin/driver-assignment` — DriverAssignmentPage (기사 배정)
 *
 * BE 출처 — `services/arologis-service/.../controller/DispatchAdminV1Controller`
 * (neo P1-5 admin V1 controller — `/api/v1/arologis/admin` prefix).
 *
 * 노출 endpoint (BE @PreAuthorize MASTER/MANAGER 와 1:1):
 * - GET   `/api/v1/arologis/admin/dispatches?status&fromDate&toDate&page&size`
 *         배차 list 페이징 (DispatchPageResponse).
 * - POST  `/api/v1/arologis/admin/dispatches/auto-match` body{dispatchId}
 *         자동 매칭 trigger (DispatchService.AutoMatchResult).
 * - POST  `/api/v1/arologis/admin/dispatches/{id}/manual-assign` body{vehicleSeq, driverCode}
 *         수동 배차 (Map dispatchId/vehicleSeq/driverCode).
 * - PATCH `/api/v1/arologis/admin/dispatches/{id}/driver` body{vehicleSeq, newDriverCode}
 *         기사 변경 (Map dispatchId/vehicleSeq/newDriverCode).
 * - GET   `/api/v1/arologis/admin/drivers/available?date&zoneId`
 *         가용 기사 list (AvailableDriverResponse).
 *
 * 보조 endpoint (재사용):
 * - GET `/admin/arologis/dispatches/unassigned?date` — 미배차 출고전표 리스트
 *   (`arologisDispatchApi.ts` 의 `getUnassigned` 재사용, KakaoAutoDispatchPage 실행 전 현황).
 *
 * UUID 비공개 가드 (feedback_uuid_no_user_visibility.md):
 * - 사용자 노출 식별자: driverCode / phoneNumber / vehicleType / dispatch type / sequence.
 * - dispatchId UUID 는 admin routing 전용 (응답 dispatchId 필드는 raw UUID string 이지만
 *   화면 라벨에는 "배차 #<seq>" 또는 dispatch type + 일자로만 표시).
 *
 * 풀네임 ROLE (feedback_role_naming_full.md): MASTER / MANAGER (BE @PreAuthorize 정확 일치).
 *
 * PR #134~144 회고 가드: BE record 1:1, 한국어 error message, ApiResponse{success,data,error,meta}.
 */
import { apiClient, type ApiEnvelope } from './client'
import type { UnassignedEntry } from './arologisDispatchApi'

// ---------------------------------------------------------------------------
// 공통 권한 — P1-5 3개 화면 모두 동일 (BE @PreAuthorize 와 1:1)
// ---------------------------------------------------------------------------

/**
 * P1-5 arologis admin 화면 진입 권한.
 *
 * BE: `@PreAuthorize("hasAnyRole('MASTER','MANAGER')")` (DispatchAdminV1Controller).
 *
 * NOTE — 기존 `arologisDispatchApi.ts` 의 `ARO_PRECLASSIFY_ROLES` 는 DISPATCH 도 포함하지만,
 * P1-5 신규 admin V1 controller 는 MASTER/MANAGER 만 허용. BE 정책과 1:1 일치.
 */
export const ARO_ADMIN_DISPATCH_ROLES = ['MASTER', 'MANAGER'] as const

// ---------------------------------------------------------------------------
// DispatchType — BE com.samhanair.logis.arologis.domain.DispatchType 와 1:1
// ---------------------------------------------------------------------------

/** 배차 유형 — BE DispatchType enum 1:1. */
export type DispatchType = 'DAY' | 'NIGHT' | 'EXPRESS'

// ---------------------------------------------------------------------------
// DispatchStatus — DISPATCH-DESIGN.md §2.1 / BE DispatchStatus enum 1:1
// ---------------------------------------------------------------------------

/**
 * 배차 상태 코드 — DISPATCH-DESIGN.md §2.1 8종.
 *
 * PENDING           대기중
 * AUTO_MATCHED      자동 매칭됨
 * MANUALLY_ASSIGNED 수동 배정됨
 * DRIVER_ASSIGNED   기사 배정됨
 * IN_TRANSIT        운송중
 * DELIVERED         배달완료
 * CANCELLED         취소됨
 * FAILED            매칭실패
 */
export type DispatchStatus =
  | 'PENDING'
  | 'AUTO_MATCHED'
  | 'MANUALLY_ASSIGNED'
  | 'DRIVER_ASSIGNED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'FAILED'

// ---------------------------------------------------------------------------
// DriverAvailabilityStatus — DISPATCH-DESIGN.md §2.2 / BE enum 1:1
// ---------------------------------------------------------------------------

/**
 * 기사 가용 상태 코드 — DISPATCH-DESIGN.md §2.2.
 *
 * AVAILABLE  가용
 * ON_ROUTE   운행중
 * OFF_DUTY   비가용
 * BREAK      휴식중
 */
export type DriverAvailabilityStatus = 'AVAILABLE' | 'ON_ROUTE' | 'OFF_DUTY' | 'BREAK'

/** DispatchType → 한국어 라벨. */
export const DISPATCH_TYPE_LABEL: Record<DispatchType, string> = {
  DAY: '주간',
  NIGHT: '야상',
  EXPRESS: '특급',
}

// ---------------------------------------------------------------------------
// 1) GET /api/v1/arologis/admin/dispatches — 배차 list 페이징
// ---------------------------------------------------------------------------

/**
 * 배차 요약 1건 — BE `DispatchPageResponse.DispatchSummary` record 1:1.
 *
 * @property dispatchId     admin routing 전용 UUID string (사용자 라벨에는 직접 노출 X)
 * @property dispatchDate   배차 일자 (ISO YYYY-MM-DD)
 * @property dispatchType   배차 유형
 * @property dispatchStatus 배차 상태 (DISPATCH-DESIGN.md §2.1)
 * @property vehicleCount   배차 내 차량 수
 * @property createdAt      생성 일시 (ISO LocalDateTime)
 */
export interface DispatchSummary {
  dispatchId: string
  dispatchDate: string
  dispatchType: DispatchType
  dispatchStatus: DispatchStatus
  vehicleCount: number
  createdAt: string
}

/**
 * 배차 list 페이징 응답 — BE `DispatchPageResponse` record 1:1.
 *
 * @property content       현재 페이지 배차 요약 list
 * @property totalElements 전체 건수
 * @property totalPages    전체 페이지 수
 * @property page          현재 페이지 (0-based)
 * @property size          페이지 크기
 */
export interface DispatchPageResponse {
  content: DispatchSummary[]
  totalElements: number
  totalPages: number
  page: number
  size: number
}

/**
 * 배차 list 조회 — BE `GET /api/v1/arologis/admin/dispatches`.
 *
 * @param params 필터 / 페이징 (모두 optional, BE default page=0 size=20)
 */
export async function listDispatches(params: {
  status?: DispatchType
  fromDate?: string
  toDate?: string
  page?: number
  size?: number
} = {}): Promise<DispatchPageResponse> {
  const res = await apiClient.get<ApiEnvelope<DispatchPageResponse>>(
    '/api/v1/arologis/admin/dispatches',
    { params },
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// 2) POST /api/v1/arologis/admin/dispatches/auto-match — 자동 매칭
// ---------------------------------------------------------------------------

/**
 * 자동 매칭 결과 — BE `DispatchService.AutoMatchResult` record 1:1.
 *
 * @property totalVehicles 대상 차량 수 (PENDING)
 * @property matched       자동 매칭 성공 차량 수
 */
export interface AutoMatchResult {
  totalVehicles: number
  matched: number
}

/**
 * 자동 매칭 trigger — BE `POST /api/v1/arologis/admin/dispatches/auto-match`.
 *
 * dispatchId 배차 내 PENDING 차량 전체에 대해 활성 DriverMatcher 호출.
 *
 * @param dispatchId 배차 UUID (admin routing 전용)
 */
export async function triggerAutoMatch(dispatchId: string): Promise<AutoMatchResult> {
  const res = await apiClient.post<ApiEnvelope<AutoMatchResult>>(
    '/api/v1/arologis/admin/dispatches/auto-match',
    { dispatchId },
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// 3) POST /api/v1/arologis/admin/dispatches/{id}/manual-assign — 수동 배차
// ---------------------------------------------------------------------------

/**
 * 수동 배차 응답 — BE Map{dispatchId, vehicleSeq, driverCode}.
 */
export interface ManualAssignResponse {
  dispatchId: string
  vehicleSeq: number
  driverCode: string
}

/**
 * 수동 배차 — BE `POST /api/v1/arologis/admin/dispatches/{id}/manual-assign`.
 *
 * vehicleSeq + driverCode 지정으로 배차 내 특정 차량에 기사 수동 배정.
 *
 * @param dispatchId 배차 UUID
 * @param vehicleSeq 차량 순번 (1-based)
 * @param driverCode 기사 식별 코드 (UUID 비공개 가드)
 */
export async function manualAssign(
  dispatchId: string,
  vehicleSeq: number,
  driverCode: string,
): Promise<ManualAssignResponse> {
  const res = await apiClient.post<ApiEnvelope<ManualAssignResponse>>(
    `/api/v1/arologis/admin/dispatches/${dispatchId}/manual-assign`,
    { vehicleSeq, driverCode },
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// 4) PATCH /api/v1/arologis/admin/dispatches/{id}/driver — 기사 변경
// ---------------------------------------------------------------------------

/**
 * 기사 변경 응답 — BE Map{dispatchId, vehicleSeq, newDriverCode}.
 */
export interface ChangeDriverResponse {
  dispatchId: string
  vehicleSeq: number
  newDriverCode: string
}

/**
 * 기사 변경 — BE `PATCH /api/v1/arologis/admin/dispatches/{id}/driver`.
 *
 * 이미 ASSIGNED 상태 차량의 기사를 새 driverCode 로 교체. MatchSource.MANUAL 재기록.
 *
 * @param dispatchId    배차 UUID
 * @param vehicleSeq    차량 순번 (1-based)
 * @param newDriverCode 변경할 기사 식별 코드 (UUID 비공개 가드)
 */
export async function changeDriver(
  dispatchId: string,
  vehicleSeq: number,
  newDriverCode: string,
): Promise<ChangeDriverResponse> {
  const res = await apiClient.patch<ApiEnvelope<ChangeDriverResponse>>(
    `/api/v1/arologis/admin/dispatches/${dispatchId}/driver`,
    { vehicleSeq, newDriverCode },
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// 5) GET /api/v1/arologis/admin/drivers/available — 가용 기사 list
// ---------------------------------------------------------------------------

/**
 * 기사 source — BE com.samhanair.logis.arologis.domain.DriverSource enum 1:1.
 */
export type DriverSource = 'INTERNAL' | 'INSUNG' | 'EXTERNAL'

/** DriverSource → 한국어 라벨. */
export const DRIVER_SOURCE_LABEL: Record<DriverSource, string> = {
  INTERNAL: '본 어플',
  INSUNG: '인성데이타',
  EXTERNAL: '외부',
}

/**
 * 가용 기사 1건 — BE `AvailableDriverResponse.AvailableDriver` record 1:1.
 *
 * @property driverCode          사용자 노출 식별자 (UUID 비공개 가드)
 * @property phoneNumber         전화번호 (010-0000-0000 형식)
 * @property vehicleType         차량 종류 (예: "1톤" / "2.5톤" / "5톤")
 * @property source              기사 소스 (INTERNAL / INSUNG / EXTERNAL)
 * @property appInstalled        본 어플 설치 여부 (null 가능 — BE Boolean wrapper)
 * @property availabilityStatus  기사 가용 상태 (DISPATCH-DESIGN.md §2.2)
 */
export interface AvailableDriver {
  driverCode: string
  phoneNumber: string
  vehicleType: string | null
  source: DriverSource
  appInstalled: boolean | null
  availabilityStatus: DriverAvailabilityStatus
}

/**
 * 가용 기사 list 응답 — BE `AvailableDriverResponse` record 1:1.
 *
 * @property availableDrivers 가용 기사 list
 * @property queryDate        조회 일자 (ISO YYYY-MM-DD)
 * @property zoneId           조회 권역 필터 (null 이면 전체)
 * @property totalCount       가용 기사 총 수
 */
export interface AvailableDriverResponse {
  availableDrivers: AvailableDriver[]
  queryDate: string
  zoneId: string | null
  totalCount: number
}

/**
 * 가용 기사 list — BE `GET /api/v1/arologis/admin/drivers/available`.
 *
 * @param date   조회 기준 일자 (ISO YYYY-MM-DD, 기본 = 오늘)
 * @param zoneId 권역 ID 필터 (vehicleType 포함 문자열, optional)
 */
export async function getAvailableDrivers(
  date?: string,
  zoneId?: string,
): Promise<AvailableDriverResponse> {
  const res = await apiClient.get<ApiEnvelope<AvailableDriverResponse>>(
    '/api/v1/arologis/admin/drivers/available',
    { params: { ...(date ? { date } : {}), ...(zoneId ? { zoneId } : {}) } },
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// 재사용 — UnassignedEntry (arologisDispatchApi 에서 공유)
// ---------------------------------------------------------------------------

export type { UnassignedEntry }
