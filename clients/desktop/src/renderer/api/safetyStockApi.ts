/**
 * 안전재고 알림 도메인 API 클라이언트 (P1-3).
 *
 * 노출 endpoint:
 * - `GET  /inventory/safety-stock-alerts`           — 현재 임계 미만 알림 목록
 * - `GET  /inventory/safety-stock-alerts/count`     — 알림 건수 (헤더 배지용)
 * - `GET  /inventory/safety-stock-configs`          — 제품별 임계값 설정 목록
 * - `PUT  /inventory/safety-stock-configs/{productId}` — 제품 안전재고 임계값 설정
 *
 * UUID 비공개 가드: productId / warehouseId 는 path param 으로만 사용.
 * 화면 노출 식별자 = productCode / modelName / warehouseCode.
 *
 * 권한:
 * - 조회: MASTER / MANAGER / WAREHOUSE
 * - 임계값 설정 (PUT): MASTER / MANAGER / WAREHOUSE
 */
import { apiClient, type ApiEnvelope, type PageResponse } from './client'

/** 안전재고 알림 단건 (임계 미만 제품 × 창고 조합). */
export interface SafetyStockAlert {
  /** 제품 사용자 노출 코드 (productCode — UUID 비공개). */
  productCode: string
  /** 모델명 (예: "AP-WQLL14NAADKR"). */
  modelName: string
  /** 제품명. */
  productName: string
  /** 창고 코드 (예: "HQ-001"). */
  warehouseCode: string
  /** 창고명. */
  warehouseName: string
  /** 현재 가용 재고. */
  availableQty: number
  /** 안전재고 임계값. */
  threshold: number
  /** 부족분 (threshold - availableQty). */
  shortfall: number
}

/** 안전재고 임계값 설정 응답 (제품 단위). */
export interface SafetyStockConfig {
  productCode: string
  modelName: string
  productName: string
  threshold: number
  note: string | null
}

/** 임계값 설정 요청 body. */
export interface UpdateSafetyStockRequest {
  threshold: number
  note?: string
}

/** 안전재고 알림 조회 옵션. */
export interface ListSafetyStockAlertsOptions {
  warehouseCode?: string
  page?: number
  size?: number
}

/**
 * 안전재고 알림 목록 페이지 조회.
 * 현재 availableQty < threshold 인 (제품, 창고) 조합 전체.
 */
export async function listSafetyStockAlerts(
  options: ListSafetyStockAlertsOptions = {},
): Promise<PageResponse<SafetyStockAlert>> {
  const params: Record<string, string | number> = {
    page: options.page ?? 0,
    size: options.size ?? 50,
  }
  if (options.warehouseCode) params['warehouseCode'] = options.warehouseCode
  const res = await apiClient.get<ApiEnvelope<PageResponse<SafetyStockAlert>>>(
    '/inventory/safety-stock-alerts',
    { params },
  )
  return res.data.data
}

/**
 * 안전재고 알림 현재 건수 조회 — 헤더 배지용.
 * 백엔드가 단순 count 를 반환한다.
 *
 * @return 현재 임계 미만 (제품, 창고) 조합 건수
 */
export async function fetchSafetyStockAlertCount(): Promise<number> {
  const res = await apiClient.get<ApiEnvelope<{ count: number }>>(
    '/inventory/safety-stock-alerts/count',
  )
  return res.data.data.count
}

/**
 * 제품의 안전재고 임계값을 설정한다 (PUT upsert).
 * warehouseCode 미지정 시 전체 창고 합산 기준 임계값.
 *
 * @param productCode 제품 사용자 코드
 * @param body 임계값 + 메모
 */
export async function updateSafetyStock(
  productCode: string,
  body: UpdateSafetyStockRequest,
): Promise<SafetyStockConfig> {
  const res = await apiClient.put<ApiEnvelope<SafetyStockConfig>>(
    `/inventory/safety-stock-configs/${encodeURIComponent(productCode)}`,
    body,
  )
  return res.data.data
}

/** 안전재고 알림 진입 권한 — MASTER / MANAGER / WAREHOUSE. */
export const SAFETY_STOCK_ROLES = ['MASTER', 'MANAGER', 'WAREHOUSE'] as const

/** 현재 role 이 안전재고 메뉴에 진입 가능한지 확인. */
export function canAccessSafetyStock(
  role: string | undefined | null,
): boolean {
  if (!role) return false
  return (SAFETY_STOCK_ROLES as readonly string[]).includes(role)
}
