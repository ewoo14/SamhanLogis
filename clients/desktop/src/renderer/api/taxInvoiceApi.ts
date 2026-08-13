/**
 * 세금계산서 도메인 API 클라이언트 — P0-4 / SP-09-1.
 *
 * <p>BE 출처: {@code services/accounting-service} — TaxInvoiceController.
 * 7 endpoint 매핑:
 * <ul>
 *   <li>{@code GET    /accounting/tax-invoices}                — 페이지 조회 (status / from / to / partnerId)</li>
 *   <li>{@code GET    /accounting/tax-invoices/{id}}           — 단건 + lines</li>
 *   <li>{@code POST   /accounting/tax-invoices}                — DRAFT 생성</li>
 *   <li>{@code PUT    /accounting/tax-invoices/{id}}           — DRAFT 수정 (헤더 + 라인 일괄)</li>
 *   <li>{@code POST   /accounting/tax-invoices/{id}/issue}     — DRAFT → ISSUED + 자동 분개 (1089/2559/4019)</li>
 *   <li>{@code POST   /accounting/tax-invoices/{id}/cancel}    — ISSUED → CANCELLED + 자동 역분개</li>
 *   <li>{@code POST   /accounting/tax-invoices/{id}/emit-nts}  — ISSUED → 국세청 전자세금계산서 발행 (SP-09-1)</li>
 * </ul>
 *
 * <p>UUID 비공개 가드 ({@code feedback_uuid_no_user_visibility.md}):
 * - {@code id} / {@code partnerId} / {@code journalId} 는 path 또는 link 용 (사용자 노출 X)
 * - 화면 표시는 {@code taxInvoiceNo} (예: {@code 2026/05/08-1}) + {@code partnerName} + {@code partnerBusinessNo}
 *
 * <p>권한: ACCOUNTANT / MASTER 만 — RoleGuard 가 라우팅 단계에서 차단 (BE 도 PreAuthorize 강제).
 */
import {
  apiClient,
  type ApiEnvelope,
  type PageResponse,
} from './client'

/** BE 공통 오류 응답 envelope — 단일 진실원은 apiError.ts (#719 공용화, 하위호환 re-export). */
export type { ApiErrorEnvelope } from './apiError'

/** 세금계산서 상태 — BE TaxInvoiceStatus 와 1:1. */
export type TaxInvoiceStatus = 'DRAFT' | 'ISSUED' | 'CANCELLED'

/** 상태 → 한국어 라벨. */
export const TAX_INVOICE_STATUS_LABEL: Record<TaxInvoiceStatus, string> = {
  DRAFT: '임시저장',
  ISSUED: '발행',
  CANCELLED: '취소',
}

/**
 * 세금계산서 라인 응답 — BE {@code TaxInvoiceLineResponse}.
 *
 * <p>{@code supplyAmount = quantity × unitPrice}, {@code vatAmount = supplyAmount × 0.1}
 * 모두 BE 가 자동 계산. UI 는 표시 전용.
 *
 * <p>P0-4 BE 필드 변경 (PR #139):
 * - {@code spec} → {@code specification} (한국 표준 NTS 필드명 정렬)
 * - {@code unit} 신규 (단위 — 건/kg/CBM 등)
 */
export interface TaxInvoiceLine {
  /** 라인 UUID — 화면 미노출 (PUT 시 신규 생성). */
  lineId: string
  /** 0-based 라인 번호. */
  lineNo: number
  /** 품명. */
  itemName: string
  /** 규격 (옵션) — BE 필드명 {@code specification}. */
  specification: string | null
  /** 단위 — 건/kg/CBM 등 (옵션, P0-4 신규). */
  unit: string | null
  /** 수량 (BigDecimal — string). */
  quantity: string
  /** 단가 (KRW). */
  unitPrice: string
  /** 공급가액 = quantity × unitPrice. */
  supplyAmount: string
  /** 부가세 = supplyAmount × 0.1. */
  vatAmount: string
  /** 메모. */
  memo: string | null
}

