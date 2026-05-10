/**
 * arologis 배차 admin API 클라이언트 — P1-5 신규 3개 화면 전용.
 *
 * 담당 화면:
 * - `/arologis/admin/auto-dispatch`   — KakaoAutoDispatchPage (카카오톡 자동 매칭)
 * - `/arologis/admin/manual-dispatch` — ManualDispatchPage    (수동 배차)
 * - `/arologis/admin/driver-assignment` — DriverAssignmentPage (기사 배정)
 *
 * BE 출처 (arologis-service):
 * - GET  /admin/arologis/dispatches/unassigned?date          — 미배차 슬립 리스트
 * - POST /admin/arologis/dispatches/parse-kakao              — 카카오톡 자동 매칭
 * - POST /admin/arologis/dispatches/{dispatchCode}/assign    — 수동 기사 배정
 * - GET  /admin/arologis/drivers/available?date              — 가용 기사 조회
 * - GET  /admin/arologis/dispatches?date&status              — 배차 목록 조회
 *
 * UUID 비공개 가드 (feedback_uuid_no_user_visibility.md):
 * - 사용자 노출 식별자: slipNo / partnerCode / partnerName / address /
 *   driverCode / driverName / dispatchCode (비즈니스 코드)
 * - UUID (dispatchId, driverId 등) 는 내부 routing 용도에만 사용하며
 *   화면에 절대 노출 금지.
 *
 * 풀네임 ROLE (feedback_role_naming_full.md):
 * - DISPATCH / MANAGER / MASTER 3종.
 */
import { apiClient, type ApiEnvelope } from './client'
import type { UnassignedEntry } from './arologisDispatchApi'

// ---------------------------------------------------------------------------
// 공통 권한 — P1-5 3개 화면 모두 동일 (BE @PreAuthorize 와 1:1)
// ---------------------------------------------------------------------------

/**
 * P1-5 arologis admin 화면 진입 권한.
 *
 * BE: `@PreAuthorize("hasAnyRole('MASTER','MANAGER','DISPATCH')")`
 */
export const ARO_ADMIN_DISPATCH_ROLES = ['MASTER', 'MANAGER', 'DISPATCH'] as const

// ---------------------------------------------------------------------------
// 카카오톡 자동 매칭 (AutoDispatch)
// ---------------------------------------------------------------------------

/**
 * 카카오톡 자동 매칭 결과 항목 — BE AutoMatchResult.Entry 와 1:1.
 *
 * @property slipNo 전표번호 (사용자 노출 식별자)
 * @property partnerName 거래처명 (사용자 노출)
 * @property address 주소 (사용자 노출)
 * @property driverCode 배정된 기사 코드 (사용자 노출)
 * @property driverName 배정된 기사명 (사용자 노출)
 * @property vehicleLabel 차량 번호 / 별명 (사용자 노출)
 * @property confidence 매칭 신뢰도 0-100 (%)
 * @property matched 자동 매칭 성공 여부
 */
export interface AutoMatchResultEntry {
  slipNo: string
  partnerName: string | null
  address: string | null
  driverCode: string | null
  driverName: string | null
  vehicleLabel: string | null
  confidence: number
  matched: boolean
}

/**
 * 카카오톡 자동 매칭 응답 — BE AutoMatchResponse 와 1:1.
 *
 * @property date 배차 일자 (YYYY-MM-DD)
 * @property totalSlips 대상 슬립 총 건수
 * @property matchedCount 자동 매칭 성공 건수
 * @property unmatchedCount 자동 매칭 실패 건수 (수동 보정 필요)
 * @property entries 매칭 결과 행 리스트
 */
export interface AutoMatchResponse {
  date: string
  totalSlips: number
  matchedCount: number
  unmatchedCount: number
  entries: AutoMatchResultEntry[]
}

/**
 * 카카오톡 자동 매칭 실행 — POST /admin/arologis/dispatches/parse-kakao.
 *
 * 미배차 슬립을 대상으로 DriverMatcher (Mock + Insung) 를 호출하여
 * 자동으로 기사/차량을 배정한다. 매칭 실패 건은 수동 배차 화면에서 보정.
 *
 * @param date 배차 일자 (YYYY-MM-DD)
 */
