/**
 * 전표 도메인 API 클라이언트 (출고 / 입고).
 *
 * 노출 endpoint:
 * - `GET    /slips`                — Page<SlipSummary> 페이지 조회 (slipType / status 필터)
 * - `GET    /slips/{id}`           — 라인 포함 상세 (`SlipDetail`)
 * - `POST   /slips`                — 신규 전표 생성 (DRAFT)
 * - `GET    /slips/lookup-product` — 모델명 → product 요약 (onBlur lookup)
 * - `POST   /slips/{id}/{action}`  — 라이프사이클 transition (save/send/accept/...)
 *
 * UUID 비공개 가드: 응답 객체의 `id`/`partnerId`/`sourceWarehouseId` 등 UUID
 * 필드는 axios body 안 / URL path param 으로만 사용한다. 화면 표시 영역에는
 * 절대 노출하지 않는다 (`feedback_uuid_no_user_visibility.md`).
 */
import {
  apiClient,
  type ApiEnvelope,
  type PageResponse,
} from './client'
import type { SlipStatus } from '@samhan/design-system'
import type { DeliveryTagCode } from '@samhan/design-system'

/** 본 슬라이스 범위 — 출고/입고 2종. */
export type SlipType = 'OUTBOUND' | 'INBOUND'

/** 목록용 요약 응답 — BE `SlipResponse`. */
export interface SlipSummary {
  id: string
  slipType: SlipType
  slipNo: string
  slipDate: string
  seqNo: number
  status: SlipStatus
  partnerId: string | null
  partnerName: string | null
  sourceWarehouseId: string | null
  destinationWarehouseId: string | null
  deliveryTag: DeliveryTagCode | null
  requesterId: string | null
  acceptedBy: string | null
  acceptedAt: string | null
  completedAt: string | null
  confirmedAt: string | null
  updatedAt: string
  version: number
}

/** 라인 응답 — BE `SlipLineResponse`. */
export interface SlipLineDetail {
  id: string
  productId: string
  productName: string | null
  modelName: string | null
  /**
   * 규격 (예: "220V", "4HP") — Slice A 신규 (피드백 #4 / Designer components.md § 3).
   * BE `SlipLineResponse.specification` (varchar 50, nullable).
   */
  specification: string | null
  quantity: number
  unitPrice: string
  lineTotal: string
  note: string | null
}

/**
 * 결재란 출고인/검수인 응답 — Slice A 신규 (Designer README.md § 2.3 + ux-flow.md § 2.4).
 * BE 가 user-service lookup 후 fullName 포함 (Option A 권장).
 */
export interface SlipApprovalActor {
  /** 사용자 UUID — 화면 미노출 (UUID 비공개 가드). */
  userId: string
  /** 사용자 이름 — 결재란 셀에 표시. */
  fullName: string
  /** ISO 8601 timestamp — 결재란 셀에 HH:mm 부분만 표시. */
  signedAt: string
}

