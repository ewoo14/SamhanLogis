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
 *   <li>{@link listSpecKeyTemplates} — `GET /api/v1/spec-key-templates`
 *       (product-service `ProductCatalogController`) — 카테고리별 추천 specKey.</li>
 *   <li>{@link getEstimate} — `GET /slips/estimates/{id}` (slip-service
 *       `EstimateController`) — 견적서 인쇄 미리보기 view-model.</li>
 *   <li>{@link listPartnerOrders} / {@link getPartnerOrder} — `GET /api/v1/partner-orders`
 *       (partner-order-service, read-only).</li>
 *   <li>{@link searchPartners} — `GET /admin/partners/search` (partner-service
 *       `PartnerAdminController`) — 거래처 검색 자동완성.</li>
 * </ul>
 *
 * <p>라인 입력 참조 lookup 3종은 product-service `ProductLookupController` 와 1:1 계약이다.
 * `ApiResponse` envelope 없이 배열을 직접 반환한다.
 *
 * <p>내부 식별자 비공개 가드 ({@code feedback_uuid_no_user_visibility.md}): 화면 노출
 * 식별자는 {@code modelCode}, {@code estimateNumber}, {@code partnerCode},
 * {@code materialKey}, {@code branchCode} 같은 비즈니스 키만 사용한다.
 * 내부 식별자는 React key 또는 PATCH/DELETE path param 으로만 사용.
 */
import { apiClient, type ApiEnvelope, type PageResponse } from './client'
import { toOrderPathId } from '../utils/orderNo'

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