/** 세금계산서 종류 — 매출(SALES) / 매입(PURCHASE). P0-4 신규. */
export type TaxInvoiceType = 'SALES' | 'PURCHASE'

/**
 * 세금계산서 헤더 — 페이지 조회용 (라인 미포함). BE {@code TaxInvoiceResponse}.
 *
 * <p>P0-4 신규 필드는 {@link TaxInvoiceDetail} 에만 추가. 본 summary 는
 * 기존 BE {@code TaxInvoiceResponse} (legacy /accounting/tax-invoices GET 응답) 매핑 유지.
 */
export interface TaxInvoiceSummary {
  /** UUID — path param 전용. 화면 미노출. */
  id: string
  /** 사람이 읽는 발행번호 (ISSUED 상태일 때만 채워짐). */
  taxInvoiceNo: string | null
  partnerId: string
  partnerBusinessNo: string | null
  partnerName: string
  supplyDate: string
  supplyAmount: string
  vatAmount: string
  totalAmount: string
  status: TaxInvoiceStatus
  issuedAt: string | null
  issuedBy: string | null
  /** 자동 분개 UUID — 분개장 link 용. */
  journalId: string | null
  reverseJournalId: string | null
}

/**
 * 세금계산서 단건 상세 — BE {@code TaxInvoiceDetailResponse}.
 *
 * <p>P0-4 신규 필드 (PR #139):
 * - {@code invoiceType} (매출/매입)
 * - {@code partnerCode} (거래처 비즈니스 식별자)
 * - {@code cancelReason} (취소 사유)
 */
export interface TaxInvoiceDetail extends TaxInvoiceSummary {
  /** 세금계산서 종류 (P0-4 신규, NULL 이면 SALES legacy). */
  invoiceType: TaxInvoiceType | null
  /** 거래처 코드 — 비즈니스 식별자 (P0-4 신규, UUID 비공개 대안). */
  partnerCode: string | null
  partnerAddress: string | null
  cancelledAt: string | null
  cancelledBy: string | null
  /** 취소 사유 — CANCELLED 단계에서만 채워짐 (P0-4 신규). */
  cancelReason: string | null
  eTaxExternalId: string | null
  description: string | null
  lines: TaxInvoiceLine[]
}

/**
 * 라인 1건 생성/수정 요청 — legacy POST/PUT (CreateTaxInvoiceRequest) 용.
 *
 * <p>본 페이로드는 BE 의 legacy {@code CreateTaxInvoiceLineRequest} record 와 1:1 매핑
 * (필드명 {@code spec} 유지). P0-4 신규 endpoint {@code POST /issue-request} 는
 * 별도 record {@code TaxInvoiceLineRequest} (필드명 {@code specification}) 사용.
 */
export interface CreateTaxInvoiceLineRequest {
  itemName: string
  /** 규격 — legacy DTO 필드명 {@code spec} 유지 (request body). */
  spec?: string
  /** 수량 (BigDecimal — string 으로 직렬화). */
  quantity: string
  /** 단가. */
  unitPrice: string
  memo?: string
}

/** 세금계산서 신규/수정 요청 — POST/PUT 공용. */
export interface CreateTaxInvoiceRequest {
  partnerId: string
  /**
   * 거래처 코드 — 비즈니스 식별자 (#825 재수렴 CM-a, BE nullable String 병렬 추가).
   *
   * <p>정준 거래처 검색({@code partnerApi.searchPartners})의 실 {@code partnerCode} 를
   * 전송한다. 사업자번호({@code partnerBusinessNo})와 별개 필드 — bizNo 를 코드로
   * 보내지 않는다 (L6 오라벨 해소). BE 가 필드를 아직 수신하지 않아도 Spring 기본
   * unknown-property 무시로 안전 (FE 선반영).
   */
  partnerCode?: string
  partnerBusinessNo?: string
  partnerName: string
  partnerAddress?: string
  supplyDate: string
  description?: string
  lines: CreateTaxInvoiceLineRequest[]
}