/** 상세 응답 — BE `SlipDetailResponse`. */
export interface SlipDetail extends SlipSummary {
  memo: string | null
  lines: SlipLineDetail[]
  partnerCode?: string | null
  inspectionStatus?: 'READY' | 'NOT_READY' | null
  /**
   * 기사명 — link-dispatch-slice 신규 (Designer plan §7).
   * DRAFT/SAVED 단계만 편집 가능 (BE 가드와 동일).
   * SMS 발송 시 BE 가 driverPhone 으로 메시지 송신.
   */
  driverName?: string | null
  /**
   * 기사 휴대폰 (010-XXXX-XXXX 정규화) — link-dispatch-slice 신규.
   * KOREAN_MOBILE_PHONE_PATTERN 검증.
   */
  driverPhone?: string | null
  /**
   * ACCEPTED 트랜지션 시점 자동 채워지는 출고인 (피드백 #9).
   * 미도달 시 undefined / null. Designer ux-flow.md § 2.1 참고.
   */
  dispatcher?: SlipApprovalActor | null
  /**
   * INSPECTING 트랜지션 시점 자동 채워지는 검수인 (피드백 #9).
   * 미도달 시 undefined / null. Designer ux-flow.md § 2.2 참고.
   */
  inspector?: SlipApprovalActor | null
  /** 담당부서 (BE 가 사용자 부서 lookup 후 전달). */
  ownerDepartment?: string | null
  /** 담당자 (slip.createdBy 의 fullName). */
  ownerFullName?: string | null
  /** 배송지 — DispatchView 에서 14pt 본문으로 표시. */
  shippingAddress?: string | null
  /** 거래처 연락처 — DispatchView 에서 14pt 본문으로 표시. */
  contactPhone?: string | null
  /**
   * signature-slice-C 신규 필드 7개 (모두 nullable, 미서명 시 null).
   *
   * BE Plan §3 V5__add_slip_signature.sql 의 컬럼과 1:1 대응. signaturePng 은 base64
   * dataURL ("data:image/png;base64,...") 형태로 BE 가 인코딩하여 응답.
   */
  /** 서명 시점 ISO 8601 — 미서명 시 null. */
  signedAt?: string | null
  /** 인수자명 (≤50자) — 미서명 시 null. */
  signerName?: string | null
  /** PNG base64 dataURL — 미서명 시 null. SignatureViewer 의 signaturePngBase64 prop 으로 그대로 전달. */
  signaturePng?: string | null
  /** SHA-256 hex (64자) — 미서명 시 null. SignatureViewer 가 앞 8자만 표시. */
  signatureHash?: string | null
  /** 서명 채널 — MOBILE_CANVAS / PAPER_SCAN / 기타 (Phase 6+ 확장). */
  signatureChannel?: 'MOBILE_CANVAS' | 'PAPER_SCAN' | string | null
  /** 인수자 share 토큰 (base64url) — 모바일 `/share/{token}` 라우트 경로. */
  signatureShareToken?: string | null
  /** share 유효기간 ISO 8601 (+30일). */
  signatureShareExpiresAt?: string | null

  /**
   * Slice C2 (PR #23 follow-up) — 배송기사 서명 4 필드 (nullable).
   * Slip.driverName 은 기존 Slice B 필드 재사용 (별도 driverSignerName X).
   */
  driverSignedAt?: string | null
  driverSignaturePng?: string | null
  driverSignatureHash?: string | null
  driverSignatureChannel?: 'MOBILE_CANVAS' | 'PAPER_SCAN' | string | null

  /**
   * V20 신규 5필드 — BE V20__add_slip_v20_fields.sql 컬럼과 1:1 대응 (모두 nullable).
   * 판매/구매조회(SlipQueryRow) 와 동일 필드명 사용.
   */
  /** 배송주소 (최대 500자) — 거래처 shippingAddress 복사 또는 직접 입력. */
  deliveryAddress?: string | null
  /** 감리주소 (최대 500자) — "배송주소와 동일" 체크박스 연동. */
  supervisionAddress?: string | null
  /** 프로젝트명 (최대 200자). */
  projectName?: string | null
  /** 인수자 번호 (최대 20자, 010-XXXX-XXXX 형식 권장). */
  recipientPhone?: string | null
  /** 입금예정일 (ISO 8601 date string YYYY-MM-DD). */
  paymentDueDate?: string | null
  /** 사업자번호 — 거래처 선택 시 자동 표시 (사용자 입력 X, UUID 비공개 가드). */
  businessNumber?: string | null
  /** 인쇄 여부 — 서버에서 관리, readonly 표시 전용. */
  printed?: boolean | null
}

/**
 * 세트 전개 옵션 — BE `BundleSetOptions` (estimate/web/dto) 와 1:1.
 *
 * <p>BUNDLE(세트) 품목 라인에 한해 사용. 종합견적서 GAS 의 옵션 선택
 * (실외기 교체/제외, 판넬 선택/360 형상, 자재 포함 여부) 을 그대로 전달하여
 * BE BundleExpander 가 6:4 재분배 + 옵션 필터링으로 구성품 라인을 전개한다.
 * SINGLE 품목 라인은 undefined 로 둔다(전개 없음).
 */
