/**
 * 사업자 양식 API 클라이언트 (supplier-profile 슬라이스).
 *
 * BE endpoint: accounting-service `/api/v1/accounting/supplier-profiles`
 *
 * 노출 endpoint 6개:
 * - GET    /accounting/supplier-profiles           전체 목록 (보통 1~2건)
 * - GET    /accounting/supplier-profiles/primary   기본 사업자 단건
 * - POST   /accounting/supplier-profiles           신규 등록 (MANAGER/MASTER)
 * - PUT    /accounting/supplier-profiles/{id}      수정 (MANAGER/MASTER)
 * - POST   /accounting/supplier-profiles/{id}/mark-primary  기본 사업자 전환 (MANAGER/MASTER)
 * - DELETE /accounting/supplier-profiles/{id}      삭제 (비기본만, MANAGER/MASTER)
 *
 * UUID 비공개 가드:
 * - `SupplierProfile.id` UUID 는 path param 내부 전용. 화면 표시 X.
 * - 사용자 노출 식별자는 businessNumber (사업자등록번호) 와 companyName (상호).
 *
 * RoleGuard:
 * - ACCOUNTANT: 조회만 (read-only)
 * - MANAGER / MASTER: 전체 CRUD
 */
import { apiClient, type ApiEnvelope } from './client'

/**
 * 사업자 정보 DTO (BE `SupplierProfileResponse` 와 1:1).
 *
 * @property id           - 내부 UUID (화면 미노출)
 * @property businessNumber - 사업자등록번호 (10자리 숫자, 하이픈 없음)
 * @property subBusinessNumber - 종사업장번호 (4자리, optional)
 * @property companyName  - 상호
 * @property ceoName      - 대표 성명
 * @property address      - 사업장 주소
 * @property businessType - 업태
 * @property businessItem - 종목
 * @property email        - 이메일 (세금계산서 수신용)
 * @property isPrimary    - 기본 사업자 여부
 * @property createdAt    - 등록 일시 (ISO8601)
 * @property updatedAt    - 수정 일시 (ISO8601)
 */
export interface SupplierProfile {
  id: string
  businessNumber: string
  subBusinessNumber: string | null
  companyName: string
  ceoName: string
  address: string
  businessType: string
  businessItem: string
  email: string
  isPrimary: boolean
  createdAt: string
  updatedAt: string
}

/**
 * 사업자 등록/수정 요청 DTO (BE `SupplierProfileRequest` 와 1:1).
 *
 * Bean Validation 기준:
 * - businessNumber: @Pattern(regexp = "\\d{10}")  10자리 숫자
 * - subBusinessNumber: @Pattern(regexp = "\\d{4}") 4자리 숫자, nullable
 * - companyName: @NotBlank
 * - ceoName: @NotBlank
 * - address: @NotBlank
 * - businessType: @NotBlank
 * - businessItem: @NotBlank
 * - email: @Email, nullable
 */
export interface SupplierProfileRequest {
  businessNumber: string
  subBusinessNumber: string | null
  companyName: string
  ceoName: string
  address: string
  businessType: string
  businessItem: string
  email: string
}

/**
 * 사업자 목록 전체 조회.
 * 일반적으로 1~2건 (기본 사업자 + 다중 사업자).
 */
export async function listSupplierProfiles(): Promise<SupplierProfile[]> {
  const res = await apiClient.get<ApiEnvelope<SupplierProfile[]>>(
    '/accounting/supplier-profiles',
  )
  return res.data.data
}

/**
 * 기본 사업자 단건 조회.
 * 등록된 기본 사업자가 없으면 BE 404 → catch 로 null 반환.
 */
export async function getPrimarySupplierProfile(): Promise<SupplierProfile | null> {
  try {
    const res = await apiClient.get<ApiEnvelope<SupplierProfile>>(
      '/accounting/supplier-profiles/primary',
    )
    return res.data.data
  } catch {
    return null
  }
}

/**
 * 사업자 신규 등록 (MANAGER/MASTER 전용).
 */
export async function createSupplierProfile(
  req: SupplierProfileRequest,
): Promise<SupplierProfile> {
  const res = await apiClient.post<ApiEnvelope<SupplierProfile>>(
    '/accounting/supplier-profiles',
    req,
  )
  return res.data.data
}

/**
 * 사업자 정보 수정 (MANAGER/MASTER 전용).
 *
 * @param id  - 내부 UUID (화면 미노출 — path param 전용)
 * @param req - 수정 필드
 */
export async function updateSupplierProfile(
  id: string,
  req: SupplierProfileRequest,
): Promise<SupplierProfile> {
  const res = await apiClient.put<ApiEnvelope<SupplierProfile>>(
    `/accounting/supplier-profiles/${id}`,
    req,
  )
  return res.data.data
}

/**
 * 기본 사업자 전환 (MANAGER/MASTER 전용).
 * BE 가 기존 primary 를 자동 해제하고 지정 id 를 primary 로 설정.
 *
 * @param id - 기본 사업자로 지정할 UUID (path param 전용)
 */
export async function markAsPrimarySupplierProfile(
  id: string,
): Promise<SupplierProfile> {
  const res = await apiClient.post<ApiEnvelope<SupplierProfile>>(
    `/accounting/supplier-profiles/${id}/mark-primary`,
  )
  return res.data.data
}

/**
 * 사업자 삭제 (MANAGER/MASTER 전용).
 * BE 가 isPrimary=true 인 항목은 400 거부.
 *
 * @param id - 삭제할 UUID (path param 전용)
 */
export async function deleteSupplierProfile(id: string): Promise<void> {
  await apiClient.delete(`/accounting/supplier-profiles/${id}`)
}
