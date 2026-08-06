/**
 * 거래처별 원장 API 클라이언트 — PR-E2 FE-7 (Samhan Public native).
 *
 * <p>BE accounting-service commit c48e156 의 통합 회계 리포트 endpoint 2건 wrapper.
 *
 * <h2>노출 endpoint</h2>
 * <ul>
 *   <li>{@code GET /accounting/sales/aggregate?from=&to=&partnerCode=} (BE-A8) —
 *       기간 매출/수금/채권 집계 (한국 일반기업회계기준 401/110 코드 기반)</li>
 *   <li>{@code GET /accounting/journals/partner-ledger?partnerCode=&from=&to=} —
 *       거래처별 원장 read model (출고 판매전표 + 확정 입금보고서)</li>
 * </ul>
 *
 * <h2>BE 응답 정렬 / shape 가정</h2>
 * <ul>
 *   <li>aggregate: 거래처별 row 목록. partnerCode 미지정 시 전체 거래처. partnerName
 *       매출 잔액 DESC 정렬은 BE 보장 (호출측은 fallback 정렬 미적용).</li>
 *   <li>ledger: {@code LedgerImageResponse} record — partner snapshot + chatRoomNames(배열)
 *       + lines(차변/대변/누적 잔액). 잔액 누적은 BE 가 라인 순서대로 계산.</li>
 * </ul>
 *
 * <h2>접근 제어</h2>
 * <ul>
 *   <li>endpoint 자체가 ACCOUNTANT / MASTER 만 (BE {@code @PreAuthorize}).</li>
 *   <li>FE 사이드바 entry / 페이지 / 인쇄 라우트 가드는 ACCOUNTANT / MANAGER / MASTER
 *       (사용자 명세 — MANAGER 는 read-only 조회 허용. BE 가 거부 시 403 표시).</li>
 * </ul>
 *
 * <h2>UUID 비공개 가드</h2>
 * <p>화면/응답 노출 식별자는 partnerCode + partnerName + slipNo (journalNo) +
 * partnerBusinessNo + chatRoomName 만. partnerId / journalId 는 응답에서 제거됨.
 *
 * <h2>BigDecimal 직렬화</h2>
 * <p>BE 가 BigDecimal 을 string 으로 직렬화한다 (Spring 기본 ObjectMapper). FE 는
 * Number() / Number.parseFloat() 로 변환 후 toLocaleString 으로 표시한다.
 */
import { apiClient, type ApiEnvelope } from './client'

/**
 * BE {@code SalesAggregateRow} record 와 1:1.
 *
 * <p>거래처별 매출/수금/채권 집계 1행. 한국 일반기업회계기준 코드 매핑:
 * <ul>
 *   <li>{@code salesTotal} — 401 (상품매출) 분개 라인 합계 (대변잔액)</li>
 *   <li>{@code paymentTotal} — 110 (외상매출금) 대변 합계 (수금/회수)</li>
 *   <li>{@code receivableBalance} — 110 차변잔액 (현재 미회수 채권)</li>
 * </ul>
 */
export interface SalesAggregateRow {
  /** 거래처 코드 (사용자 노출 식별자). */
  partnerCode: string
  /** 사업자번호 숫자 문자열. */
  bizNo: string
  /** 거래처 사업자명 (snapshot). */
  partnerName: string
  /** 기간 매출 합계 (KRW BigDecimal — string). */
  salesTotal: string
  /** 기간 수금 합계 (KRW BigDecimal — string). */
  paymentTotal: string
  /** 기간 조정 합계 (매출·수금이 아닌 채권 변동). */
  adjustmentTotal?: string
  /** 기초잔액 + 기간 매출 - 기간 수금으로 계산한 기말 채권 잔액 (KRW BigDecimal — string). */
  receivableBalance: string
  /** 집계 시작 일자 (YYYY-MM-DD). */
  periodFrom: string
  /** 집계 종료 일자 (YYYY-MM-DD). */
  periodTo: string
}

/**
 * 화면 line 모델 — PartnerLedgerResponse documents를 인쇄 가능한 라인으로 펼친 1건.
 */