export interface BundleSetOptions {
  /** 실외기 교체 옵션 modelCode — 지정 시 기본 실외기를 이 모델로 대체. */
  remoteOption?: string | null
  /** 실외기 제외 여부 — true 면 실외기 구성품 전개 제외. */
  remoteExcluded?: boolean | null
  /** 판넬 선택 modelCode — 1종 택1. */
  panelOption?: string | null
  /** 판넬 360 형상 여부 — variant 정확 매칭에 사용. */
  panelShape360?: boolean | null
  /** 자재 포함 여부 — true 면 자재류 구성품 포함. */
  materialIncluded?: boolean | null
}

/** 라인 input — BE `CreateSlipRequest.SlipLineRequest`. */
export interface SlipLineInput {
  productId: string
  productName?: string
  modelName?: string
  /**
   * 규격 (Slice A 신규 — Designer components.md § 3).
   * 빈 값 / undefined 모두 허용. DB column varchar(50).
   */
  specification?: string
  quantity: number
  unitPrice: string
  note?: string
  /** 세트 전개 옵션 — BUNDLE 품목 라인에 한해 전달(BE BundleExpander). */
  setOptions?: BundleSetOptions
}

/** 매입 전표 direct PUT 수정 요청 — BE `SlipUpdateRequest`. */
export interface SlipUpdateRequest {
  updatedAt: string
  partnerName?: string | null
  partnerCode?: string | null
  memo?: string | null
  businessNumber?: string | null
  deliveryAddress?: string | null
  supervisionAddress?: string | null
  projectName?: string | null
  recipientPhone?: string | null
  paymentDueDate?: string | null
  lines: SlipLineInput[]
}

/** 신규 전표 생성 요청 body — BE `CreateSlipRequest`. */
export interface CreateSlipRequest {
  slipType: SlipType
  slipDate?: string
  sourceWarehouseId?: string
  destinationWarehouseId?: string
  partnerId?: string
  partnerName?: string
  deliveryTag?: DeliveryTagCode
  memo?: string
  /** 기사명 — link-dispatch-slice 신규 (옵션). */
  driverName?: string
  /** 기사 휴대폰 — link-dispatch-slice 신규 (옵션, 010-XXXX-XXXX). */
  driverPhone?: string
  // PR-G1 backlog #2 — V16 e-Count 12 컬럼 (모두 옵션, BE 가 null 시 기본 분기).
  /** "10"=출고 / "11"=입고. null 시 slipType 분기 자동. */
  ioType?: string
  /** HHmmss. null 시 BE 가 서버 시각 자동 채움. */
  timeDate?: string
  /** 거래처 연락처 (자동 채움 가능). */
  customerTel?: string
  /** 거래처 사업장 주소 (자동 채움 가능). */
  customerAddress?: string
  /** 거래처 대표자명 (자동 채움 가능). */
  customerRepresentative?: string
  /** 배송지 주소 — 별도 입력. */
  shippingAddress?: string
  /** 검수지 주소 — 별도 입력. */
  inspectionAddress?: string
  /** 수령자 연락처 — 별도 입력. */
  receiverPhone?: string
  /** 결제 만기 라벨 (예: "MM-DD" 또는 "익월말"). */
  paymentDueLabel?: string
  /** 할인 정보 (자유 입력). */
  discountInfo?: string
  /** 대금 회수 조건 ("월말" / "익월말" / "현금" 등). */
  collectTerm?: string
  /** 거래 약정 조건 (자유 입력). */
  agreeTerm?: string
  // V20 신규 5필드 (BE V20__add_slip_v20_fields.sql 컬럼과 1:1 대응, 모두 옵션)
  /** 배송주소 (최대 500자). */
  deliveryAddress?: string
  /** 감리주소 (최대 500자). */
  supervisionAddress?: string
  /** 프로젝트명 (최대 200자). */
  projectName?: string
  /** 인수자 번호 (최대 20자, 010-XXXX-XXXX 형식 권장). */
  recipientPhone?: string
  /** 입금예정일 (YYYY-MM-DD). */
  paymentDueDate?: string
  lines: SlipLineInput[]
}

