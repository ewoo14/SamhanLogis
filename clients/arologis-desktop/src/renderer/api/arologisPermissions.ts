/**
 * 아로로지스 권한 관리 admin API (`/admin/arologis/permissions`).
 *
 * arologis.* page-code 의 롤별 권한(view/edit) 매트릭스를 조회·할당한다. grant 는 중앙
 * auth-service `role_page_permissions` 에 저장되며, arologis-service 가
 * `ArologisPermissionAdminController` 를 통해 위임한다.
 *
 * UUID 비공개 가드: roleCode / pageCode 비즈니스 키만 사용한다(권한 행 UUID 비노출).
 *
 * BE 계약(PR #430): ArologisPermissionAdminController + AuthPermissionAdminClient 의
 * record(RolePagePermissionView / RoleGrantRequest) 와 정확히 일치한다.
 * - GET  /admin/arologis/permissions → Map<roleCode, Map<pageCode, RolePagePermissionView>>
 * - PUT  /admin/arologis/permissions  body {roleCode, pageCode, canView, canEdit} → 단건 upsert
 *   (서버: MASTER 롤 변경 거부 / arologis.* 외 page-code 거부 / AROLOGIS_MASTER 전용)
 */
import { apiClient, type ApiEnvelope } from './client'

/**
 * 롤-페이지 권한 뷰 (BE RolePagePermissionView record 일치).
 *
 * UUID 없음 — roleCode/pageCode 가 비즈니스 키. displayName 은 page-code 한국어 명칭.
 */
export interface RolePagePermissionView {
  roleCode: string
  pageCode: string
  displayName: string
  canView: boolean
  canEdit: boolean
}

/**
 * 권한 매트릭스 — roleCode → pageCode → 권한 정보.
 *
 * 서버는 arologis.* prefix 로 스코프하여 실제 grant 된 롤 행만 반환한다.
 */
export type PermissionMatrix = Record<string, Record<string, RolePagePermissionView>>

/** 권한 할당(upsert) 요청 body (BE RoleGrantRequest record 일치). */
export interface RoleGrantRequest {
  roleCode: string
  pageCode: string
  canView: boolean
  canEdit: boolean
}

const PERMISSIONS_BASE = '/admin/arologis/permissions'

/**
 * arologis.* 롤별 권한 매트릭스 조회.
 *
 * @return roleCode → pageCode → 권한 정보 매트릭스
 */
export async function getMatrix(): Promise<PermissionMatrix> {
  const res = await apiClient.get<ApiEnvelope<PermissionMatrix>>(PERMISSIONS_BASE)
  return res.data.data
}

/**
 * 단일 롤-페이지 권한 할당(upsert).
 *
 * `canEdit=true` 인 경우 중앙 도메인 규칙상 `canView` 가 자동 true 로 보장된다.
 *
 * @param roleCode 역할 코드 (대문자/밑줄)
 * @param pageCode 페이지 코드 (arologis.* — 서버 가드로 강제)
 * @param canView  조회 권한 부여 여부
 * @param canEdit  편집 권한 부여 여부
 * @return upsert 결과 권한 정보
 */
export async function updateGrant(
  roleCode: string,
  pageCode: string,
  canView: boolean,
  canEdit: boolean,
): Promise<RolePagePermissionView> {
  const body: RoleGrantRequest = { roleCode, pageCode, canView, canEdit }
  const res = await apiClient.put<ApiEnvelope<RolePagePermissionView>>(PERMISSIONS_BASE, body)
  return res.data.data
}
