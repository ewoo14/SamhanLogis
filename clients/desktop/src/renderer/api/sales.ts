/**
 * 판매 도메인 API 클라이언트 — 견적서 / 주문서 / 장기미발주.
 *
 * <p>본 모듈은 [Phase 6 frontend Sub-team Desktop] 슬라이스 (PR Sub-team A 통합) 의
 * legacy estimate / partner-order 화면을 SamhanLogis backend 로 옮기는 첫 frontend
 * 진입점이다. legacy index.html (estimate 18,614 라인 / partner-order 9,427 라인) 의
 * 화면 fetch 흐름을 다음 endpoint 로 통합한다.
 *
 * <h2>endpoint 매핑 (Plan §2.1.7 + §2.1.7 Phase 4.5 보강)</h2>
 * <ul>
 *   <li>{@link listProducts} — `GET /api/v1/products` (M1a, ProductCatalog) — 카테고리별
 *       카탈로그 모달 검색. 견적/주문 카드 grid 의 라인 추가 source.</li>
 *   <li>{@link getProductSpecs} — `GET /api/v1/products/{modelCode}/specs` (M1a) — 라인
 *       클릭 시 동적 specKey 카드 표시 (DOMAIN-EXTENSIONS §4).</li>
 *   <li>{@link listSpecKeyTemplates} — `GET /api/v1/spec-key-templates` (M1a) —
 *       카테고리별 추천 specKey (Spec 추가 모달 source).</li>
 *   <li>{@link listMaterialPrices} — `GET /api/v1/material-prices` (M1a) — D4/D7/D8 자재.</li>
 *   <li>{@link listOduRecommendations} — `GET /api/v1/odu-recommendations` (M1a) —
 *       추천 실외기 lookup (홈멀티 자동 권장 표시).</li>
 *   <li>{@link lookupBranchPipe} — `GET /api/v1/branch-pipes/lookup` (M1a) — 분기관 lookup
 *       (M3 EstimateBranchCalcService 통합 시 활용).</li>
 *   <li>{@link listEstimates} / {@link createEstimate} — `GET/POST /api/v1/estimates`
 *       (M3 estimate-service, 본 슬라이스에서는 mock 우선).</li>
 *   <li>{@link listPartnerOrders} / {@link getPartnerOrder} — `GET /api/v1/partner-orders`
 *       (M4 partner-order-service, 본 슬라이스에서는 read-only mock).</li>
 *   <li>{@link listLongPendingPartners} — `GET /api/v1/partners/long-pending` (M5
 *       LongPendingScheduler).</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 ({@code feedback_uuid_no_user_visibility.md}): 모든 응답에서 사용자
 * 노출 식별자는 {@code modelCode}, {@code estimateNumber}, {@code partnerCode} 만 사용한다.
 * UUID 는 React key 또는 PATCH/DELETE path param 으로만 사용.
 */
import { apiClient, type ApiEnvelope, type PageResponse } from './client'

// ---------------------------------------------------------------------------
// product-service M1a — 카탈로그 / Spec / Template
// ---------------------------------------------------------------------------

/** UsageScope enum — product-service `UsageScope.java` 와 1:1. */
export type UsageScope = 'NONE' | 'ESTIMATE' | 'PARTNER_ORDER' | 'BOTH'

/**
 * EstimateCategory enum — product-service `EstimateCategory.java` 와 1:1.
 * 견적서 카테고리 6 분기 중 화면 노출 5종 (분기관 / 추천실외기는 별도 카테고리 없음).
 */
export type EstimateCategory =
  | 'HOME_MULTI'
  | 'SINGLE_SET'
  | 'COMMERCIAL_MULTI'
  | 'LEGACY'
  | 'OTHER'

/** EstimateCategory → 한국어 라벨 (legacy "홈멀티/싱글 세트/상업멀티/구형/기타"). */
export const ESTIMATE_CATEGORY_LABEL: Record<EstimateCategory, string> = {
  HOME_MULTI: '홈멀티',
  SINGLE_SET: '싱글 세트',
  COMMERCIAL_MULTI: '상업멀티',
  LEGACY: '구형',
  OTHER: '기타',
}

/** ProductCatalog 응답 — product-service `ProductCatalogResponse` 와 1:1. */
export interface ProductCatalog {
  modelCode: string
  name: string
  usageScope: UsageScope
  estimateCategory: EstimateCategory | null
  releasePrice: number | null
  deliveryPrice: number | null
  hasVariableDiscount: boolean
  legacyDiscountFlag: boolean
  discountFlags: string | null
}

/** ProductSpec 응답 — product-service `ProductSpecResponse` 와 1:1. */
export interface ProductSpec {
  id: string
  specKey: string
  specValue: string | null
  unit: string | null
  displayOrder: number | null
}

