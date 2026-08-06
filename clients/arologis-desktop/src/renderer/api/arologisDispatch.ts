/**
 * arologis 가배차 분류 API 클라이언트 — Phase 10 PR-E1 FE-2.
 *
 * <p>매뉴얼: 출고전표 자동 조회 → 권역 (REGION 마스터) 또는 시도 (광역 prefix) 분류로
 * 가배차 작업 전 사전 분류 화면. legacy GAS 2번 (REGION) + 15번 (시도) 이식.
 *
 * <p>BE 출처 (commit e5dc20f):
 * - services/arologis-service/.../controller/ArologisAdminController#preClassify (BE-A2)
 * - services/arologis-service/.../controller/ArologisAdminController#regional   (BE-A4)
 * - dto/PreClassifyResponse.java + dto/RegionalDispatchResponse.java
 *
 * <p>노출 endpoint (BE @PreAuthorize 와 1:1):
 * <ul>
 *   <li>GET /admin/arologis/dispatches/pre-classify?from&to — 권역 분류 (REGION 마스터)
 *       (MASTER/MANAGER/DISPATCH)</li>
 *   <li>GET /admin/arologis/dispatches/regional?date        — 시도 분류 (광역 prefix)
 *       (MASTER/MANAGER/DISPATCH)</li>
 *   <li>GET /admin/arologis/dispatches/unassigned?date      — 미배차 리스트 (FE-3)
 *       (MASTER/MANAGER/DISPATCH)</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 (feedback_uuid_no_user_visibility.md):
 * - 응답 entry 의 사용자 노출 식별자는 slipNo / partnerCode / partnerName / address /
 *   regionGroup (탭1) / sido (탭2) 만.
 * - dispatchId 등 UUID 는 응답에 포함되지 않음 (BE record 가 비공개 처리).
 *
 * <p>풀네임 ROLE (feedback_role_naming_full.md): MASTER / MANAGER / DISPATCH.
 */
import { apiClient, type ApiEnvelope } from './client'

/** 레거시 가배차분류리스트 호환 8개 실행 모드. */
export type DispatchExecutionMode =
  | 'SANGIL_AND_CHOWOL_REGION_EXCLUDED'
  | 'CHOWOL_REGION_EXCLUDED'
  | 'SANGIL_REGION_EXCLUDED'
  | 'STACK_ONLY'
  | 'REGION_ONLY'
  | 'SANGIL_AND_CHOWOL_REGION_INCLUDED'
  | 'CHOWOL_REGION_INCLUDED'
  | 'SANGIL_REGION_INCLUDED'

/**
 * 가배차 (REGION 권역) 분류 entry — BE {@code PreClassifyResponse.Entry} 와 1:1.
 *
 * @property slipNo 전표번호 (사용자 노출 식별자)
 * @property partnerCode 거래처 코드 (사용자 노출 식별자)
 * @property partnerName 거래처 상호 (사용자 노출)
 * @property address 거래처 주소 (RegionClassifier 입력값)
 * @property regionGroup 매칭된 권역 그룹명 (예: "서울특별시" / "경기동부"). 미매칭 시 null.
 * @property dispatchPlanned 본 슬립이 이미 dispatch 에 할당되어 있는지 여부.
 */
export interface PreClassifyEntry {
  slipNo: string
  partnerCode: string
  partnerName: string
  address: string
  regionGroup: string | null
  dispatchPlanned: boolean
}

/**
 * 가배차 분류 응답 — BE {@code PreClassifyResponse} 와 1:1.
 *
 * @property regionGroups 권역 그룹명 → 슬립 entry 리스트 매핑 (서비스측 정렬 보존).
 * @property unclassified RegionClassifier 매칭 실패 (group=null) 출고전표 entry 리스트.
 */
export interface PreClassifyResponse {
  regionGroups: Record<string, PreClassifyEntry[]>
  unclassified: PreClassifyEntry[]
  /** 창고 code provenance가 없어 UNKNOWN으로 제외된 원천 전표 수. */
  unknownWarehouseCount: number
}

/**
 * 지방 가배차 (시도) entry — BE {@code RegionalDispatchResponse.Entry} 와 1:1.
 *
 * @property slipNo 전표번호 (사용자 노출 식별자)
 * @property partnerCode 거래처 코드 (사용자 노출 식별자)
 * @property partnerName 거래처 상호 (사용자 노출)
 * @property address 거래처 주소 (광역 prefix 매칭 source)
 * @property sido 매칭된 시도명 (예: "서울" / "부산"). 미매칭 시 null.
 */
export interface RegionalEntry {
  slipNo: string
  partnerCode: string
  partnerName: string
  address: string
  sido: string | null
}