export async function runAutoMatch(date: string): Promise<AutoMatchResponse> {
  const res = await apiClient.post<ApiEnvelope<AutoMatchResponse>>(
    '/admin/arologis/dispatches/parse-kakao',
    { date },
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// 수동 배차 (ManualDispatch) — 배차 목록 + 기사 직접 선택
// ---------------------------------------------------------------------------

/**
 * 배차 상태 enum — BE DispatchStatus 와 1:1.
 */
export type DispatchStatus = 'PENDING' | 'ASSIGNED' | 'IN_TRANSIT' | 'DONE' | 'CANCELLED'

/** 배차 상태 → 한국어 라벨. */
export const DISPATCH_STATUS_LABEL: Record<DispatchStatus, string> = {
  PENDING: '대기',
  ASSIGNED: '배정됨',
  IN_TRANSIT: '배송 중',
  DONE: '완료',
  CANCELLED: '취소',
}

/**
 * 배차 목록 항목 — BE DispatchSummary 와 1:1.
 *
 * @property dispatchCode 배차 비즈니스 코드 (사용자 노출 식별자)
 * @property dispatchDate 배차 일자 (YYYY-MM-DD)
 * @property status 배차 상태
 * @property driverCode 배정 기사 코드 (null = 미배정)
 * @property driverName 배정 기사명 (null = 미배정)
 * @property vehicleLabel 차량 번호 / 별명
 * @property totalStops 정차 건수
 * @property totalSlips 연결 슬립 건수
 */
export interface DispatchSummary {
  dispatchCode: string
  dispatchDate: string
  status: DispatchStatus
  driverCode: string | null
  driverName: string | null
  vehicleLabel: string | null
  totalStops: number
  totalSlips: number
}

/**
 * 배차 목록 응답.
 *
 * @property dispatches 배차 항목 리스트
 * @property totalCount 전체 건수
 */
export interface DispatchListResponse {
  dispatches: DispatchSummary[]
  totalCount: number
}

/**
 * 배차 목록 조회 — GET /admin/arologis/dispatches?date&status.
 *
 * @param date 배차 일자 (YYYY-MM-DD)
 * @param status 상태 필터 (미지정 시 전체)
 */
export async function getDispatchList(
  date: string,
  status?: DispatchStatus,
): Promise<DispatchListResponse> {
  const res = await apiClient.get<ApiEnvelope<DispatchListResponse>>(
    '/admin/arologis/dispatches',
    { params: { date, ...(status ? { status } : {}) } },
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// 기사 배정 (DriverAssignment)
// ---------------------------------------------------------------------------

/**
 * 가용 기사 항목 — BE AvailableDriverDto 와 1:1.
 *
 * @property driverCode 기사 코드 (사용자 노출 식별자)
 * @property driverName 기사 성명
 * @property phone 휴대전화 (010-0000-0000 형식)
 * @property vehicleLabel 차량 번호 / 별명
 * @property region 주 운행 권역
 * @property active 활성 여부 (false = 휴직/퇴사)
 * @property currentDispatchCount 해당 일자 현재 배차 건수 (과부하 방지)
 */
export interface AvailableDriver {
  driverCode: string
  driverName: string
  phone: string
  vehicleLabel: string | null
  region: string | null
  active: boolean
  currentDispatchCount: number
}

/**
 * 가용 기사 목록 응답.
 */
export interface AvailableDriverListResponse {
  date: string
  drivers: AvailableDriver[]
}

/**
 * 기사 배정 요청 — POST /admin/arologis/dispatches/{dispatchCode}/assign.
 */
export interface AssignDriverRequest {
  driverCode: string
}

/**
 * 기사 배정 응답.
 *
 * @property dispatchCode 배차 비즈니스 코드
 * @property driverCode 배정된 기사 코드
 * @property driverName 배정된 기사명
 */
export interface AssignDriverResponse {
  dispatchCode: string
  driverCode: string
  driverName: string
}

/**
 * 가용 기사 목록 조회 — GET /admin/arologis/drivers/available?date.
 *
 * @param date 조회 일자 (YYYY-MM-DD)
 */
export async function getAvailableDrivers(
  date: string,
): Promise<AvailableDriverListResponse> {
  const res = await apiClient.get<ApiEnvelope<AvailableDriverListResponse>>(
    '/admin/arologis/drivers/available',
    { params: { date } },
  )
  return res.data.data
}

/**
 * 기사 배정 (수동) — POST /admin/arologis/dispatches/{dispatchCode}/assign.
 *
 * @param dispatchCode 배차 비즈니스 코드
 * @param driverCode 배정할 기사 코드
 */
export async function assignDriver(
  dispatchCode: string,
  driverCode: string,
): Promise<AssignDriverResponse> {
  const res = await apiClient.post<ApiEnvelope<AssignDriverResponse>>(
    `/admin/arologis/dispatches/${dispatchCode}/assign`,
    { driverCode } satisfies AssignDriverRequest,
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// 재사용 — UnassignedEntry (arologisDispatchApi 에서 공유)
// ---------------------------------------------------------------------------

export type { UnassignedEntry }