/** SpecKeyTemplate 응답 — product-service `SpecKeyTemplateResponse` 와 1:1. */
export interface SpecKeyTemplate {
  id: string
  estimateCategory: EstimateCategory
  specKey: string
  defaultUnit: string | null
  displayOrder: number | null
  isRecommended: boolean
}

/** GET /api/v1/products 검색 옵션. */
export interface ListProductsOptions {
  usageScope?: UsageScope
  category?: EstimateCategory
  page?: number
  size?: number
}

/**
 * 카테고리별 ProductMaster 페이징 조회.
 *
 * <p>견적/주문 화면에서 [품목 추가] 모달 진입 시 호출. legacy 의
 * {@code renderHome/renderSingle/renderComm/renderOld} 가 시트별로 가져오던 row 를
 * 본 endpoint 1개로 통합 fetch.
 *
 * @param options - {@code usageScope=BOTH&category=HOME_MULTI} 표준 패턴.
 * @return Spring Page envelope 의 ProductCatalog 배열.
 */
export async function listProducts(
  options: ListProductsOptions = {},
): Promise<PageResponse<ProductCatalog>> {
  const params: Record<string, string | number> = {
    page: options.page ?? 0,
    size: options.size ?? 50,
  }
  if (options.usageScope) params['usageScope'] = options.usageScope
  if (options.category) params['category'] = options.category

  // product-service ProductCatalogController 는 ApiEnvelope 미적용 (Spring Page 직접 반환).
  const res = await apiClient.get<PageResponse<ProductCatalog>>(
    '/api/v1/products',
    { params },
  )
  return res.data
}

/**
 * 단일 모델의 ProductSpec 목록 조회 — displayOrder ASC 정렬.
 *
 * <p>견적 라인 클릭 시 `<ProductSpecList>` 표시.
 */
export async function getProductSpecs(modelCode: string): Promise<ProductSpec[]> {
  const res = await apiClient.get<ProductSpec[]>(
    `/api/v1/products/${encodeURIComponent(modelCode)}/specs`,
  )
  return res.data
}

/**
 * 카테고리별 추천 specKey 목록 — Spec 추가 모달 source.
 */
export async function listSpecKeyTemplates(
  category?: EstimateCategory,
): Promise<SpecKeyTemplate[]> {
  const params: Record<string, string> = {}
  if (category) params['category'] = category
  const res = await apiClient.get<SpecKeyTemplate[]>('/api/v1/spec-key-templates', {
    params,
  })
  return res.data
}

// ---------------------------------------------------------------------------
// estimate-service M3 — 견적 (mock 우선, M3 통합 시 실 endpoint)
// ---------------------------------------------------------------------------

/** EstimateStatus enum — estimate-service 가정 (M3 통합 시 정확한 enum 으로 교체). */
export type EstimateStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'SENT'
  | 'CONVERTED'
  | 'CANCELED'

/** EstimateStatus → 한국어 라벨. */
export const ESTIMATE_STATUS_LABEL: Record<EstimateStatus, string> = {
  DRAFT: '작성중',
  CONFIRMED: '확정',
  SENT: '발송',
  CONVERTED: '전표전환',
  CANCELED: '취소',
}

/** 견적 목록 row — 사용자 노출 식별자만 노출. */
export interface EstimateSummary {
  /** 사용자 노출 식별자 (`견적-2026-0001` 형식). */
  estimateNumber: string
  /** 작성일 (ISO 8601). */
  createdAt: string
  /** 거래처명 (사용자 노출). */
  partnerName: string
  /** 카테고리 — legacy 4 카드 + LEGACY/OTHER. */
  category: EstimateCategory
  /** 합계 (원). */
  totalAmount: number
  status: EstimateStatus
  /** 작성자 (이름). */
  authorName: string
}

/** 견적 라인 — 카드 row 표시 + 인쇄 양식 source. */
export interface EstimateLine {
  /** React key (UUID, 화면 미노출). */
  id: string
  /** 카테고리 — 라인별 분기 카드 결정. */
  category: EstimateCategory
  /** 품목 코드 (사용자 노출). */
  modelCode: string
  /** 품명. */
  productName: string
  quantity: number
  /** 출고가 (원). */
  releasePrice: number
  /** 납품가 (원). */
  deliveryPrice: number
  /** 소계 = quantity * deliveryPrice. */
  subtotal: number
  /** 변동DC 적용 여부 (backend `VariableDiscountDetector` 결과). */
  hasVariableDiscount: boolean
  /** Bundle EXPAND/KEEP 모드 — Bundle 부모만 의미. */
  bundleMode: 'EXPAND' | 'KEEP' | null
}

/** 견적 상세. */
export interface EstimateDetail {
  estimateNumber: string
  partnerCode: string
  partnerName: string
  category: EstimateCategory
  status: EstimateStatus
  createdAt: string
  authorName: string
  /** 배송 주소. */
  deliveryAddress: string | null
  /** 현장 주소. */
  siteAddress: string | null
  /** 연락처 (E.164). */
  contactPhone: string | null
  /** 납기일 (LocalDate). */
  dueDate: string | null
  /** 결제 기한. */
  paymentDueDate: string | null
  memo: string | null
  lines: EstimateLine[]
  totalAmount: number
}