/**
 * 지방 가배차 분류 응답 — BE {@code RegionalDispatchResponse} 와 1:1.
 *
 * @property date 조회 기준 일자 (요청 파라미터 echo, ISO YYYY-MM-DD).
 * @property sidoGroups 시도명 → 슬립 entry 리스트.
 * @property unmatched 광역 prefix 매칭 실패 슬립 entry.
 */
export interface RegionalResponse {
  date: string
  sidoGroups: Record<string, RegionalEntry[]>
  unmatched: RegionalEntry[]
}

/**
 * 가배차 분류 admin 진입 권한.
 *
 * <p>BE {@code @PreAuthorize("hasAnyRole('MASTER','MANAGER','DISPATCH')")} 와 1:1.
 * DISPATCH 가 신규로 추가됨 — 운영 가능 role 전체 노출.
 */
export const ARO_PRECLASSIFY_ROLES = [
  'AROLOGIS_MASTER',
  'AROLOGIS_MANAGER',
] as const

/**
 * 가배차 분류 (REGION 권역) 조회.
 *
 * @param from 조회 시작일 (ISO YYYY-MM-DD)
 * @param to 조회 종료일 (ISO YYYY-MM-DD, from 이후)
 */
export async function getPreClassify(
  from: string,
  to: string,
  mode?: DispatchExecutionMode,
): Promise<PreClassifyResponse> {
  const res = await apiClient.get<ApiEnvelope<PreClassifyResponse>>(
    '/admin/arologis/dispatches/pre-classify',
    { params: { from, to, ...(mode ? { mode } : {}) } },
  )
  return res.data.data
}

/**
 * 지방 가배차 (시도) 조회.
 *
 * @param date 조회 일자 (ISO YYYY-MM-DD)
 */
export async function getRegional(date: string): Promise<RegionalResponse> {
  const res = await apiClient.get<ApiEnvelope<RegionalResponse>>(
    '/admin/arologis/dispatches/regional',
    { params: { date } },
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// FE-3 — 미배차 리스트 (legacy GAS 7번 이식)
// ---------------------------------------------------------------------------

/**
 * 미배차 entry — BE {@code UnassignedSlipResponse.Entry} 와 1:1.
 *
 * <p>BE record 는 nullable 명시가 없으나, {@code UnassignedService} 가 거래처
 * 미연결 슬립도 entry 로 push 하므로 partnerCode/partnerName/address 모두
 * nullable 로 안전 측 정의.
 *
 * @property slipNo 전표번호 (사용자 노출 필수 식별자)
 * @property partnerCode 거래처 코드 (사용자 노출, null 가능)
 * @property partnerName 거래처 상호 (사용자 노출, null 가능)
 * @property address 거래처 주소 (사용자 노출, null 가능)
 */
export interface UnassignedEntry {
  slipNo: string
  partnerCode: string | null
  partnerName: string | null
  address: string | null
}

/**
 * 미배차 응답 — BE {@code UnassignedSlipResponse} 와 1:1.
 *
 * <p>slice 명세의 {@code items} / {@code scheduledTime} 컬럼은 BE record 가
 * 보유하지 않으므로 본 client / 화면에는 표시하지 않는다. BE schema 가
 * 확장되면 본 인터페이스도 함께 갱신한다 (services/arologis-service/.../dto/
 * UnassignedSlipResponse.java).
 *
 * @property date 조회 일자 (요청 echo, yyyy-MM-dd)
 * @property totalOutbound 기간 OUTBOUND 슬립 총 건수
 * @property unassignedCount 미배차 슬립 건수 (entries.length 와 동일)
 * @property entries 미배차 슬립 entry 리스트
 */
export interface UnassignedResponse {
  date: string
  totalOutbound: number
  unassignedCount: number
  entries: UnassignedEntry[]
}

/**
 * 미배차 출고전표 조회 — {@code GET /admin/arologis/dispatches/unassigned?date=}.
 *
 * @param date 조회 일자 (ISO YYYY-MM-DD, 필수)
 * @return 일자 OUTBOUND 슬립 중 dispatch 미할당 리스트
 */
export async function getUnassigned(date: string): Promise<UnassignedResponse> {
  const res = await apiClient.get<ApiEnvelope<UnassignedResponse>>(
    '/admin/arologis/dispatches/unassigned',
    { params: { date } },
  )
  return res.data.data
}

/**
 * 미배차 리스트 화면 진입 권한 (BE @PreAuthorize 와 1:1).
 *
 * <p>풀네임 의무 (feedback_role_naming_full.md). DISPATCH 역할은 backlog 단계의
 * 신규 role 이며 현재 운영 사용자는 MASTER / MANAGER 만 매핑되지만, BE 가 이미
 * 화이트리스트에 포함하므로 FE 도 동일 집합 유지.
 */
export const ARO_UNASSIGNED_ROLES = [
  'AROLOGIS_MASTER',
  'AROLOGIS_MANAGER',
] as const
