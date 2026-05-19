/**
 * 아로로지스 admin 도메인 API 호출 (`/admin/arologis/**`).
 *
 * 현재 BE 제공 endpoint (읽기 전용):
 * - GET /admin/arologis/drivers  → ApiResponse<List<DriverResponse>>
 *
 * POST / PATCH / DELETE 는 BE 미구현 (드라이버 마스터 CRUD 정책은 Figma UI/UX 시점에 도입 예정).
 * FE 에서는 목록 조회만 지원하며, 수동 CUD 는 안내 메시지로 대체.
 *
 * UUID 비공개 — 화면에는 driverCode / phoneNumber / vehicleType 만 표시.
 * BE DriverResponse 에 `name` 필드 없음 — source (DriverSource enum) 필드로 출처 표시.
 */
import { apiClient, type ApiEnvelope } from './client'

/**
 * BE arologis-service `DriverResponse` 와 1:1.
 * UUID `id` 는 BE 내부 전용으로 FE 에서 수신하지 않음.
 * `name` 필드는 BE DriverResponse 에 없으므로 FE 에서도 제거.
 */
export interface DriverDto {
  /** 사용자 노출 식별자 (예: "D-001"). */
  driverCode: string
  /** 활성 unique. passwordless 로그인 식별자. */
  phoneNumber: string
  vehicleType: string
  /**
   * 기사 데이터 출처 (BE DriverSource enum).
   * INSUNG_QUICK = 인성데이타 퀵프로그램 자동 매칭, MANUAL = 수동 등록.
   */
  source: string
  /** 어플 설치 여부 — BE 가 마지막 로그인 시점에 갱신. */
  appInstalled: boolean
}

/**
 * 기사 목록 조회.
 *
 * BE `GET /admin/arologis/drivers` → `ApiResponse<List<DriverResponse>>`.
 * ApiEnvelope `data` 필드를 unwrap 하여 반환.
 *
 * @returns 활성 기사 목록 (deleted=false 인 항목만 BE 에서 필터)
 */
export async function listDrivers(): Promise<DriverDto[]> {
  const res = await apiClient.get<ApiEnvelope<DriverDto[]>>(
    '/admin/arologis/drivers',
  )
  return res.data.data
}

// ────────────────────────────────────────────────────────────────────────────
// 미구현 stub — BE POST/PATCH/DELETE endpoint 부재.
// 드라이버 마스터 CUD 는 Figma UI/UX 확정 + BE 도메인 정책 수립 후 도입.
// 현재 DriverManagementPage 는 read-only 모드로 동작한다.
// ────────────────────────────────────────────────────────────────────────────

/** @deprecated BE endpoint 미구현. 사용 금지. */
export async function createDriver(_body: unknown): Promise<never> {
  return Promise.reject(new Error('NOT_IMPLEMENTED: 기사 수동 등록은 추후 도입 예정입니다.'))
}

/** @deprecated BE endpoint 미구현. 사용 금지. */
export async function updateDriver(_driverCode: string, _body: unknown): Promise<never> {
  return Promise.reject(new Error('NOT_IMPLEMENTED: 기사 정보 수정은 추후 도입 예정입니다.'))
}

/** @deprecated BE endpoint 미구현. 사용 금지. */
export async function deleteDriver(_driverCode: string): Promise<never> {
  return Promise.reject(new Error('NOT_IMPLEMENTED: 기사 비활성화는 추후 도입 예정입니다.'))
}