export interface LedgerLine {
  /** 분개 일자 (YYYY-MM-DD). */
  date: string
  /** 사용자 노출 분개번호 (예: 2026/05/08-1). UUID 대신. */
  journalNo: string
  /** 4자리 계정 코드 (110/401/255 등). */
  accountCode: string
  /** 적요 (분개 헤더 description 또는 슬립 메모). */
  description: string
  /** 차변 금액 (KRW BigDecimal — string, "0" 가능). */
  debit: string
  /** 대변 금액 (KRW BigDecimal — string, "0" 가능). */
  credit: string
  /** 누적 잔액 (KRW BigDecimal — string, 음수 가능). 기초잔액부터 라인 적용 후 잔액. */
  balance: string
  /** 판매전표의 구조화된 배송주소. 적요에서 파싱하지 않는다. */
  deliveryAddress?: string | null
  /** 원장 문서 종류. JOURNAL_ONLY는 판매전표 미이관 분개 행이다. */
  documentType?: 'SALE' | 'SALE_SUMMARY' | 'CASH_RECEIPT' | 'JOURNAL_ONLY'
  effect?: 'SALE' | 'PAYMENT' | 'ADJUSTMENT' | 'NONE'
}

/**
 * PartnerLedgerResponse read model을 화면에서 사용하는 line 모델로 투영한 결과.
 *
 * <p>거래처별 원장 단건 응답 — partner snapshot + 분개 line + 단톡방.
 */
export interface LedgerData {
  /** 거래처 코드 (사용자 노출 식별자 — UUID 비공개 가드). */
  partnerCode: string
  /** 거래처 사업자명 (snapshot). */
  partnerName: string
  /** 사업자등록번호 (snapshot, 미등록 거래처는 빈 문자열). */
  partnerBusinessNo: string
  /** 단톡방 이름 리스트 (notification-service 매핑 — 0~N건, fail-soft). */
  chatRoomNames: string[]
  /** 원장 기간 시작 (YYYY-MM-DD). */
  periodFrom: string
  /** 원장 기간 종료 (YYYY-MM-DD). */
  periodTo: string
  openingBalance?: string
  salesTotal?: string
  paymentTotal?: string
  adjustmentTotal?: string
  closingBalance?: string
  /** 분개 라인 목록 (date 오름차순 → journalNo 오름차순). */
  lines: LedgerLine[]
}

export interface PartnerLedgerSourceDocument {
  type: 'SALE' | 'SALE_SUMMARY' | 'CASH_RECEIPT' | 'JOURNAL_ONLY'
  documentNo: string
  date: string
  deliveryAddress: string | null
  amount: string
  lines: Array<{
    productName: string
    modelName: string | null
    quantity: number
    unitPriceWithVat: string
    lineAmount: string
  }>
  accountCode?: string | null
  description?: string | null
  debit?: string | null
  credit?: string | null
  effect?: 'SALE' | 'PAYMENT' | 'ADJUSTMENT' | 'NONE' | null
}