/** 페이지 조회 옵션 — slipType / status / deliveryTag 필터, 0-based page. */
export interface ListSlipsOptions {
  slipType?: SlipType
  status?: SlipStatus
  /** 배송태그 필터 — OUTBOUND: 8종, INBOUND: 3종. */
  deliveryTag?: DeliveryTagCode | null
  page?: number
  size?: number
}

/** 모델명 lookup 응답 — BE `ProductSummary` (slip-service facade). */
export interface ProductLookupResult {
  productId: string
  modelName: string
  productName: string
  sellingPrice: string
  /** 품목코드 — 세트 전개 시 BE 가 부모 modelCode 로 사용. */
  modelCode?: string
  /** 품목 유형 — "SINGLE" | "BUNDLE". BUNDLE 이면 세트 옵션 노출. */
  productType?: string
}

/**
 * 전표 페이지 조회. 빈 필터 시 전체.
 *
 * @return Spring `Page<SlipResponse>` 형태
 */
export async function listSlips(
  options: ListSlipsOptions = {},
): Promise<PageResponse<SlipSummary>> {
  const params: Record<string, string | number> = {
    page: options.page ?? 0,
    size: options.size ?? 20,
  }
  if (options.slipType) params['slipType'] = options.slipType
  if (options.status) params['status'] = options.status
  if (options.deliveryTag) params['deliveryTag'] = options.deliveryTag

  const res = await apiClient.get<ApiEnvelope<PageResponse<SlipSummary>>>(
    '/slips',
    { params },
  )
  return res.data.data
}

/**
 * 전표 단건 상세 조회 — 라인 포함.
 *
 * @param id 전표 UUID (path param 으로만 사용, 화면 표시 X)
 */
export async function getSlip(id: string): Promise<SlipDetail> {
  const res = await apiClient.get<ApiEnvelope<SlipDetail>>(`/slips/${id}`)
  return res.data.data
}

/**
 * 신규 전표 생성. 응답은 라인 포함 상세 (`SlipDetailResponse`).
 *
 * @return 생성된 전표 (status=DRAFT)
 */
export async function createSlip(
  body: CreateSlipRequest,
): Promise<SlipDetail> {
  const res = await apiClient.post<ApiEnvelope<SlipDetail>>('/slips', body)
  return res.data.data
}

/**
 * 매입 전표 soft delete — optimistic lock (updatedAt 필수).
 *
 * BE `DELETE /slips/{id}` + request body `{ updatedAt }`.
 * 응답 없음 (204). 204/200 모두 성공으로 처리.
 *
 * 에러 코드:
 * - 409 Conflict       — 낙관적 잠금 충돌 (다른 사용자가 먼저 수정)
 * - 422 Unprocessable  — SLIP_DELETE_INSPECTION_COMPLETED (검수 완료 전표 삭제 불가)
 * - 403 Forbidden      — 권한 부족
 *
 * @param id        전표 UUID (path param 전용, 화면 표시 금지)
 * @param updatedAt 낙관적 잠금용 마지막 수정 시각 (ISO 8601)
 */
export async function deletePurchaseSlip(
  id: string,
  updatedAt: string,
): Promise<void> {
  await apiClient.delete<ApiEnvelope<void>>(
    `/slips/${encodeURIComponent(id)}`,
    { data: { updatedAt } },
  )
}