/**
 * 세금계산서 취소 요청 — 사유 필수 (BE {@code TaxInvoiceCancelRequest}).
 *
 * <p>BE 검증: {@code @Size(min=5, max=1000)} — 5자 미만 / 1000자 초과 시 400.
 */
export interface TaxInvoiceCancelRequest {
  /** 취소 사유 (5자 이상 1000자 이하 필수). */
  reason: string
}

/** 세금계산서 인쇄용 응답 — GET /{id}/print. 단건 상세와 동일 shape (BE alias). */
export type TaxInvoicePrintResponse = TaxInvoiceDetail

/** 세금계산서 목록 요약 응답 — GET / 페이지용 (lines 제외). BE `TaxInvoiceSummaryResponse`. */
export type TaxInvoiceSummaryResponse = TaxInvoiceSummary

/** 페이지 조회 옵션. */
export interface ListTaxInvoicesOptions {
  status?: TaxInvoiceStatus
  /** ISO 날짜 (YYYY-MM-DD) — supplyDate 범위 시작. */
  from?: string
  /** ISO 날짜 — supplyDate 범위 종료. */
  to?: string
  partnerId?: string
  page?: number
  size?: number
}

// ---------------------------------------------------------------------------
// endpoint 호출
// ---------------------------------------------------------------------------

/** 세금계산서 페이지 조회. */
export async function listTaxInvoices(
  options: ListTaxInvoicesOptions = {},
): Promise<PageResponse<TaxInvoiceSummary>> {
  const params: Record<string, string | number> = {
    page: options.page ?? 0,
    size: options.size ?? 20,
  }
  if (options.status) params['status'] = options.status
  if (options.from) params['from'] = options.from
  if (options.to) params['to'] = options.to
  if (options.partnerId) params['partnerId'] = options.partnerId
  const res = await apiClient.get<ApiEnvelope<PageResponse<TaxInvoiceSummary>>>(
    '/accounting/tax-invoices',
    { params },
  )
  return res.data.data
}

/** 단건 상세. */
export async function getTaxInvoice(id: string): Promise<TaxInvoiceDetail> {
  const res = await apiClient.get<ApiEnvelope<TaxInvoiceDetail>>(
    `/accounting/tax-invoices/${id}`,
  )
  return res.data.data
}

/** 신규 생성 (DRAFT). */
export async function createTaxInvoice(
  body: CreateTaxInvoiceRequest,
): Promise<TaxInvoiceDetail> {
  const res = await apiClient.post<ApiEnvelope<TaxInvoiceDetail>>(
    '/accounting/tax-invoices',
    body,
  )
  return res.data.data
}

/** DRAFT 수정 — 헤더 + 라인 일괄 교체. */
export async function updateTaxInvoice(
  id: string,
  body: CreateTaxInvoiceRequest,
): Promise<TaxInvoiceDetail> {
  const res = await apiClient.put<ApiEnvelope<TaxInvoiceDetail>>(
    `/accounting/tax-invoices/${id}`,
    body,
  )
  return res.data.data
}

/** DRAFT → ISSUED — 발행번호 채번 + 자동 분개. */
export async function issueTaxInvoice(id: string): Promise<TaxInvoiceDetail> {
  const res = await apiClient.post<ApiEnvelope<TaxInvoiceDetail>>(
    `/accounting/tax-invoices/${id}/issue`,
    {},
  )
  return res.data.data
}

/**
 * ISSUED → CANCELLED — 자동 역분개.
 *
 * @param id 세금계산서 UUID (path param 전용).
 * @param request 취소 사유 (필수).
 */
export async function cancelTaxInvoice(
  id: string,
  request: TaxInvoiceCancelRequest,
): Promise<TaxInvoiceDetail> {
  const res = await apiClient.post<ApiEnvelope<TaxInvoiceDetail>>(
    `/accounting/tax-invoices/${id}/cancel`,
    request,
  )
  return res.data.data
}

