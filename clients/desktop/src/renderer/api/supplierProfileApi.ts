/**
 * 사업자 양식 API 클라이언트 (supplier-profile 슬라이스).
 *
 * BE endpoint: accounting-service `/api/v1/accounting/supplier-profiles`
 *
 * 노출 endpoint 8개:
 * - GET    /accounting/supplier-profiles               전체 목록 (보통 1~2건; bankAccounts 포함, stampPngBase64 null)
 * - GET    /accounting/supplier-profiles/primary       기본 사업자 단건
 * - GET    /accounting/supplier-profiles/{id}          상세 단건 (stamp 포함)
 * - GET    /accounting/supplier-profiles/print-profile 인쇄용 기본 사업자 공개 정보 (인증만, 권한 게이트 없음)
 * - POST   /accounting/supplier-profiles               신규 등록 (MANAGER/MASTER)
 * - PUT    /accounting/supplier-profiles/{id}          수정 (MANAGER/MASTER)
 * - PATCH  /accounting/supplier-profiles/{id}/primary  기본 사업자 전환 (MANAGER/MASTER)
 * - DELETE /accounting/supplier-profiles/{id}          삭제 (비기본만, MANAGER/MASTER)
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
 * 입금계좌 DTO (BE `SupplierBankAccountResponse` 와 1:1).
 *
 * @property accountHolder - 예금주
 * @property bankName      - 은행명
 * @property accountNumber - 계좌번호
 * @property displayOrder  - 표시 순서 (배열 인덱스와 일치)
 * @property exposed       - 거래명세서/세금계산서 명세서 노출 여부 (default: true)
 */
export interface SupplierBankAccount {
  accountHolder: string
  bankName: string
  accountNumber: string
  displayOrder: number
  exposed: boolean
}

/**
 * 사업자 정보 DTO (BE `SupplierProfileResponse` 와 1:1).
 *
 * @property id               - 내부 UUID (화면 미노출)
 * @property version          - 낙관적 잠금 버전 (BE @Version)
 * @property businessNumber   - 사업자등록번호 (10자리 숫자, 하이픈 없음)
 * @property subBusinessNumber - 종사업장번호 (4자리, optional)
 * @property companyName      - 상호
 * @property representativeName - 대표 성명 (BE DTO 필드명 일치)
 * @property businessAddress  - 사업장 주소 (BE DTO 필드명 일치)
 * @property businessType     - 업태
 * @property businessItem     - 종목
 * @property email            - 이메일 (세금계산서 수신용)
 * @property isPrimary        - 기본 사업자 여부
 * @property tel              - 대표 전화 (nullable)
 * @property fax              - 팩스 번호 (nullable)
 * @property bankAccounts     - 입금계좌 목록 (displayOrder 순; 목록 응답에도 포함, stampPngBase64 만 null)
 * @property hasStamp         - 인감 등록 여부
 * @property stampPngBase64   - 인감 PNG base64 (detail/primary 전용; 목록에는 null)
 * @property hasLogo          - 로고 등록 여부
 * @property logoPngBase64    - 로고 PNG base64 (detail 전용; 목록에는 null)
 */
export interface SupplierProfile {
  id: string
  version: number
  businessNumber: string
  subBusinessNumber: string | null
  companyName: string
  /** @deprecated ceoName → representativeName (BE DTO 필드명 일치). 기존 호환용 alias. */
  ceoName?: string
  representativeName: string
  address?: string
  businessAddress: string
  businessType: string
  businessItem: string
  email: string
  isPrimary: boolean
  tel: string | null
  fax: string | null
  bankAccounts: SupplierBankAccount[]
  hasStamp: boolean
  stampPngBase64: string | null
  hasLogo: boolean
  logoPngBase64: string | null
}

/**
 * 인쇄용 기본 사업자 공개 정보 DTO
 * (BE `GET /accounting/supplier-profiles/print-profile` — 인증만, 권한 게이트 없음).
 *
 * primary 부재 시 404.
 *
 * bankAccounts 는 exposed=true 계좌만 (BE 가 필터링).
 */
export interface SupplierPrintProfile {
  companyName: string
  businessNumber: string
  subBusinessNumber: string | null
  representativeName: string
  businessAddress: string
  businessType: string
  businessItem: string
  email: string
  tel: string | null
  fax: string | null
  bankAccounts: SupplierBankAccount[]
  stampPngBase64: string | null
  logoPngBase64: string | null
}

/**
 * 입금계좌 등록/수정 요청 DTO.
 *
 * displayOrder 는 BE 가 배열 index 로 재계산 — FE 전송 불필요. 제거됨.
 * exposed 생략 시 BE 기본값 true.
 */
export interface SupplierBankAccountRequest {
  accountHolder: string
  bankName: string
  accountNumber: string
  exposed?: boolean
}

/**
 * 사업자 등록/수정 요청 DTO (BE `SupplierProfileRequest` 와 1:1).
 *
 * Bean Validation 기준:
 * - businessNumber: @Pattern(regexp = "\\d{10}")  10자리 숫자
 * - subBusinessNumber: @Pattern(regexp = "\\d{4}") 4자리 숫자, nullable
 * - companyName: @NotBlank
 * - representativeName: @NotBlank
 * - businessAddress: @NotBlank
 * - businessType: @NotBlank
 * - businessItem: @NotBlank
 * - email: @Email, nullable
 * - tel: nullable, 최대 30자
 * - fax: nullable, 최대 30자
 * - bankAccounts: replace-all 시맨틱 — 배열 전체를 새로 기록
 */