/**
 * 매출 전표 soft delete — SP-08-6-3 신규. optimistic lock (updatedAt 필수).
 *
 * BE `DELETE /slips/{id}/sales` + request body `{ updatedAt }`.
 * 응답 없음 (204). 204/200 모두 성공으로 처리.
 *
 * 에러 코드:
 * - 409 Conflict       — 낙관적 잠금 충돌 (다른 사용자가 먼저 수정)
 * - 422 Unprocessable  — SLIP_DELETE_SHIPPED (출고 완료 전표 삭제 불가)
 * - 403 Forbidden      — 권한 부족 (SALES/MANAGER/MASTER 이외)
 *
 * @param id        전표 UUID (path param 전용, 화면 표시 금지)
 * @param updatedAt 낙관적 잠금용 마지막 수정 시각 (ISO 8601)
 */
export async function deleteSalesSlip(
  id: string,
  updatedAt: string,
): Promise<void> {
  await apiClient.delete<ApiEnvelope<void>>(
    `/slips/${encodeURIComponent(id)}/sales`,
    { data: { updatedAt } },
  )
}

/**
 * 매입 전표 direct PUT 수정.
 *
 * @param id 전표 UUID (path param 전용, 화면 표시 금지)
 * @param body updatedAt 낙관적 잠금 + 헤더/라인 전체 교체 요청
 */
export async function updatePurchaseSlip(
  id: string,
  body: SlipUpdateRequest,
): Promise<SlipDetail> {
  const res = await apiClient.put<ApiEnvelope<SlipDetail>>(
    `/slips/${encodeURIComponent(id)}`,
    body,
  )
  return res.data.data
}

/**
 * 매출 전표 direct PUT 수정 — SP-08-6-2 신규.
 *
 * OUTBOUND 전표의 헤더 및 라인을 전체 교체 (optimistic lock).
 * 에러 코드:
 * - 409 Conflict      — 낙관적 잠금 충돌 (다른 사용자가 먼저 수정)
 * - 422 Unprocessable — 라인 입력값 검증 오류
 * - 403 Forbidden     — 권한 부족 (SALES/MANAGER/MASTER 이외)
 *
 * @param id   전표 UUID (path param 전용, 화면 표시 금지)
 * @param body updatedAt 낙관적 잠금 + 헤더/라인 전체 교체 요청
 */
export async function updateSalesSlip(
  id: string,
  body: SlipUpdateRequest,
): Promise<SlipDetail> {
  const res = await apiClient.put<ApiEnvelope<SlipDetail>>(
    `/slips/${encodeURIComponent(id)}/sales`,
    body,
  )
  return res.data.data
}

/**
 * 기사 정보 부분 갱신 요청 — link-dispatch-slice 신규.
 *
 * BE `UpdateSlipDriverRequest` (PATCH /slips/{id}/driver).
 * DRAFT/SAVED 단계만 허용 (BE 가드와 동일).
 */
export interface UpdateSlipDriverRequest {
  driverName?: string | null
  driverPhone?: string | null
}

/**
 * 기사 정보 부분 갱신 — DRAFT/SAVED 단계만.
 */
export async function updateSlipDriver(
  slipId: string,
  body: UpdateSlipDriverRequest,
): Promise<SlipDetail> {
  const res = await apiClient.patch<ApiEnvelope<SlipDetail>>(
    `/slips/${slipId}/driver`,
    body,
  )
  return res.data.data
}

/**
 * 라인 추가 요청 body — BE `AddLineRequest`. DRAFT/SAVED 단계만 허용.
 */
export interface AddLineRequest {
  productId: string
  productName?: string
  modelName?: string
  specification?: string
  quantity: number
  unitPrice: string
  note?: string
}

/**
 * 라인 추가 — DRAFT/SAVED 단계만. 다른 단계에서 호출 시 BE 가 409 반환.
 */
export async function addLine(slipId: string, body: AddLineRequest): Promise<SlipDetail> {
  const res = await apiClient.post<ApiEnvelope<SlipDetail>>(`/slips/${slipId}/lines`, body)
  return res.data.data
}

/**
 * 라인 제거 — DRAFT/SAVED 단계만. orphan removal. 응답 없음 (204).
 */
export async function removeLine(slipId: string, lineId: string): Promise<void> {
  await apiClient.delete(`/slips/${slipId}/lines/${lineId}`)
}