/** EstimateCategory → 한국어 라벨 (legacy "홈멀티/싱글중대형/상업멀티/구형/기타"). */
export const ESTIMATE_CATEGORY_LABEL: Record<EstimateCategory, string> = {
  HOME_MULTI: '홈멀티',
  SINGLE_SET: '싱글중대형',
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
export type SpecKeyValueType = 'NUMBER' | 'DIMENSION' | 'RANGE' | 'TEXT'

export interface SpecKeyTemplate {
  id: string
  estimateCategory: EstimateCategory
  specKey: string
  defaultUnit: string | null
  valueType: SpecKeyValueType
  displayOrder: number | null
  isRecommended: boolean
}

/** 자재 단가 lookup row — product-service `MaterialPriceResponse` 와 1:1. */
export interface MaterialPriceRow {
  materialKey: string
  name: string
  /** BE BigDecimal → JSON number 직렬화. */
  price: number
  optionLabel: string | null
}

/** 추천 실외기 타입 — product-service `OduRecommendationLookup.RecommendationType` 와 1:1. */
export type OduRecommendationType =
  | 'HOME_MULTI'
  | 'MULTI_HEATING_COOLING'

/** 추천 실외기 lookup row — product-service `OduRecommendationResponse` 와 1:1. */
export interface OduRecommendationRow {
  recommendationType: OduRecommendationType
  /** BE BigDecimal → JSON number 직렬화. */
  indoorCapacity: number | null
  indoorCount: number | null
  outdoorHp: string
}

/** 분지관 lookup row — product-service `BranchPipeResponse` 와 1:1. */
export interface BranchPipeRow {
  branchCode: string
  description: string | null
  summaryQty: number | null
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

/** 자재 단가 lookup 목록 — envelope 없이 배열 직접 반환. */
export async function listMaterialPrices(): Promise<MaterialPriceRow[]> {
  const res = await apiClient.get<MaterialPriceRow[]>('/api/v1/material-prices')
  return res.data
}

/** 추천 실외기 lookup 목록 — type 지정 시 BE query filter 사용. */
export async function listOduRecommendations(
  type?: OduRecommendationType,
): Promise<OduRecommendationRow[]> {
  const params: Record<string, string> = {}
  if (type) params['type'] = type
  const res = await apiClient.get<OduRecommendationRow[]>(
    '/api/v1/odu-recommendations',
    { params },
  )
  return res.data
}

/** 분지관 lookup 목록 — branchCode 지정 시 BE query filter 사용. */
export async function listBranchPipes(
  branchCode?: string,
): Promise<BranchPipeRow[]> {
  const params: Record<string, string> = {}
  if (branchCode) params['branchCode'] = branchCode
  const res = await apiClient.get<BranchPipeRow[]>('/api/v1/branch-pipes', {
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
 * 견적 단건 조회 — 견적서 인쇄 미리보기({@link QuoteView}) 전용 view-model.
 *
 * <p>**path 결함 수정** — 기존 데드 경로 `/api/v1/estimates/{id}` 는 estimate-service
 * 가 slip-service 로 통합되며 폐기되었다. 현행 endpoint 는 slip-service
 * `EstimateController @RequestMapping("/slips/estimates")` (gateway
 * `slip-service-noprefix` route `/slips/**`). 본 함수는 현행 `/slips/estimates/{id}`
 * 응답({@code EstimateDetailResponse})을 인쇄 양식이 기대하는 {@link EstimateDetail}
 * view-model 로 매핑한다. 데드 `listEstimates`(`/api/v1/estimates`)는 목록 화면이
 * `estimateApi.listEstimates`(`/slips/estimates`)를 사용하므로 본 모듈에서 제거했다.
 *
 * @param estimateNumber 라우트 path param. 현행 BE 는 UUID `id` 를 path 로 받는다
 *        (인쇄 라우트가 estimateNumber 자리에 id 를 전달).
 */
export async function getEstimate(estimateNumber: string): Promise<EstimateDetail> {
  const res = await apiClient.get<ApiEnvelope<LiveEstimateDetailResponse>>(
    `/slips/estimates/${encodeURIComponent(toOrderPathId(estimateNumber))}`,
  )
  const e = res.data.data
  return {
    estimateNumber: e.estimateNo,
    partnerCode: e.partnerBusinessNo ?? '',
    partnerName: e.partnerName,
    category: 'OTHER',
    status: 'DRAFT',
    createdAt: e.estimateDate,
    authorName: '',
    deliveryAddress: e.partnerAddress,
    siteAddress: e.partnerAddress,
    contactPhone: null,
    dueDate: e.validUntil,
    paymentDueDate: null,
    memo: e.memo,
    totalAmount: Number(e.totalAmount ?? 0),
    lines: e.lines.map((l) => {
      const unitPrice = Number(l.unitPrice ?? 0)
      const supplyAmount = Number(l.supplyAmount ?? 0)
      return {
        id: l.id,
        category: 'OTHER',
        modelCode: l.modelName ?? '',
        productName: l.productName ?? '',
        quantity: l.quantity,
        releasePrice: unitPrice,
        deliveryPrice: unitPrice,
        subtotal: supplyAmount,
        hasVariableDiscount: false,
        bundleMode: null,
      }
    }),
  }
}

/** slip-service `EstimateLineResponse` 부분 — 인쇄 매핑에 필요한 필드만. */
interface LiveEstimateLineResponse {
  id: string
  productName: string | null
  modelName: string | null
  quantity: number
  unitPrice: string | null
  supplyAmount: string | null
}

/** slip-service `EstimateDetailResponse` 부분 — 인쇄 매핑에 필요한 필드만. */
interface LiveEstimateDetailResponse {
  estimateNo: string
  estimateDate: string
  partnerName: string
  partnerBusinessNo: string | null
  partnerAddress: string | null
  validUntil: string | null
  totalAmount: string | null
  memo: string | null
  lines: LiveEstimateLineResponse[]
}

// ---------------------------------------------------------------------------
// partner-order-service M4 — 주문서 관리 (read-only)
// ---------------------------------------------------------------------------

/** PartnerOrderStatus — partner-order-service 가정. Phase 2.5: ON_HOLD 추가. Phase 2.6a: CONVERTED 추가. */
export type PartnerOrderStatus =
  | 'DRAFT'
  | 'ON_HOLD'
  | 'CONFIRMING'
  | 'CONFIRMED'
  | 'CANCELED'
  | 'CONVERTED'

/** PartnerOrderStatus → 한국어. 업무용어 통일: DRAFT=진행중, CONFIRMED=완료. */
export const PARTNER_ORDER_STATUS_LABEL: Record<PartnerOrderStatus, string> = {
  DRAFT: '진행중',
  ON_HOLD: '보류',
  CONFIRMING: '확인중',
  CONFIRMED: '완료',
  CANCELED: '취소',
  CONVERTED: '전환완료',
}

/** 주문 전표 발행 상태 — 사용자 화면에는 대기/영구실패만 별도 표시한다. */
export type SlipPublishStatus = 'NOT_REQUIRED' | 'PUBLISHED' | 'PENDING_RETRY' | 'FAILED_PERMANENT'

/**
 * SlipPublishStatus → 화면 표시 메타(라벨 + design-system Badge variant).
 *
 * <p>{@code NOT_REQUIRED}/{@code PUBLISHED} 는 정상 흐름이므로 배지를 표시하지 않는다
 * (키 자체를 생략 — `Partial` 이라 조회 시 `undefined`). 목록/상세 화면이 동일 맵을 공유해
 * 라벨·색상 표기가 갈리지 않게 한다(#854 R5 MED — 목록 화면 배선 배지 재사용).
 *
 * <p>{@code PENDING_RETRY} 라벨은 "전표 발행 재시도 중"이다 — 이 상태는 정의상 이미 최소
 * 1회 발행 실패 후 최대 24시간 자동 재시도 중인 상태이므로, "대기"(아직 시도 전이라는
 * 인상)보다 "재시도 중"이 진행 상황을 정확히 전달한다(#854 R5 LOW-4).
 */
export const SLIP_PUBLISH_STATUS_DISPLAY: Partial<
  Record<SlipPublishStatus, { label: string; variant: 'warning' | 'danger' }>
> = {
  PENDING_RETRY: { label: '전표 발행 재시도 중', variant: 'warning' },
  FAILED_PERMANENT: { label: '전표 발행 실패', variant: 'danger' },
}

/** 주문 목록 row. */
export interface PartnerOrderSummary {
  orderNumber: string
  partnerCode: string
  /** 거래처명. BE entity 컬럼 부재로 현재 null. SP-08-4-2 lookup 후 채움. */
  partnerName: string | null
  submittedAt: string | null
  /** 작성일. DRAFT도 생성 시각을 보유하며 발송일(submittedAt)과 별개다. */
  createdAt?: string | null
  status: PartnerOrderStatus
  slipPublishStatus: SlipPublishStatus
  totalAmount: number
  /** 자동 생성된 출고전표 번호 (CONVERTED 시만). */
  linkedSlipNo: string | null
  /** soft-delete 행 여부. 목록에서는 삭제행도 포함된다. */
  isDeleted?: boolean
  /** 삭제 시각 (ISO 8601). */
  deletedAt?: string | null
  /** 삭제자 표시명. UUID 는 BE 에서 정제되어 null 로 온다. */
  deletedByName?: string | null
  /** partnerId가 없는 legacy 주문은 병합 후보에서 제외한다. */
  mergeEligible?: boolean
  /** 병합 제외 사유. UUID는 포함하지 않는다. */
  mergeIneligibilityReason?: string | null
}

/** 주문 라인 — Bundle EXPAND/KEEP 결과 표시. Phase 2.6a: lineId/convertedQuantity 추가. Phase 2.6d: productId 추가. */
export interface PartnerOrderLine {
  /**
   * 재고 batch 조회 키. 화면 미노출(UUID 비공개).
   * BE PartnerOrderDetailResponse.LineResponse.productId (Phase 2.6d 노출).
   */
  productId: string
  /**
   * 라인 UUID — BE PartnerOrderDetailResponse.LineResponse.lineId.
   * 사용자 화면 미노출; 부분전환 요청의 orderLineId 로만 사용.
   */
  lineId: string
  modelCode: string
  productName: string
  categoryKey?: string
  quantity: number
  deliveryPrice: number
  /** VAT 포함 라인 합계 T — 기존 BE subtotal 계약 유지. */
  subtotal: number
  /** 공급가액 S. 기존 주문 snapshot은 null일 수 있다. */
  supplyAmount?: number | null
  /** 부가세 V. 기존 주문 snapshot은 null일 수 있다. */
  vatAmount?: number | null
  /** VAT 포함 라인 합계 T (=subtotal). */
  lineTotal?: number | null
  /** S/V/T 중 저장 권위를 나타내는 BE 계약값. */
  authority?: 'PRICE' | 'SUPPLY' | 'VAT' | 'TOTAL' | null
  /** 라인 비고 — 협업 overlay `line.{lineKey}.remark` 의 현재값. */
  remark: string | null
  /** 출고전표로 전환된 누적 수량 (Phase 2.6a). 기본 0. */
  convertedQuantity: number
  bundleMode: 'EXPAND' | 'KEEP' | null
  /**
   * 품목 유형 — BE PartnerOrderDetailResponse.LineResponse.productType (Round C #23 enrich).
   * "BUNDLE" 이면 세트 품목 → 재고조회 모달(2.6d) 대상에서 제외(세트 단위 재고 표시 금지).
   * product-service 조회 실패(fail-soft) 또는 미부착 시 null/undefined.
   */
  productType?: string | null
  /** Bundle EXPAND 시 펼친 component 라인 (read-only 표시). */
  expandedComponents: Array<{
    modelCode: string
    productName: string
    quantity: number
  }>
}

// ---------------------------------------------------------------------------
// partner-order-service — 부분전환 (Phase 2.6a)
// ---------------------------------------------------------------------------

/** 부분전환 요청 라인 항목. */
export interface ConvertToSlipItem {
  /** 주문 라인 UUID (PartnerOrderLine.lineId). 사용자 화면 미노출. */
  orderLineId: string
  /** 이번 전환할 수량 (1 이상). */
  quantity: number
}

/** POST /api/v1/partner-orders/{id}/convert-to-slip 요청 본문. */
export interface ConvertToSlipRequest {
  items: ConvertToSlipItem[]
  /** 출고 창고 코드 (필수 — D-WH-03). */
  warehouseCode: string
}

/**
 * 부분전환 결과 — BE ConvertResultResponse 와 1:1.
 *
 * @param slipNo 발행된 출고전표 번호 (사용자 노출).
 * @param orderStatus 전환 후 주문 status 이름 (DRAFT 유지 또는 CONVERTED).
 * @param fullyConverted 모든 라인이 전량 전환되었는지 여부.
 */
export interface ConvertResult {
  slipNo: string
  orderStatus: string
  fullyConverted: boolean
}

/**
 * 주문 부분전환 — 선택 라인/수량을 출고전표로 전환한다 (Phase 2.6a).
 *
 * <p>BE: {@code POST /api/v1/partner-orders/{id}/convert-to-slip}. 권한: sales.partner-order.convert CREATE.
 * slipNo==null && 전환 가능 상태(DRAFT/ON_HOLD/CONFIRMED 이외 CANCELED·CONFIRMING 제외) 주문만 허용.
 * 잔여 초과 수량 지정 시 BE 가 409 반환.
 *
 * @param orderNumber 주문번호 (URL-safe encode 적용) — UUID 비노출.
 * @param request 전환 요청 (items: 수량>0 라인만, warehouseCode 필수 — D-WH-03).
 */
export async function convertPartnerOrderToSlip(
  orderNumber: string,
  request: ConvertToSlipRequest,
): Promise<ConvertResult> {
  const res = await apiClient.post<ApiEnvelope<ConvertResult>>(
    `/api/v1/partner-orders/${encodeURIComponent(toOrderPathId(orderNumber))}/convert-to-slip`,
    request,
  )
  return res.data.data
}

/** 주문 상세. */
export interface PartnerOrderDetail extends PartnerOrderSummary {
  bizCode: string
  updatedAt: string
  deliveryAddress: string | null
  siteAddress: string | null
  contactPhone: string | null
  dueDate: string | null
  memo: string | null
  lines: PartnerOrderLine[]
}

type RawPartnerOrderLine = Partial<Omit<PartnerOrderLine, 'deliveryPrice' | 'subtotal' | 'supplyAmount' | 'vatAmount' | 'lineTotal' | 'expandedComponents'>>
  & {
    deliveryPrice?: number | string | null
    priceVat?: number | string | null
    subtotal?: number | string | null
    supplyAmount?: number | string | null
    vatAmount?: number | string | null
    lineTotal?: number | string | null
    authority?: 'PRICE' | 'SUPPLY' | 'VAT' | 'TOTAL' | null
    modelName?: string | null
    modelCode?: string | null
    expandedComponents?: PartnerOrderLine['expandedComponents'] | null
  }

type RawPartnerOrderDetail = Partial<Omit<PartnerOrderDetail, 'totalAmount' | 'lines'>>
  & {
    totalAmount?: number | string | null
    lines?: RawPartnerOrderLine[] | null
  }

/**
 * slipPublishStatus 결측(BE 응답에 필드 자체가 없음) 1회 경고 — 폴백('NOT_REQUIRED')
 * 자체는 유지하되 침묵 마스킹을 막는다(#854 R5 MED). `raw.slipPublishStatus ?? 'NOT_REQUIRED'`
 * 는 BE 가 {@code @JsonInclude(NON_NULL)} 로 필드를 아예 생략하는 경우와 값이 정말
 * 'NOT_REQUIRED' 인 경우를 구별하지 못한다 — 배포 스큐 창구(구버전 BE가 신규 필드 미포함)
 * 에서 R4 가 고친 결함이 재현돼도 감지 수단이 없었다. 세션당 1회만 경고해 렌더/폴링
 * 스팸을 피한다.
 */
let slipPublishStatusMissingWarned = false
function warnSlipPublishStatusMissing(source: string): void {
  if (slipPublishStatusMissingWarned) return
  slipPublishStatusMissingWarned = true
  console.warn(
    `[sales] slipPublishStatus 필드가 BE 응답(${source})에 없습니다. 배포 스큐 또는 계약 회귀 ` +
      `가능성이 있습니다 — 화면은 'NOT_REQUIRED' 로 폴백 표시합니다.`,
  )
}

function numberValue(value: number | string | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function normalizePartnerOrderLine(line: RawPartnerOrderLine, index: number): PartnerOrderLine {
  const deliveryPrice = numberValue(line.deliveryPrice ?? line.priceVat)
  return {
    productId: line.productId ?? `missing-product-${index + 1}`,
    lineId: line.lineId ?? `missing-line-${index + 1}`,
    modelCode: line.modelCode ?? line.modelName ?? '',
    productName: line.productName ?? '',
    categoryKey: line.categoryKey,
    quantity: numberValue(line.quantity),
    deliveryPrice,
    subtotal: numberValue(line.subtotal) || deliveryPrice * numberValue(line.quantity),
    supplyAmount: line.supplyAmount == null ? null : numberValue(line.supplyAmount),
    vatAmount: line.vatAmount == null ? null : numberValue(line.vatAmount),
    lineTotal: line.lineTotal == null ? null : numberValue(line.lineTotal),
    authority: line.authority ?? null,
    remark: line.remark ?? null,
    convertedQuantity: numberValue(line.convertedQuantity),
    bundleMode: line.bundleMode ?? null,
    productType: line.productType,
    expandedComponents: line.expandedComponents ?? [],
  }
}

/**
 * PartnerOrderDetailResponse 정규화.
 *
 * BE DTO 는 현재 FE 모델과 동일하게 `deliveryPrice`/`modelCode` 를 내려주지만, 협업 commit
 * 응답이나 mock 이 도메인 snapshot 형태(`priceVat`/`modelName`)로 들어와도 화면 모델을 유지한다.
 */
export function normalizePartnerOrderDetail(raw: PartnerOrderDetail): PartnerOrderDetail
export function normalizePartnerOrderDetail(raw: RawPartnerOrderDetail): PartnerOrderDetail
export function normalizePartnerOrderDetail(raw: RawPartnerOrderDetail): PartnerOrderDetail {
  if (raw.slipPublishStatus == null) warnSlipPublishStatusMissing('partner-order-detail')
  return {
    orderNumber: raw.orderNumber ?? '',
    partnerCode: raw.partnerCode ?? '',
    partnerName: raw.partnerName ?? null,
    submittedAt: raw.submittedAt ?? null,
    createdAt: raw.createdAt ?? null,
    status: (raw.status ?? 'DRAFT') as PartnerOrderStatus,
    // raw.slipPublishStatus: SlipPublishStatus | undefined — '??' 결과가 이미 SlipPublishStatus
    // 로 좁혀지므로(폴백값 'NOT_REQUIRED' 가 union 의 기존 멤버) 캐스트가 불필요하다(#854 R5
    // LOW-1 — as SlipPublishStatus 캐스트 검토 결과 제거).
    slipPublishStatus: raw.slipPublishStatus ?? 'NOT_REQUIRED',
    totalAmount: numberValue(raw.totalAmount),
    linkedSlipNo: raw.linkedSlipNo ?? null,
    isDeleted: raw.isDeleted === true,
    deletedAt: raw.deletedAt ?? null,
    deletedByName: raw.deletedByName ?? null,
    bizCode: raw.bizCode ?? '',
    updatedAt: raw.updatedAt ?? '',
    deliveryAddress: raw.deliveryAddress ?? null,
    siteAddress: raw.siteAddress ?? null,
    contactPhone: raw.contactPhone ?? null,
    dueDate: raw.dueDate ?? null,
    memo: raw.memo ?? null,
    lines: (raw.lines ?? []).map(normalizePartnerOrderLine),
  }
}

type RawPartnerOrderSummary = Partial<Omit<PartnerOrderSummary, 'totalAmount'>> & {
  totalAmount?: number | string | null
}

/**
 * PartnerOrderSummary 정규화 — 목록(list) 응답 전용.
 *
 * <p>{@link normalizePartnerOrderDetail} 과 동일한 폴백 정책(문자열/숫자 혼재 totalAmount,
 * 누락 필드 기본값)을 목록 row 에도 적용한다. 종전 {@link listPartnerOrders} 는 정규화 없이
 * raw cast 로 반환해 mock 모드에서 신규 필수 필드(slipPublishStatus)가 런타임 `undefined`
 * 였다(#854 R5 MED — 타입-런타임 정합 회복).
 */
function normalizePartnerOrderSummary(raw: RawPartnerOrderSummary): PartnerOrderSummary {
  if (raw.slipPublishStatus == null) warnSlipPublishStatusMissing('partner-order-summary')
  return {
    orderNumber: raw.orderNumber ?? '',
    partnerCode: raw.partnerCode ?? '',
    partnerName: raw.partnerName ?? null,
    submittedAt: raw.submittedAt ?? null,
    createdAt: raw.createdAt ?? null,
    status: (raw.status ?? 'DRAFT') as PartnerOrderStatus,
    slipPublishStatus: raw.slipPublishStatus ?? 'NOT_REQUIRED',
    totalAmount: numberValue(raw.totalAmount),
    linkedSlipNo: raw.linkedSlipNo ?? null,
    isDeleted: raw.isDeleted === true,
    deletedAt: raw.deletedAt ?? null,
    deletedByName: raw.deletedByName ?? null,
    mergeEligible: raw.mergeEligible,
    mergeIneligibilityReason: raw.mergeIneligibilityReason ?? null,
  }
}

/** 주문 수정 요청 — 본사 direct PUT 전용. */
export interface PartnerOrderUpdateRequest {
  updatedAt: string
  partnerCode: string
  bizCode: string
  dueDate: string | null
  memo: string | null
  lines: Array<{
    modelCode: string
    productName: string
    categoryKey: string
    quantity: number
    deliveryPrice: number
    remark: string | null
    supplyAmount?: number | null
    vatAmount?: number | null
    lineTotal?: number | null
    authority?: 'PRICE' | 'SUPPLY' | 'VAT' | 'TOTAL' | null
  }>
}

/**
 * 주문 페이지 조회 (read-only).
 */
export async function listPartnerOrders(
  page = 0,
  size = 20,
  filters: {
    dateFrom?: string
    dateTo?: string
    partnerId?: string
    /** 병합 후보 전용 거래처 코드 정확 검색. 기존 partnerId 부분검색과 구분한다. */
    partnerCode?: string
    /** 병합 후보 전용 거래처 UUID 정확 검색. 화면에는 노출하지 않는다. */
    partnerIdExact?: string
    status?: PartnerOrderStatus
    /** 발행실패(FAILED) 또는 재시도 중(PENDING_RETRY) 전용 목록 필터. */
    slipPublishStatus?: 'FAILED' | SlipPublishStatus
    searchKeyword?: string
    /**
     * 내부 관리자 목록 전용 opt-in — 삭제행(취소선/복원 표시) 포함. BE 기본값 false(활성만).
     * 파트너(X-Is-Partner) 호출은 BE 가 값과 무관하게 활성 행만 반환한다(#757 R2 HIGH).
     */
    includeDeleted?: boolean
  } = {},
): Promise<PageResponse<PartnerOrderSummary>> {
  const params: Record<string, string | number> = { page, size }
  if (filters.dateFrom) params['dateFrom'] = filters.dateFrom
  if (filters.dateTo) params['dateTo'] = filters.dateTo
  if (filters.partnerId) params['partnerId'] = filters.partnerId
  if (filters.partnerCode) params['partnerCode'] = filters.partnerCode
  if (filters.partnerIdExact) params['partnerIdExact'] = filters.partnerIdExact
  if (filters.status) params['status'] = filters.status
  if (filters.slipPublishStatus) params['slipPublishStatus'] = filters.slipPublishStatus
  if (filters.searchKeyword) params['searchKeyword'] = filters.searchKeyword
  if (filters.includeDeleted) params['includeDeleted'] = 'true'
  const res = await apiClient.get<ApiEnvelope<PageResponse<RawPartnerOrderSummary>>>(
    '/api/v1/partner-orders',
    { params },
  )
  const pageResult = res.data.data
  return { ...pageResult, content: (pageResult.content ?? []).map(normalizePartnerOrderSummary) }
}

/** 주문 단건 조회. */
export async function getPartnerOrder(
  orderNumber: string,
): Promise<PartnerOrderDetail> {
  const res = await apiClient.get<ApiEnvelope<PartnerOrderDetail>>(
    `/api/v1/partner-orders/${encodeURIComponent(toOrderPathId(orderNumber))}`,
  )
  return normalizePartnerOrderDetail(res.data.data)
}

/** 주문 헤더/라인 direct PUT 수정. */
export async function updatePartnerOrder(
  orderNumber: string,
  request: PartnerOrderUpdateRequest,
): Promise<PartnerOrderDetail> {
  const res = await apiClient.put<ApiEnvelope<PartnerOrderDetail>>(
    `/api/v1/partner-orders/${encodeURIComponent(toOrderPathId(orderNumber))}`,
    request,
  )
  return normalizePartnerOrderDetail(res.data.data)
}

// ---------------------------------------------------------------------------
// partner-order-service — 다중주문 병합 전환 (Phase 2.6b D2)
// ---------------------------------------------------------------------------

/**
 * 병합 전환 대상 주문 1건 + 선택 라인.
 * partnerOrderId 는 사용자 화면에 미노출 (orderLineId 도 동일).
 */
export interface MergeConvertOrderItems {
  /**
   * 주문번호 또는 UUID — FE 는 orderNumber 전달.
   * BE `PartnerOrderIdResolver` 가 주문번호/UUID 양용 허용.
   * 사용자 화면 노출 금지.
   */
  partnerOrderId: string
  items: { orderLineId: string; quantity: number }[]
}

/** 병합 전환 확정 헤더 — FE 가 충돌 필드를 '/' 병기/선택 후 전달. */
export interface MergeConvertShippingInfo {
  partnerName?: string
  shippingAddress?: string
  receiverPhone?: string
  paymentDueLabel?: string
  discountInfo?: string
  memo?: string
}

/**
 * 병합 전환 결과 — BE MergeConvertResultResponse 와 1:1.
 *
 * @param slipNo 발급된 단일 출고전표 번호 (사용자 노출).
 * @param convertedOrders 전환된 주문별 상태.
 *   - orderNo: 주문번호 (BE 확정 — UUID 아님, 사용자 노출 가능).
 *   - orderStatus: 전환 후 주문 상태 (CONVERTED / DRAFT 등).
 *   - fullyConverted: 전량 전환 여부.
 */
export interface MergeConvertResult {
  slipNo: string
  convertedOrders: { orderNo: string; orderStatus: string; fullyConverted: boolean }[]
}

/**
 * 다중 주문 병합 전환 — 선택 주문/라인을 단일 출고전표로 병합 발행한다 (Phase 2.6b D2).
 *
 * <p>BE: {@code POST /api/v1/partner-orders/convert-to-slip-merge}. 권한: sales.partner-order.convert CREATE.
 * 같은 거래처 DRAFT/ON_HOLD 주문만 허용 (BE 가 partnerCode 동일성 검증 후 처리).
 * 잔여 초과 또는 거래처 불일치 시 BE 가 409 반환.
 *
 * @param orders 병합 대상 주문 목록 (각각 partnerOrderId + 선택 라인)
 * @param warehouseCode 출고 창고 코드 (필수)
 * @param shippingInfo FE 확정 병합 헤더
 */
export async function mergeConvertToSlip(
  orders: MergeConvertOrderItems[],
  warehouseCode: string,
  shippingInfo: MergeConvertShippingInfo,
): Promise<MergeConvertResult> {
  const res = await apiClient.post<ApiEnvelope<MergeConvertResult>>(
    '/api/v1/partner-orders/convert-to-slip-merge',
    { orders, warehouseCode, shippingInfo },
  )
  return res.data.data
}

/** 주문 soft delete. */
export async function deletePartnerOrder(orderNumber: string): Promise<void> {
  await apiClient.delete(
    `/api/v1/partner-orders/${encodeURIComponent(toOrderPathId(orderNumber))}`,
  )
}

/** 주문 soft-delete 복원. */
export async function restorePartnerOrder(orderNumber: string): Promise<PartnerOrderDetail> {
  const res = await apiClient.post<ApiEnvelope<PartnerOrderDetail>>(
    `/api/v1/partner-orders/${encodeURIComponent(toOrderPathId(orderNumber))}/restore`,
  )
  return normalizePartnerOrderDetail(res.data.data)
}

/**
 * 주문 보류 처리 — 진행중(DRAFT) → 보류(ON_HOLD). Phase 2.5.
 *
 * <p>BE: {@code POST /api/v1/partner-orders/{id}/hold}. 권한: sales.partner-order.edit UPDATE.
 * DRAFT 가 아닌 상태에서 호출 시 BE 가 409 반환.
 *
 * @param orderNumber 주문번호 (URL-safe encode 적용) — UUID 비노출 ([[uuid-no-user-visibility]]).
 */
export async function holdPartnerOrder(orderNumber: string): Promise<PartnerOrderDetail> {
  const res = await apiClient.post<ApiEnvelope<PartnerOrderDetail>>(
    `/api/v1/partner-orders/${encodeURIComponent(toOrderPathId(orderNumber))}/hold`,
  )
  return normalizePartnerOrderDetail(res.data.data)
}

/**
 * 주문 보류 해제 — 보류(ON_HOLD) → 진행중(DRAFT). Phase 2.5.
 *
 * <p>BE: {@code POST /api/v1/partner-orders/{id}/release}. 권한: sales.partner-order.edit UPDATE.
 * ON_HOLD 가 아닌 상태에서 호출 시 BE 가 409 반환.
 *
 * @param orderNumber 주문번호 (URL-safe encode 적용) — UUID 비노출 ([[uuid-no-user-visibility]]).
 */
export async function releasePartnerOrder(orderNumber: string): Promise<PartnerOrderDetail> {
  const res = await apiClient.post<ApiEnvelope<PartnerOrderDetail>>(
    `/api/v1/partner-orders/${encodeURIComponent(toOrderPathId(orderNumber))}/release`,
  )
  return normalizePartnerOrderDetail(res.data.data)
}

// ---------------------------------------------------------------------------
// partner-service M5 — 거래처 검색 (견적서 거래처 자동완성, v2 §정정 16)
// ---------------------------------------------------------------------------

/**
 * PartnerSummary — 거래처 검색 자동완성 row.
 *
 * <p>선택 즉시 `cardOrderInfo` 의 거래처명/거래처코드/연락처 자동 채움.
 *
 * <p>**BE 계약 정합 (path 결함 수정)** — 실제 backend 거래처 검색 endpoint 는
 * partner-service `PartnerAdminController @GetMapping("/search")` =
 * `/admin/partners/search` (gateway `partner-service-noprefix` route `/admin/partners/**`).
 * 응답은 {@code ApiResponse<AdminPartnerListResponse{ items: PartnerSummaryResponse[],
 * total, page, size }>} 이며 PartnerSummaryResponse 는 {@code partnerCode / name / bizNo /
 * phone / status / creditLimit / outstandingBalance} 만 노출한다. 따라서
 * 대표자명({@code representativeName}) / 주소({@code address}) / 그룹({@code groupName}) /
 * 비고({@code note}) 는 본 검색 endpoint 가 제공하지 않으므로 항상 {@code null} 이다
 * (단건 상세 `/admin/partners/{partnerCode}` 조회 시 별도 확보).
 */
export interface PartnerSummary {
  /** 내부 partnerId UUID — 화면 표시 금지, API payload 전용. */
  partnerId?: string | null
  /** 사업자등록번호 (= BE `bizNo`, 사용자 노출 식별자). */
  businessRegistrationNumber: string
  /** 거래처명 (= BE `name`). */
  companyName: string
  /** 대표자명 — 검색 endpoint 미제공 (항상 null). */
  representativeName: string | null
  /** 연락처 (= BE `phone`). */
  contactPhone: string | null
  /** 주소 — 검색 endpoint 미제공 (항상 null). */
  address: string | null
  /** 그룹 — 검색 endpoint 미제공 (항상 null). */
  groupName: string | null
  /** 비고 — 검색 endpoint 미제공 (항상 null). */
  note: string | null
}

/** BE `PartnerSummaryResponse` — `/admin/partners/search` items row (raw). */
interface AdminPartnerSummaryRow {
  partnerId?: string | null
  partnerCode: string
  name: string | null
  bizNo: string | null
  phone: string | null
}

/** BE `AdminPartnerListResponse` — `/admin/partners/search` envelope payload. */
interface AdminPartnerListPayload {
  items: AdminPartnerSummaryRow[]
  total: number
  page: number
  size: number
}

/**
 * 거래처 검색 (자동완성).
 *
 * <p>견적서 작성 화면의 `cardOrderInfo` 거래처 검색 input → 한글/사업자번호 부분 매칭.
 * backend partner-service `/admin/partners/search?q=` 로 호출 (path 결함 수정 — 기존
 * `/api/v1/partners/search` 는 매핑 부재로 404). mock 미배포 시 빈 배열 반환.
 *
 * @param keyword 거래처명/사업자번호 부분 매칭 키워드 (BE `q` 파라미터). 2자 이상 권장.
 * @param size 최대 결과 수 (기본 10).
 */
export async function searchPartners(
  keyword: string,
  size = 10,
  options: { activeOnly?: boolean } = {},
): Promise<PartnerSummary[]> {
  if (!keyword || keyword.trim().length < 1) return []
  const res = await apiClient.get<ApiEnvelope<AdminPartnerListPayload>>(
    '/admin/partners/search',
    {
      params: {
        q: keyword.trim(),
        page: 0,
        size,
        ...(options.activeOnly ? { status: 'ACTIVE' } : {}),
      },
    },
  )
  return res.data.data.items.map((row) => ({
    partnerId: row.partnerId ?? null,
    businessRegistrationNumber: row.bizNo ?? row.partnerCode,
    companyName: row.name ?? '',
    representativeName: null,
    contactPhone: row.phone,
    address: null,
    groupName: null,
    note: null,
  }))
}

// ---------------------------------------------------------------------------
// partner-service — 주문서 승인 (v2 §정정 9, /sales/order-approvals)
// ---------------------------------------------------------------------------

/**
 * PartnerApprovalStatus — 주문서 승인 status enum 6종 (v2 §정정 9 / §정정 11).
 *
 * <p>csv 시드 (`주문서 승인현황 *.csv`) 의 status 분포 + DECISIONS.md 정정 라운드 명세.
 */
export type PartnerApprovalStatus =
  | 'UNAPPROVED'
  | 'APPROVED'
  | 'PASSWORD_RESET_PENDING'
  | 'PASSWORD_ERROR'
  | 'ACCESS_DENIED'
  | 'LONG_PENDING'

/** PartnerApprovalStatus → 한국어 라벨 (v2 §정정 11). */
export const PARTNER_APPROVAL_STATUS_LABEL: Record<PartnerApprovalStatus, string> = {
  UNAPPROVED: '미승인',
  APPROVED: '승인',
  PASSWORD_RESET_PENDING: '비밀번호 재설정 대기',
  PASSWORD_ERROR: '비밀번호 오류',
  ACCESS_DENIED: '접근제한',
  LONG_PENDING: '장기미발주',
}

/** PartnerApproval row — `/sales/order-approvals` grid source. */
export interface PartnerApproval {
  /** 거래처 코드 (사업자등록번호, 사용자 노출). */
  partnerCode: string
  /** 거래처명. */
  partnerName: string
  status: PartnerApprovalStatus
  /** 승인 요청 일시 (ISO 8601 또는 legacy `2026년 5월 4일 오후 5:27` 한글). */
  approvalRequestedAt: string | null
  /** PC 버전 튜토리얼 완료 여부. */
  pcTutorialDone: boolean
  /** 모바일 버전 튜토리얼 완료 여부. */
  mobileTutorialDone: boolean
  /** 영업담당자 (FK to EmployeeMaster.employeeName). */
  assignedManagerName: string | null
}

/** 주문서 앱 접근권한 미리보기 — 후보와 외부 조회 보류를 함께 표시한다. */
export interface PartnerAccessPreview {
  candidates: PartnerApproval[]
  deferred: boolean
  deferredPartnerCount: number
  deferredSources: ('ORDER' | 'SHIPMENT')[]
}

/**
 * 주문서 승인 페이지 조회 — `/api/v1/partner-approvals?page=&size=&status=`.
 */
export async function listPartnerApprovals(
  page = 0,
  size = 50,
  status?: PartnerApprovalStatus,
): Promise<PageResponse<PartnerApproval>> {
  const params: Record<string, string | number> = { page, size }
  if (status) params['status'] = status
  const res = await apiClient.get<ApiEnvelope<PageResponse<PartnerApproval>>>(
    '/api/v1/partner-approvals',
    { params },
  )
  return res.data.data
}

/**
 * 주문서 앱 접근권한 설정 후보 미리보기.
 *
 * <p>기간은 화면 표시용이 아니라 backend 선별 query에 전달되어 실제 후보 수를 바꾼다.
 */
export async function previewPartnerAccess(
  unusedDays: number,
): Promise<PartnerAccessPreview> {
  const res = await apiClient.get<ApiEnvelope<PartnerAccessPreview>>(
    '/api/v1/partner-approvals/access-preview/report',
    { params: { unusedDays } },
  )
  return res.data.data
}

/**
 * 영업자 주문서 승인 status 변경 (v2 §정정 9/11).
 *
 * <p>승인 전환 시 backend 가 비밀번호 자동 재설정 흐름을 발동 (PASSWORD_RESET_PENDING
 * 으로 전환되어 거래처 다음 접속 시 재설정 페이지 표시). 본 endpoint 는 status 변경
 * mutation 만 담당.
 */
export async function updatePartnerApprovalStatus(
  partnerCode: string,
  status: PartnerApprovalStatus,
): Promise<PartnerApproval> {
  const res = await apiClient.patch<ApiEnvelope<PartnerApproval>>(
    `/api/v1/partner-approvals/${encodeURIComponent(partnerCode)}/status`,
    { status },
  )
  return res.data.data
}

/**
 * 거래처 비밀번호 강제 초기화 (v2 §정정 9 — '비밀번호 초기화' 버튼).
 *
 * <p>호출 시 status → PASSWORD_RESET_PENDING + 거래처 다음 접속 시 재설정 페이지 자동 표시.
 */
export async function resetPartnerPassword(
  partnerCode: string,
): Promise<PartnerApproval> {
  const res = await apiClient.post<ApiEnvelope<PartnerApproval>>(
    `/api/v1/partner-approvals/${encodeURIComponent(partnerCode)}/reset-password`,
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// dc-config-service — 거래처 DC 설정 (v2 §정정 14, /sales/partner-dc-config)
// ---------------------------------------------------------------------------

/**
 * PartnerDcConfig — 거래처별 DC 설정 row.
 *
 * <p>Notion CSV export (`거래처 DC정보`) 의 column 1:1 매핑.
 * DC 11종 + 특이사항. backend `partner_dc_config` 테이블의 columns.
 */
export interface PartnerDcConfig {
  /** 거래처 코드 (사업자등록번호, PK). */
  partnerCode: string
  /** 업체명. */
  companyName: string
  /** 홈멀티 DC (예 `46%`). null 이면 미설정. */
  homeMultiDc: string | null
  /** 상업멀티 DC. */
  commercialMultiDc: string | null
  /** 유연호스 I형 (Yes/No). */
  flexibleHoseTypeI: string | null
  /** 360 (단가 또는 DC%). */
  threeSixty: string | null
  /** 4way. */
  fourWay: string | null
  /** 1way. */
  oneWay: string | null
  /** 스탠드. */
  stand: string | null
  /** 디럭스. */
  deluxe: string | null
  /** 1등급. */
  firstGrade: string | null
  /** 단위처리. */
  unitProcess: string | null
  /** 특이사항. */
  remark: string | null
}

/** PartnerDcConfig 컬럼 메타 — grid header + 인라인 수정 입력 정의. */
export interface PartnerDcConfigColumnMeta {
  key: keyof Omit<PartnerDcConfig, 'partnerCode' | 'companyName'>
  label: string
  /** 입력 placeholder hint. */
  placeholder: string
}

export const PARTNER_DC_CONFIG_COLUMNS: PartnerDcConfigColumnMeta[] = [
  { key: 'homeMultiDc', label: '홈멀티DC', placeholder: '예: 46%' },
  { key: 'commercialMultiDc', label: '상업멀티DC', placeholder: '예: 47%' },
  { key: 'flexibleHoseTypeI', label: '유연호스I형', placeholder: 'Yes / No' },
  { key: 'threeSixty', label: '360', placeholder: '예: ₩70,000' },
  { key: 'fourWay', label: '4way', placeholder: '예: ₩70,000' },
  { key: 'oneWay', label: '1way', placeholder: '예: ₩50,000' },
  { key: 'stand', label: '스탠드', placeholder: '예: ₩30,000' },
  { key: 'deluxe', label: '디럭스', placeholder: '예: ₩30,000' },
  { key: 'firstGrade', label: '1등급', placeholder: '예: ₩30,000' },
  { key: 'unitProcess', label: '단위처리', placeholder: '단위처리' },
  { key: 'remark', label: '특이사항', placeholder: '메모' },
]

/** 거래처 DC 설정 페이지 조회. */
export async function listPartnerDcConfigs(
  page = 0,
  size = 50,
  keyword?: string,
): Promise<PageResponse<PartnerDcConfig>> {
  const params: Record<string, string | number> = { page, size }
  if (keyword && keyword.trim()) params['keyword'] = keyword.trim()
  const res = await apiClient.get<ApiEnvelope<PageResponse<PartnerDcConfig>>>(
    '/api/v1/partner-dc-configs',
    { params },
  )
  return res.data.data
}

/** 거래처 DC 설정 단건 수정 (인라인 저장). */
export async function updatePartnerDcConfig(
  partnerCode: string,
  patch: Partial<PartnerDcConfig>,
): Promise<PartnerDcConfig> {
  const res = await apiClient.patch<ApiEnvelope<PartnerDcConfig>>(
    `/api/v1/partner-dc-configs/${encodeURIComponent(partnerCode)}`,
    patch,
  )
  return res.data.data
}

/** 거래처 전표 가격계산용 DC 설정 단건 조회. */
export async function getPartnerDcConfig(partnerCode: string): Promise<PartnerDcConfig | null> {
  try {
    const res = await apiClient.get<ApiEnvelope<PartnerDcConfig>>(
      `/api/v1/partner-dc-configs/${encodeURIComponent(partnerCode)}`,
    )
    return res.data.data ?? null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// dc-config-service — 종합견적서 전역 가격 설정 (/sales/estimate-config)
// ---------------------------------------------------------------------------

export interface EstimateConfig {
  commonHomeDiscountRate: number
  commonCommercialDiscountRate: number
  oldProductDiscountRate: number
  vatRate: number
  cardFeeRate: number
  advanceDiscountRate: number
  comboWarnRate: number
  homeNoHose: boolean
  homeNoBranch: boolean
  homeWithFoot: boolean
  homeDefaultPanel: string
  singleDefaultWiredRemote: string
  singleNoRemote: boolean
  singleWithBase: boolean
  singleDefaultPanel: string
  singlePanelShape: string
  singleDiscount: number
  singleOneWayDiscount: number
  singleMaterialInclusion: string
  footerNotice: string
}

export type UpdateEstimateConfigRequest = EstimateConfig

export async function getEstimateConfig(): Promise<EstimateConfig> {
  const res = await apiClient.get<ApiEnvelope<EstimateConfig>>('/api/v1/estimate-config')
  return res.data.data
}

export async function updateEstimateConfig(
  request: UpdateEstimateConfigRequest,
): Promise<EstimateConfig> {
  const res = await apiClient.put<ApiEnvelope<EstimateConfig>>(
    '/api/v1/estimate-config',
    request,
  )
  return res.data.data
}
