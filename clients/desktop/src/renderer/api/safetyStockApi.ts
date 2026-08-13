/**
 * 안전재고 알림 도메인 API 클라이언트 (P1-3).
 *
 * BE 정합 (TM PR #143 cross-check 후 정렬):
 * - `GET  /inventory/alerts/safety-stock`         — 임계 미만 알림 목록 (List 평면, 페이지 미사용)
 * - `GET  /inventory/alerts/safety-stock/count`   — 알림 건수 (헤더 배지용, `{ count }`)
 * - `POST /inventory/products/{productId}/safety-stock` — 임계값 upsert (productId 는 UUID)
 *
 * QA 정책 (P13ValidationIT 기준):
 * - 알림 조건: `currentQty < threshold` (미만 전용; == 임계 시 알림 제외)
 * - shortage  = max(0, threshold - currentQty)
 *
 * UUID 사용자 비공개 가드 (memory `feedback_uuid_no_user_visibility`):
 * - 화면에는 productCode / productName / warehouseName 만 표시.
 * - productId / warehouseId opaque token 은 API 요청 param 으로만 사용, 화면 노출 금지.
 *
 * 권한: BE @PreAuthorize 와 동일 (조회/설정 모두 MASTER / MANAGER / INVENTORY / WAREHOUSE).
 */
import { apiClient, type ApiEnvelope } from './client'

/**
 * 안전재고 알림 단건 — BE `SafetyStockAlertResponse` record 와 1:1 매칭.
 *
 * @property productId    제품 UUID (path param / 내부 조인용, 화면 비표시)
 * @property productCode  제품 코드 (화면 표시용 비즈니스 식별자, BE fail-soft 시 null)
 * @property productName  제품명 (화면 표시용, BE fail-soft 시 null)
 * @property warehouseId  창고 opaque token (path param / 내부 조인용, 화면 비표시)
 * @property warehouseName 창고명 (화면 표시용, memory `feedback_uuid_no_user_visibility`)
 * @property threshold    안전재고 임계값
 * @property currentQty   현재 가용 재고 합계
 * @property shortage     부족량 = max(0, threshold - currentQty).
 *                        QA 정책: 알림 조건 `currentQty < threshold` (미만 전용).
 *                        currentQty == threshold 인 경우 알림 제외 → shortage = 0 미발생.
 * @property note         임계값 메모
 */
export interface SafetyStockAlert {
  productId: string
  productCode: string | null
  productName: string | null
  warehouseId: string | null
  warehouseName: string | null
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
 * @property warehouseId 대상 창고 opaque token (null = 전체 창고 합산 기준)
 * @property threshold   안전재고 임계값 (0 이상)
 * @property note        메모 (선택)
 */
export interface SetSafetyStockRequest {
  warehouseId?: string | null
  threshold: number
  note?: string | null
  /** 선택 범위 — 전체/선택 창고를 명시한다. */
  scopeMode: 'ALL' | 'SELECTED'
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