/**
 * 전표 복사 — 기존 전표의 헤더 + 라인을 그대로 복사하여 신규 DRAFT 전표 생성.
 * BE 별도 endpoint 없이 클라이언트에서 createSlip 으로 동등 본문 POST.
 */
export async function duplicateSlip(source: SlipDetail): Promise<SlipDetail> {
  const body: CreateSlipRequest = {
    slipType: source.slipType,
    sourceWarehouseId: source.sourceWarehouseId ?? undefined,
    destinationWarehouseId: source.destinationWarehouseId ?? undefined,
    partnerId: source.partnerId ?? undefined,
    partnerName: source.partnerName ?? undefined,
    deliveryTag: source.deliveryTag ?? undefined,
    memo: source.memo ?? undefined,
    driverName: source.driverName ?? undefined,
    driverPhone: source.driverPhone ?? undefined,
    lines: source.lines.map((l) => ({
      productId: l.productId,
      productName: l.productName ?? undefined,
      modelName: l.modelName ?? undefined,
      specification: l.specification ?? undefined,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      note: l.note ?? undefined,
    })),
  }
  return createSlip(body)
}

/**
 * 모델명 → product 요약 lookup. SlipFormPage 라인 입력 onBlur 시 호출.
 *
 * 200 응답 시 productName / sellingPrice 자동 fill 에 사용한다.
 * 미존재 (404) 는 axios error 로 던지며 호출자가 "찾을 수 없음" 메시지 처리.
 *
 * @param modelName 사용자가 입력한 모델명 (예: AJ040RXH4BC1)
 */
export async function lookupProductByModelName(
  modelName: string,
): Promise<ProductLookupResult> {
  const res = await apiClient.get<ApiEnvelope<ProductLookupResult>>(
    '/slips/lookup-product',
    { params: { modelName } },
  )
  return res.data.data
}

/**
 * PR-G1 backlog #2 — 거래처 자동 채움 lookup 응답.
 * BE `PartnerAdminResponse` 의 customer 필드 부분만 추출 (UUID 미노출).
 */
export interface PartnerAutoFillResult {
  partnerCode: string
  name: string
  phone: string | null
  address: string | null
  representative: string | null
}

/**
 * PR-G1 backlog #2 — 거래처 코드 → 자동 채움 데이터 lookup.
 *
 * SlipFormPage "거래처 자동 채움" 버튼이 호출. 200 시 customerTel/customerAddress/
 * customerRepresentative 3 필드 fill (사용자 수정 가능). 404 시 axios error 던짐 →
 * 호출자가 "거래처 미존재" 안내.
 *
 * @param partnerCode 거래처 코드 (사용자 노출 식별자)
 */
export async function lookupPartnerForAutoFill(
  partnerCode: string,
): Promise<PartnerAutoFillResult> {
  const res = await apiClient.get<ApiEnvelope<PartnerAutoFillResult>>(
    `/admin/partners/${encodeURIComponent(partnerCode)}`,
  )
  const d = res.data.data
  return {
    partnerCode: d.partnerCode,
    name: d.name,
    phone: d.phone ?? null,
    address: d.address ?? null,
    representative: d.representative ?? null,
  }
}

/**
 * 판매/구매 조회 전용 풍성한 컬럼 응답 — BE `SlipResponse` (신규 필드 포함).
 *
 * UUID 비공개 가드: `id` / `partnerId` / `sourceWarehouseId` / `destinationWarehouseId` 는
 * 내부 처리 전용. 화면 표시에는 slipNo / partnerCode / businessNumber 만 사용.
 */