export interface SupplierProfileRequest {
  businessNumber: string
  subBusinessNumber: string | null
  companyName: string
  representativeName: string
  businessAddress: string
  businessType: string
  businessItem: string
  email: string
  tel: string | null
  fax: string | null
  bankAccounts: SupplierBankAccountRequest[]
}

/**
 * 인감 업로드 요청 DTO.
 *
 * @property stampPngBase64 - PNG 파일을 base64 인코딩한 문자열 (data: prefix 제외)
 * @property stampHash      - PNG bytes 의 SHA-256 hex (64자) — BE 검증용
 */
export interface StampUploadRequest {
  stampPngBase64: string
  stampHash: string
}

/**
 * 로고 업로드 요청 DTO.
 *
 * PNG only, ≤200KB. stamp 와 동일 패턴.
 *
 * @property logoPngBase64 - PNG 파일을 base64 인코딩한 문자열 (data: prefix 제외)
 * @property logoHash      - PNG bytes 의 SHA-256 hex (64자) — BE 검증용
 */
export interface LogoUploadRequest {
  logoPngBase64: string
  logoHash: string
}

/**
 * 사업자 목록 전체 조회.
 * 일반적으로 1~2건 (기본 사업자 + 다중 사업자).
 * bankAccounts 포함, stampPngBase64 는 null (BE of() 동형).
 */
export async function listSupplierProfiles(): Promise<SupplierProfile[]> {
  const res = await apiClient.get<ApiEnvelope<SupplierProfile[]>>(
    '/accounting/supplier-profiles',
  )
  return res.data.data
}

/**
 * 사업자 상세 단건 조회 (stamp 포함).
 * 편집 모달 진입 시 최신 상태(bankAccounts + stampPngBase64) 를 fetch.
 *
 * @param id - 내부 UUID (path param 전용)
 */
export async function getSupplierProfile(id: string): Promise<SupplierProfile> {
  const res = await apiClient.get<ApiEnvelope<SupplierProfile>>(
    `/accounting/supplier-profiles/${id}`,
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
 * 인쇄용 기본 사업자 공개 정보 조회 (인증만, 권한 게이트 없음).
 * primary 부재 시 BE 404 → catch 로 null 반환.
 */
export async function getSupplierPrintProfile(): Promise<SupplierPrintProfile | null> {
  try {
    const res = await apiClient.get<ApiEnvelope<SupplierPrintProfile>>(
      '/accounting/supplier-profiles/print-profile',
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
 * @param req - 수정 필드 (bankAccounts replace-all, tel/fax nullable)
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
 * 인감 업로드/교체 (MANAGER/MASTER 전용).
 *
 * PNG only, ≤200KB. stampHash = PNG bytes SHA-256 hex 64자.
 * BE 가 hash mismatch 시 400 (INVALID_INPUT) 반환.
 *
 * @param id  - 내부 UUID (path param 전용)
 * @param req - stampPngBase64 + stampHash
 */
export async function uploadSupplierStamp(
  id: string,
  req: StampUploadRequest,
): Promise<SupplierProfile> {
  const res = await apiClient.put<ApiEnvelope<SupplierProfile>>(
    `/accounting/supplier-profiles/${id}/stamp`,
    req,
  )
  return res.data.data
}

/**
 * 인감 삭제 (MANAGER/MASTER 전용).
 *
 * @param id - 내부 UUID (path param 전용)
 */
export async function deleteSupplierStamp(id: string): Promise<void> {
  await apiClient.delete(`/accounting/supplier-profiles/${id}/stamp`)
}

/**
 * 기본 사업자 전환 (MANAGER/MASTER 전용).
 * BE 가 기존 primary 를 자동 해제하고 지정 id 를 primary 로 설정.
 *
 * BE endpoint: PATCH /accounting/supplier-profiles/{id}/primary
 *
 * @param id - 기본 사업자로 지정할 UUID (path param 전용)
 */
export async function markAsPrimarySupplierProfile(
  id: string,
): Promise<SupplierProfile> {
  const res = await apiClient.patch<ApiEnvelope<SupplierProfile>>(
    `/accounting/supplier-profiles/${id}/primary`,
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

/**
 * 로고 업로드/교체 (MANAGER/MASTER 전용).
 *
 * PNG only, ≤200KB. logoHash = PNG bytes SHA-256 hex 64자.
 * BE 가 hash mismatch 시 400 (INVALID_INPUT) 반환.
 *
 * @param id  - 내부 UUID (path param 전용)
 * @param req - logoPngBase64 + logoHash
 */
export async function uploadSupplierLogo(
  id: string,
  req: LogoUploadRequest,
): Promise<SupplierProfile> {
  const res = await apiClient.put<ApiEnvelope<SupplierProfile>>(
    `/accounting/supplier-profiles/${id}/logo`,
    req,
  )
  return res.data.data
}

/**
 * 로고 삭제 (MANAGER/MASTER 전용).
 *
 * @param id - 내부 UUID (path param 전용)
 */
export async function deleteSupplierLogo(id: string): Promise<void> {
  await apiClient.delete(`/accounting/supplier-profiles/${id}/logo`)
}
