/**
 * 안전재고 알림 도메인 API 클라이언트 (P1-3).
 *
 * BE 정합 (TM PR #143 cross-check 후 정렬):
 * - `GET  /inventory/alerts/safety-stock`         — 임계 미만 알림 목록 (List 평면, 페이지 미사용)
 * - `GET  /inventory/alerts/safety-stock/count`   — 알림 건수 (헤더 배지용, `{ count }`)
 * - `POST /inventory/products/{productId}/safety-stock` — 임계값 upsert (productId 는 UUID)
 *
 * UUID 사용자 비공개 가드 — 본 화면은 관리자/창고 운영자(MASTER/MANAGER/INVENTORY/WAREHOUSE)
 * 전용이므로 productId/warehouseId UUID 노출은 허용 (cf. memory `feedback_uuid_no_user_visibility`).
 *
 * 권한: BE @PreAuthorize 와 동일 (조회/설정 모두 MASTER / MANAGER / INVENTORY / WAREHOUSE).
 */
import { apiClient, type ApiEnvelope } from './client'

/**
 * 안전재고 알림 단건 — BE `SafetyStockAlertResponse` record 와 1:1 매칭.
 *
 * @property productId   제품 UUID (관리자 화면 전용 노출)
 * @property warehouseId 창고 UUID (null = 전체 창고 합산 기준)
 * @property threshold   안전재고 임계값
 * @property currentQty  현재 가용 재고 합계
 * @property shortage    부족량 (threshold - currentQty, 양수 = 부족)
 * @property note        임계값 메모
 */
export interface SafetyStockAlert {
  productId: string
  warehouseId: string | null
  threshold: number
  currentQty: number
  shortage: number
  note: string | null
}

/**
 * 안전재고 임계값 설정 응답 — BE `SafetyStockConfigResponse` record 와 1:1 매칭.
 */
export interface SafetyStockConfigDto {
  id: string
  productId: string
  warehouseId: string | null
  threshold: number
  note: string | null
}

/**
 * 임계값 설정 요청 body — BE `SafetyStockSetRequest` record 와 1:1 매칭.
 *
 * @property warehouseId 대상 창고 UUID (null = 전체 창고 합산 기준)
 * @property threshold   안전재고 임계값 (0 이상)
 * @property note        메모 (선택)
 */
export interface SetSafetyStockRequest {
  warehouseId?: string | null
  threshold: number
  note?: string | null
}

/**
 * 안전재고 알림 목록 조회 — BE 는 List 평면 반환 (페이지 미적용).
 *
 * @return 임계 미만 (제품, 창고) 조합 전체 목록
 */
export async function listSafetyStockAlerts(): Promise<SafetyStockAlert[]> {
  const res = await apiClient.get<ApiEnvelope<SafetyStockAlert[]>>(
    '/inventory/alerts/safety-stock',
  )
  return res.data.data
}

/**
 * 안전재고 알림 현재 건수 조회 — 헤더 배지용.
 *
 * @return 현재 임계 미만 (제품, 창고) 조합 건수
 */
export async function fetchSafetyStockAlertCount(): Promise<number> {
  const res = await apiClient.get<ApiEnvelope<{ count: number }>>(
    '/inventory/alerts/safety-stock/count',
  )
  return res.data.data.count
}

/**
 * 제품별(+창고별) 안전재고 임계값을 설정/갱신한다 (upsert, 201).
 *
 * @param productId 대상 제품 UUID
 * @param body 임계값 설정 요청 (warehouseId / threshold / note)
 * @return BE 가 반환한 설정 결과
 */
export async function setSafetyStock(
  productId: string,
  body: SetSafetyStockRequest,
): Promise<SafetyStockConfigDto> {
  const res = await apiClient.post<ApiEnvelope<SafetyStockConfigDto>>(
    `/inventory/products/${encodeURIComponent(productId)}/safety-stock`,
    body,
  )
  return res.data.data
}

/**
 * 안전재고 알림 진입 권한 — BE @PreAuthorize 화이트리스트와 1:1 정합.
 * MASTER / MANAGER / INVENTORY / WAREHOUSE.
 */
export const SAFETY_STOCK_ROLES = [
  'MASTER',
  'MANAGER',
  'INVENTORY',
  'WAREHOUSE',
] as const

/** 현재 role 이 안전재고 메뉴에 진입 가능한지 확인. */
export function canAccessSafetyStock(
  role: string | undefined | null,
): boolean {
  if (!role) return false
  return (SAFETY_STOCK_ROLES as readonly string[]).includes(role)
}