/**
 * 견적 페이지 조회.
 *
 * <p>**Note** — M3 estimate-service 가 미배포 상태일 경우 본 호출은 404 를 반환할 수
 * 있다. 화면은 빈 목록 + 안내 메시지 표시.
 */
export async function listEstimates(
  page = 0,
  size = 20,
): Promise<PageResponse<EstimateSummary>> {
  const res = await apiClient.get<ApiEnvelope<PageResponse<EstimateSummary>>>(
    '/api/v1/estimates',
    { params: { page, size } },
  )
  return res.data.data
}

/**
 * 견적 단건 조회.
 */
export async function getEstimate(estimateNumber: string): Promise<EstimateDetail> {
  const res = await apiClient.get<ApiEnvelope<EstimateDetail>>(
    `/api/v1/estimates/${encodeURIComponent(estimateNumber)}`,
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// partner-order-service M4 — 주문서 조회 (read-only)
// ---------------------------------------------------------------------------

/** PartnerOrderStatus — partner-order-service 가정. */
export type PartnerOrderStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'CONFIRMED'
  | 'CONVERTED'
  | 'CANCELED'

/** PartnerOrderStatus → 한국어. */
export const PARTNER_ORDER_STATUS_LABEL: Record<PartnerOrderStatus, string> = {
  DRAFT: '작성중',
  SUBMITTED: '발송',
  CONFIRMED: '확정',
  CONVERTED: '전표전환',
  CANCELED: '취소',
}

/** 주문 목록 row. */
export interface PartnerOrderSummary {
  orderNumber: string
  partnerCode: string
  partnerName: string
  submittedAt: string | null
  status: PartnerOrderStatus
  totalAmount: number
  /** 자동 생성된 출고전표 번호 (CONVERTED 시만). */
  linkedSlipNo: string | null
}

/** 주문 라인 — Bundle EXPAND/KEEP 결과 표시. */
export interface PartnerOrderLine {
  id: string
  modelCode: string
  productName: string
  quantity: number
  deliveryPrice: number
  subtotal: number
  bundleMode: 'EXPAND' | 'KEEP' | null
  /** Bundle EXPAND 시 펼친 component 라인 (read-only 표시). */
  expandedComponents: Array<{
    modelCode: string
    productName: string
    quantity: number
  }>
}

/** 주문 상세. */
export interface PartnerOrderDetail extends PartnerOrderSummary {
  deliveryAddress: string | null
  siteAddress: string | null
  contactPhone: string | null
  dueDate: string | null
  memo: string | null
  lines: PartnerOrderLine[]
}

/**
 * 주문 페이지 조회 (read-only).
 */
export async function listPartnerOrders(
  page = 0,
  size = 20,
  status?: PartnerOrderStatus,
): Promise<PageResponse<PartnerOrderSummary>> {
  const params: Record<string, string | number> = { page, size }
  if (status) params['status'] = status
  const res = await apiClient.get<ApiEnvelope<PageResponse<PartnerOrderSummary>>>(
    '/api/v1/partner-orders',
    { params },
  )
  return res.data.data
}

/** 주문 단건 조회. */
export async function getPartnerOrder(
  orderNumber: string,
): Promise<PartnerOrderDetail> {
  const res = await apiClient.get<ApiEnvelope<PartnerOrderDetail>>(
    `/api/v1/partner-orders/${encodeURIComponent(orderNumber)}`,
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// long-pending — partner-service M5 (LongPendingScheduler 결과)
// ---------------------------------------------------------------------------

/** LongPendingPartner — 30일 이상 미발주 거래처. */
export interface LongPendingPartner {
  /** 사업자등록번호 (사용자 노출). */
  businessRegistrationNumber: string
  /** 거래처명. */
  companyName: string
  /** 담당자명 (FK to EmployeeMaster.employeeName). */
  assignedManagerName: string | null
  /** 마지막 주문일 (없으면 null). */
  lastOrderAt: string | null
  /** 마지막 견적일. */
  lastEstimateAt: string | null
  /** 최근 활동일 (주문/견적 중 가장 최근). */
  lastActivityAt: string | null
  /** 미발주 일수 — 30 초과 시 marker 표시. */
  daysSinceLastActivity: number | null
  /** PartnerAuth.status — LONG_PENDING_NO_ORDER / ACCESS_DENIED 등. */
  authStatus: string | null
}

/** 장기미발주 거래처 페이지 조회. */
export async function listLongPendingPartners(
  page = 0,
  size = 50,
): Promise<PageResponse<LongPendingPartner>> {
  const res = await apiClient.get<ApiEnvelope<PageResponse<LongPendingPartner>>>(
    '/api/v1/partners/long-pending',
    { params: { page, size } },
  )
  return res.data.data
}