export interface SlipQueryRow {
  id: string
  slipType: SlipType
  slipNo: string
  slipDate: string
  status: SlipStatus
  partnerName: string | null
  partnerCode: string | null
  businessNumber: string | null
  deliveryAddress: string | null
  supervisionAddress: string | null
  projectName: string | null
  recipientPhone: string | null
  paymentDueDate: string | null
  printed: boolean
  memo: string | null
  totalAmount: number
  totalQuantity: number
  salesPersonName: string | null
  editHistoryCount: number
  deliveryTag: DeliveryTagCode | null
  deliveryTagLabel: string | null
  inspectionStatus?: 'READY' | 'NOT_READY' | null
  sourceWarehouseId: string | null
  destinationWarehouseId: string | null
  /** 낙관적 잠금용 — soft delete / PUT 시 필요. ISO 8601. */
  updatedAt: string
}

/** 판매/구매 조회 검색 옵션 */
export interface QuerySlipsOptions {
  slipType: 'OUTBOUND' | 'INBOUND'
  dateFrom: string
  dateTo: string
  page: number
  size: number
  searchPartnerName?: string
  searchPartnerCode?: string
  searchBusinessNumber?: string
  searchSlipNo?: string
  searchProjectName?: string
  searchDeliveryAddress?: string
}

/**
 * 판매/구매 조회 페이지 API.
 *
 * BE `GET /slips/query` — QuerySlipsOptions 를 쿼리 파라미터로 전달.
 * 응답은 Page<SlipQueryRow> (Spring Data Page 형태).
 */
export async function querySlips(
  opts: QuerySlipsOptions,
): Promise<PageResponse<SlipQueryRow>> {
  const params: Record<string, string | number> = {
    slipType: opts.slipType,
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    page: opts.page,
    size: opts.size,
  }
  if (opts.searchPartnerName)    params['searchPartnerName']    = opts.searchPartnerName
  if (opts.searchPartnerCode)    params['searchPartnerCode']    = opts.searchPartnerCode
  if (opts.searchBusinessNumber) params['searchBusinessNumber'] = opts.searchBusinessNumber
  if (opts.searchSlipNo)         params['searchSlipNo']         = opts.searchSlipNo
  if (opts.searchProjectName)    params['searchProjectName']    = opts.searchProjectName
  if (opts.searchDeliveryAddress) params['searchDeliveryAddress'] = opts.searchDeliveryAddress

  const res = await apiClient.get<ApiEnvelope<PageResponse<SlipQueryRow>>>(
    '/slips/query',
    { params },
  )
  return res.data.data
}

/**
 * 전표 라이프사이클 transition action 코드 — BE `SlipController` POST endpoint suffix 와 1:1.
 *
 * - `save`     DRAFT → SAVED
 * - `send`     SAVED → SENT
 * - `accept`   SENT → ACCEPTED (출고인 자동 채움)
 * - `process`  ACCEPTED → PROCESSING
 * - `inspect`  PROCESSING → INSPECTING (검수인 자동 채움) — Slice A 신규
 * - `complete` INSPECTING → COMPLETED (Slice A 에서 PROCESSING → COMPLETED 가 INSPECTING 거침)
 * - `ship`     COMPLETED → SHIPPING (출고전표 한정)
 * - `deliver`  SHIPPING → DELIVERED (출고전표 한정)
 * - `confirm`  DELIVERED→CONFIRMED (출고) / COMPLETED→CONFIRMED (입고)
 * - `reject`   SENT/ACCEPTED → REJECTED (사유 필수)
 * - `cancel`   DRAFT/SAVED/SENT → CANCELED
 */
export type SlipTransitionAction =
  | 'save'
  | 'send'
  | 'accept'
  | 'process'
  | 'inspect'
  | 'complete'
  | 'ship'
  | 'deliver'
  | 'confirm'
  | 'reject'
  | 'cancel'

/**
 * 라이프사이클 transition 호출. reject 만 body (`reason`) 필요.
 *
 * @param id 전표 UUID
 * @param action transition 액션 코드
 * @param body reject 사유 (그 외 transition 은 미사용)
 */
export async function transitionSlip(
  id: string,
  action: SlipTransitionAction,
  body?: { reason?: string },
): Promise<SlipDetail> {
  const res = await apiClient.post<ApiEnvelope<SlipDetail>>(
    `/slips/${id}/${action}`,
    body ?? {},
  )
  return res.data.data
}