/**
 * 인쇄용 데이터 조회 — GET /{id}/print.
 *
 * @param id 세금계산서 UUID (path param 전용).
 */
export async function getTaxInvoicePrintData(
  id: string,
): Promise<TaxInvoicePrintResponse> {
  const res = await apiClient.get<ApiEnvelope<TaxInvoicePrintResponse>>(
    `/accounting/tax-invoices/${id}/print`,
  )
  return res.data.data
}

// ---------------------------------------------------------------------------
// SP-09-1: NTS e-tax 국세청 전자세금계산서 발행
// ---------------------------------------------------------------------------

/**
 * 국세청 전자세금계산서 제출 방법.
 *
 * <p>BE {@code NtsSubmitMethod} enum 과 1:1 — BE {@code @Pattern(regexp = "DRY_RUN|NTS")}.
 * <ul>
 *   <li>{@code DRY_RUN} — 실제 발행 없이 유효성 검증만 수행 (기본값). 개발/테스트 전용.</li>
 *   <li>{@code NTS}     — 국세청 API 실 호출. 운영 PC {@code .env.ops} 에서만 활성.</li>
 * </ul>
 */
export type NtsSubmitMethod = 'DRY_RUN' | 'NTS'

export const DEFAULT_TAX_INVOICE_SUBMIT_METHOD: NtsSubmitMethod = 'DRY_RUN'

/**
 * 국세청 전자세금계산서 발행 요청 — BE {@code EmitNtsRequest}.
 *
 * <p>SP-09-1 shell: BE ETaxClient 가 mock/sandbox 모드로 동작.
 * BE {@code @NotNull} — {@code submitMethod} 는 필수이며 생략 불가.
 */
export interface EmitNtsRequest {
  /** 제출 방법 — DRY_RUN (기본) / NTS (운영). BE @NotNull + @Pattern(DRY_RUN|NTS). */
  submitMethod: NtsSubmitMethod
}

/**
 * 국세청 전자세금계산서 발행 응답 — BE {@code EmitNtsResponse} record 5 필드.
 *
 * <p>BE {@code TaxInvoiceEmitService} 반환값과 정확히 일치.
 * DRY_RUN 모드: {@code eTaxExternalId = "DRY-{taxInvoiceNo}-{epochMilli}"}.
 */
export interface EmitNtsResponse {
  /** 세금계산서 번호 (사용자 노출 가능). */
  taxInvoiceNo: string
  /** 발행 후 상태 — 정상 발행 시 ISSUED 유지. */
  status: TaxInvoiceStatus
  /** 국세청 수신 ID (비즈니스 식별자, DRY_RUN 시 "DRY-..." 형식). */
  eTaxExternalId: string
  /** 발행 시각 ISO-8601 (Instant → JSON). */
  submittedAt: string
  /** 제출 방법 — DRY_RUN 또는 NTS. */
  submitMethod: NtsSubmitMethod
}

/**
 * ISSUED 상태 세금계산서를 국세청에 전자세금계산서로 발행한다.
 *
 * <p>POST {@code /accounting/tax-invoices/{id}/emit-nts}
 * <p>권한: ACCOUNTANT / MASTER 만 허용 (BE PreAuthorize 동일).
 * <p>SP-09-1 shell — BE ETaxClient mock 모드. 실 발행은 운영 `.env.ops` 키 활성 후 NTS.
 *
 * @param id           세금계산서 UUID (path param 전용 — 사용자 미노출).
 * @param submitMethod 제출 방법 (생략 시 DRY_RUN; 운영 실 발행 시 NTS).
 */
export async function emitTaxInvoiceToNts(
  id: string,
  submitMethod: NtsSubmitMethod = DEFAULT_TAX_INVOICE_SUBMIT_METHOD,
): Promise<EmitNtsResponse> {
  const body: EmitNtsRequest = { submitMethod }
  const res = await apiClient.post<ApiEnvelope<EmitNtsResponse>>(
    `/accounting/tax-invoices/${id}/emit-nts`,
    body,
  )
  return res.data.data
}