/** API 문서 순서를 보존하면서 debit-credit 누적잔액을 계산한다. */
function documentSequence(documentNo: string): number {
  const match = /(?:^|[-/])(\d+)\s*$/.exec(documentNo.trim())
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

function compareDocuments(
  left: { document: PartnerLedgerSourceDocument; index: number },
  right: { document: PartnerLedgerSourceDocument; index: number },
): number {
  const dateOrder = left.document.date.localeCompare(right.document.date)
  if (dateOrder !== 0) return dateOrder

  const sequenceOrder = documentSequence(left.document.documentNo)
    - documentSequence(right.document.documentNo)
  if (sequenceOrder !== 0) return sequenceOrder

  if (left.document.documentNo !== right.document.documentNo) {
    return left.document.documentNo < right.document.documentNo ? -1 : 1
  }

  const typeOrder = (type: PartnerLedgerSourceDocument['type']): number =>
    type === 'SALE' ? 0 : 1
  const typeDifference = typeOrder(left.document.type) - typeOrder(right.document.type)
  return typeDifference !== 0 ? typeDifference : left.index - right.index
}

export function buildPartnerLedgerLines(
  documents: PartnerLedgerSourceDocument[],
  openingBalance = '0',
): LedgerLine[] {
  let balance = Number(openingBalance) || 0
  const orderedDocuments = documents
    .map((document, index) => ({ document, index }))
    .sort(compareDocuments)

  return orderedDocuments.flatMap(({ document }) => {
    const signedDirection = (amount: string): { debit: string; credit: string } => {
      const value = Number(amount) || 0
      return value >= 0
        ? { debit: String(value), credit: '0' }
        : { debit: '0', credit: String(Math.abs(value)) }
    }
    const rows = document.type === 'SALE' && document.lines.length > 0
      ? document.lines.map((line) => {
        const direction = signedDirection(line.lineAmount)
        return {
          date: document.date,
          journalNo: document.documentNo,
          accountCode: document.accountCode ?? '',
          description: `${line.productName}${line.modelName ? ` (${line.modelName})` : ''}`,
          debit: direction.debit,
          credit: direction.credit,
          deliveryAddress: document.deliveryAddress,
          documentType: document.type,
          effect: document.effect ?? (document.type === 'CASH_RECEIPT' ? 'PAYMENT' : 'SALE'),
        }
      })
      : [{
          date: document.date,
          journalNo: document.documentNo,
          accountCode: document.accountCode ?? '',
          description: document.description
            ?? (document.type === 'CASH_RECEIPT' ? '입금보고서' : '판매전표 없음 / 전표 미이관'),
          debit: document.debit && Number(document.debit) !== 0
            ? document.debit
            : document.credit && Number(document.credit) !== 0
              ? '0'
              : signedDirection(document.type === 'CASH_RECEIPT'
                ? String(-(Number(document.amount) || 0))
                : document.amount).debit,
          credit: document.credit && Number(document.credit) !== 0
            ? document.credit
            : document.debit && Number(document.debit) !== 0
              ? '0'
              : signedDirection(document.type === 'CASH_RECEIPT'
                ? String(-(Number(document.amount) || 0))
                : document.amount).credit,
          deliveryAddress: document.deliveryAddress,
          documentType: document.type,
          effect: document.effect ?? 'NONE',
        }]
    return rows.map((row) => {
      balance += Number(row.debit) - Number(row.credit)
      return { ...row, balance: String(balance) }
    })
  })
}

/** 화면 read model로 저장한 신규 snapshot과 legacy line snapshot의 복원 응답. */
export interface LedgerSnapshotResponse {
  partnerCode: string
  partnerName: string
  partnerBusinessNo: string
  chatRoomNames: string[]
  periodFrom: string
  periodTo: string
  openingBalance?: string
  salesTotal?: string
  paymentTotal?: string
  adjustmentTotal?: string
  closingBalance?: string
  documents: PartnerLedgerSourceDocument[]
  lines: LedgerLine[]
}

/** BE {@code LedgerHistoryResponse} — 목록에서는 ledger가 null이고 복원 시 채워진다. */
export interface LedgerHistoryResponse {
  batchNo: string
  partnerCode: string
  periodFrom: string
  periodTo: string
  lineCount: number
  savedAt: string
  sourceBatchNo?: string | null
  ledger: LedgerSnapshotResponse | null
}

/** Spring Data Page 응답의 화면 사용 필드. */
export interface LedgerHistoryPage {
  content: LedgerHistoryResponse[]
  totalElements?: number
  totalPages?: number
  number?: number
  size?: number
}

/**
 * 매출/수금/채권 집계 조회 — {@code GET /accounting/sales/aggregate}.
 *
 * @param from 집계 시작 (YYYY-MM-DD, 필수)
 * @param to 집계 종료 (YYYY-MM-DD, 필수)
 * @param partnerCode 단일 거래처 필터 (선택, 미지정 시 전체)
 * @return 거래처별 집계 row 목록 (BE 정렬 보장)
 */
export async function getSalesAggregate(
  from: string,
  to: string,
  partnerCode?: string,
): Promise<SalesAggregateRow[]> {
  const params: Record<string, string> = { from, to }
  if (partnerCode && partnerCode.trim()) {
    params['partnerCode'] = partnerCode.trim()
  }
  const res = await apiClient.get<ApiEnvelope<SalesAggregateRow[]>>(
    '/accounting/sales/aggregate',
    { params },
  )
  return res.data.data
}

/**
 * 거래처별 원장 데이터 조회 — {@code GET /accounting/journals/partner-ledger}.
 *
 * @param partnerCode 거래처 코드 (필수, 사용자 노출 식별자)
 * @param from 원장 기간 시작 (YYYY-MM-DD, 필수)
 * @param to 원장 기간 종료 (YYYY-MM-DD, 필수)
 * @return 출고 판매전표·확정 입금보고서 기반 원장 line
 */
export async function getLedgerData(
  partnerCode: string,
  from: string,
  to: string,
): Promise<LedgerData> {
  const res = await apiClient.get<ApiEnvelope<PartnerLedgerResponse>>(
    '/accounting/journals/partner-ledger',
    { params: { partnerCode, from, to } },
  )
  return mapPartnerLedgerResponse(res.data.data, partnerCode)
}

/** 사용자가 현재 원장 결과를 명시적으로 snapshot 저장한다. 조회 자체는 저장하지 않는다. */
export async function captureLedger(
  partnerCode: string,
  from: string,
  to: string,
): Promise<LedgerData> {
  const res = await apiClient.post<ApiEnvelope<PartnerLedgerResponse>>(
    '/accounting/journals/ledger-snapshots',
    null,
    { params: { partnerCode, from, to } },
  )
  return mapPartnerLedgerResponse(res.data.data, partnerCode)
}

/** GET/POST가 공유하는 PartnerLedgerResponse를 화면 line 모델로 투영한다. */
export function mapPartnerLedgerResponse(
  source: PartnerLedgerResponse,
  fallbackPartnerCode?: string,
): LedgerData {
  return {
    partnerCode: source.partnerCode ?? fallbackPartnerCode ?? '',
    partnerName: source.partnerName ?? '',
    partnerBusinessNo: source.partnerBusinessNo ?? '',
    chatRoomNames: [],
    periodFrom: source.periodFrom,
    periodTo: source.periodTo,
    openingBalance: source.openingBalance ?? '0',
    salesTotal: source.salesTotal ?? '0',
    paymentTotal: source.paymentTotal ?? '0',
    adjustmentTotal: source.adjustmentTotal ?? '0',
    closingBalance: source.closingBalance ?? source.openingBalance ?? '0',
    lines: buildPartnerLedgerLines(source.documents ?? [], source.openingBalance ?? '0'),
  }
}

/** 신규 document snapshot과 기존 line snapshot을 동일 화면 모델로 복원한다. */
export function mapLedgerSnapshotResponse(source: LedgerSnapshotResponse): LedgerData {
  return {
    partnerCode: source.partnerCode,
    partnerName: source.partnerName,
    partnerBusinessNo: source.partnerBusinessNo,
    chatRoomNames: source.chatRoomNames ?? [],
    periodFrom: source.periodFrom,
    periodTo: source.periodTo,
    openingBalance: source.openingBalance ?? '0',
    salesTotal: source.salesTotal ?? '0',
    paymentTotal: source.paymentTotal ?? '0',
    adjustmentTotal: source.adjustmentTotal ?? '0',
    closingBalance: source.closingBalance ?? source.openingBalance ?? '0',
    lines: source.documents?.length
      ? buildPartnerLedgerLines(source.documents, source.openingBalance ?? '0')
      : source.lines ?? [],
  }
}

export interface PartnerLedgerResponse {
  partnerCode: string | null
  partnerName: string | null
  partnerBusinessNo: string | null
  periodFrom: string
  periodTo: string
  openingBalance?: string
  salesTotal?: string
  paymentTotal?: string
  adjustmentTotal?: string
  closingBalance?: string
  documents: PartnerLedgerSourceDocument[]
}

/** 거래처별 원장 저장 이력 목록을 조회한다. */
export async function getLedgerHistory(
  partnerCode: string,
  from: string,
  to: string,
  page = 0,
  size = 20,
): Promise<LedgerHistoryPage> {
  const res = await apiClient.get<ApiEnvelope<LedgerHistoryPage>>(
    '/accounting/journals/ledger-history',
    { params: { partnerCode, from, to, page: String(page), size: String(size) } },
  )
  return res.data.data
}

/** 복원본을 현재 원장으로 다시 읽지 않고 서버에서 원문 payload 그대로 새 저장한다. */
export async function copyLedgerSnapshot(batchNo: string): Promise<LedgerHistoryResponse> {
  const res = await apiClient.post<ApiEnvelope<LedgerHistoryResponse>>(
    `/accounting/journals/ledger-history/${encodeURIComponent(batchNo)}/copy`,
    null,
  )
  return res.data.data
}

/** 사용자 노출 배치번호로 저장 시점 원장을 복원한다. */
export async function restoreLedger(batchNo: string): Promise<LedgerHistoryResponse> {
  const res = await apiClient.get<ApiEnvelope<LedgerHistoryResponse>>(
    `/accounting/journals/ledger-history/${encodeURIComponent(batchNo)}/restore`,
  )
  return res.data.data
}
