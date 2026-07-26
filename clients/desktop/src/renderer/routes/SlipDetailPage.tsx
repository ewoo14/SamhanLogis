/**
 * 전표 상세 + 라이프사이클 transition 화면 (출고/입고 공용).
 *
 * Slice A (sales-polish-2-slice) 갱신 — Designer `wireframes.md` § 5 충실 반영:
 * - 사용자 피드백 #1 ("라이프사이클" 모호) 해결 → `<ProgressBar>` 신규 컴포넌트로 대체
 *   ProgressBar 헤더 정보 위에 위치 (사용자 진입 시 즉시 단계 확인)
 *   기존 transition 버튼 영역은 "다음 단계 액션" 으로 ProgressBar 아래 유지
 * - 사용자 피드백 #9 — 결재 정보 카드 (출고자/검수자 자동 채움) 신규 표시
 * - INSPECTING 신규 단계 transition (`PROCESSING → INSPECTING → COMPLETED`) 지원
 * - usePageTitle 로 AppHeader 동적 화면명 ("출고전표 상세 [2026/05/04-1]")
 *
 * status 별 transition (Slice A 갱신 — INSPECTING 신규):
 * - DRAFT      → save / cancel
 * - SAVED      → send / cancel
 * - SENT       → accept / reject / cancel
 * - ACCEPTED   → process / reject
 * - PROCESSING → inspect (Slice A 신규 — 기존 complete 대신)
 * - INSPECTING → complete (Slice A 신규)
 * - COMPLETED  → ship (OUTBOUND) / confirm (INBOUND 즉시)
 * - SHIPPING   → deliver
 * - DELIVERED  → confirm (OUTBOUND)
 *
 * UUID 비공개 가드: id 는 path param 으로만 사용. 화면 표시 영역에는 노출 X.
 * dispatcher.userId / inspector.userId 도 화면 미노출 (이름만 표시).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  AuditOverlay,
  Badge,
  Button,
  Card,
  CopyButton,
  Input,
  KOREAN_MOBILE_PHONE_PATTERN,
  Modal,
  PartnerAutocomplete,
  PhoneInput,
  ProgressBar,
  SignatureViewer,
  SlipEditRequestDialog,
  SlipNumberDisplay,
  Spinner,
  type AuditLogEntry,
  type PartnerOption,
  type SlipEditRequestType as SlipEditRequestUiType,
} from '@samhan/design-system'
import axios from 'axios'
import {
  deletePurchaseSlip,
  deleteSalesSlip,
  duplicateSlip,
  getSlip,
  removeLine,
  transitionSlip,
  updatePurchaseSlip,
  updateSalesSlip,
  updateSlipDriver,
  type SlipDetail,
  type SlipLineInput,
  type SlipTransitionAction,
  type SlipType,
} from '../api/slip'
// D-R8-7: 전표 수정 거래처 자동완성 — 견적(EstimateFormPage)과 동일 소스로 통일한다.
import { searchPartners } from '../api/sales'
import { getApiErrorInfo } from '../api/apiError'
import { type StockBalanceLookupLine } from '../api/inventory'
import { InventoryLookupModal } from './components/InventoryLookupModal'
import { invalidateSignature } from '../api/signature'
import {
  listAuditLogs,
  type SlipAuditLogEntry,
} from '../api/slipAudit'
import { getRedline, type SlipFieldRedline } from '../api/slipRedline'
import { RedlineCell } from '../components/audit/RedlineCell'
import {
  createSlipEditRequest,
  SLIP_EDIT_REQUEST_STATUS_LABEL,
  type SlipEditRequest,
  type SlipEditRequestType,
} from '../api/slipEditRequest'
import { SlipCollaborationPanel } from '../components/collab/SlipCollaborationPanel'
import { CollaborativeSlipInput } from '../components/collab/CollaborativeSlipInput'
import { PresenceIndicator } from '../components/collab/PresenceIndicator'
import { MobileActionSheet } from '../components/common/MobileActionSheet'
import { MobileCollapsible } from '../components/common/MobileCollapsible'
import { SlipRealtimeClient } from '../realtime/SlipRealtimeClient'
import {
  createDocCoeditProvider,
  type DocCoeditProvider,
} from '../realtime/createCoeditProvider'
import {
  coeditLineIdsAreStale,
  reseedCoeditLineIds,
  resolveServerLineId,
  toServerLineIdSet,
} from '../realtime/coeditLineIds'
import { usePageTitle } from '../hooks/usePageTitle'
import { usePermissions } from '../hooks/usePermissions'
import { useIsMobile } from '../hooks/useIsMobile'
import { usePresence } from '../hooks/usePresence'
import { OUTBOUND_DELIVERY_TAG_LABELS } from '../api/slipCutoff'
import {
  partnerRepriceSessionIsCurrent,
  usePartnerPriceRefresh,
  type PartnerRepriceCandidate,
  type PartnerRepriceOutcome,
} from '../utils/usePartnerPriceRefresh'
import { lookupProducts } from '../api/productApi'
import { vatExclusiveOf, vatInclusiveOf } from '../utils/vatPrice'
import {
  editLineVat,
  editSlipLineAmount,
  hasVatWarning,
  roundProduct,
  type LineVatLine,
} from '../utils/lineVat'
import { vatFromSupply } from '../utils/vatRounding'

const SLIP_HEADER_TEXT_FIELDS = new Set(['memo', 'deliveryAddress', 'supervisionAddress', 'projectName'])

/** SAVED 전표를 거래처 없이 SENT로 전송할 때 표시할 사용자 안내. */
export const PARTNER_REQUIRED_SEND_MESSAGE =
  '거래처를 먼저 지정해야 전송할 수 있습니다 — 전표 수정에서 거래처를 지정하세요'

/**
 * 전표 거래처 필수화 전이 가드의 FE preflight.
 *
 * <p>모바일 액션 시트와 데스크톱 다음 단계 버튼이 같은 predicate를 사용한다.
 * DRAFT 저장과 BE의 최종 가드는 이 함수의 대상이 아니다.
 *
 * @param slip 전표 상태와 거래처 UUID
 * @param action 실행할 전이 액션
 * @return SAVED→SENT이며 거래처 UUID가 없으면 true
 */
export function shouldBlockPartnerlessSend(
  slip: Pick<SlipDetail, 'status' | 'partnerId'>,
  action: SlipTransitionAction,
): boolean {
  return action === 'send' && slip.status === 'SAVED' && !slip.partnerId
}

/**
 * 특이사항 메모에서 배송태그 자동 접두("[지방] …" 등 레거시 autoMemo)를 제거한다.
 * DispatchDocument 와 동일 로직 — 신규 전표는 no-op, 레거시 호환용.
 */
function memoWithoutTagPrefix(
  memo: string | null | undefined,
  tagLabel: string | null,
): string | null {
  if (!memo) return null
  if (tagLabel) {
    const prefix = `[${tagLabel}]`
    if (memo.startsWith(prefix)) {
      const trimmed = memo.slice(prefix.length).trim()
      return trimmed || null
    }
  }
  return memo
}

function deliveryTagLabel(value: string | null | undefined): string | null {
  if (!value) return null
  return (OUTBOUND_DELIVERY_TAG_LABELS as Record<string, string>)[value] ?? value
}

function formatNumber(value: string): string {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric.toLocaleString() : value
}

function isEmptyDetailValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return trimmed === '' || trimmed === '-' || trimmed === '—'
}

function DetailGridItem({
  value,
  testId,
  children,
}: {
  value: unknown
  testId?: string
  children: ReactNode
}) {
  return (
    <div
      className={isEmptyDetailValue(value) ? 'detail-grid-item-empty' : undefined}
      data-testid={testId}
    >
      {children}
    </div>
  )
}

type SlipLine = SlipDetail['lines'][number]

function slipLineAmounts(line: SlipLine) {
  const supply = line.supplyAmount != null ? Number(line.supplyAmount) : Number(line.lineTotal)
  const vat = line.vatAmount != null ? Number(line.vatAmount) : vatFromSupply(supply)
  const unitWithVat = line.unitPriceWithVat != null
    ? Number(line.unitPriceWithVat)
    : Number(line.unitPrice)
  return {
    supply,
    vat,
    totalIncl: supply + vat,
    unitWithVat,
  }
}

export interface SlipDetailPageProps {
  /** OUTBOUND 또는 INBOUND — 라우트별 listPath 결정 + ship/deliver 노출 여부. */
  mode: SlipType
}

const SLIP_STATUS_LABEL: Record<string, string> = {
  DRAFT: '임시저장',
  SAVED: '저장',
  SENT: '전송',
  ACCEPTED: '수락',
  PROCESSING: '처리중',
  INSPECTING: '검수중',
  COMPLETED: '완료',
  SHIPPING: '배송중',
  DELIVERED: '배송완료',
  CONFIRMED: '확정',
  REJECTED: '반려',
  CANCELED: '취소',
}

function slipStatusBadgeStyle(status: string) {
  switch (status) {
    case 'CONFIRMED':
    case 'DELIVERED':
      return { background: '#D1FAE5', color: '#065F46' }
    case 'REJECTED':
    case 'CANCELED':
      return { background: '#FEE2E2', color: '#991B1B' }
    case 'SENT':
    case 'ACCEPTED':
    case 'PROCESSING':
    case 'INSPECTING':
    case 'COMPLETED':
    case 'SHIPPING':
      return { background: '#EDE9FE', color: '#5B21B6' }
    case 'SAVED':
      return { background: '#FEF3C7', color: '#92400E' }
    case 'DRAFT':
    default:
      return { background: '#F3F4F6', color: '#4B5563' }
  }
}

function slipStatusLabel(status: string): string {
  return SLIP_STATUS_LABEL[status] ?? status
}

/**
 * status 별 가능 transition 액션 목록 (Slice A 갱신 — INSPECTING 신규).
 * OUTBOUND/INBOUND 차이 (ship/deliver 는 출고전표 한정) 는 mode 로 필터.
 */
function actionsForStatus(
  status: SlipDetail['status'],
  mode: SlipType,
): SlipTransitionAction[] {
  switch (status) {
    case 'DRAFT':
      return ['save', 'cancel']
    case 'SAVED':
      return ['send', 'cancel']
    case 'SENT':
      return ['accept', 'reject', 'cancel']
    case 'ACCEPTED':
      return ['process', 'reject']
    case 'PROCESSING':
      return ['inspect'] // Slice A: complete → inspect (검수 단계 거침)
    case 'INSPECTING':
      return ['complete'] // Slice A 신규
    case 'COMPLETED':
      return mode === 'OUTBOUND' ? ['ship'] : ['confirm']
    case 'SHIPPING':
      return mode === 'OUTBOUND' ? ['deliver'] : []
    case 'DELIVERED':
      return mode === 'OUTBOUND' ? ['confirm'] : []
    default:
      return []
  }
}

const ACTION_LABEL: Record<SlipTransitionAction, string> = {
  save: '저장',
  send: '전송',
  accept: '수락',
  process: '처리 시작',
  inspect: '검수 시작', // Slice A 신규
  complete: '처리 완료',
  ship: '배송 시작',
  deliver: '배송 완료',
  confirm: '확정',
  reject: '반려',
  cancel: '취소',
}

const INSPECTION_STATUS_LABEL: Record<string, string> = {
  READY: '검수 가능',
  NOT_READY: '검수 대기',
}


type PurchaseEditLine = SlipLineInput & {
  key: string
  /** authoritative 저장 경로에서 입력 단가를 보존했는지 판정하기 위한 서버 원본. */
  unitPriceWithVat?: string | null
  authority?: 'PRICE' | 'SUPPLY' | 'VAT' | 'TOTAL'
  vatDirty?: boolean
  isBundleComponent?: boolean
}

export type EditUnitPriceLabel = '단가(VAT포함)' | '단가(VAT제외)'

/**
 * 전표 상세 수정 행의 단가가 어느 VAT 도메인인지 판정한다.
 *
 * 정상 전표는 unitPrice(공급단가)와 unitPriceWithVat(화면 단가)가 다르다.
 * authoritative 저장 경로는 개발책임자 결정에 따라 사용자가 입력한 단가를 두 컬럼에
 * 그대로 보존하므로 두 값이 같다. 이 경우 수정 화면도 그 저장값을 VAT 포함 단가로
 * 설명해야 같은 값에 서로 다른 사실을 붙이지 않는다.
 */
export function editUnitPriceLabel(
  line: Pick<PurchaseEditLine, 'unitPrice' | 'unitPriceWithVat'>,
): EditUnitPriceLabel {
  const unitPrice = Number(line.unitPrice)
  const unitPriceWithVat = line.unitPriceWithVat == null ? Number.NaN : Number(line.unitPriceWithVat)
  return Number.isFinite(unitPrice)
    && Number.isFinite(unitPriceWithVat)
    && unitPrice === unitPriceWithVat
    ? '단가(VAT포함)'
    : '단가(VAT제외)'
}

/**
 * 여러 행이 섞인 수정 표의 공통 헤더. 행별 accessible label은 각 행의 판정값을 사용한다.
 */
export function editUnitPriceColumnHeader(
  lines: ReadonlyArray<Pick<PurchaseEditLine, 'unitPrice' | 'unitPriceWithVat'>>,
): string {
  if (lines.length === 0) return '단가(VAT제외)'
  const first = editUnitPriceLabel(lines[0]!)
  return lines.every((line) => editUnitPriceLabel(line) === first)
    ? first
    : '단가(행별 VAT 기준)'
}

/**
 * 라인 patch — 고정값 또는 "현재 라인 → patch" 함수.
 *
 * <p>BLOCKING-1 부수 발견(#824 R1): 수량/VAT 권위 편집({@code updateDetailQuantity}/
 * {@code updateDetailVat})이 종전에는 {@code salesEditLinesRef.current}/
 * {@code purchaseEditLinesRef.current}(커밋 후에만 갱신되는 ref)에서 라인을 읽어 patch 를
 * 미리 계산했다. 그런데 같은 Y.Doc 트랜잭션이 라인당 5개 필드(quantity/unitPrice/
 * supplyAmount/vatAmount/lineTotalWithVat) 각각의 {@code CollaborativeSlipInput} 을
 * 동시에 구독시켜, 한 필드 편집이 doc 이벤트를 한 번 내면 나머지 필드도 자기 값을
 * Y.Doc 원문과 비교해 재동기화를 시도한다(정상 설계 — 원격 편집 반영용). 이 재동기화들이
 * 커밋 전(ref 미갱신) 상태에서 연쇄 발화하면 "직전 커밋 전" 스냅샷을 반복해 읽어, 방금
 * setState 로 반영한 값(예: 수량 0)을 다른 필드의 재동기화가 "아직 갱신 안 된" ref 로 다시
 * 읽어 덮어써 버렸다(실측: 수량 0 으로 정상 계산되고도 부가세/합계 필드의 재동기화가 같은
 * 캐스케이드 안에서 quantity:7 로 되돌림). 함수형 patch 는 setState 업데이터 내부에서
 * React 가 실제로 적용 중인 "직전 patch 반영 후" 값을 읽으므로 이 경합이 원천적으로 없다.
 */
type LinePatch = Partial<PurchaseEditLine> | ((line: PurchaseEditLine) => Partial<PurchaseEditLine>)

function createEditLineKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

export function toPurchaseEditLines(slip: SlipDetail): PurchaseEditLine[] {
  return slip.lines.map((line) => ({
    key: createEditLineKey(),
    lineId: line.id,
    productId: line.productId,
    productName: line.productName ?? '',
    modelName: line.modelName ?? '',
    specification: line.specification ?? '',
    quantity: line.quantity,
    unitPrice: String(line.unitPrice),
    unitPriceWithVat: line.unitPriceWithVat,
    supplyAmount: String(line.supplyAmount ?? line.lineTotal),
    vatAmount: String(line.vatAmount ?? vatFromSupply(Number(line.lineTotal))),
    lineTotalWithVat: String(
      Number(line.supplyAmount ?? line.lineTotal) + Number(line.vatAmount ?? vatFromSupply(Number(line.lineTotal))),
    ),
    authority: 'PRICE',
    // Hydrated S/V/T are already authoritative server values. Keep them in
    // every subsequent save payload, including header-only edits.
    vatDirty: line.supplyAmount != null && line.vatAmount != null && line.lineTotal != null,
    isBundleComponent: Boolean((line.parentSetModel ?? '').trim()),
    note: line.note ?? '',
  }))
}

/**
 * 세트 구성품 lineId 집합 — 거래처 변경 재조회 <b>제외</b> 대상 (R8 재fix 회귀 교정).
 *
 * <p>BE {@code BundleLineageResolver.isBundleComponent}(parentSetModel 비공백 — <b>setHead 무관</b>,
 * head 도 구성품) 의 FE 미러. 근거(코드 실증):
 * <ul>
 *   <li>구성품은 수정 저장의 가격기억 각인 대상이 <b>아니다</b> — {@code SalesSlipUpdateService}/
 *       {@code SlipUpdateService.collectPriceMemory:245} 가 isBundleComponent 라인을 제외하고,
 *       수정 경로에는 BUNDLE_SET 재각인 자체가 없다(SOURCE_BUNDLE_SET 은 생성 전개 시점 전용).</li>
 *   <li>구성품 배분가는 세트 전개(BundleExpander)가 정한 VAT제외 직기입 값이라, 거래처 변경
 *       재조회(카탈로그 VAT포함 해석 ÷1.1)가 닿으면 −9.09% 변형된다(라이브 실증: 88,000→80,000).</li>
 *   <li>수정 화면(전개 후 저장본)에는 BUNDLE 제품 라인이 존재하지 않는다 — "세트 head 재가격" 은
 *       BUNDLE 제품 라인이 실존하는 <b>생성 폼</b>(SOURCE_BUNDLE_SET 기억 대상)에만 해당한다.</li>
 * </ul>
 */
export function bundleComponentLineIds(
  lines: ReadonlyArray<{ id?: string | null; parentSetModel?: string | null }>,
): ReadonlySet<string> {
  const ids = new Set<string>()
  for (const line of lines) {
    if (line.id && (line.parentSetModel ?? '').trim() !== '') ids.add(line.id)
  }
  return ids
}

type PartnerRepriceSourceView = Pick<PartnerRepriceOutcome, 'source' | 'updatedAt'>

/** 수정모달 라인 출처 마커 문구 — hit/miss/미확보를 색상 외 텍스트와 AT 의미로 구분한다. */
export function partnerRepriceMarkerText(outcome: PartnerRepriceSourceView): {
  label: string
  description: string
} {
  if (outcome.source === 'REMEMBERED') {
    return {
      label: '거래처 최근단가',
      description: `이 거래처에 마지막으로 저장된 단가${outcome.updatedAt ? ` · ${outcome.updatedAt.slice(0, 10)} 저장` : ''}`,
    }
  }
  if (outcome.source === 'CATALOG') {
    return {
      label: '판매가',
      description: '이 거래처에 저장된 최근단가가 없어 판매가를 적용했습니다',
    }
  }
  return {
    label: '단가 확인 필요',
    description: '카탈로그 판매가를 확인할 수 없어 단가를 비웠습니다. 직접 입력해 주세요',
  }
}

/** 거래처 변경 배너 — miss를 "최근단가 재적용"으로 오인하지 않도록 출처별 건수를 고지한다. */
export function partnerRepriceBannerText(
  outcomes: ReadonlyArray<Pick<PartnerRepriceOutcome, 'source'>>,
  changedCount: number,
): string {
  if (outcomes.length === 0) return ''
  const remembered = outcomes.filter((outcome) => outcome.source === 'REMEMBERED').length
  const catalog = outcomes.filter((outcome) => outcome.source === 'CATALOG').length
  const unavailable = outcomes.filter((outcome) => outcome.source === 'UNAVAILABLE').length
  return [
    '거래처 변경 단가 확인 완료',
    remembered > 0 ? `최근단가 ${remembered}건` : null,
    catalog > 0 ? `판매가 ${catalog}건` : null,
    unavailable > 0 ? `단가 확인 필요 ${unavailable}건` : null,
    `변경 ${changedCount}행`,
  ].filter(Boolean).join(' · ')
}

function EditPriceChangeIndicator({ id }: { id: string }) {
  return (
    <span id={id} className="price-change-indicator">
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <path d="M3 2v7m0 0L1.5 7.5M3 9l1.5-1.5M9 10V3m0 0L7.5 4.5M9 3l1.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      단가 변경
    </span>
  )
}

/**
 * coedit 헤더 필드 — Y.Doc `header` map 에 실리는 값.
 *
 * <p>{@code partnerId} 는 D-R8-7 신규. 거래처 선택을 CRDT 로 전파하지 않으면 상대 피어는
 * <b>구 partnerId</b> 를 그대로 들고 저장한다 — 화면엔 새 거래처가 보이는데 (거래처+품목)
 * 가격기억은 원 거래처에 각인되는 R8-QA-3 결함이 협업 경로로 되살아난다. 화면에는
 * 거래처명만 표시하고 UUID 는 payload 전용이다(D-R3-1).
 */
export function coeditHeaderValues(slip: SlipDetail, mode: SlipType): Record<string, string> {
  return {
    partnerId: slip.partnerId ?? '',
    partnerName: slip.partnerName ?? '',
    partnerCode: slip.partnerCode ?? '',
    businessNumber: slip.businessNumber ?? '',
    memo: slip.memo ?? '',
    deliveryAddress: slip.deliveryAddress ?? '',
    supervisionAddress: mode === 'OUTBOUND' ? slip.supervisionAddress ?? '' : '',
    projectName: slip.projectName ?? '',
    recipientPhone: slip.recipientPhone ?? '',
    paymentDueDate: slip.paymentDueDate ?? '',
  }
}

function syncSlipCoeditProvider(provider: DocCoeditProvider | null, slip: SlipDetail, mode: SlipType) {
  if (!provider) return
  for (const [fieldName, value] of Object.entries(coeditHeaderValues(slip, mode))) {
    provider.setHeaderValue(fieldName, value)
  }
  provider.replaceItems(toPurchaseEditLines(slip))
}

function seedSlipCoeditProvider(provider: DocCoeditProvider, slip: SlipDetail, mode: SlipType) {
  syncSlipCoeditProvider(provider, slip, mode)
}

/**
 * coedit Y.Doc → 매입/매출 수정 폼 라인.
 *
 * <p>🔴 <b>lineId 는 반드시 Y.Doc 에서 직독한다 — 위치복원 금지</b> (R8-FE-1 = R8-QA-2 · BLOCKING).
 * 종전 {@code lineId: current[index]?.lineId ?? null} 은 원격 피어가 1행을 삭제하는 순간
 * 무너진다: Y.Doc 은 즉시 당겨지지만 {@code current} 는 아직 구 스냅샷이라 남은 행이 전부
 * 이웃의 lineId 를 물려받고, 서버가 그 lineId 를 무조건 신뢰해 남의 세트 계보를 각인하며
 * 사용자 단가가 가격기억에서 증발한다(라이브 2/2 결정적 재현).
 *
 * <p>파생 금액을 포함한 {@code previous} 행은 Y.Doc의 {@code lineId} 우선, 신규 행만
 * {@code productId}로 매칭한다. 배열 인덱스는 원격 선행행 삭제 시 다른 행의 금액을
 * 상속시키므로 식별자 매칭에 사용하지 않는다.
 */
export function coeditLinesToEditLines(
  provider: DocCoeditProvider,
  current: PurchaseEditLine[],
  knownServerLineIds: ReadonlySet<string>,
): PurchaseEditLine[] {
  return provider.items.toArray().map((_, index) => {
    const providerLineId = provider.getItemValue(index, 'lineId')
    const providerProductId = provider.getItemValue(index, 'productId')
    const previous = current.find((candidate) => (
      (providerLineId && candidate.lineId === providerLineId)
      || (!providerLineId && providerProductId && candidate.productId === providerProductId)
    ))
    const quantityValue = provider.getItemValue(index, 'quantity')
    // BLOCKING-1 부수 발견 2(#824 R1): supplyAmount/vatAmount/lineTotalWithVat/authority/
    // vatDirty 는 quantity/unitPrice 와 달리 "타이핑 대상"이 아니라 파생값이라, 이 라인에서
    // 한 번도 Y.Doc 에 쓰인 적이 없으면 원문이 항상 빈 문자열이다. `|| previous` 폴백 없이
    // Y.Doc 직독만 쓰면 이 함수가 재호출될 때마다(같은 행의 다른 필드 편집도 트리거) 방금
    // React state 에 반영된 권위값을 매번 undefined 로 지워버린다 — quantity/unitPrice 의
    // B-1 폴백 제거(주석 참조)와는 반대 방향의 요구라 필드별로 분기한다.
    const rawSupply = provider.getItemValue(index, 'supplyAmount')
    const rawVat = provider.getItemValue(index, 'vatAmount')
    const rawLineTotal = provider.getItemValue(index, 'lineTotalWithVat')
    const rawAuthority = provider.getItemValue(index, 'authority')
    const rawVatDirty = provider.getItemValue(index, 'vatDirty')
    const supplyAmount = rawSupply || previous?.supplyAmount
    const vatAmount = rawVat || previous?.vatAmount
    const hasDerivedAmounts = supplyAmount != null
      && supplyAmount !== ''
      && vatAmount != null
      && vatAmount !== ''
    const lineTotalWithVat = hasDerivedAmounts
      ? String(Number(supplyAmount) + Number(vatAmount))
      : rawLineTotal || previous?.lineTotalWithVat
    return {
      key: previous?.key ?? createEditLineKey(),
      lineId: resolveServerLineId(provider, index, knownServerLineIds),
      productId: provider.getItemValue(index, 'productId') || previous?.productId || '',
      productName: provider.getItemValue(index, 'productName'),
      modelName: provider.getItemValue(index, 'modelName'),
      specification: provider.getItemValue(index, 'specification'),
      // 타이핑 coedit 값은 Y.Doc 직접 사용(`|| previous` 폴백 제거) — 빈 문자열로 지울 수 있게(리뷰 FE B-1: 폴백이 ''를 falsy 처리해 숫자 셀 clear 불가). productId 는 선택기반(타이핑 아님)이라 폴백 유지.
      quantity: Number(quantityValue || 0),
      unitPrice: provider.getItemValue(index, 'unitPrice'),
      unitPriceWithVat: previous?.unitPriceWithVat,
      note: provider.getItemValue(index, 'note'),
      supplyAmount,
      vatAmount,
      lineTotalWithVat,
      authority: (rawAuthority || previous?.authority) as PurchaseEditLine['authority'],
      vatDirty: rawVatDirty ? rawVatDirty === 'true' : previous?.vatDirty,
    }
  })
}

/**
 * 전표 상세(수정) 라인 → {@link LineVatLine} 계산 도메인 변환.
 *
 * <p>이 화면의 단가 열(line.unitPrice)은 VAT 제외 공급단가 계약이라 {@code recalculateLineVat}
 * 의 PRICE 분기(단가=VAT 포함 전제)와 도메인이 다르다. SUPPLY/VAT 권위 편집
 * ({@code updateDetailVat})에서만 사용하고, 합계는 공급가액과 부가세의 파생값으로
 * 읽기 전용 처리한다. 수량 변경은 {@link computeDetailQuantityChange}
 * 가 별도로 처리한다(BLOCKING-1 — PRICE 분기로 우회하면 안 되는 이유는 그쪽 주석 참조).
 */
export function detailVatLine(
  line: Pick<PurchaseEditLine, 'quantity' | 'unitPrice' | 'lineTotalWithVat' | 'supplyAmount' | 'vatAmount' | 'authority'>,
): LineVatLine {
  const total = line.lineTotalWithVat ?? '0'
  return {
    quantity: line.quantity,
    unitPrice: String(line.unitPrice ?? '0'),
    supplyAmount: line.supplyAmount ?? '0',
    vatAmount: line.vatAmount ?? '0',
    lineTotal: total,
    authority: line.authority ?? 'PRICE',
  }
}

/** {@link LineVatLine} 계산 결과 → 전표 상세 편집 라인 patch. */
export function detailAmountState(
  result: LineVatLine,
  authority: PurchaseEditLine['authority'],
): Partial<PurchaseEditLine> {
  // BLOCKING-1 부수 발견(#824 R1): `Number(x) || 1` 은 진짜 수량 0(방금 수량 셀을 비운
  // 직후)을 "값 없음"으로 오판해 1로 되돌린다(JS 0 은 falsy). 수량과 사용자가 입력한
  // 단가를 그대로 보존하고, 금액 편집에서는 단가를 역산하지 않는다.
  const parsedQuantity = Number(result.quantity)
  const quantity = Number.isFinite(parsedQuantity) ? Math.max(0, Math.trunc(parsedQuantity)) : 0
  return {
    quantity,
    // 전표 상세의 단가는 사용자가 입력한 값을 보존하며 역산하지 않는다.
    unitPrice: String(result.unitPrice),
    supplyAmount: result.supplyAmount,
    vatAmount: result.vatAmount,
    lineTotalWithVat: result.lineTotal,
    authority,
    vatDirty: true,
  }
}

/**
 * 전표 상세(수정) 화면 수량 변경 — BLOCKING-1(#824 R1) 근본 수정.
 *
 * <p>종전에는 {@code changeLineQuantity}(PRICE authority 경로)를 그대로 태워
 * {@link detailVatLine} 이 unitPrice 자리에 lineTotalWithVat(합계)를 채워 넣었다. PRICE
 * 분기는 "단가(VAT 포함)×수량=합계"를 전제하므로, 수량을 바꿀 때마다 실제로는
 * "직전 합계 × 새 수량"을 다시 곱하는 꼴이 되어 금액이 기하급수로 불어났다(실측: 수량
 * 2→3 에 220,000→660,000, 2→2 재입력에도 220,000→440,000 — vatDirty=true 로 폭증값이
 * 그대로 권위값 전송됨). 이 화면의 단가 열은 VAT 제외 공급단가 계약이므로, PRICE 경로로
 * 우회하지 않고 <b>공급단가(unitPrice)를 고정한 채 새 수량을 곱해 공급가액만 다시 낸다</b>
 * (SUPPLY authority 로 닫아 부가세는 BE 와 같은 0 방향 절사).
 *
 * <p>불변식:
 * <ol>
 *   <li>단가는 수량 변경으로 바뀌지 않는다 — 반환 patch 의 unitPrice 는 입력을 그대로 승계.</li>
 *   <li>값을 바꾸지 않은 재입력(예: 2→2)은 어떤 금액도 바꾸지 않는다 — 파싱한 수량이 현재
 *       수량과 같으면 반올림 경로 자체를 타지 않고 조기 반환한다(드리프트 원천 차단).</li>
 *   <li>빈 입력은 수량 0으로 반영한다 — 수량 입력칸을 비울 수 있어야 한다(RED-1, CI hard
 *       gate). 파생 금액도 0으로 닫아 미완성 라인이 이상값을 보이지 않게 한다.</li>
 * </ol>
 */
export function computeDetailQuantityChange(
  line: Pick<PurchaseEditLine, 'quantity' | 'unitPrice'>,
  quantity: string,
): Partial<PurchaseEditLine> {
  const parsed = Number(quantity)
  const safeQuantity = Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0

  // 불변식 2: no-op 재입력은 반올림 경로 자체를 타지 않는다.
  if (safeQuantity === Number(line.quantity)) {
    return { quantity: safeQuantity }
  }

  if (safeQuantity === 0) {
    return {
      quantity: 0,
      supplyAmount: '0',
      vatAmount: '0',
      lineTotalWithVat: '0',
      authority: 'PRICE',
      vatDirty: true,
    }
  }

  const unitPrice = line.unitPrice ?? '0'
  const nextSupply = roundProduct(safeQuantity, unitPrice)
  const vatLine = editLineVat(
    { quantity: safeQuantity, unitPrice, supplyAmount: '0', vatAmount: '0', lineTotal: '0' },
    'SUPPLY',
    String(nextSupply),
  )
  return {
    quantity: safeQuantity,
    unitPrice,
    supplyAmount: vatLine.supplyAmount,
    vatAmount: vatLine.vatAmount,
    lineTotalWithVat: vatLine.lineTotal,
    authority: 'PRICE',
    vatDirty: true,
  }
}

/**
 * 전표 상세(수정) 화면 단가 변경 — 발견 1(#937 R1) 근본수정.
 *
 * <p>{@link computeDetailQuantityChange} 와 축만 다른 자매 함수다 — 이 화면의 단가 열은
 * VAT 제외 공급단가 계약이므로(위 {@link detailVatLine} 주석 참조) PRICE authority(단가=
 * VAT 포함 전제, lineVat.ts recalculateLineVat)로 우회하지 않고 수량을 고정한 채 새 단가로
 * 공급가액을 다시 낸다(SUPPLY authority 로 닫아 부가세는 BE 와 같은 0 방향 절사) — 생성
 * 화면(SlipFormPage)이 단가 편집 시 화면 금액을 즉시 재계산하는 것과 같은 정책(E2, 두 화면
 * 정책 일치 — 이 PR 제목의 주장)이다.
 *
 * <p>종전에는 단가 셀 onChange 가 로컬 state 의 unitPrice/vatDirty 만 바꾸고 supplyAmount/
 * vatAmount 는 전혀 건드리지 않아(화면이 옛 금액을 그대로 보여줌), BE 저장 시에만
 * quantity×unitPrice 로 재계산돼 화면·DB 가 어긋났다(적대검증 발견 1 2단계). 이 함수가 낸
 * 파생값은 {@link detailAmountDocWrites}가 Y.Doc 에도 반영해 재열기·doc-sync 되돌림을
 * 막는다(발견 1 3·4단계 근본수정 — 같은 뿌리인 발견 2 도 함께 닫는다).
 *
 * <p>불변식: 값을 바꾸지 않은 재입력은 어떤 금액도 바꾸지 않는다({@link computeDetailQuantityChange}
 * 불변식 2 와 동일 원칙 — 드리프트 원천 차단).
 */
export function computeDetailUnitPriceChange(
  line: Pick<PurchaseEditLine, 'quantity' | 'unitPrice'>,
  unitPrice: string,
): Partial<PurchaseEditLine> {
  // 불변식: no-op 재입력은 재계산 경로 자체를 타지 않는다.
  if (unitPrice === String(line.unitPrice ?? '')) {
    return { unitPrice }
  }

  const nextSupply = roundProduct(line.quantity, unitPrice || '0')
  const vatLine = editLineVat(
    { quantity: line.quantity, unitPrice, supplyAmount: '0', vatAmount: '0', lineTotal: '0' },
    'SUPPLY',
    String(nextSupply),
  )
  return {
    unitPrice,
    supplyAmount: vatLine.supplyAmount,
    vatAmount: vatLine.vatAmount,
    lineTotalWithVat: vatLine.lineTotal,
    authority: 'PRICE',
    vatDirty: true,
  }
}

/**
 * 전표 상세 금액 셀(단가/공급가액/부가세) 입력 문자열 필터 — 발견 3(#937 R1), E4.
 *
 * <p>생성 화면(LineRow.tsx 의 모듈-로컬 {@code parseEditableAmountInput})과 <b>같은 규칙</b>을
 * 그대로 복제한다 — 그 함수는 export 되지 않고, LineRow.tsx 는 이 PR 의 변경 금지 대상(적대검증
 * 각도 ②, 바이트 단위 0)이라 import 할 수 없다. 규칙을 바꿀 때는 두 곳을 함께 고쳐야 한다.
 *
 * <p>순수 자연수(빈 값 포함) 또는 3자리 콤마 그룹 형식만 허용한다 — 소수점(2.7→3 조용한
 * HALF_UP 반올림)·부호(-3 음수 공급가액 수용)·지수표기(1e3→1000)를 전부 거부해, 사용자가
 * 의도하지 않은 다른 금액이 조용히 만들어지는 것을 막는다.
 *
 * @return 정규화(콤마 제거)된 숫자 문자열, 또는 거부 시 {@code null}
 */
export function parseEditableDetailAmountInput(raw: string): string | null {
  if (/^\d*$/.test(raw)) return raw
  if (raw.includes(',,')) return null
  if (!/^\d{1,3}(?:,\d{0,3})+$/.test(raw)) return null
  return raw.replace(/,/g, '')
}

/**
 * 로컬에서 재계산된 supplyAmount/vatAmount 를 Y.Doc 필드와 대조해, 갱신이 필요한(=stale 한)
 * 라인만 골라낸다 — 발견 1·2 근본수정(#937 R1) 이 실제로 쓰는 계산 부분(무엇을 쓸지)이다.
 * "언제 쓰는지"는 {@link syncDetailAmountToDoc} 참조 — **반드시 동기 호출**해야 한다(그 함수
 * 주석이 이유를 설명한다).
 *
 * <p>quantity/unitPrice 변경({@link computeDetailQuantityChange}/{@link computeDetailUnitPriceChange})은
 * 로컬 React state 만 갱신하고 Y.Doc 의 supplyAmount/vatAmount 필드는 건드리지 않는다. 그런데
 * {@link coeditLinesToEditLines}(:558-563 부근)는 그 두 필드의 Y.Doc 원문이 있으면 그것을
 * 신뢰한다(원격 피어의 직접 편집을 반영하기 위한 정상 설계) — 이 함수가 재계산된 값을 Y.Doc
 * 에도 함께 반영해 두 저장소를 늘 일치시킨다.
 *
 * <p>lineTotalWithVat 는 동기화 대상에서 <b>의도적으로 제외</b>한다 —
 * {@link coeditLinesToEditLines} 는 supplyAmount·vatAmount 가 둘 다 있으면 항상 그 합으로
 * 새로 유도하므로(:565-571), Y.Doc 의 원본 lineTotalWithVat 필드는 그 분기에서 읽히지 않는다.
 *
 * <p>신규(미저장) 라인은 이 화면에서 만들 수 없다(행 추가 버튼이 SlipFormPage 로 안내만
 * 한다) — 모든 라인이 항상 lineId 를 갖는다는 이 화면의 기존 전제를 그대로 따른다.
 */
export function detailAmountDocWrites(
  provider: Pick<DocCoeditProvider, 'getItemValueById'>,
  lines: ReadonlyArray<Pick<PurchaseEditLine, 'lineId' | 'supplyAmount' | 'vatAmount'>>,
): Array<{ lineId: string; supplyAmount: string; vatAmount: string }> {
  const writes: Array<{ lineId: string; supplyAmount: string; vatAmount: string }> = []
  for (const line of lines) {
    if (!line.lineId) continue
    const nextSupply = line.supplyAmount ?? '0'
    const nextVat = line.vatAmount ?? '0'
    if (
      provider.getItemValueById(line.lineId, 'supplyAmount') === nextSupply
      && provider.getItemValueById(line.lineId, 'vatAmount') === nextVat
    ) continue
    writes.push({ lineId: line.lineId, supplyAmount: nextSupply, vatAmount: nextVat })
  }
  return writes
}

/**
 * quantity/unitPrice 재계산 직후 Y.Doc 에 동기 반영한다 — 발견 1·2 근본수정(#937 R1),
 * "언제"를 담당한다({@link detailAmountDocWrites} 는 "무엇을").
 *
 * <p>🚨 <b>반드시 이 필드를 편집한 {@code CollaborativeSlipInput} 의 onValueChange 콜백
 * 안에서, 동기로(await 없이) 호출해야 한다</b> — React {@code useEffect}(비동기, post-commit)
 * 로는 늦다는 것이 라이브 실측이다: 그 컴포넌트 자신이 onValueChange 직후 <b>같은 이벤트
 * 핸들러 안에서</b> quantity/unitPrice 를 Y.Doc 에 쓰고, 그 쓰기가 즉시(동기) 문서변경
 * 이벤트를 내 {@link coeditLinesToEditLines} 를 재호출시킨다. 그 함수는 Y.Doc 의
 * supplyAmount/vatAmount 원문을 신뢰하므로, 이 동기화가 effect 로 미뤄지면(다음 렌더 커밋
 * 후) 그 사이에 낀 coeditLinesToEditLines 호출이 <b>아직 안 쓰인(stale) Y.Doc 값</b>을 읽어
 * 방금 재계산한 로컬값을 되돌린다 — effect 버전은 vitest 는 전부 통과했지만 실 브라우저에서
 * 재현되지 않았다(라이브QA 로만 드러남, RED-first 로도 못 잡는 유형).
 *
 * <p>{@code preEditLine}(patch 적용 <b>전</b> 스냅샷)은 JSX map 클로저 값이다 — 한 번의
 * 동기 키 입력 캐스케이드 안에서는 이 컴포넌트가 다시 렌더되지 않으므로(React 는 이벤트
 * 핸들러 종료까지 커밋을 미룬다) 이 시점의 line 이 곧 "이번 편집 직전"의 유일한 참값이다.
 *
 * <p>unitPrice/quantity 자신도 함께 쓴다(중복 — CollaborativeSlipInput 이 어차피 다시 쓴다)
 * — 그래야 이 트랜잭션 하나로 Y.Doc 이 즉시 완전히 일치해, 뒤이은 개별 필드 syncFromDoc
 * 재동기 캐스케이드가 몇 단계를 거치든 항상 같은(정답) 값으로 수렴한다.
 *
 * <p>🚨 <b>Y.Doc 의 현재값과 비교해 실제로 다를 때만 쓴다</b>(unitPrice/quantity 포함 —
 * detailAmountDocWrites 는 supplyAmount/vatAmount 만 대조하므로 이 함수가 나머지 두 필드도
 * 직접 대조한다). 이 대조가 없으면 무한 재귀로 콜스택이 터진다(라이브 실측 — "Maximum call
 * stack size exceeded"): 이 필드 자신의 개별 syncFromDoc 이 방금 쓴 값을 "원격 변경"으로
 * 오인해 onValueChange 를 재호출하는데, 그 재호출은 JSX map 클로저의 stale {@code preEditLine}
 * 을 다시 넘겨받으므로 {@link computeDetailUnitPriceChange}/{@link computeDetailQuantityChange}
 * 의 no-op 가드(입력값 vs stale 이전 라인)가 "값이 바뀌었다"고 영원히 오판한다 — 가드가
 * 막아주지 못하는 이 재귀는 반드시 <b>Y.Doc 현재값과 이번에 쓸 값이 이미 같은지</b>로 끊어야
 * 한다(stale 클로저와 무관하게 Y.Doc 자신은 각 라운드마다 최신이므로 여기서는 안전하다).
 */
export function syncDetailAmountToDoc(
  provider: DocCoeditProvider | null,
  preEditLine: Pick<PurchaseEditLine, 'lineId'>,
  patch: Partial<PurchaseEditLine>,
) {
  if (!provider || !preEditLine.lineId || patch.supplyAmount == null || patch.vatAmount == null) return
  const lineId = preEditLine.lineId
  const writes = detailAmountDocWrites(provider, [
    { lineId, supplyAmount: patch.supplyAmount, vatAmount: patch.vatAmount },
  ])
  const needsUnitPrice = patch.unitPrice != null
    && provider.getItemValueById(lineId, 'unitPrice') !== String(patch.unitPrice)
  const needsQuantity = patch.quantity != null
    && provider.getItemValueById(lineId, 'quantity') !== String(patch.quantity)
  if (writes.length === 0 && !needsUnitPrice && !needsQuantity) return
  provider.doc.transact(() => {
    if (needsUnitPrice) provider.setItemValueById(lineId, 'unitPrice', String(patch.unitPrice))
    if (needsQuantity) provider.setItemValueById(lineId, 'quantity', String(patch.quantity))
    for (const write of writes) {
      provider.setItemValueById(write.lineId, 'supplyAmount', write.supplyAmount)
      provider.setItemValueById(write.lineId, 'vatAmount', write.vatAmount)
    }
  })
}

/**
 * 전표 상세 수정 라인 → BE {@code SlipUpdateRequest.LineRequest} payload 변환.
 *
 * <p>발견 1(#937 R1) RED 테스트가 저장 payload 를 직접 단정할 수 있도록 매출/매입 저장
 * 핸들러의 중복 인라인 매핑을 추출했다(동작 변경 없음 — 순수 리팩터). {@code vatDirty} 가
 * 아니면 공급가액·부가세·합계를 생략해 BE 가 quantity×unitPrice 로 재계산하게 한다
 * (all-or-nothing 계약, BE AuthoritativeAmountValidator 미러).
 */
export function buildDetailLinePayload(line: PurchaseEditLine): SlipLineInput {
  return {
    lineId: line.lineId ?? null,
    productId: line.productId,
    productName: line.productName?.trim() || undefined,
    modelName: line.modelName?.trim() || undefined,
    specification: line.specification?.trim() || undefined,
    quantity: Number(line.quantity),
    unitPrice: String(line.unitPrice || '0'),
    note: line.note?.trim() || undefined,
    ...(line.vatDirty
      ? {
          supplyAmount: line.supplyAmount,
          vatAmount: line.vatAmount,
          lineTotalWithVat: line.lineTotalWithVat,
        }
      : {}),
  }
}

/**
 * "2026-05-04T14:32:18+09:00" → "14:32" — Designer print-spec.md § 3.4.
 */
function formatHHmm(iso: string | null | undefined): string {
  if (!iso) return ''
  return iso.slice(11, 16)
}

/**
 * 전표 transition action → BE @RequirePermission page-code + action 매핑.
 *
 * C5-2c: canTransitionSlip() 헬퍼를 canAccess() 로 이관.
 * 근거: services/slip-service/.../SlipController.java @RequirePermission + V36 seed.
 *
 *   save / send          → sales.slip.edit        / update (MASTER/MANAGER/SALES)
 *   accept/process/      → slip.transfer.process  / update (MASTER/MANAGER/WAREHOUSE/INVENTORY)
 *     inspect/complete/
 *     ship/deliver
 *   confirm              → sales.slip.confirm     / update (MASTER/MANAGER/ACCOUNTANT)
 *   reject               → slip.reject            / update (MASTER/MANAGER)
 *   cancel               → sales.slip.cancel      / update (MASTER/MANAGER/SALES)
 */
function slipActionPageCode(
  action: SlipTransitionAction,
): { pageCode: 'sales.slip.edit' | 'slip.transfer.process' | 'sales.slip.confirm' | 'slip.reject' | 'sales.slip.cancel' } {
  switch (action) {
    case 'save':
    case 'send':
      return { pageCode: 'sales.slip.edit' }
    case 'accept':
    case 'process':
    case 'inspect':
    case 'complete':
    case 'ship':
    case 'deliver':
      return { pageCode: 'slip.transfer.process' }
    case 'confirm':
      return { pageCode: 'sales.slip.confirm' }
    case 'reject':
      return { pageCode: 'slip.reject' }
    case 'cancel':
      return { pageCode: 'sales.slip.cancel' }
  }
}

export function SlipDetailPage({ mode }: SlipDetailPageProps) {
  const params = useParams<{ id: string }>()
  const id = params.id ?? ''
  const slipCollabBasePath = useMemo(() => `/slips/${id}`, [id])
  const navigate = useNavigate()
  const { canAccess } = usePermissions()
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()
  const isOutbound = mode === 'OUTBOUND'
  const listPath = isOutbound ? '/sales' : '/purchases'

  const [rejectReason, setRejectReason] = useState('')
  /** 좌측 넘버링 클릭으로 선택된 라인 ID — 선택 시 상단 툴바 표시 (단일 선택, 행 편집용). */
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null)
  /** Phase 2.6d: 재고조회 다중선택 라인 ID 집합. */
  const [checkedLineIds, setCheckedLineIds] = useState<Set<string>>(new Set())
  /** Phase 2.6d: 재고조회 모달 open 상태. */
  const [inventoryLookupOpen, setInventoryLookupOpen] = useState(false)
  // link-dispatch-slice 신규: driver 인라인 편집 state (DRAFT/SAVED 만 활성)
  const [editingDriver, setEditingDriver] = useState(false)
  const [draftDriverName, setDraftDriverName] = useState('')
  const [draftDriverPhone, setDraftDriverPhone] = useState('')
  // signature-slice-C 신규: 서명 무효화 modal state (MASTER only)
  const [invalidateOpen, setInvalidateOpen] = useState(false)
  const [invalidateReason, setInvalidateReason] = useState('')
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false)
  // PR-H3: 수정/삭제 요청 다이얼로그 state — null 이면 미오픈, 'EDIT'/'DELETE' 면 해당 type 으로 오픈.
  const [editRequestDialogType, setEditRequestDialogType]
    = useState<SlipEditRequestType | null>(null)
  // PR-H3: 가장 최근 본인 요청 (mutation 결과 + SSE decided 갱신). null = 요청 이력 없음.
  // BE 가 SlipDetail 응답에 latestEditRequest 필드 합류 시 그것으로 교체 가능.
  const [latestEditRequest, setLatestEditRequest]
    = useState<SlipEditRequest | null>(null)
  // PR-H3: 수락/거절 결과 toast (SSE slip:edit-request:decided 수신 시 표시).
  const [decisionToast, setDecisionToast]
    = useState<{ kind: 'success' | 'danger'; text: string } | null>(null)
  // SP-08-5-3: 매입 soft delete confirm modal state.
  const [purchaseDeleteOpen, setPurchaseDeleteOpen] = useState(false)
  const [purchaseDeleteConflict, setPurchaseDeleteConflict] = useState(false)
  const [purchaseDeleteInspectionAlert, setPurchaseDeleteInspectionAlert] = useState<string | null>(null)

  // SP-08-6-3: 매출 soft delete confirm modal state.
  const [salesDeleteOpen, setSalesDeleteOpen] = useState(false)
  const [salesDeleteConflict, setSalesDeleteConflict] = useState(false)
  const [salesDeleteShippedAlert, setSalesDeleteShippedAlert] = useState<string | null>(null)
  const [salesDeleteForbiddenAlert, setSalesDeleteForbiddenAlert] = useState<string | null>(null)
  const [salesDeleteErrorAlert, setSalesDeleteErrorAlert] = useState<string | null>(null)

  // SP-08-6-2: 매출 direct PUT 수정 modal state.
  const [salesEditOpen, setSalesEditOpen] = useState(false)
  const [salesConflictMessage, setSalesConflictMessage] = useState<string | null>(null)
  const [salesIsConflict, setSalesIsConflict] = useState(false)
  const [salesReloadSuccessMessage, setSalesReloadSuccessMessage] = useState<string | null>(null)
  const [salesUpdatedAt, setSalesUpdatedAt] = useState<string | null>(null)
  // D-R8-7: 거래처 UUID — payload 전용(화면 미표시). PartnerAutocomplete 선택과 coedit header 로만 갱신된다.
  const [salesPartnerId, setSalesPartnerId] = useState('')
  const [salesPartnerName, setSalesPartnerName] = useState('')
  const [salesPartnerCode, setSalesPartnerCode] = useState('')
  const [salesBusinessNumber, setSalesBusinessNumber] = useState('')
  const [salesMemo, setSalesMemo] = useState('')
  const [salesDeliveryAddress, setSalesDeliveryAddress] = useState('')
  const [salesProjectName, setSalesProjectName] = useState('')
  const [salesRecipientPhone, setSalesRecipientPhone] = useState('')
  const [salesPaymentDueDate, setSalesPaymentDueDate] = useState('')
  const [salesSupervisionAddress, setSalesSupervisionAddress] = useState('')
  const [salesEditLines, setSalesEditLines] = useState<PurchaseEditLine[]>([])
  const salesReloadSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // SP-08-5-2/E1-b-2: 매입 direct PUT 수정 state.
  const [purchaseEditOpen, setPurchaseEditOpen] = useState(false)
  const [purchaseConflictMessage, setPurchaseConflictMessage] = useState<string | null>(null)
  const [purchaseIsConflict, setPurchaseIsConflict] = useState(false)
  const [purchaseReloadSuccessMessage, setPurchaseReloadSuccessMessage] = useState<string | null>(null)
  const [purchaseUpdatedAt, setPurchaseUpdatedAt] = useState<string | null>(null)
  // D-R8-7: 거래처 UUID — payload 전용(화면 미표시).
  const [purchasePartnerId, setPurchasePartnerId] = useState('')
  const [purchasePartnerName, setPurchasePartnerName] = useState('')
  const [purchasePartnerCode, setPurchasePartnerCode] = useState('')
  const [purchaseBusinessNumber, setPurchaseBusinessNumber] = useState('')
  const [purchaseMemo, setPurchaseMemo] = useState('')
  const [purchaseDeliveryAddress, setPurchaseDeliveryAddress] = useState('')
  const [purchaseProjectName, setPurchaseProjectName] = useState('')
  const [purchaseRecipientPhone, setPurchaseRecipientPhone] = useState('')
  const [purchasePaymentDueDate, setPurchasePaymentDueDate] = useState('')
  const [purchaseEditLines, setPurchaseEditLines] = useState<PurchaseEditLine[]>([])
  const purchaseReloadSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 매출 인라인 편집 폼 — 진입 시 뷰 스크롤+포커스용 ref (구 모달 즉시노출/auto-focus 대체).
  const salesEditFormRef = useRef<HTMLElement>(null)
  // 매입 인라인 편집 폼 — 매출 인라인 패턴과 동일하게 진입 시 위치/포커스를 보정한다.
  const purchaseEditFormRef = useRef<HTMLElement>(null)
  // 매출 인라인 편집 진입 시: read-only 라인 선택/체크 초기화(숨긴 툴바 잔존상태 방지) + 폼으로 스크롤 + 첫 입력 포커스.
  // 인라인 폼이 전표라인 자리(fold 아래) 렌더라 스크롤 없으면 편집 진입을 인지 못함(리뷰 R1 Design/FE BLOCKING·DevOps).
  useEffect(() => {
    if (!(salesEditOpen && mode === 'OUTBOUND')) return
    setSelectedLineId(null)
    setCheckedLineIds(new Set())
    const el = salesEditFormRef.current
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // readonly(판매번호)·disabled 는 건너뛰고 첫 편집 가능 필드에 포커스(Codex 라운드 MED).
    el.querySelector<HTMLElement>(
      'input:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled]), [contenteditable="true"]',
    )?.focus?.()
  }, [salesEditOpen, mode])

  useEffect(() => {
    if (!(purchaseEditOpen && mode === 'INBOUND')) return
    setSelectedLineId(null)
    setCheckedLineIds(new Set())
    const el = purchaseEditFormRef.current
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    el.querySelector<HTMLElement>(
      'input:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled]), [contenteditable="true"]',
    )?.focus?.()
  }, [purchaseEditOpen, mode])
  // §7 협업 수정완료: 확정/완료 전표도 물리 종결 전이면 overlay 필드 편집 가능.
  const [collabEditMode, setCollabEditMode] = useState(false)
  const [slipFormCoeditProvider, setSlipFormCoeditProvider] = useState<DocCoeditProvider | null>(null)
  // coedit provider 로딩 중 여부 — 로딩 중에만 입력/저장 잠금(이중소스 방지). 로드 실패(provider=null) 시엔 비-coedit 평문 편집·저장 허용(콜랩 서버 다운 시 영구잠금 회귀 방지, 리뷰 Opus 라운드2 BLOCKING).
  const [slipFormCoeditPending, setSlipFormCoeditPending] = useState(false)
  // [D-R8-11] 협업 중 행삭제 잠금 제거 — 근본 fix(Y.Doc lineId 직독: resolveServerLineId 가 서버
  // 미보유 lineId 를 신규 라인으로 강등)가 이미 계보를 방어하므로 잠금은 과잉이었다. 잠금은
  // (1) 수정 모달의 행삭제를 영구 불가로 만들고 (2) 근본 fix 의 라이브 검증을 봉쇄했다. 대신
  // 툴바 서버측 삭제 경합(R8-QA-12)은 저장 400 을 충돌 안내+최신 불러오기로 처리한다(위 onError).

  // D-R8-10/R8-QA-11: 수정 모달도 거래처 변경 시 가격을 새 거래처 기준으로 재조회한다(폼과 공용 훅).
  // 미적용 시 옛 거래처의 협상단가가 새 거래처에 각인됐다. CRDT 라인(Y.Doc 파생)이라 새 단가는
  // provider 에 써서 원격 전파 + doc-sync 되돌림을 피하고, 변경행 강조는 라인 밖 별도 Set 으로 추적한다
  // (coeditLinesToEditLines 가 라인을 Y.Doc 에서 재생성하므로 라인 필드에 담으면 소실).
  const partnerReprice = usePartnerPriceRefresh()
  // 카탈로그 조회(훅 run 이전 단계)까지 포함한 재조회 세션 순서 가드 — 훅의 supersession 은 run()
  // 호출 순서 기준이라, 카탈로그 fetch 지연으로 이전 선택의 run 이 나중에 시작되면 최신 선택을
  // 뒤집을 수 있다. 세션 seq 로 카탈로그 단계에서 선차단한다.
  const modalRepriceSeqRef = useRef(0)
  const [repriceChangedLineIds, setRepriceChangedLineIds] = useState<ReadonlySet<string>>(() => new Set())
  const [repriceOutcomeByLineId, setRepriceOutcomeByLineId] = useState<ReadonlyMap<string, PartnerRepriceOutcome>>(() => new Map())
  // 카탈로그 조회 단계까지 포함한 수정모달 재조회 pending — 저장 버튼 race 차단용.
  const [modalRepricePending, setModalRepricePending] = useState(false)
  const salesEditLinesRef = useRef(salesEditLines)
  salesEditLinesRef.current = salesEditLines
  const purchaseEditLinesRef = useRef(purchaseEditLines)
  purchaseEditLinesRef.current = purchaseEditLines
  const salesPartnerIdRef = useRef(salesPartnerId)
  salesPartnerIdRef.current = salesPartnerId
  const purchasePartnerIdRef = useRef(purchasePartnerId)
  purchasePartnerIdRef.current = purchasePartnerId
  // 편집 세션 종료(두 폼 모두 닫힘) 시 재조회 강조 초기화 — 다음 세션에 이전 강조가 잔존하지 않도록.
  useEffect(() => {
    if (!salesEditOpen && !purchaseEditOpen) {
      setRepriceChangedLineIds(new Set())
      setRepriceOutcomeByLineId(new Map())
      setModalRepricePending(false)
    }
  }, [salesEditOpen, purchaseEditOpen])

  const detailQuery = useQuery({
    queryKey: ['slip', id],
    queryFn: () => getSlip(id),
    enabled: !!id,
  })
  const { refetch: refetchDetail } = detailQuery
  // presence(보는 사람) — detailQuery 성공(조회권한+존재) 이후에만 join.
  // enabled 가 !!id 뿐이면 로딩/에러(404/403) 상태에서도 join+heartbeat 유지되어
  // 본인은 화면서 못 보는데 동료 목록엔 "보는 중"으로 잡힘(리뷰 라운드1 FE HIGH/BE LOW).
  const presenceEntries = usePresence({ entityId: id, enabled: !!id && !!detailQuery.data })

  // PR-H2: audit log 백필 — useQuery cache 키 ['slipAuditLogs', id]
  // SSE "slip:edit" event 수신 시 함께 invalidate.
  const auditLogsQuery = useQuery({
    queryKey: ['slipAuditLogs', id],
    queryFn: () => listAuditLogs(id),
    enabled: !!id,
  })

  const redlineQuery = useQuery({
    queryKey: ['slipRedline', id],
    queryFn: () => getRedline(id),
    enabled: !!id,
  })

  const redlineByField = useMemo(() => {
    const map = new Map<string, SlipFieldRedline>()
    if (redlineQuery.data?.anchored) {
      for (const field of redlineQuery.data.fields) {
        if (field.layers.length >= 2) {
          map.set(field.fieldPath, field)
        }
      }
    }
    return map
  }, [redlineQuery.data])

  const renderRedlineCell = (
    fieldPath: string,
    fallback: ReactNode,
    format?: (value: string) => string,
  ) => {
    const field = redlineByField.get(fieldPath)
    if (!field) return fallback
    return <RedlineCell layers={field.layers} format={format} />
  }

  // Phase 2.6d: 전표 id 변경 시 재고조회 체크 상태 초기화 (P1-1)
  useEffect(() => {
    setCheckedLineIds(new Set())
  }, [id])

  // PR-H1+PR-H2+PR-H3: SSE 구독 — 진입 시 1회, unmount 시 abort.
  // 이벤트 수신 시 슬립 본체/코멘트/audit-logs 모두 invalidate.
  useEffect(() => {
    if (!id) return
    const ctrl = SlipRealtimeClient.subscribe(id, (evt) => {
      // SSE 이벤트 수신 → 전표/코멘트/audit cache 무효화 (작은 입자 — 단순 invalidate 전략)
      void queryClient.invalidateQueries({ queryKey: ['slipComments', id] })
      // 전표 본체 변경 (status 등) 도 가능 → 함께 무효화
      void queryClient.invalidateQueries({ queryKey: ['slip', id] })
      // PR-H2: slip:edit event → audit-logs 재조회 (수정 횟수 + overlay 갱신)
      if (evt.event === 'slip:edit' || evt.event === 'message') {
        void queryClient.invalidateQueries({ queryKey: ['slipAuditLogs', id] })
        void queryClient.invalidateQueries({ queryKey: ['slipRedline', id] })
      }
      // Phase 2.1 Task 6: slip:restored / slip:edit / slip:reverted → 버전이력 재조회.
      // (전표 본체 ['slip', id] 는 위에서 이미 무효화 — 여기서는 버전이력만 추가)
      if (
        evt.event === 'slip:restored'
        || evt.event === 'slip:reverted'
        || evt.event === 'slip:edit'
        || evt.event === 'message'
      ) {
        void queryClient.invalidateQueries({ queryKey: ['slipRevisions', id] })
        void queryClient.invalidateQueries({ queryKey: ['slipRedline', id] })
      }
      // PR-H3: 수정/삭제 요청 결정 SSE — 작성자에게 toast + latestEditRequest 갱신.
      if (evt.event === 'slip:edit-request:decided') {
        const payload = evt.data as Partial<SlipEditRequest> | null
        if (payload && (payload.status === 'APPROVED' || payload.status === 'REJECTED')) {
          setLatestEditRequest((prev) => {
            // 본인 요청만 갱신 — id 일치하거나 prev 가 없을 때 (BE broadcast 모드 호환)
            if (!prev || (payload.id && prev.id === payload.id)) {
              return { ...(prev ?? ({} as SlipEditRequest)), ...payload } as SlipEditRequest
            }
            return prev
          })
          const typeLabel
            = payload.type === 'DELETE' ? '삭제' : '수정'
          if (payload.status === 'APPROVED') {
            setDecisionToast({
              kind: 'success',
              text: `${typeLabel} 요청이 수락되었습니다.${
                payload.decidedByName ? ` (담당: ${payload.decidedByName})` : ''
              }`,
            })
          } else {
            setDecisionToast({
              kind: 'danger',
              text: `${typeLabel} 요청이 거절되었습니다.${
                payload.decisionReason ? ` 사유: ${payload.decisionReason}` : ''
              }`,
            })
          }
        }
      }
      // PR-H3: 본인 요청 created SSE (BE 가 발행 시) — latestEditRequest 동기화.
      if (evt.event === 'slip:edit-request:created') {
        const payload = evt.data as Partial<SlipEditRequest> | null
        if (payload && payload.slipId === id) {
          setLatestEditRequest(payload as SlipEditRequest)
        }
      }
    })
    return () => {
      ctrl.abort()
    }
  }, [id, queryClient])

  // PR-H3: CONFIRMED 단계 수정/삭제 요청 mutation. 성공 시 dialog 닫기 + latestEditRequest 갱신.
  const editRequestMutation = useMutation({
    mutationFn: (vars: { type: SlipEditRequestType; reason: string }) =>
      createSlipEditRequest(id, { type: vars.type, reason: vars.reason }),
    onSuccess: (created) => {
      setEditRequestDialogType(null)
      setLatestEditRequest(created)
      // BE 가 본 요청 결정 시 SSE slip:edit-request:decided 발행 → SlipDetail 의 status 도 변경 가능.
      // 즉시 detail/list cache 도 한번 invalidate 해 둠 (정합성 안전망).
      void queryClient.invalidateQueries({ queryKey: ['slip', id] })
    },
  })

  // Slice A: AppHeader 동적 화면명 — slipNo bracket meta (Designer wireframes.md § 1.3)
  usePageTitle(
    isOutbound ? '판매전표 상세' : '입고전표 상세',
    detailQuery.data?.slipNo,
  )

  const transitionMutation = useMutation({
    mutationFn: (vars: { action: SlipTransitionAction; reason?: string }) =>
      transitionSlip(id, vars.action, vars.reason ? { reason: vars.reason } : undefined),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['slip', id] })
      void queryClient.invalidateQueries({ queryKey: ['slips'] })
      // S2d-1 NB6: 임계 전이(send/inspect)가 redline anchor 를 세팅하므로 redline 도 갱신한다.
      void queryClient.invalidateQueries({ queryKey: ['slipRedline', id] })
      setRejectReason('')
    },
  })

  /**
   * SP-08-6-2: 매출 전표 direct PUT 수정 mutation.
   * 성공 → modal 닫기 + cache invalidate (OUTBOUND query 포함).
   * 409  → 낙관적 잠금 충돌 배너 (salesIsConflict).
   * 422  → 라인 입력값 오류 배너.
   */
  const salesUpdateMutation = useMutation({
    mutationFn: (body: Parameters<typeof updateSalesSlip>[1]) => updateSalesSlip(id, body),
    onSuccess: async (updated) => {
      setSalesConflictMessage(null)
      setSalesIsConflict(false)
      setSalesReloadSuccessMessage(null)
      setRepriceChangedLineIds(new Set())
      setSalesEditOpen(false)
      queryClient.setQueryData(['slip', id], updated)
      await queryClient.invalidateQueries({ queryKey: ['slipAuditLogs', id] })
      await queryClient.invalidateQueries({ queryKey: ['slips'] })
      await queryClient.invalidateQueries({ queryKey: ['slips', 'query', 'OUTBOUND'] })
      // S2d-1 NB6: 매출 PUT 수정(헤더 변경 포함)이 redline 갱신 트리거.
      await queryClient.invalidateQueries({ queryKey: ['slipRedline', id] })
    },
    onError: (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setSalesIsConflict(true)
        setSalesConflictMessage('다른 사용자가 먼저 수정했습니다. 최신 내용 불러오기 후 다시 저장해 주세요.')
        return
      }
      if (axios.isAxiosError(error) && error.response?.status === 422) {
        setSalesIsConflict(false)
        setSalesConflictMessage('매출 라인 입력값이 올바르지 않습니다. 수량과 단가를 확인해 주세요.')
        return
      }
      // R8-QA-12: coedit 중 동료가 라인을 서버측 삭제하면, 내 화면의 lineId 가 서버 활성 라인과
      // 어긋나 저장이 400(INVALID_INPUT — validateLineIds/계약/계보 게이트)으로 거부된다. 이건
      // 입력값 오류가 아니라 문서 구조 불일치이므로, 막다른 "입력값 확인" 대신 충돌 배너 +
      // "최신 내용 불러오기" 복구 경로를 준다(409 UX 와 동일). 재조회+재시드가 어긋난 lineId 를
      // 서버 기준으로 정합화한다. (D-R8-11 로 행삭제 잠금을 제거한 뒤의 경합 안전망.)
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        setSalesIsConflict(true)
        setSalesConflictMessage('동료가 라인을 변경했거나 화면이 최신이 아닙니다. 최신 내용 불러오기 후 다시 저장해 주세요.')
        return
      }
      setSalesIsConflict(false)
      setSalesConflictMessage('매출 전표 수정에 실패했습니다. 입력값을 확인해 주세요.')
    },
  })

  const purchaseUpdateMutation = useMutation({
    mutationFn: (body: Parameters<typeof updatePurchaseSlip>[1]) => updatePurchaseSlip(id, body),
    onSuccess: async (updated) => {
      setPurchaseConflictMessage(null)
      setPurchaseIsConflict(false)
      setPurchaseReloadSuccessMessage(null)
      setRepriceChangedLineIds(new Set())
      setPurchaseEditOpen(false)
      queryClient.setQueryData(['slip', id], updated)
      await queryClient.invalidateQueries({ queryKey: ['slipAuditLogs', id] })
      await queryClient.invalidateQueries({ queryKey: ['slips'] })
      await queryClient.invalidateQueries({ queryKey: ['slips', 'query', 'INBOUND'] })
      // S2d-1 NB6: 매입 PUT 수정(헤더 변경 포함)이 redline 갱신 트리거.
      await queryClient.invalidateQueries({ queryKey: ['slipRedline', id] })
    },
    onError: (error) => {
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setPurchaseIsConflict(true)
        setPurchaseConflictMessage('다른 사용자가 먼저 수정했습니다. 최신 내용 불러오기 후 다시 저장해 주세요.')
        return
      }
      if (axios.isAxiosError(error) && error.response?.status === 422) {
        setPurchaseIsConflict(false)
        setPurchaseConflictMessage('매입 라인 입력값이 올바르지 않습니다. 수량과 단가를 확인해 주세요.')
        return
      }
      // R8-QA-12 미러 — 매출과 동일 계약(문서 구조 불일치 400 → 충돌 안내 + 최신 불러오기).
      if (axios.isAxiosError(error) && error.response?.status === 400) {
        setPurchaseIsConflict(true)
        setPurchaseConflictMessage('동료가 라인을 변경했거나 화면이 최신이 아닙니다. 최신 내용 불러오기 후 다시 저장해 주세요.')
        return
      }
      setPurchaseIsConflict(false)
      setPurchaseConflictMessage('매입 전표 수정에 실패했습니다. 입력값을 확인해 주세요.')
    },
  })

  /**
   * SP-08-5-3: 매입 전표 soft delete mutation.
   * 성공 → 매입 목록(/purchases)으로 redirect + list cache invalidate.
   * 409  → 낙관적 잠금 충돌 배너 (purchaseDeleteConflict).
   * 422  → 검수 완료 전표 삭제 불가 alert.
   * 403  → 권한 없음 alert.
   */
  const deletePurchaseSlipMutation = useMutation({
    mutationFn: () => deletePurchaseSlip(id, slip.updatedAt),
    onSuccess: () => {
      setPurchaseDeleteOpen(false)
      setPurchaseDeleteConflict(false)
      queryClient.setQueryData(['slip', id], undefined)
      void queryClient.invalidateQueries({ queryKey: ['slips', 'query', 'INBOUND'] })
      void queryClient.invalidateQueries({ queryKey: ['slips'] })
      navigate('/purchases', {
        state: { toast: '전표가 삭제되었습니다' },
      })
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status
        if (status === 409) {
          setPurchaseDeleteConflict(true)
          return
        }
        if (status === 422) {
          setPurchaseDeleteInspectionAlert('검수 완료된 매입 전표는 삭제할 수 없습니다')
          return
        }
        if (status === 403) {
          alert('매입 전표 삭제 권한이 없습니다')
          setPurchaseDeleteOpen(false)
          return
        }
      }
      alert('매입 전표 삭제에 실패했습니다.')
    },
  })

  /**
   * SP-08-6-3: 매출 전표 soft delete mutation.
   * 성공 → 매출 목록(/sales)으로 redirect + list cache invalidate.
   * 409  → 낙관적 잠금 충돌 배너 (salesDeleteConflict).
   * 422  → 출고 완료 전표 삭제 불가 alert.
   * 403  → 권한 없음 alert.
   */
  const deleteSalesSlipMutation = useMutation({
    mutationFn: () => deleteSalesSlip(id, slip.updatedAt),
    onSuccess: () => {
      setSalesDeleteOpen(false)
      setSalesDeleteConflict(false)
      setSalesDeleteShippedAlert(null)
      setSalesDeleteForbiddenAlert(null)
      setSalesDeleteErrorAlert(null)
      queryClient.setQueryData(['slip', id], undefined)
      void queryClient.invalidateQueries({ queryKey: ['slips', 'query', 'OUTBOUND'] })
      void queryClient.invalidateQueries({ queryKey: ['slips'] })
      navigate('/sales', {
        state: { toast: `전표가 삭제되었습니다. (${slip.slipNo})` },
      })
    },
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status
        if (status === 409) {
          setSalesDeleteConflict(true)
          return
        }
        if (status === 422) {
          setSalesDeleteShippedAlert('출고 완료된 매출 전표는 삭제할 수 없습니다')
          return
        }
        if (status === 403) {
          setSalesDeleteForbiddenAlert('매출 전표 삭제 권한이 없습니다.')
          return
        }
      }
      setSalesDeleteErrorAlert('매출 전표 삭제에 실패했습니다.')
    },
  })

  /** 라인 제거 (BE: DELETE /slips/{id}/lines/{lineId}). DRAFT/SAVED 만 허용. */
  const removeLineMutation = useMutation({
    mutationFn: (lineId: string) => removeLine(id, lineId),
    onSuccess: () => {
      setSelectedLineId(null)
      void queryClient.invalidateQueries({ queryKey: ['slip', id] })
    },
  })

  /** link-dispatch-slice: 기사 정보 부분 갱신 (PATCH /slips/{id}/driver). DRAFT/SAVED 만 허용. */
  const driverMutation = useMutation({
    mutationFn: () =>
      updateSlipDriver(id, {
        driverName: draftDriverName.trim() || null,
        driverPhone: draftDriverPhone || null,
      }),
    onSuccess: () => {
      setEditingDriver(false)
      void queryClient.invalidateQueries({ queryKey: ['slip', id] })
      void queryClient.invalidateQueries({ queryKey: ['delivery-batches'] })
    },
  })

  /**
   * signature-slice-C 신규: 서명 무효화 (DELETE /slips/{id}/signature?reason=...).
   * MASTER only — BE 가 audit 로그 강제 기록. 200 응답 시 SlipDetail 재조회로 signature* 필드 null 화.
   */
  const invalidateSignatureMutation = useMutation({
    mutationFn: (reason: string) => invalidateSignature(id, reason),
    onSuccess: () => {
      setInvalidateOpen(false)
      setInvalidateReason('')
      void queryClient.invalidateQueries({ queryKey: ['slip', id] })
      void queryClient.invalidateQueries({ queryKey: ['slips'] })
    },
  })

  /**
   * 전표 복사 (DRAFT 신규 생성) — R6-H2: BE POST /slips/{id}/duplicate 서버 복사.
   * FE 평면 재-POST 는 세트 계보 소실 + 구성품 배분가 가격기억 각인 결함이 있어 제거.
   * 성공 시 신규 전표 상세로 이동.
   */
  const duplicateMutation = useMutation({
    mutationFn: () => {
      if (!detailQuery.data) throw new Error('전표 데이터 없음')
      return duplicateSlip(detailQuery.data.id)
    },
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: ['slips'] })
      const target = created.slipType === 'OUTBOUND' ? 'sales' : 'purchases'
      navigate(`/${target}/${created.id}`)
    },
    onError: (error) => {
      // BE duplicate 계약 에러 3종 — 403 생성 권한 / 404 원본 미존재·삭제 / 409 당일 마감 초과.
      const { status, data } = getApiErrorInfo(error)
      if (status === 403) {
        alert('전표를 복사(생성)할 권한이 없습니다.')
        return
      }
      if (status === 404) {
        alert('원본 전표를 찾을 수 없습니다. 삭제되었거나 정리된 전표일 수 있습니다.')
        return
      }
      if (status === 409) {
        alert(data?.message ?? '오늘 출고전표 마감 시간이 지나 복사할 수 없습니다.')
        return
      }
      alert(data?.message ?? '전표 복사에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    },
  })

  const syncPurchaseFormFromData = useCallback((data: SlipDetail) => {
    setPurchasePartnerId(data.partnerId ?? '')
    setPurchasePartnerName(data.partnerName ?? '')
    setPurchasePartnerCode(data.partnerCode ?? '')
    setPurchaseBusinessNumber(data.businessNumber ?? '')
    setPurchaseMemo(data.memo ?? '')
    setPurchaseDeliveryAddress(data.deliveryAddress ?? '')
    setPurchaseProjectName(data.projectName ?? '')
    setPurchaseRecipientPhone(data.recipientPhone ?? '')
    setPurchasePaymentDueDate(data.paymentDueDate ?? '')
    setPurchaseEditLines(toPurchaseEditLines(data))
    setPurchaseUpdatedAt(data.updatedAt)
  }, [setPurchaseUpdatedAt])

  const handlePurchaseConflictReload = useCallback(async () => {
    const result = await refetchDetail()
    if (result.data) {
      syncPurchaseFormFromData(result.data)
      syncSlipCoeditProvider(slipFormCoeditProvider, result.data, mode)
      setPurchaseConflictMessage(null)
      setPurchaseIsConflict(false)
      setPurchaseReloadSuccessMessage('최신 내용으로 업데이트됐습니다. 다시 저장해 주세요.')
      if (purchaseReloadSuccessTimerRef.current) {
        clearTimeout(purchaseReloadSuccessTimerRef.current)
      }
      purchaseReloadSuccessTimerRef.current = setTimeout(() => {
        setPurchaseReloadSuccessMessage(null)
        purchaseReloadSuccessTimerRef.current = null
      }, 3000)
    }
  }, [mode, refetchDetail, slipFormCoeditProvider, syncPurchaseFormFromData])

  useEffect(() => {
    if (!detailQuery.data || purchaseEditOpen) return
    syncPurchaseFormFromData(detailQuery.data)
  }, [detailQuery.data, purchaseEditOpen, syncPurchaseFormFromData])

  useEffect(() => {
    return () => {
      if (purchaseReloadSuccessTimerRef.current) {
        clearTimeout(purchaseReloadSuccessTimerRef.current)
      }
    }
  }, [])

  // SP-08-6-2: 매출 수정 폼 동기화 + 충돌 reload 핸들러
  const syncSalesFormFromData = useCallback((data: SlipDetail) => {
    setSalesPartnerId(data.partnerId ?? '')
    setSalesPartnerName(data.partnerName ?? '')
    setSalesPartnerCode(data.partnerCode ?? '')
    setSalesBusinessNumber(data.businessNumber ?? '')
    setSalesMemo(data.memo ?? '')
    setSalesDeliveryAddress(data.deliveryAddress ?? '')
    setSalesSupervisionAddress(data.supervisionAddress ?? '')
    setSalesProjectName(data.projectName ?? '')
    setSalesRecipientPhone(data.recipientPhone ?? '')
    setSalesPaymentDueDate(data.paymentDueDate ?? '')
    setSalesEditLines(toPurchaseEditLines(data))
    setSalesUpdatedAt(data.updatedAt)
  }, [setSalesUpdatedAt])

  const handleSalesConflictReload = useCallback(async () => {
    const result = await refetchDetail()
    if (result.data) {
      syncSalesFormFromData(result.data)
      syncSlipCoeditProvider(slipFormCoeditProvider, result.data, mode)
      setSalesConflictMessage(null)
      setSalesIsConflict(false)
      setSalesReloadSuccessMessage('최신 내용으로 업데이트됐습니다. 다시 저장해 주세요.')
      if (salesReloadSuccessTimerRef.current) {
        clearTimeout(salesReloadSuccessTimerRef.current)
      }
      salesReloadSuccessTimerRef.current = setTimeout(() => {
        setSalesReloadSuccessMessage(null)
        salesReloadSuccessTimerRef.current = null
      }, 3000)
    }
  }, [mode, refetchDetail, slipFormCoeditProvider, syncSalesFormFromData])

  useEffect(() => {
    if (!detailQuery.data || salesEditOpen) return
    syncSalesFormFromData(detailQuery.data)
  }, [detailQuery.data, salesEditOpen, syncSalesFormFromData])

  useEffect(() => {
    return () => {
      if (salesReloadSuccessTimerRef.current) {
        clearTimeout(salesReloadSuccessTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const slipData = detailQuery.data
    const enabled = !!slipData && (salesEditOpen || purchaseEditOpen)
    if (!id || !enabled || !slipData) {
      setSlipFormCoeditProvider(null)
      setSlipFormCoeditPending(false)
      return undefined
    }

    let disposed = false
    setSlipFormCoeditPending(true)
    let provider: DocCoeditProvider | null = null
    let unsubscribeDoc: (() => void) | null = null

    // 계보/가격기억 귀속의 권위 — 현재 로드된 상세 응답의 라인 id 집합. Y.Doc 직독 lineId 는
    // 이 집합으로 검증해야 클라 랜덤 UUID(구 seed/신규행)가 payload 에 새어 400 이 나지 않는다.
    const knownServerLineIds = toServerLineIdSet(slipData.lines)

    const applyProviderState = (nextProvider: DocCoeditProvider) => {
      if (mode === 'OUTBOUND') {
        // D-R8-7: 상대 피어의 거래처 재선택을 수신 — 이게 없으면 구 partnerId 로 저장한다.
        const nextPartnerId = nextProvider.getHeaderValue('partnerId')
        const partnerChanged = nextPartnerId !== salesPartnerIdRef.current
        salesPartnerIdRef.current = nextPartnerId
        setSalesPartnerId(nextPartnerId)
        setSalesPartnerName(nextProvider.getHeaderValue('partnerName'))
        setSalesPartnerCode(nextProvider.getHeaderValue('partnerCode'))
        setSalesBusinessNumber(nextProvider.getHeaderValue('businessNumber'))
        setSalesMemo(nextProvider.getHeaderValue('memo'))
        setSalesDeliveryAddress(nextProvider.getHeaderValue('deliveryAddress'))
        setSalesSupervisionAddress(nextProvider.getHeaderValue('supervisionAddress'))
        setSalesProjectName(nextProvider.getHeaderValue('projectName'))
        setSalesRecipientPhone(nextProvider.getHeaderValue('recipientPhone'))
        setSalesPaymentDueDate(nextProvider.getHeaderValue('paymentDueDate'))
        setSalesEditLines((prev) => coeditLinesToEditLines(nextProvider, prev, knownServerLineIds))
        if (partnerChanged && nextPartnerId) {
          // 원격 거래처 변경도 로컬 선택과 동일하게 최신 거래처 단가를 재조회한다.
          void repriceEditLinesForPartner(nextPartnerId, nextProvider)
        }
        return
      }
      const nextPartnerId = nextProvider.getHeaderValue('partnerId')
      const partnerChanged = nextPartnerId !== purchasePartnerIdRef.current
      purchasePartnerIdRef.current = nextPartnerId
      setPurchasePartnerId(nextPartnerId)
      setPurchasePartnerName(nextProvider.getHeaderValue('partnerName'))
      setPurchasePartnerCode(nextProvider.getHeaderValue('partnerCode'))
      setPurchaseBusinessNumber(nextProvider.getHeaderValue('businessNumber'))
      setPurchaseMemo(nextProvider.getHeaderValue('memo'))
      setPurchaseDeliveryAddress(nextProvider.getHeaderValue('deliveryAddress'))
      setPurchaseProjectName(nextProvider.getHeaderValue('projectName'))
      setPurchaseRecipientPhone(nextProvider.getHeaderValue('recipientPhone'))
      setPurchasePaymentDueDate(nextProvider.getHeaderValue('paymentDueDate'))
      setPurchaseEditLines((prev) => coeditLinesToEditLines(nextProvider, prev, knownServerLineIds))
      if (partnerChanged && nextPartnerId) {
        void repriceEditLinesForPartner(nextPartnerId, nextProvider)
      }
    }

    void createDocCoeditProvider({
      documentId: id,
      basePath: slipCollabBasePath,
      headerTextFields: SLIP_HEADER_TEXT_FIELDS,
    }).then((nextProvider) => {
      if (disposed) {
        nextProvider.destroy()
        return
      }
      provider = nextProvider
      // 재시드 게이트 — 견적(EstimateFormPage)과 정렬(전표는 종전 isEmpty() 만 봐 비대칭이었다).
      // ⚠️ 두 경로를 분리한다 — 예전엔 stale 도 full-seed 로 처리해 원격 헤더/셀 편집을 파괴했다
      // (R8 mock 게이트 회귀: 원격 memo/수량 소실). 계보 복구의 본래 의도는 lineId 부착뿐이다.
      if (nextProvider.isEmpty()) {
        // 최초 진입(빈 Y.Doc) — 서버 상세로 헤더+아이템 전체를 시드한다.
        seedSlipCoeditProvider(nextProvider, slipData, mode)
      } else if (coeditLineIdsAreStale(nextProvider, knownServerLineIds)) {
        // lineId seed 이전 구 스냅샷 — 원격 편집(memo/수량 등)은 보존하고 아이템 lineId 만
        // 서버 기준으로 in-place 복구한다(reseedCoeditLineIds). 미복구 시 전 라인이 신규로
        // 강등돼 계보가 소실되거나 계보 보유 문서에서 BE requireLineIdContract 가 400 을 낸다.
        reseedCoeditLineIds(nextProvider, slipData.lines.map((line) => line.id ?? ''))
      }
      applyProviderState(nextProvider)
      unsubscribeDoc = nextProvider.subscribeDoc(() => applyProviderState(nextProvider))
      setSlipFormCoeditProvider(nextProvider)
      setSlipFormCoeditPending(false)
    }).catch(() => {
      // 로드 실패 — provider 는 null 유지하되 pending 해제 → 입력/저장이 비-coedit 평문 모드로 복귀(영구잠금 방지).
      if (!disposed) {
        setSlipFormCoeditProvider(null)
        setSlipFormCoeditPending(false)
      }
    })

    return () => {
      disposed = true
      unsubscribeDoc?.()
      provider?.destroy()
      setSlipFormCoeditProvider(null)
      setSlipFormCoeditPending(false)
    }
  }, [detailQuery.data, id, mode, purchaseEditOpen, salesEditOpen, slipCollabBasePath])

  if (!id) return null

  if (detailQuery.isLoading) {
    return (
      <div className="loading-fallback" role="status" aria-label="불러오는 중">
        <Spinner size="md" label="불러오는 중" />
      </div>
    )
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <div className="error-banner" role="alert">
        전표를 불러오지 못했습니다.
      </div>
    )
  }

  const slip = detailQuery.data
  const possibleActions = actionsForStatus(slip.status, mode)
  const canRejectSlip = possibleActions.includes('reject')
    && canAccess('slip.reject', 'update')
  const canCancelSlip = possibleActions.includes('cancel')
    && canAccess(slipActionPageCode('cancel').pageCode, 'update')
  const canDirectEditPurchase = mode === 'INBOUND'
    && canAccess('purchases.slip.edit', 'update')
    && (slip.status === 'SAVED' || slip.status === 'DRAFT')

  const canDirectDeletePurchase = mode === 'INBOUND'
    && canAccess('purchases.slip.delete', 'delete')
    && (slip.status === 'SAVED' || slip.status === 'DRAFT')

  /**
   * SP-08-6-2: 매출 전표 직접 수정 권한 판단.
   * - mode = OUTBOUND (출고전표)
   * - canAccess('sales.slip.edit', 'update') — 동적 권한(MASTER 자동 전권)
   * - status = SAVED 또는 DRAFT
   */
  const canDirectEditSales = mode === 'OUTBOUND'
    && canAccess('sales.slip.edit', 'update')
    && (slip.status === 'SAVED' || slip.status === 'DRAFT')

  /**
   * SP-08-6-3: 매출 전표 soft delete 권한 판단.
   * - mode = OUTBOUND (출고전표)
   * - canAccess('sales.slip.edit', 'delete') — 동적 권한(MASTER 자동 전권)
   * - status = SAVED 또는 DRAFT
   */
  const canDirectDeleteSales = mode === 'OUTBOUND'
    && canAccess('sales.slip.edit', 'delete')
    && (slip.status === 'SAVED' || slip.status === 'DRAFT')

  /**
   * PR-H3: 창고/관리자 수락이 필요한 단계 (LOCKED_REQUIRES_APPROVAL).
   * BE {@code SlipEditRequestService.LOCKED_REQUIRES_APPROVAL} 와 정확히 일치 —
   * CONFIRMED/ACCEPTED/PROCESSING. 삭제 요청 UI 노출 + 요청 후 창고 수락 필요.
   * 수정은 §7 협업 수정완료가 완전 대체하므로 edit-request 진입을 노출하지 않는다.
   * 사용자 명시 정책 정합 (QA Major 회귀 가드).
   */
  const isApprovalRequired
    = slip.status === 'CONFIRMED'
    || slip.status === 'ACCEPTED'
    || slip.status === 'PROCESSING'

  /**
   * PR-H3: 변경 자체를 차단해야 하는 단계 (FULLY_LOCKED + 종료 단계).
   * BE {@code SlipEditRequestService.FULLY_LOCKED} (INSPECTING/SHIPPING/DELIVERED) 정합.
   * COMPLETED 는 검수 직후 ship 대기 단계로 본 FE 에서 동일 차단 처리 (기존 정책 보존).
   * 사용자에게 "현재 변경 불가" 안내 + 모든 액션 disabled.
   */
  const isPhysicalTerminal
    = slip.status === 'SHIPPING'
    || slip.status === 'DELIVERED'
    || slip.status === 'CANCELED'
    || slip.status === 'REJECTED'

  const isLocked = isPhysicalTerminal

  const canCollabEdit = canAccess('slip.audit-overlay', 'update') && !isPhysicalTerminal

  const collabEditValues: Record<string, string | null | undefined> = {
    memo: slip.memo,
    shippingAddress: slip.shippingAddress,
    inspectionAddress: slip.inspectionAddress,
    receiverPhone: slip.receiverPhone,
    customerTel: slip.customerTel ?? slip.contactPhone,
    customerAddress: slip.customerAddress,
    customerRepresentative: slip.customerRepresentative,
    paymentDueLabel: slip.paymentDueLabel,
    discountInfo: slip.discountInfo,
    collectTerm: slip.collectTerm,
    agreeTerm: slip.agreeTerm,
  }

  /**
   * PR-H3: 삭제 요청 생성 권한.
   * BE `POST /api/v1/slips/{slipId}/edit-request` 는
   * `@RequirePermission(page="slip.edit-requests", action=CREATE)` 이고,
   * V36 seed 는 MASTER/MANAGER/SALES can_edit=TRUE 로 기존 작성자 role 목록과 정합한다.
   * 수정 요청은 §7 수정완료로 대체되어 화면에서 제거한다.
   */
  const canRequestDelete = canAccess('slip.edit-requests', 'create')

  /**
   * PR-H3: 현재 PENDING 본인 요청이 있는지.
   * 두 번째 요청은 BE 가 막거나 사용자에게 "이미 요청 진행 중" 안내.
   */
  const hasPendingRequest = !!latestEditRequest
    && latestEditRequest.status === 'PENDING'

  const errorMessage = (() => {
    if (!transitionMutation.isError) return null
    const err = transitionMutation.error
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as { message?: string } | undefined
      return data?.message ?? '전이에 실패했습니다.'
    }
    return '알 수 없는 오류'
  })()

  const handleTransition = (action: SlipTransitionAction) => {
    if (transitionMutation.isPending) return
    if (shouldBlockPartnerlessSend(slip, action)) {
      alert(PARTNER_REQUIRED_SEND_MESSAGE)
      return
    }
    if (!canAccess(slipActionPageCode(action).pageCode, 'update')) {
      alert('해당 전표 상태를 변경할 권한이 없습니다.')
      return
    }
    if (action === 'reject') {
      const reason = rejectReason.trim()
      if (!reason) {
        alert('반려 사유를 입력하세요.')
        return
      }
      transitionMutation.mutate({ action, reason })
    } else {
      transitionMutation.mutate({ action })
    }
  }

  /** 라인 편집은 DRAFT/SAVED 만 허용 (BE 가드와 동일). */
  const linesEditable = slip.status === 'DRAFT' || slip.status === 'SAVED'
  const selectedLine = selectedLineId
    ? slip.lines.find((l) => l.id === selectedLineId) ?? null
    : null

  /**
   * Phase 2.6d: 체크박스 다중선택 토글.
   * productId 보유 라인만 선택 가능.
   */
  const handleLineCheckToggle = (lineId: string) => {
    setCheckedLineIds((prev) => {
      const next = new Set(prev)
      if (next.has(lineId)) {
        next.delete(lineId)
      } else {
        next.add(lineId)
      }
      return next
    })
  }

  /**
   * Phase 2.6d: 선택 품목 재고조회 모달 열기.
   * 선택된 라인의 {productId, modelName, productName} 배열로 모달 open.
   *
   * <p>세트(BUNDLE) 재고 가드 불필요 — 5d3bb017/Round C #23 판정: 신규 전표는
   * {@code addSlipLinesExpanded} 로 BUNDLE 을 구성품 라인으로 "전개 저장"하므로 전표 라인에
   * BUNDLE 부모(productType=BUNDLE)가 남지 않는다(이미 구성품 단위 재고조회). 따라서 SlipFormPage·
   * SalesPartnerOrderDetailPage 와 달리 여기서는 BUNDLE 제외 필터가 필요 없다(가짜 가드 금지).
   */
  const inventoryLookupLines: StockBalanceLookupLine[] = slip.lines
    .filter((l) => checkedLineIds.has(l.id) && l.productId)
    .map((l) => ({
      productId: l.productId,
      modelName: l.modelName ?? '',
      productName: l.productName ?? '',
    }))

  /** 행 삭제 — 경고창 후 BE DELETE. */
  const handleRemoveLine = () => {
    if (!selectedLine) return
    if (!linesEditable) {
      alert(`라인 편집은 작성 중/저장 단계에서만 가능합니다. (현재: ${slipStatusLabel(slip.status)})`)
      return
    }
    if (!window.confirm(`[${selectedLine.modelName ?? '-'}] 라인을 삭제하시겠습니까?`)) {
      return
    }
    removeLineMutation.mutate(selectedLine.id)
  }

  /** 첫 가능한 정상 transition (reject/cancel 제외) — 하단 "완료" 버튼이 호출. */
  const nextPrimaryAction
    = possibleActions.find((a) => a !== 'reject' && a !== 'cancel') ?? null

  /** 하단 "전표 복사" — 사용자 확인 후 신규 DRAFT 생성. */
  const handleDuplicate = () => {
    if (!window.confirm('현재 전표를 복사하여 새 작성중 전표를 생성합니다. 진행할까요?')) {
      return
    }
    duplicateMutation.mutate()
  }

  /** 하단 "삭제" — 경고창 후 cancel transition (BE soft-delete). */
  const handleDeleteSlip = () => {
    if (!possibleActions.includes('cancel')) {
      alert(`현재 단계(${slipStatusLabel(slip.status)})에서는 삭제(취소)할 수 없습니다.`)
      return
    }
    if (!canCancelSlip) {
      alert('전표를 삭제(취소)할 권한이 없습니다.')
      return
    }
    if (transitionMutation.isPending) return
    if (!window.confirm('정말로 이 전표를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없으며, 전표가 취소 상태로 변경됩니다.')) {
      return
    }
    transitionMutation.mutate({ action: 'cancel' })
  }

  /** 하단 "완료" — 다음 정상 단계 transition 실행. */
  const handleAdvanceStage = () => {
    if (!nextPrimaryAction) return
    if (shouldBlockPartnerlessSend(slip, nextPrimaryAction)) {
      alert(PARTNER_REQUIRED_SEND_MESSAGE)
      return
    }
    transitionMutation.mutate({ action: nextPrimaryAction })
  }

  // 분기 사유 (REJECTED 시 BE 가 응답에 reason 을 별도 필드로 줄 수 있음 — Slice A 는 memo 사용)
  const branchReason
    = slip.status === 'REJECTED' || slip.status === 'CANCELED'
      ? slip.memo ?? undefined
      : undefined

  /**
   * PR-H2: audit logs 를 필드별로 group 후 AuditOverlay 의 history 형식으로 매핑.
   * - field 키 → AuditLogEntry[] (revisionNo 내림차순 정렬은 AuditOverlay 가 담당)
   * - actorId 는 색상 hash 입력 전용, 화면 노출 X.
   */
  const auditLogs: SlipAuditLogEntry[] = Array.isArray(auditLogsQuery.data) ? auditLogsQuery.data : []
  const auditByField: Record<string, AuditLogEntry[]> = auditLogs.reduce(
    (acc, log) => {
      const list = acc[log.field] ?? []
      list.push({
        revisionNo: log.revisionNo,
        beforeValue: log.beforeValue,
        actorId: log.actorId,
        actorName: log.actorName,
        changedAt: log.changedAt,
      })
      acc[log.field] = list
      return acc
    },
    {} as Record<string, AuditLogEntry[]>,
  )

  /**
   * PR-H2: 수정 횟수 = distinct revisionNo 개수.
   * BE 가 한 revision 에 여러 필드 변경을 묶어 보낼 수 있으므로 set 으로 dedupe.
   */
  const revisionCount = new Set(auditLogs.map((l) => l.revisionNo)).size

  const mobileSlipTotal = slip.lines.reduce(
    (sum, line) => sum + slipLineAmounts(line).totalIncl,
    0,
  )
  const mobilePrimaryAction = nextPrimaryAction
    ? {
        label: ACTION_LABEL[nextPrimaryAction],
        onClick: () => handleTransition(nextPrimaryAction),
        disabled:
          transitionMutation.isPending
          || !canAccess(slipActionPageCode(nextPrimaryAction).pageCode, 'update'),
      }
    : null
  const handleMobilePrint = () => {
    if (isOutbound) {
      navigate(`/sales/${id}/print/statement`)
      return
    }
    navigate(`/purchases/${id}/print/purchase`)
  }

  /**
   * D-R8-7: 전표 수정의 거래처 선택 — 자유입력을 대체하는 단일 경로.
   *
   * <p>거래처 4필드(partnerId/명/코드/사업자번호)를 <b>CRDT 트랜잭션 1회</b>로 원자 전파한다.
   * 필드를 따로 쓰면 상대 피어가 중간 상태(새 이름 + 구 UUID)를 관측하는 창이 열린다.
   * partnerCode 는 사업자번호 digits 규약(P0-B) 을 따른다.
   *
   * <p>해제(null)는 지원하지 않는다 — 전표는 생성 시점부터 거래처가 확정돼 있고, BE
   * {@code SlipUpdateRequest.partnerId} 는 null 을 "기존 거래처 보존" 으로 읽는다.
   */
  const handleSlipPartnerSelect = (option: PartnerOption | null) => {
    if (!option) return
    const nextPartnerId = option.id ?? ''
    const nextBizNo = option.bizNo ?? option.partnerCode ?? ''
    const apply = (setId: (v: string) => void, setName: (v: string) => void,
                   setCode: (v: string) => void, setBizNo: (v: string) => void) => {
      setId(nextPartnerId)
      setName(option.name)
      setCode(nextBizNo)
      setBizNo(nextBizNo)
    }
    if (mode === 'OUTBOUND') {
      salesPartnerIdRef.current = nextPartnerId
      apply(setSalesPartnerId, setSalesPartnerName, setSalesPartnerCode, setSalesBusinessNumber)
    } else {
      purchasePartnerIdRef.current = nextPartnerId
      apply(setPurchasePartnerId, setPurchasePartnerName, setPurchasePartnerCode, setPurchaseBusinessNumber)
    }
    const provider = slipFormCoeditProvider
    if (provider) {
      provider.doc.transact(() => {
        provider.setHeaderValue('partnerId', nextPartnerId)
        provider.setHeaderValue('partnerName', option.name)
        provider.setHeaderValue('partnerCode', nextBizNo)
        provider.setHeaderValue('businessNumber', nextBizNo)
      })
    }
    // D-R8-10/R8-QA-11: 거래처 변경 → 새 거래처 기준 단가 재조회 + 배너 + 변경행 강조.
    void repriceEditLinesForPartner(nextPartnerId)
  }

  /**
   * D-R8-10/R8-QA-11: 거래처 변경 시 수정 모달 라인 단가를 새 거래처 기준으로 bulk 재조회한다.
   * 공용 훅(usePartnerPriceRefresh)이 수명주기·조회·해석을 맡고, 여기서는 CRDT 라인 규약으로
   * 후보(lineId)를 뽑아 새 단가를 provider(있으면)/로컬 state(없으면)에 적용하고 변경행을 추적한다.
   *
   * <p><b>miss fallback = 카탈로그 판매가</b> (R8 잔여 1 — R8-QA-11-MISS): 수정 라인은 카탈로그
   * 판매가를 들고 있지 않으므로 lookupProducts(POST /api/products/lookup)로 각 productId 의
   * 판매가를 조회해 후보 catalogFallback 으로 공급한다. 종전(fallback=현재단가)은 miss 시 옛
   * 거래처 협상단가가 그대로 남아 저장 시 새 거래처에 각인됐다(라이브 실증: A 협상 777,000 → B
   * miss → B 기억 854,700). 폼(SlipFormPage 의 catalogUnitPrice 스냅샷)과 동일 처방의 모달판이다.
   * 카탈로그 미확보 라인(품목 삭제/조회 실패/판매가 null)은 현재값을 비우고 UNAVAILABLE 마커와
   * 저장 차단을 적용한다. 값을 지어내지 않으면서 옛 거래처 단가의 조용한 각인도 허용하지 않는다.
   *
   * <p><b>VAT 도메인 변환</b> (R8 잔여 2 — 드리프트): 기억·카탈로그는 VAT <b>포함</b>, 수정 필드는
   * VAT <b>제외</b> 공급단가다(utils/vatPrice.ts 에 BE 실증 기록). 후보는 포함 도메인으로 승격해
   * 훅에 넘기고(비교 도메인 통일), 적용 시 {@code vatExclusiveOf}(BE ÷1.1 정수 절사 미러)로
   * 필드 도메인 변환한다. 미변환 시 기억 500,000 이 필드에 그대로 실려 저장 ×1.1 = 550,000 으로
   * 거래처 변경마다 ~10% 복리 팽창했다(라이브 실증). 라인별 세구분 분기는 두지 않는다 — BE
   * SlipLine 에 세구분 필드가 없고 수정 저장 각인이 전 라인 균일 ×1.1 이므로 균일 ÷1.1 이 유일한
   * 정합 미러다.
   *
   * <p><b>세트 구성품 제외</b> (R8 재fix 회귀 교정): {@link bundleComponentLineIds} 라인
   * (parentSetModel 비공백 — head 포함)은 후보에서 뺀다. 구성품은 수정 저장의 가격기억 각인
   * 대상이 아니고(BE isBundleComponent 제외 + 수정 경로 BUNDLE_SET 재각인 부재), 배분가는 세트
   * 전개가 정한 값이라 거래처 변경으로 재가격되면 안 된다(라이브 실증: 구성품 88,000→80,000
   * −9.09% 변형 회귀). 평면(단품) 라인만 재가격한다 — 생성 폼의 BUNDLE 제품 라인 재가격
   * (SOURCE_BUNDLE_SET 대상)은 폼 경로 그대로이며 수정 화면에는 그 라인 유형이 존재하지 않는다.
   *
   * <p><b>in-flight 편집 가드</b>: 조회 대기 중 사용자가(또는 원격 피어가) 그 라인 단가를 직접
   * 편집했으면 적용 시점 재검증으로 건너뛴다 — 폼의 priceSource=USER 재분류 보호와 동일 의도.
   */
  const repriceEditLinesForPartner = async (
    partnerId: string,
    providerOverride?: DocCoeditProvider | null,
  ) => {
    const seq = ++modalRepriceSeqRef.current
    if (!partnerId) {
      partnerReprice.invalidate()
      setRepriceChangedLineIds(new Set())
      setRepriceOutcomeByLineId(new Map())
      setModalRepricePending(false)
      return
    }
    setModalRepricePending(true)
    const activePartnerIdRef = mode === 'OUTBOUND' ? salesPartnerIdRef : purchasePartnerIdRef
    const editLines = mode === 'OUTBOUND' ? salesEditLinesRef.current : purchaseEditLinesRef.current
    const provider = providerOverride ?? slipFormCoeditProvider
    const setEditLines = mode === 'OUTBOUND' ? setSalesEditLines : setPurchaseEditLines
    const editLinesRef = mode === 'OUTBOUND' ? salesEditLinesRef : purchaseEditLinesRef
    // 세트 구성품(lineage 는 서버 상세가 권위) — 재가격 금지 대상.
    const componentLineIds = bundleComponentLineIds(slip.lines)
    // 후보 원천: lineId(적용 키)+productId 보유 + 세트 구성품 아님. 비수치 단가(수정 중 빈 셀)는
    // 건너뛴다 — 각인 위험은 이월된 숫자 단가에서 오고, 빈 셀에 값을 만들어 넣는 것은 재조회의 몫이 아니다.
    const targets = editLines.filter(
      (line) => line.productId
        && line.lineId
        && !componentLineIds.has(line.lineId)
        && Number.isFinite(Number(String(line.unitPrice ?? '').trim() || 'NaN')),
    )
    if (targets.length === 0) {
      setRepriceChangedLineIds(new Set())
      setRepriceOutcomeByLineId(new Map())
      setModalRepricePending(false)
      return
    }
    // 필드(VAT제외) 스냅샷 — 적용 시 실변경 판정 기준(build 시점).
    const currentExclusiveByLineId = new Map(
      targets.map((line) => [line.lineId!, String(line.unitPrice ?? '').trim()]),
    )
    // 1단계: 카탈로그 판매가(VAT포함) 조회 — miss fallback 원천.
    try {
      const catalogProducts = await lookupProducts(targets.map((line) => line.productId!))
      if (!partnerRepriceSessionIsCurrent(
        seq,
        modalRepriceSeqRef.current,
        partnerId,
        activePartnerIdRef.current,
        true,
      )) return // 더 새 거래처 선택/원격 변경이 시작됨 — 이 세션 폐기
      const catalogInclusiveByProductId = new Map<string, string>()
      for (const product of catalogProducts) {
        if (product.id && product.sellingPrice != null && Number.isFinite(product.sellingPrice)) {
          catalogInclusiveByProductId.set(product.id, String(product.sellingPrice))
        }
      }
      // 2단계: 후보를 기억 도메인(VAT포함)으로 승격해 공용 훅 실행.
      const candidates: PartnerRepriceCandidate[] = targets.map((line) => {
        const currentInclusive = vatInclusiveOf(currentExclusiveByLineId.get(line.lineId!) ?? '')
        return {
          key: line.lineId!,
          productId: line.productId!,
          currentUnitPrice: currentInclusive,
          // 삭제품목·sellingPrice null·조회 실패는 null — 공용 훅이 UNAVAILABLE 로 명시한다.
          catalogFallback: catalogInclusiveByProductId.get(line.productId!) ?? null,
        }
      })
      const { outcomes, isCurrent } = await partnerReprice.run(partnerId, candidates)
      const requestIsCurrent = () => partnerRepriceSessionIsCurrent(
        seq,
        modalRepriceSeqRef.current,
        partnerId,
        activePartnerIdRef.current,
        isCurrent(),
      )
      if (!requestIsCurrent()) return
      // in-flight 편집 재검증 원천 — provider 있으면 Y.Doc(원격 포함 최신), 없으면 로컬 state 최신 ref.
      const liveExclusiveOf = (lineId: string): string => {
        if (provider) return provider.getItemValueById(lineId, 'unitPrice').trim()
        const line = editLinesRef.current.find((candidate) => candidate.lineId === lineId)
        return line === undefined ? '' : String(line.unitPrice ?? '').trim()
      }
      // 3단계: outcome(포함 도메인)을 필드 도메인(VAT제외)으로 변환한다.
      const changed = new Set<string>()
      const priceByLineId = new Map<string, string>()
      const appliedOutcomes = new Map<string, PartnerRepriceOutcome>()
      for (const outcome of outcomes) {
        const nextExclusive = outcome.source === 'UNAVAILABLE' ? '' : vatExclusiveOf(outcome.unitPrice)
        const currentExclusive = currentExclusiveByLineId.get(outcome.key)
        if (currentExclusive === undefined || (outcome.source !== 'UNAVAILABLE' && !nextExclusive)) continue
        // 조회 중 직접 편집된 값과 삭제된 라인은 결과로 덮지 않는다.
        if (liveExclusiveOf(outcome.key) !== currentExclusive) continue
        appliedOutcomes.set(outcome.key, outcome)
        if (nextExclusive === currentExclusive || (
          nextExclusive !== '' && Number(nextExclusive) === Number(currentExclusive)
        )) continue
        changed.add(outcome.key)
        priceByLineId.set(outcome.key, nextExclusive)
      }
      if (priceByLineId.size > 0) {
        if (!requestIsCurrent()) return
        if (provider) {
          provider.doc.transact(() => {
            for (const [lineId, unitPrice] of priceByLineId) {
              if (!requestIsCurrent()) break
              provider.setItemValueById(lineId, 'unitPrice', unitPrice)
            }
          })
        } else {
          setEditLines((lines) =>
            lines.map((line) =>
              line.lineId && priceByLineId.has(line.lineId)
                ? { ...line, unitPrice: priceByLineId.get(line.lineId)! }
                : line,
            ),
          )
        }
      }
      if (!requestIsCurrent()) return
      setRepriceChangedLineIds(changed)
      setRepriceOutcomeByLineId(appliedOutcomes)
    } finally {
      if (modalRepriceSeqRef.current === seq) setModalRepricePending(false)
    }
  }

  const searchSlipPartnerOptions = async (q: string): Promise<PartnerOption[]> => {
    const rows = await searchPartners(q, 8)
    return rows.map((row) => ({
      id: row.partnerId ?? undefined,
      partnerCode: row.businessRegistrationNumber,
      name: row.companyName,
      bizNo: row.businessRegistrationNumber,
      phone: row.contactPhone ?? undefined,
    }))
  }

  /** 현재 거래처의 PartnerAutocomplete controlled value — 이름이 있으면 표시한다. */
  const slipPartnerOption = (name: string, bizNo: string, partnerId: string): PartnerOption | null =>
    name ? { id: partnerId || undefined, partnerCode: bizNo, name, bizNo } : null

  const hasUnavailableReprice = Array.from(repriceOutcomeByLineId.values())
    .some((outcome) => outcome.source === 'UNAVAILABLE')
  const repriceBannerText = partnerRepriceBannerText(
    Array.from(repriceOutcomeByLineId.values()),
    repriceChangedLineIds.size,
  )

  const handlePurchaseEditSave = () => {
    // R9 #3/#4: 재조회 중이거나 카탈로그 미확보 단가를 직접 확인하지 않은 상태는 저장 금지.
    if (modalRepricePending || partnerReprice.isPending || hasUnavailableReprice) return
    purchaseUpdateMutation.mutate({
      updatedAt: purchaseUpdatedAt ?? slip.updatedAt,
      // D-R8-7: null 이면 BE 가 기존 거래처를 보존한다(계약 주석과 동일).
      partnerId: purchasePartnerId || null,
      partnerName: purchasePartnerName.trim() || null,
      partnerCode: purchasePartnerCode.trim() || null,
      businessNumber: purchaseBusinessNumber.trim() || null,
      memo: purchaseMemo.trim() || null,
      deliveryAddress: purchaseDeliveryAddress.trim() || null,
      projectName: purchaseProjectName.trim() || null,
      recipientPhone: purchaseRecipientPhone.trim() || null,
      paymentDueDate: purchasePaymentDueDate || null,
      lines: purchaseEditLines.map(buildDetailLinePayload),
    })
  }

  const handleSalesEditSave = () => {
    // 매출·매입 미러 — B 거래처에 A 단가가 각인되는 저장 race/fail-open을 이중 방어한다.
    if (modalRepricePending || partnerReprice.isPending || hasUnavailableReprice) return
    salesUpdateMutation.mutate({
      updatedAt: salesUpdatedAt ?? slip.updatedAt,
      // D-R8-7: null 이면 BE 가 기존 거래처를 보존한다(계약 주석과 동일).
      partnerId: salesPartnerId || null,
      partnerName: salesPartnerName.trim() || null,
      partnerCode: salesPartnerCode.trim() || null,
      businessNumber: salesBusinessNumber.trim() || null,
      memo: salesMemo.trim() || null,
      deliveryAddress: salesDeliveryAddress.trim() || null,
      supervisionAddress: salesSupervisionAddress.trim() || null,
      projectName: salesProjectName.trim() || null,
      recipientPhone: salesRecipientPhone.trim() || null,
      paymentDueDate: salesPaymentDueDate || null,
      lines: salesEditLines.map(buildDetailLinePayload),
    })
  }

  /*
    E1-b-1: 매출 전표 수정은 상세 라인 영역에서 인라인으로 렌더한다.
    기존 모달의 payload/충돌/라인 coedit 계약은 그대로 유지하고 shell 만 제거한다.
  */
  const salesEditInlineForm = (
    <section
      ref={salesEditFormRef}
      className="slip-edit-inline"
      aria-label="매출 전표 수정"
      data-testid="sales-slip-edit-modal"
    >
      <div className="slip-edit-inline-header">
        <h4 className="detail-section-title">매출 전표 수정</h4>
        <div className="slip-edit-inline-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setSalesEditOpen(false)}
            disabled={salesUpdateMutation.isPending}
            data-testid="sales-slip-edit-cancel"
          >
            취소
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={salesUpdateMutation.isPending || modalRepricePending || partnerReprice.isPending}
            disabled={salesUpdateMutation.isPending || slipFormCoeditPending || modalRepricePending || partnerReprice.isPending || hasUnavailableReprice || salesEditLines.length === 0}
            data-testid="sales-slip-edit-save"
            onClick={handleSalesEditSave}
          >
            저장
          </Button>
        </div>
      </div>

      {salesConflictMessage ? (
        <div className="error-banner" role="alert" data-testid="sales-slip-edit-conflict-banner">
          <strong>{salesConflictMessage}</strong>
          {salesIsConflict ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="sales-slip-edit-reload"
              onClick={() => void handleSalesConflictReload()}
            >
              최신 내용 불러오기
            </Button>
          ) : null}
        </div>
      ) : null}
      {salesReloadSuccessMessage ? (
        <div role="status" data-testid="sales-slip-edit-reload-success" className="success-banner">
          {salesReloadSuccessMessage}
        </div>
      ) : null}

      {/* D-R8-10/R8-QA-11: 거래처 변경 최근단가 재적용 배너(폼과 동일 문구/역할). 상시 마운트 live region. */}
      <div
        className={repriceOutcomeByLineId.size > 0 ? 'price-memory-refresh-banner' : undefined}
        role={hasUnavailableReprice ? 'alert' : 'status'}
        aria-live="polite"
        data-testid="sales-slip-edit-price-refresh-banner"
      >
        {modalRepricePending || partnerReprice.isPending
          ? '거래처 변경 단가 확인 중… 저장은 확인 완료 후 가능합니다.'
          : repriceBannerText}
      </div>

      <div className="detail-grid" data-testid="sales-slip-edit-form">
        <label className="sales-edit-field">
          <span className="detail-label">판매번호</span>
          <Input inputSize="sm" readOnly value={slip.slipNo} aria-label="판매번호" />
        </label>
        {/*
          D-R8-7: 거래처는 PartnerAutocomplete 단일 경로.
          기존 수동 '거래처' CollaborativeSlipInput 제거 — SlipFormPage 가 "P0 D-AC3-01" 로
          밟은 선례와 정렬한다. 자유입력 시 partnerName 만 바뀌고 partnerId 는 불변이라
          (거래처+품목) 가격기억이 원 거래처에 각인됐다(R8-QA-3 라이브 실증).
          거래처코드/사업자번호는 선택 거래처에서 파생되는 read-only 표시로 강등한다.
          inputTestId(D-R8-10): 협업 partnerName 필드 식별자 유지 — 원격 거래처 재선택이
          CRDT 헤더로 전파돼 이 controlled value 에 반영된다(coedit-bound partner field).
        */}
        <label className="sales-edit-field">
          <span className="detail-label">거래처</span>
          <PartnerAutocomplete
            value={slipPartnerOption(salesPartnerName, salesBusinessNumber, salesPartnerId)}
            onChange={handleSlipPartnerSelect}
            searchPartners={searchSlipPartnerOptions}
            ariaLabel="거래처"
            placeholder="거래처명 또는 사업자번호"
            disabled={slipFormCoeditPending}
            inputTestId="slip-coedit-field-header-partnerName"
          />
        </label>
        <label className="sales-edit-field">
          <span className="detail-label">거래처코드</span>
          <Input inputSize="sm" readOnly value={salesPartnerCode} aria-label="거래처코드" />
        </label>
        <label className="sales-edit-field">
          <span className="detail-label">사업자번호</span>
          <Input inputSize="sm" readOnly value={salesBusinessNumber} aria-label="사업자번호" />
        </label>
        <label className="sales-edit-field">
          <span className="detail-label">배송주소</span>
          <CollaborativeSlipInput
            provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
            fieldPath="header.deliveryAddress"
            value={salesDeliveryAddress}
            onValueChange={setSalesDeliveryAddress}
            aria-label="배송주소"
          />
        </label>
        <label className="sales-edit-field">
          <span className="detail-label">감리주소</span>
          <CollaborativeSlipInput
            provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
            fieldPath="header.supervisionAddress"
            value={salesSupervisionAddress}
            onValueChange={setSalesSupervisionAddress}
            aria-label="감리주소"
          />
        </label>
        <label className="sales-edit-field">
          <span className="detail-label">프로젝트명</span>
          <CollaborativeSlipInput
            provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
            fieldPath="header.projectName"
            value={salesProjectName}
            onValueChange={setSalesProjectName}
            aria-label="프로젝트명"
          />
        </label>
        <label className="sales-edit-field">
          <span className="detail-label">인수자 번호</span>
          <CollaborativeSlipInput
            provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
            fieldPath="header.recipientPhone"
            value={salesRecipientPhone}
            onValueChange={setSalesRecipientPhone}
            aria-label="인수자 번호"
          />
        </label>
        <label className="sales-edit-field">
          <span className="detail-label">입금예정일</span>
          <CollaborativeSlipInput
            provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
            fieldPath="header.paymentDueDate"
            type="date"
            value={salesPaymentDueDate}
            onValueChange={setSalesPaymentDueDate}
            aria-label="입금예정일"
          />
        </label>
      </div>

      <label className="sales-edit-field sales-edit-memo">
        <span className="detail-label">적요</span>
        <CollaborativeSlipInput
          provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
          fieldPath="header.memo"
          value={salesMemo}
          onValueChange={setSalesMemo}
          aria-label="적요"
        />
      </label>

      <div className="sales-edit-lines" data-testid="sales-slip-edit-lines">
        <div className="slip-line-table-scroll">
        <table className="slip-line-table">
          <thead>
            <tr>
              <th>품목</th>
              <th>모델명</th>
              <th>규격</th>
              <th>수량</th>
              <th>{editUnitPriceColumnHeader(salesEditLines)}</th>
              <th>공급가액</th>
              <th>부가세</th>
              <th>합계(VAT포함)</th>
              <th aria-label="행 삭제" />
            </tr>
          </thead>
          <tbody>
            {salesEditLines.map((line, index) => {
              const outcome = line.lineId ? repriceOutcomeByLineId.get(line.lineId) : undefined
              const marker = outcome ? partnerRepriceMarkerText(outcome) : null
              const sourceStatusId = `sales-edit-price-source-${line.key}`
              const changedStatusId = `sales-edit-price-changed-${line.key}`
              const changed = Boolean(line.lineId && repriceChangedLineIds.has(line.lineId))
              return <tr
                key={line.key}
                className={changed ? 'price-memory-refreshed-row' : undefined}
              >
                <td>
                  <CollaborativeSlipInput
                    provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
                    fieldPath={`items.${index}.productName`}
                    value={line.productName ?? ''}
                    onValueChange={(value) => updateSalesLine(index, { productName: value })}
                    aria-label={`품목 ${index + 1}`}
                  />
                </td>
                <td>
                  <CollaborativeSlipInput
                    provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
                    fieldPath={`items.${index}.modelName`}
                    value={line.modelName ?? ''}
                    onValueChange={(value) => updateSalesLine(index, { modelName: value })}
                    aria-label={`모델명 ${index + 1}`}
                  />
                </td>
                <td>
                  <CollaborativeSlipInput
                    provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
                    fieldPath={`items.${index}.specification`}
                    value={line.specification ?? ''}
                    onValueChange={(value) => updateSalesLine(index, { specification: value })}
                    aria-label={`규격 ${index + 1}`}
                  />
                </td>
                <td>
                  <CollaborativeSlipInput
                    provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
                    fieldPath={`items.${index}.quantity`}
                    type="number"
                    min={1}
                    value={String(line.quantity)}
                    onValueChange={(value) => updateDetailQuantity(index, updateSalesLine, slipFormCoeditProvider, line, value)}
                    aria-label={`수량 ${index + 1}`}
                  />
                </td>
                <td>
                  <CollaborativeSlipInput
                    provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
                    fieldPath={`items.${index}.unitPrice`}
                    type="number"
                    min={0}
                    value={String(line.unitPrice)}
                    parseValue={parseEditableDetailAmountInput}
                    onValueChange={(value) => {
                      // 함수형 patch 로 바뀌어 updateSalesLine 내부의 object-patch 전용
                      // 강조해제 분기를 타지 않는다 — 여기서 직접 처리한다(단가값 자체는
                      // 안정적이라 race 걱정 없이 closure 의 line.lineId 로 충분하다).
                      clearRepriceHighlight(line.lineId)
                      updateDetailUnitPrice(index, updateSalesLine, slipFormCoeditProvider, line, value)
                    }}
                    aria-label={`${editUnitPriceLabel(line)} ${index + 1}`}
                    aria-describedby={[
                      marker ? sourceStatusId : null,
                      changed ? changedStatusId : null,
                    ].filter(Boolean).join(' ') || undefined}
                  />
                  {marker ? (
                    <span id={sourceStatusId} role="note" aria-label={marker.description} title={marker.description} className="price-source-note">
                      {marker.label}
                    </span>
                  ) : null}
                  {changed ? <EditPriceChangeIndicator id={changedStatusId} /> : null}
                </td>
                <td>
                  <CollaborativeSlipInput
                    provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
                    fieldPath={`items.${index}.supplyAmount`}
                    type="number" min={0}
                    value={String(line.supplyAmount ?? '0')}
                    parseValue={parseEditableDetailAmountInput}
                    onValueChange={(value) => updateDetailVat(index, updateSalesLine, 'SUPPLY', value)}
                    readOnly={Boolean(line.isBundleComponent)}
                    aria-label={`공급가액 ${index + 1}`}
                  />
                </td>
                <td>
                  <CollaborativeSlipInput
                    provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
                    fieldPath={`items.${index}.vatAmount`}
                    type="number" min={0}
                    value={String(line.vatAmount ?? '0')}
                    parseValue={parseEditableDetailAmountInput}
                    onValueChange={(value) => updateDetailVat(index, updateSalesLine, 'VAT', value)}
                    readOnly={Boolean(line.isBundleComponent)}
                    aria-label={`부가세 ${index + 1}`}
                  />
                  {line.vatAmount != null && hasVatWarning(line.supplyAmount ?? line.lineTotalWithVat ?? '0', line.vatAmount)
                    ? <span role="note" style={{ color: '#9A6700', fontSize: 10 }}>⚠ 10%와 다름</span>
                    : null}
                </td>
                <td>
                  <CollaborativeSlipInput
                    provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
                    fieldPath={`items.${index}.lineTotalWithVat`}
                    type="number" min={0}
                    value={String(line.lineTotalWithVat ?? '0')}
                    // 합계는 공급가액+부가세 파생값이다. 협업 입력은 원격 인식과
                    // 문서 구독을 유지하되, 사용자 입력과 협업 문서의 합계 직접 편집은 받지 않는다.
                    onValueChange={() => undefined}
                    onDocSyncValueChange={() => undefined}
                    readOnly
                    aria-label={`합계(VAT포함) ${index + 1}`}
                  />
                </td>
                <td className="td-right">
                  {Number(line.lineTotalWithVat ?? 0).toLocaleString('ko-KR')}원
                </td>
                <td>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`${index + 1}번 행 삭제`}
                    onClick={() => removeSalesLine(index)}
                  >
                    ×
                  </Button>
                </td>
              </tr>
            })}
          </tbody>
        </table>
        </div>
      </div>
    </section>
  )

  /*
    E1-b-2: 매입 전표 수정도 상세 라인 영역에서 인라인으로 렌더한다.
    E1-b-1 매출 인라인 패턴을 복제하되, INBOUND direct PUT/409/422/coedit 계약은 그대로 유지한다.
  */
  const purchaseEditInlineForm = (
    <section
      ref={purchaseEditFormRef}
      className="slip-edit-inline"
      aria-label="매입 전표 수정"
      data-testid="purchase-slip-edit-modal"
    >
      <div className="slip-edit-inline-header">
        <h4 className="detail-section-title">매입 전표 수정</h4>
        <div className="slip-edit-inline-actions">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPurchaseEditOpen(false)}
            disabled={purchaseUpdateMutation.isPending}
            data-testid="purchase-slip-edit-cancel"
          >
            취소
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={purchaseUpdateMutation.isPending || modalRepricePending || partnerReprice.isPending}
            disabled={purchaseUpdateMutation.isPending || slipFormCoeditPending || modalRepricePending || partnerReprice.isPending || hasUnavailableReprice || purchaseEditLines.length === 0}
            data-testid="purchase-slip-edit-submit"
            onClick={handlePurchaseEditSave}
          >
            저장
          </Button>
        </div>
      </div>

      {purchaseConflictMessage ? (
        <div className="error-banner" role="alert" data-testid="purchase-slip-edit-conflict-banner">
          <strong>{purchaseConflictMessage}</strong>
          {purchaseIsConflict ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              data-testid="purchase-slip-edit-reload"
              onClick={() => void handlePurchaseConflictReload()}
            >
              최신 내용 불러오기
            </Button>
          ) : null}
        </div>
      ) : null}
      {purchaseReloadSuccessMessage ? (
        <div role="status" data-testid="purchase-slip-edit-reload-success" className="success-banner">
          {purchaseReloadSuccessMessage}
        </div>
      ) : null}

      {/* D-R8-10/R8-QA-11: 거래처 변경 최근단가 재적용 배너(매출 폼과 동일 계약·미러). */}
      <div
        className={repriceOutcomeByLineId.size > 0 ? 'price-memory-refresh-banner' : undefined}
        role={hasUnavailableReprice ? 'alert' : 'status'}
        aria-live="polite"
        data-testid="purchase-slip-edit-price-refresh-banner"
      >
        {modalRepricePending || partnerReprice.isPending
          ? '거래처 변경 단가 확인 중… 저장은 확인 완료 후 가능합니다.'
          : repriceBannerText}
      </div>

      <div className="detail-grid" data-testid="purchase-slip-edit-form">
        <label className="purchase-edit-field">
          <span className="detail-label">구매번호</span>
          <Input inputSize="sm" readOnly value={slip.slipNo} aria-label="구매번호" />
        </label>
        {/* D-R8-7: 거래처 = PartnerAutocomplete 단일 경로(매출 폼과 동일 계약). inputTestId=협업 partnerName 식별자. */}
        <label className="purchase-edit-field">
          <span className="detail-label">거래처</span>
          <PartnerAutocomplete
            value={slipPartnerOption(purchasePartnerName, purchaseBusinessNumber, purchasePartnerId)}
            onChange={handleSlipPartnerSelect}
            searchPartners={searchSlipPartnerOptions}
            ariaLabel="거래처"
            placeholder="거래처명 또는 사업자번호"
            disabled={slipFormCoeditPending}
            inputTestId="slip-coedit-field-header-partnerName"
          />
        </label>
        <label className="purchase-edit-field">
          <span className="detail-label">거래처코드</span>
          <Input inputSize="sm" readOnly value={purchasePartnerCode} aria-label="거래처코드" />
        </label>
        <label className="purchase-edit-field">
          <span className="detail-label">사업자번호</span>
          <Input inputSize="sm" readOnly value={purchaseBusinessNumber} aria-label="사업자번호" />
        </label>
        <label className="purchase-edit-field">
          <span className="detail-label">배송주소</span>
          <CollaborativeSlipInput
            provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
            fieldPath="header.deliveryAddress"
            value={purchaseDeliveryAddress}
            onValueChange={setPurchaseDeliveryAddress}
            aria-label="배송주소"
          />
        </label>
        <label className="purchase-edit-field">
          <span className="detail-label">프로젝트명</span>
          <CollaborativeSlipInput
            provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
            fieldPath="header.projectName"
            value={purchaseProjectName}
            onValueChange={setPurchaseProjectName}
            aria-label="프로젝트명"
          />
        </label>
        <label className="purchase-edit-field">
          <span className="detail-label">인수자 번호</span>
          <CollaborativeSlipInput
            provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
            fieldPath="header.recipientPhone"
            value={purchaseRecipientPhone}
            onValueChange={setPurchaseRecipientPhone}
            aria-label="인수자 번호"
          />
        </label>
        <label className="purchase-edit-field">
          <span className="detail-label">입금예정일</span>
          <CollaborativeSlipInput
            provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
            fieldPath="header.paymentDueDate"
            type="date"
            value={purchasePaymentDueDate}
            onValueChange={setPurchasePaymentDueDate}
            aria-label="입금예정일"
          />
        </label>
      </div>

      <label className="purchase-edit-field purchase-edit-memo">
        <span className="detail-label">적요</span>
        <CollaborativeSlipInput
          provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
          fieldPath="header.memo"
          value={purchaseMemo}
          onValueChange={setPurchaseMemo}
          aria-label="적요"
        />
      </label>

      <div className="purchase-edit-lines" data-testid="purchase-slip-edit-lines">
        <div className="slip-line-table-scroll">
        <table className="slip-line-table">
          <thead>
            <tr>
              <th>품목</th>
              <th>모델명</th>
              <th>규격</th>
              <th>수량</th>
              <th>{editUnitPriceColumnHeader(purchaseEditLines)}</th>
              <th>공급가액</th>
              <th>부가세</th>
              <th>합계(VAT포함)</th>
              <th aria-label="행 삭제" />
            </tr>
          </thead>
          <tbody>
            {purchaseEditLines.map((line, index) => {
              const outcome = line.lineId ? repriceOutcomeByLineId.get(line.lineId) : undefined
              const marker = outcome ? partnerRepriceMarkerText(outcome) : null
              const sourceStatusId = `purchase-edit-price-source-${line.key}`
              const changedStatusId = `purchase-edit-price-changed-${line.key}`
              const changed = Boolean(line.lineId && repriceChangedLineIds.has(line.lineId))
              return <tr
                key={line.key}
                className={changed ? 'price-memory-refreshed-row' : undefined}
              >
                <td>
                  <CollaborativeSlipInput
                    provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
                    fieldPath={`items.${index}.productName`}
                    value={line.productName ?? ''}
                    onValueChange={(value) => updatePurchaseLine(index, { productName: value })}
                    aria-label={`품목 ${index + 1}`}
                  />
                </td>
                <td>
                  <CollaborativeSlipInput
                    provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
                    fieldPath={`items.${index}.modelName`}
                    value={line.modelName ?? ''}
                    onValueChange={(value) => updatePurchaseLine(index, { modelName: value })}
                    aria-label={`모델명 ${index + 1}`}
                  />
                </td>
                <td>
                  <CollaborativeSlipInput
                    provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
                    fieldPath={`items.${index}.specification`}
                    value={line.specification ?? ''}
                    onValueChange={(value) => updatePurchaseLine(index, { specification: value })}
                    aria-label={`규격 ${index + 1}`}
                  />
                </td>
                <td>
                  <CollaborativeSlipInput
                    provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
                    fieldPath={`items.${index}.quantity`}
                    type="number"
                    min={1}
                    value={String(line.quantity)}
                    onValueChange={(value) => updateDetailQuantity(index, updatePurchaseLine, slipFormCoeditProvider, line, value)}
                    aria-label={`수량 ${index + 1}`}
                  />
                </td>
                <td>
                  <CollaborativeSlipInput
                    provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
                    fieldPath={`items.${index}.unitPrice`}
                    type="number"
                    min={0}
                    value={String(line.unitPrice)}
                    parseValue={parseEditableDetailAmountInput}
                    onValueChange={(value) => {
                      // 매출 행과 동일 — 함수형 patch 전환으로 우회된 강조해제를 여기서 직접 처리.
                      clearRepriceHighlight(line.lineId)
                      updateDetailUnitPrice(index, updatePurchaseLine, slipFormCoeditProvider, line, value)
                    }}
                    aria-label={`${editUnitPriceLabel(line)} ${index + 1}`}
                    aria-describedby={[
                      marker ? sourceStatusId : null,
                      changed ? changedStatusId : null,
                    ].filter(Boolean).join(' ') || undefined}
                  />
                  {marker ? (
                    <span id={sourceStatusId} role="note" aria-label={marker.description} title={marker.description} className="price-source-note">
                      {marker.label}
                    </span>
                  ) : null}
                  {changed ? <EditPriceChangeIndicator id={changedStatusId} /> : null}
                </td>
                <td>
                  <CollaborativeSlipInput
                    provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
                    fieldPath={`items.${index}.supplyAmount`}
                    type="number" min={0}
                    value={String(line.supplyAmount ?? '0')}
                    parseValue={parseEditableDetailAmountInput}
                    onValueChange={(value) => updateDetailVat(index, updatePurchaseLine, 'SUPPLY', value)}
                    readOnly={Boolean(line.isBundleComponent)}
                    aria-label={`공급가액 ${index + 1}`}
                  />
                </td>
                <td>
                  <CollaborativeSlipInput
                    provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
                    fieldPath={`items.${index}.vatAmount`}
                    type="number" min={0}
                    value={String(line.vatAmount ?? '0')}
                    parseValue={parseEditableDetailAmountInput}
                    onValueChange={(value) => updateDetailVat(index, updatePurchaseLine, 'VAT', value)}
                    readOnly={Boolean(line.isBundleComponent)}
                    aria-label={`부가세 ${index + 1}`}
                  />
                  {line.vatAmount != null && hasVatWarning(line.supplyAmount ?? line.lineTotalWithVat ?? '0', line.vatAmount)
                    ? <span role="note" style={{ color: '#9A6700', fontSize: 10 }}>⚠ 10%와 다름</span>
                    : null}
                </td>
                <td>
                  <CollaborativeSlipInput
                    provider={slipFormCoeditProvider} coeditPending={slipFormCoeditPending}
                    fieldPath={`items.${index}.lineTotalWithVat`}
                    type="number" min={0}
                    value={String(line.lineTotalWithVat ?? '0')}
                    // 합계는 공급가액+부가세 파생값이다. 협업 입력은 원격 인식과
                    // 문서 구독을 유지하되, 사용자 입력과 협업 문서의 합계 직접 편집은 받지 않는다.
                    onValueChange={() => undefined}
                    onDocSyncValueChange={() => undefined}
                    readOnly
                    aria-label={`합계(VAT포함) ${index + 1}`}
                  />
                </td>
                <td className="td-right">
                  {Number(line.lineTotalWithVat ?? 0).toLocaleString('ko-KR')}원
                </td>
                <td>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`${index + 1}번 행 삭제`}
                    onClick={() => removePurchaseLine(index)}
                  >
                    ×
                  </Button>
                </td>
              </tr>
            })}
          </tbody>
        </table>
        </div>
      </div>
    </section>
  )

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          rowGap: 8,
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', rowGap: 8, gap: 12 }}>
          <SlipNumberDisplay slipDate={slip.slipDate} seqNo={slip.seqNo} size="lg" />
          {/* PR-H2: 수정 횟수 표시 — auditLogs distinct revisionNo 개수 */}
          <span
            data-testid="slip-detail-revision-count"
            style={{
              fontSize: 13,
              color: 'var(--color-neutral-600)',
              padding: '2px 8px',
              borderRadius: 12,
              background: 'var(--color-neutral-100)',
            }}
            title={
              auditLogsQuery.isError
                ? '수정 이력을 불러오지 못했습니다'
                : '전표 변경 누적 횟수'
            }
          >
            수정 {revisionCount}회
          </span>
          <PresenceIndicator entries={presenceEntries} size="lg" />
        </div>
        {!isMobile ? (
        <div className="detail-action-bar">
          {isOutbound ? (
            <div className="detail-print-actions">
              {/* SP-08-6-4: 거래명세서 출력 — /sales/:id/print/statement */}
              <Button
                variant="secondary"
                size="sm"
                data-testid="sales-statement-print-button"
                onClick={() => navigate(`/sales/${id}/print/statement`)}
              >
                거래명세서 출력
              </Button>
              {/* SP-08-6-4: 계산서(세금계산서) 출력 — /sales/:id/print/invoice */}
              <Button
                variant="secondary"
                size="sm"
                data-testid="sales-invoice-print-button"
                onClick={() => navigate(`/sales/${id}/print/invoice`)}
              >
                계산서 출력
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/sales/${id}/print/dispatch`)}
              >
                판매전표 출력
              </Button>
            </div>
          ) : (
            // SP-08-5-5: 매입 전표 인쇄 버튼 (INBOUND — 모든 조회 가능 권한)
            <div className="detail-print-actions">
            <Button
              variant="secondary"
              size="sm"
              data-testid="purchase-slip-print-button"
              onClick={() => navigate(`/purchases/${id}/print/purchase`)}
            >
              매입 전표 인쇄
            </Button>
            </div>
          )}
          {canDirectEditSales ? (
            <Button
              variant="primary"
              size="sm"
              data-testid="sales-slip-edit-button"
              onClick={() => {
                syncSalesFormFromData(slip)
                // 모달 첫 커밋부터 거래처 선택을 잠가 provider 초기화 전 재조회/후속 덮어쓰기 창을 닫는다.
                setSlipFormCoeditPending(true)
                setSalesConflictMessage(null)
                setSalesIsConflict(false)
                setSalesReloadSuccessMessage(null)
                setSalesEditOpen(true)
              }}
            >
              수정
            </Button>
          ) : null}
          {canDirectEditPurchase ? (
            <Button
              variant="primary"
              size="sm"
              data-testid="purchase-slip-edit-open"
              onClick={() => {
                syncPurchaseFormFromData(slip)
                setSlipFormCoeditPending(true)
                setPurchaseConflictMessage(null)
                setPurchaseIsConflict(false)
                setPurchaseReloadSuccessMessage(null)
                setPurchaseEditOpen(true)
              }}
            >
              수정
            </Button>
          ) : null}
          {canCollabEdit && !canDirectEditSales && !canDirectEditPurchase ? (
            <Button
              variant="primary"
              size="sm"
              data-testid="slip-collab-edit-open"
              onClick={() => setCollabEditMode(true)}
            >
              수정
            </Button>
          ) : null}
          {canDirectDeletePurchase ? (
            <Button
              variant="danger"
              size="sm"
              data-testid="purchase-slip-delete-button"
              onClick={() => {
                setPurchaseDeleteConflict(false)
                setPurchaseDeleteInspectionAlert(null)
                setPurchaseDeleteOpen(true)
              }}
            >
              삭제
            </Button>
          ) : null}
          {canDirectDeleteSales ? (
            <Button
              variant="danger"
              size="sm"
              data-testid="sales-slip-delete-button"
              onClick={() => {
                setSalesDeleteConflict(false)
                setSalesDeleteShippedAlert(null)
                setSalesDeleteOpen(true)
              }}
            >
              삭제
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => navigate(listPath)}>
            목록으로
          </Button>
        </div>
        ) : null}
      </div>

      {isMobile ? (
        <>
          <div className="mobile-summary-card" data-testid="slip-detail-mobile-summary">
            <div className="mobile-summary-card-header">
              <span className="mobile-summary-doc-no">
                {slip.slipDate}/{slip.seqNo}
              </span>
              <span
                className="mobile-status-badge"
                style={slipStatusBadgeStyle(slip.status)}
              >
                {slipStatusLabel(slip.status)}
              </span>
            </div>
            <div className="mobile-summary-partner">{slip.partnerName ?? '-'}</div>
            <div className="mobile-summary-divider" />
            <div className="mobile-summary-total-row">
              <span className="mobile-summary-total-amount">
                {mobileSlipTotal.toLocaleString()}원
              </span>
              <span className="mobile-summary-date">전표일자 {slip.slipDate}</span>
            </div>
          </div>

          <div className="mobile-action-bar" role="toolbar" aria-label="전표 액션">
            {mobilePrimaryAction ? (
              <button
                type="button"
                className="mobile-action-primary"
                disabled={mobilePrimaryAction.disabled}
                onClick={mobilePrimaryAction.onClick}
              >
                {mobilePrimaryAction.label}
              </button>
            ) : null}
            <button
              type="button"
              className="mobile-action-icon"
              aria-label="인쇄"
              onClick={handleMobilePrint}
            >
              인쇄
            </button>
            <button
              type="button"
              className="mobile-action-icon"
              aria-label="더보기"
              onClick={() => setMobileMoreOpen(true)}
            >
              ···
            </button>
            <MobileActionSheet open={mobileMoreOpen} onClose={() => setMobileMoreOpen(false)}>
                  {isOutbound ? (
                    <>
                      <button
                        type="button"
                        className="mobile-more-sheet-item"
                        onClick={() => {
                          setMobileMoreOpen(false)
                          navigate(`/sales/${id}/print/invoice`)
                        }}
                      >
                        계산서 출력
                      </button>
                      <button
                        type="button"
                        className="mobile-more-sheet-item"
                        onClick={() => {
                          setMobileMoreOpen(false)
                          navigate(`/sales/${id}/print/dispatch`)
                        }}
                      >
                        판매전표 출력
                      </button>
                    </>
                  ) : null}
                  {canDirectEditSales ? (
                    <button
                      type="button"
                      className="mobile-more-sheet-item"
                      onClick={() => {
                        setMobileMoreOpen(false)
                        syncSalesFormFromData(slip)
                        setSlipFormCoeditPending(true)
                        setSalesConflictMessage(null)
                        setSalesIsConflict(false)
                        setSalesReloadSuccessMessage(null)
                        setSalesEditOpen(true)
                      }}
                    >
                      수정
                    </button>
                  ) : null}
                  {canDirectEditPurchase ? (
                    <button
                      type="button"
                      className="mobile-more-sheet-item"
                      onClick={() => {
                        setMobileMoreOpen(false)
                        syncPurchaseFormFromData(slip)
                        setSlipFormCoeditPending(true)
                        setPurchaseConflictMessage(null)
                        setPurchaseIsConflict(false)
                        setPurchaseReloadSuccessMessage(null)
                        setPurchaseEditOpen(true)
                      }}
                    >
                      수정
                    </button>
                  ) : null}
                  {canCollabEdit && !canDirectEditSales && !canDirectEditPurchase ? (
                    <button
                      type="button"
                      className="mobile-more-sheet-item"
                      onClick={() => {
                        setMobileMoreOpen(false)
                        setCollabEditMode(true)
                      }}
                    >
                      수정
                    </button>
                  ) : null}
                  {canDirectDeletePurchase ? (
                    <button
                      type="button"
                      className="mobile-more-sheet-item danger"
                      onClick={() => {
                        setMobileMoreOpen(false)
                        setPurchaseDeleteConflict(false)
                        setPurchaseDeleteInspectionAlert(null)
                        setPurchaseDeleteOpen(true)
                      }}
                    >
                      매입 전표 삭제
                    </button>
                  ) : null}
                  {canDirectDeleteSales ? (
                    <button
                      type="button"
                      className="mobile-more-sheet-item danger"
                      onClick={() => {
                        setMobileMoreOpen(false)
                        setSalesDeleteConflict(false)
                        setSalesDeleteShippedAlert(null)
                        setSalesDeleteOpen(true)
                      }}
                    >
                      매출 전표 삭제
                    </button>
                  ) : null}
                  {possibleActions.includes('reject') ? (
                    <button
                      type="button"
                      className="mobile-more-sheet-item danger"
                      disabled={!canRejectSlip || transitionMutation.isPending}
                      onClick={() => {
                        setMobileMoreOpen(false)
                        handleTransition('reject')
                      }}
                    >
                      반려
                    </button>
                  ) : null}
                  {possibleActions.includes('cancel') ? (
                    <button
                      type="button"
                      className="mobile-more-sheet-item danger"
                      disabled={!canCancelSlip || transitionMutation.isPending}
                      onClick={() => {
                        setMobileMoreOpen(false)
                        handleDeleteSlip()
                      }}
                    >
                      전표 취소
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="mobile-more-sheet-item"
                    onClick={() => {
                      setMobileMoreOpen(false)
                      handleDuplicate()
                    }}
                  >
                    전표 복사
                  </button>
                  <button
                    type="button"
                    className="mobile-more-sheet-item"
                    onClick={() => {
                      setMobileMoreOpen(false)
                      navigate(listPath)
                    }}
                  >
                    목록으로
                  </button>
            </MobileActionSheet>
          </div>
        </>
      ) : null}

      {/*
        Slice A: 전표 진행 단계 ProgressBar (Designer wireframes.md § 2 + 5)
        피드백 #1 ("라이프사이클" 모호) 해결.
      */}
      <div className="progress-bar-container" style={{ marginBottom: 16 }}>
        <ProgressBar currentStatus={slip.status} branchReason={branchReason} />
      </div>

      {/*
        PR-H3: SSE 결정 toast — 수락/거절 결과 안내 (사용자 닫기 가능).
      */}
      {decisionToast ? (
        <div
          role="status"
          data-testid="slip-detail-edit-request-decision-toast"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 12px',
            marginBottom: 12,
            borderRadius: 6,
            border: '1px solid',
            borderColor:
              decisionToast.kind === 'success'
                ? 'var(--color-success-300, #6EE7B7)'
                : 'var(--color-danger-300, #FCA5A5)',
            background:
              decisionToast.kind === 'success'
                ? 'var(--color-success-50, #ECFDF5)'
                : 'var(--color-danger-50, #FEF2F2)',
            color:
              decisionToast.kind === 'success'
                ? 'var(--color-success-800, #065F46)'
                : 'var(--color-danger-800, #991B1B)',
            fontSize: 13,
          }}
        >
          <span>{decisionToast.text}</span>
          <button
            type="button"
            onClick={() => setDecisionToast(null)}
            aria-label="알림 닫기"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
              color: 'inherit',
            }}
          >
            ×
          </button>
        </div>
      ) : null}

      {/*
        PR-H3: 단계별 안내 + 삭제 요청 버튼.
        - DRAFT/SAVED/SENT: 본인 직접 수정/삭제 가능 → 별도 안내 없음
        - CONFIRMED/ACCEPTED/PROCESSING: 직접 삭제 차단, "삭제 요청" 버튼 노출 (창고 수락 필요)
        - 수정은 §7 수정완료가 유일 경로이므로 "수정 요청" 버튼을 노출하지 않음
        - SHIPPING/DELIVERED/CANCELED/REJECTED: 모든 변경 차단 안내
      */}
      {isApprovalRequired && canRequestDelete ? (
        <Card
          padding={4}
          shadow="sm"
          style={{ marginBottom: 16 }}
          data-testid="slip-detail-edit-request-banner"
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14 }}>창고 인계 후 — 삭제 요청</strong>
              <span style={{ fontSize: 13, color: 'var(--color-neutral-700)' }}>
                직접 삭제가 잠겼습니다. 창고 직원에게 삭제 처리를 요청할 수 있습니다.
              </span>
              {latestEditRequest ? (
                <Badge
                  variant={
                    latestEditRequest.status === 'PENDING'
                      ? 'warning'
                      : latestEditRequest.status === 'APPROVED'
                        ? 'success'
                        : 'danger'
                  }
                  data-testid="slip-detail-edit-request-status-badge"
                >
                  요청 {SLIP_EDIT_REQUEST_STATUS_LABEL[latestEditRequest.status]}
                </Badge>
              ) : null}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                variant="ghost"
                size="sm"
                disabled={hasPendingRequest || editRequestMutation.isPending}
                onClick={() => setEditRequestDialogType('DELETE')}
                title={
                  hasPendingRequest
                    ? '이미 처리 대기 중인 요청이 있습니다.'
                    : undefined
                }
                data-testid="slip-detail-delete-request-button"
              >
                삭제 요청
              </Button>
            </div>
          </div>
          {/* PENDING 요청의 사유 미리보기 */}
          {hasPendingRequest && latestEditRequest ? (
            <div
              style={{
                marginTop: 8,
                padding: 8,
                borderRadius: 4,
                background: 'var(--color-neutral-50, #F9FAFB)',
                fontSize: 12,
                color: 'var(--color-neutral-700)',
                whiteSpace: 'pre-wrap',
              }}
            >
              요청 사유: {latestEditRequest.reason}
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* PR-H3: 변경 자체 차단 단계 안내 — 검수 ~ 배송 완료. */}
      {isLocked ? (
        <div
          role="alert"
          data-testid="slip-detail-locked-banner"
          className="warning-banner"
        >
          현재 단계({slipStatusLabel(slip.status)})에서는 전표 변경이 차단됩니다. 물리 종결 전 단계에서만 권한자 수정 또는 삭제 요청이 가능합니다.
        </div>
      ) : null}

      <Card padding={4} shadow="sm">
        <div className="detail-grid">
          <div>
            <span className="detail-label">거래처</span>
            <span className="detail-value">
              {renderRedlineCell('header.partnerName', slip.partnerName ?? '-')}
            </span>
          </div>
          <div>
            <span className="detail-label">일자</span>
            <span className="detail-value">
              {renderRedlineCell('header.slipDate', slip.slipDate)}
            </span>
          </div>
          <div>
            <span className="detail-label">배송 태그</span>
            <span className="detail-value">
              {renderRedlineCell(
                'header.deliveryTag',
                slip.deliveryTag ? deliveryTagLabel(slip.deliveryTag) : '-',
                (value) => deliveryTagLabel(value) ?? '비움',
              )}
            </span>
          </div>
          {/*
            배송일정 라벨(deliveryScheduleLabel)은 메모와 혼재하지 않고 별도 행으로 표시한다.
            지방/야적 전표에서 "25상26하" 또는 "당착" 형태로 표시된다.
          */}
          {slip.deliveryScheduleLabel ? (
            <div data-testid="slip-detail-delivery-schedule-label">
              <span className="detail-label">배송일정</span>
              <span className="detail-value">
                <strong style={{ color: 'var(--color-primary-700, #1D4ED8)' }}>
                  {slip.deliveryScheduleLabel}
                </strong>
              </span>
            </div>
          ) : null}
          <div data-testid="slip-detail-audit-overlay-memo">
            <span className="detail-label">메모</span>
            <span className="detail-value">
              {renderRedlineCell(
                'header.memo',
                <AuditOverlay
                  field="memo"
                  currentValue={memoWithoutTagPrefix(
                    slip.memo,
                    deliveryTagLabel(slip.deliveryTag),
                  )}
                  history={auditByField['memo'] ?? []}
                />,
              )}
            </span>
          </div>
          {/* PR-H2: 배송지 audit overlay (출고전표만 의미 있음) */}
          {isOutbound ? (
            <div data-testid="slip-detail-audit-overlay-shippingAddress">
              <span className="detail-label">배송지</span>
              <span className="detail-value">
                {renderRedlineCell(
                  'header.shippingAddress',
                  <AuditOverlay
                    field="shippingAddress"
                    currentValue={slip.shippingAddress}
                    history={auditByField['shippingAddress'] ?? []}
                  />,
                )}
              </span>
            </div>
          ) : null}
        </div>
      </Card>

      {/*
        V20 신규 필드 표시 카드 — 배송주소 / 감리주소 / 프로젝트명 / 인수자 번호 / 입금예정일
        + businessNumber (거래처 자동 표시) + printed (인쇄 여부).
        빈값(null/undefined) 은 "—" 로 표시. UUID 비공개 가드 준수.
      */}
      <Card padding={4} shadow="sm" style={{ marginTop: 16 }}>
        <h4 style={{ marginTop: 0 }}>배송 · 정산 정보 (V20)</h4>
        <MobileCollapsible title="배송 · 정산 정보">
        <div className="detail-section-title mobile-only">배송 · 정산 정보</div>
        <div className="detail-grid">
          <DetailGridItem value={slip.deliveryAddress} testId="slip-detail-delivery-address">
            <span className="detail-label">배송주소</span>
            <span className="detail-value">
              {renderRedlineCell('header.deliveryAddress', slip.deliveryAddress ?? '—')}
            </span>
          </DetailGridItem>
          <DetailGridItem value={slip.supervisionAddress} testId="slip-detail-supervision-address">
            <span className="detail-label">감리주소</span>
            <span className="detail-value">
              {renderRedlineCell('header.supervisionAddress', slip.supervisionAddress ?? '—')}
            </span>
          </DetailGridItem>
          <DetailGridItem value={slip.projectName} testId="slip-detail-project-name">
            <span className="detail-label">프로젝트명</span>
            <span className="detail-value">
              {renderRedlineCell('header.projectName', slip.projectName ?? '—')}
            </span>
          </DetailGridItem>
          <DetailGridItem value={slip.recipientPhone} testId="slip-detail-recipient-phone">
            <span className="detail-label">인수자 번호</span>
            <span className="detail-value">
              {renderRedlineCell('header.recipientPhone', slip.recipientPhone ?? '—')}
            </span>
          </DetailGridItem>
          <DetailGridItem value={slip.paymentDueDate} testId="slip-detail-payment-due-date">
            <span className="detail-label">입금예정일</span>
            <span className="detail-value">
              {renderRedlineCell('header.paymentDueDate', slip.paymentDueDate ?? '—')}
            </span>
          </DetailGridItem>
          <DetailGridItem value={slip.businessNumber} testId="slip-detail-business-number">
            <span className="detail-label">사업자번호</span>
            <span className="detail-value">
              {renderRedlineCell('header.businessNumber', slip.businessNumber ?? '—')}
            </span>
          </DetailGridItem>
          <DetailGridItem value={slip.printed == null ? null : slip.printed} testId="slip-detail-printed">
            <span className="detail-label">인쇄 여부</span>
            <span className="detail-value">
              {slip.printed == null ? '—' : slip.printed ? '인쇄됨' : '미인쇄'}
            </span>
          </DetailGridItem>
          {mode === 'INBOUND' ? (
            <div data-testid="slip-detail-inspection-status">
              <span className="detail-label">검수 상태</span>
              <span className="detail-value">
                <Badge variant={slip.inspectionStatus === 'READY' ? 'success' : 'warning'}>
                  {slip.inspectionStatus ? (INSPECTION_STATUS_LABEL[slip.inspectionStatus] ?? slip.inspectionStatus) : '—'}
                </Badge>
              </span>
            </div>
          ) : null}
        </div>
        </MobileCollapsible>
      </Card>

      {/*
        link-dispatch-slice 신규: 기사 정보 카드 (driverName + driverPhone)
        DRAFT/SAVED 단계만 [편집] 가능 — BE 가드와 동일 (PATCH /slips/{id}/driver).
        OUTBOUND 만 표시 (입고전표는 거래처 측 기사 정보 무관).
      */}
      {isOutbound ? (
        <Card padding={4} shadow="sm" style={{ marginTop: 16 }}>
          <MobileCollapsible title="기사 정보">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <h4 style={{ margin: 0 }}>기사 정보 (배송)</h4>
            {!editingDriver && linesEditable ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraftDriverName(slip.driverName ?? '')
                  setDraftDriverPhone(slip.driverPhone ?? '')
                  setEditingDriver(true)
                }}
              >
                편집
              </Button>
            ) : null}
          </div>
          {editingDriver ? (
            <div className="driver-edit-grid">
              <label className="driver-edit-field">
                <span className="detail-label">기사명</span>
                <input
                  type="text"
                  value={draftDriverName}
                  onChange={(e) => setDraftDriverName(e.target.value)}
                  maxLength={50}
                  placeholder="예: 홍길동"
                  className="sfp-input"
                />
              </label>
              <PhoneInput
                label="기사 연락처"
                value={draftDriverPhone}
                onChange={setDraftDriverPhone}
                error={
                  draftDriverPhone && !KOREAN_MOBILE_PHONE_PATTERN.test(draftDriverPhone)
                    ? '올바른 휴대폰 번호 형식이 아닙니다'
                    : undefined
                }
              />
              <div className="driver-edit-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingDriver(false)}
                  disabled={driverMutation.isPending}
                >
                  취소
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  loading={driverMutation.isPending}
                  disabled={
                    !!draftDriverPhone
                    && !KOREAN_MOBILE_PHONE_PATTERN.test(draftDriverPhone)
                  }
                  onClick={() => driverMutation.mutate()}
                >
                  저장
                </Button>
              </div>
            </div>
          ) : (
            <div className="detail-grid">
              <DetailGridItem value={slip.driverName}>
                <span className="detail-label">기사명</span>
                <span className="detail-value">{slip.driverName ?? '-'}</span>
              </DetailGridItem>
              <DetailGridItem value={slip.driverPhone}>
                <span className="detail-label">기사 연락처</span>
                <span className="detail-value">{slip.driverPhone ?? '-'}</span>
              </DetailGridItem>
            </div>
          )}
          {driverMutation.isError ? (
            <div className="error-banner" role="alert" style={{ marginTop: 8 }}>
              기사 정보 저장에 실패했습니다.
            </div>
          ) : null}
          </MobileCollapsible>
        </Card>
      ) : null}

      {/* 매출/매입 인라인 편집 중에는 read-only 전용 툴바(재고조회·선택라인 행삭제 등)를 숨긴다 —
          행삭제는 인라인 draft 를 우회해 즉시 BE DELETE 라 stale draft→저장 시 409("다른 사용자") 오인
          위험(리뷰 라운드1 Design/FE BLOCKING). 편집 시 라인 삭제는 인라인 표의 행별 × 사용. */}
      {!((salesEditOpen && mode === 'OUTBOUND') || (purchaseEditOpen && mode === 'INBOUND')) ? (
        <>
      <h4 className="detail-section-title detail-mobile-hide" style={{ marginTop: 24 }}>전표 라인</h4>

      {/*
        Phase 2.6d: 재고조회 툴바 — 체크박스 다중선택 + "선택 품목 재고조회" 버튼.
        출고(OUTBOUND)·입고(INBOUND) mode 공통 동작.
      */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
          flexWrap: 'wrap',
        }}
      >
        <Button
          size="sm"
          variant="secondary"
          disabled={checkedLineIds.size === 0}
          onClick={() => setInventoryLookupOpen(true)}
          data-testid="slip-line-inventory-lookup-btn"
          title={
            checkedLineIds.size === 0
              ? '라인을 1개 이상 선택하세요'
              : `선택 ${checkedLineIds.size}건 재고조회`
          }
        >
          선택 품목 재고조회
          {checkedLineIds.size > 0 ? ` (${checkedLineIds.size})` : ''}
        </Button>
        {checkedLineIds.size > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setCheckedLineIds(new Set())}
          >
            선택 해제
          </Button>
        )}
      </div>

      {/*
        선택된 라인 액션 툴바 — 좌측 넘버링 클릭으로 행 선택 시 표시.
        행 추가·삭제·순서수정 (DRAFT/SAVED 만, BE 가드와 동일).
      */}
      {selectedLine ? (
        <div className="slip-line-toolbar" role="toolbar" aria-label="선택 라인 액션">
          <span className="slip-line-toolbar-label">
            선택: <strong>#{slip.lines.findIndex((l) => l.id === selectedLine.id) + 1}</strong>{' '}
            {selectedLine.modelName ?? '-'}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={!linesEditable}
            onClick={() => alert('행 추가 — SlipFormPage 에서 편집해주세요 (DRAFT/SAVED 만 BE 허용).')}
            title={linesEditable ? undefined : '작성 중/저장 단계에서만 가능'}
          >
            행 추가
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!linesEditable}
            onClick={() => alert('행 순서 수정 — SlipFormPage 의 drag-and-drop 사용해주세요.')}
            title={linesEditable ? undefined : '작성 중/저장 단계에서만 가능'}
          >
            순서 수정
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!linesEditable || removeLineMutation.isPending}
            onClick={handleRemoveLine}
            title={linesEditable ? undefined : '작성 중/저장 단계에서만 가능'}
          >
            행 삭제
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelectedLineId(null)}>
            선택 해제
          </Button>
        </div>
      ) : (
        <p className="slip-line-hint">
          좌측 번호를 클릭하면 해당 라인을 선택할 수 있습니다 (순서 수정 / 추가 / 삭제).
        </p>
      )}
        </>
      ) : null}

      {salesEditOpen && mode === 'OUTBOUND' ? (
        salesEditInlineForm
      ) : purchaseEditOpen && mode === 'INBOUND' ? (
        purchaseEditInlineForm
      ) : (
        <>
          <div className="slip-line-table-scroll desktop-only">
          <table className="slip-line-table">
            <thead>
              <tr>
                {/* Phase 2.6d: 재고조회 체크박스 컬럼 */}
                <th className="col-no" style={{ width: 28, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    aria-label="전체 선택"
                    checked={
                      slip.lines.length > 0 &&
                      slip.lines.every((l) => checkedLineIds.has(l.id))
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setCheckedLineIds(new Set(slip.lines.map((l) => l.id)))
                      } else {
                        setCheckedLineIds(new Set())
                      }
                    }}
                  />
                </th>
                <th className="col-no">#</th>
                <th className="col-model">모델명</th>
                <th className="col-product">품목명</th>
                <th className="col-spec">규격</th>
                <th className="col-qty">수량</th>
                <th className="col-price">단가(VAT포함)</th>
                <th className="col-supply">공급가액</th>
                <th className="col-vat">부가세</th>
                <th className="col-total">합계(VAT포함)</th>
              </tr>
            </thead>
            <tbody>
              {slip.lines.length === 0 ? (
                <tr>
                  <td colSpan={10} className="slip-line-empty">라인이 없습니다.</td>
                </tr>
              ) : (
                slip.lines.map((l, idx) => {
                  const selected = selectedLineId === l.id
                  const checked = checkedLineIds.has(l.id)
                  // 단가 부가세포함 전환: unitPriceWithVat 있으면 VAT포함 단가/공급가액/부가세 표시.
                  // legacy(없음) 는 unitPrice 를 공급단가로 보고 동일 방식 분해.
                  const supplyVal = l.supplyAmount != null ? Number(l.supplyAmount) : Number(l.lineTotal)
                  const vatVal = l.vatAmount != null ? Number(l.vatAmount) : vatFromSupply(supplyVal)
                  const unitWithVatVal = l.unitPriceWithVat != null
                    ? Number(l.unitPriceWithVat) : Number(l.unitPrice)
                  const totalInclVal = supplyVal + vatVal
                  return (
                    <tr key={l.id} className={selected ? 'is-selected' : undefined}>
                      {/* Phase 2.6d: 재고조회 체크박스 */}
                      <td style={{ textAlign: 'center', paddingLeft: 4 }}>
                        <input
                          type="checkbox"
                          aria-label={`${l.modelName ?? `라인 ${idx + 1}`} 재고조회 선택`}
                          checked={checked}
                          onChange={() => handleLineCheckToggle(l.id)}
                        />
                      </td>
                      <td className="col-no">
                        <button
                          type="button"
                          className={`slip-line-no-btn${selected ? ' is-selected' : ''}`}
                          aria-pressed={selected}
                          aria-label={`라인 ${idx + 1} 선택`}
                          onClick={() => setSelectedLineId(selected ? null : l.id)}
                        >
                          {idx + 1}
                        </button>
                      </td>
                      <td className="col-model">{renderRedlineCell(`lines[${idx}].modelName`, l.modelName ?? '-')}</td>
                      <td className="col-product">{renderRedlineCell(`lines[${idx}].productName`, l.productName ?? '-')}</td>
                      <td className="col-spec">{renderRedlineCell(`lines[${idx}].specification`, l.specification ?? '-')}</td>
                      <td className="col-qty">{renderRedlineCell(`lines[${idx}].quantity`, l.quantity.toLocaleString(), formatNumber)}</td>
                      <td className="col-price">{renderRedlineCell(`lines[${idx}].unitPrice`, unitWithVatVal.toLocaleString(), formatNumber)}</td>
                      <td className="col-supply">{supplyVal.toLocaleString()}</td>
                      <td className="col-vat">{vatVal.toLocaleString()}</td>
                      <td className="col-total">{renderRedlineCell(`lines[${idx}].lineTotal`, totalInclVal.toLocaleString(), formatNumber)}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
          </div>

          <div className="mobile-item-list" data-testid="slip-detail-mobile-lines">
            {slip.lines.length === 0 ? (
              <div className="mobile-item-card">
                <div className="mobile-item-total-row">
                  <span className="mobile-item-total-label">라인</span>
                  <span className="mobile-item-total-value">라인이 없습니다.</span>
                </div>
              </div>
            ) : (
              slip.lines.map((l, idx) => {
                const selected = selectedLineId === l.id
                const checked = checkedLineIds.has(l.id)
                const { totalIncl, unitWithVat } = slipLineAmounts(l)
                return (
                  <div key={l.id} className="mobile-item-card">
                    <div className="mobile-item-check-wrap">
                      <input
                        className="mobile-item-check"
                        type="checkbox"
                        aria-label={`${l.modelName ?? `라인 ${idx + 1}`} 재고조회 선택`}
                        checked={checked}
                        onChange={() => handleLineCheckToggle(l.id)}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="mobile-item-card-header">
                          <button
                            type="button"
                            className="slip-line-card-no"
                            aria-pressed={selected}
                            aria-label={`라인 ${idx + 1} 선택`}
                            onClick={() => setSelectedLineId(selected ? null : l.id)}
                          >
                            #{idx + 1}
                          </button>
                          <div className="mobile-item-name">
                            {renderRedlineCell(`lines[${idx}].productName`, l.productName ?? l.modelName ?? '-')}
                          </div>
                        </div>
                        {l.modelName ? (
                          <div className="mobile-item-model">{l.modelName}</div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mobile-item-divider" />

                    <div className="mobile-item-metrics">
                      <div className="mobile-item-metric">
                        <span className="mobile-item-metric-label">수량</span>
                        <span className="mobile-item-metric-value">
                          {l.quantity.toLocaleString()}
                        </span>
                      </div>
                      <div className="mobile-item-metric">
                        <span className="mobile-item-metric-label">단가(VAT포함)</span>
                        <span className="mobile-item-metric-value">
                          {unitWithVat.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="mobile-item-total-row">
                      <span className="mobile-item-total-label">합계(VAT포함)</span>
                      <span className="mobile-item-total-value">
                        {totalIncl.toLocaleString()}원
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </>
      )}

      {/* Phase 2.6d: 재고조회 모달 */}
      <InventoryLookupModal
        open={inventoryLookupOpen}
        onClose={() => setInventoryLookupOpen(false)}
        lines={inventoryLookupLines}
      />

      {/*
        Slice A: 결재 정보 카드 — 출고자/검수자 자동 채움 (Designer wireframes.md § 5 + ux-flow.md § 2)
        피드백 #9 해결.
      */}
      <Card padding={4} shadow="sm" style={{ marginTop: 24 }}>
        <h4 style={{ marginTop: 0 }}>결재 정보</h4>
        <div className="detail-grid">
          <div>
            <span className="detail-label">출고자</span>
            <span className="detail-value">
              {slip.dispatcher?.fullName
                ? `${slip.dispatcher.fullName} · ${formatHHmm(slip.dispatcher.signedAt)}`
                : '미수락'}
            </span>
          </div>
          <div>
            <span className="detail-label">검수자</span>
            <span className="detail-value">
              {slip.inspector?.fullName
                ? `${slip.inspector.fullName} · ${formatHHmm(slip.inspector.signedAt)}`
                : '미검수'}
            </span>
          </div>
          <div>
            <span className="detail-label">담당부서</span>
            <span className="detail-value">{slip.ownerDepartment ?? '-'}</span>
          </div>
          <div>
            <span className="detail-label">담당자</span>
            <span className="detail-value">{slip.ownerFullName ?? '-'}</span>
          </div>
        </div>
      </Card>

      {/*
        signature-slice-C 신규: 전자서명 정보 카드 (Designer wireframes.md §3).
        - signedAt 있을 때 SignatureViewer + 메타 + 공유링크 표시
        - MASTER 권한일 때만 [무효화] 버튼 노출 (Designer §3.4 권한 매트릭스)
        - 미서명 시 안내 메시지 (§3.2)
      */}
      <Card padding={4} shadow="sm" style={{ marginTop: 24 }}>
        <h4 style={{ marginTop: 0 }}>전자서명 정보</h4>
        {slip.signedAt && slip.signerName && slip.signaturePng ? (
          <>
            <SignatureViewer
              signaturePngBase64={slip.signaturePng}
              signerName={slip.signerName}
              signedAt={slip.signedAt}
              signatureHash={slip.signatureHash ?? null}
              size="desktop"
            />
            <div className="slip-signature-card-meta">
              <div>
                <span className="label">채널:</span>
                {slip.signatureChannel ?? 'MOBILE_CANVAS'}
              </div>
              {slip.signatureShareToken ? (
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                >
                  <span className="label">공유링크:</span>
                  <code
                    style={{
                      fontSize: 12,
                      background: 'var(--color-neutral-100)',
                      padding: '2px 6px',
                      borderRadius: 4,
                    }}
                  >
                    /share/{slip.signatureShareToken.slice(0, 12)}…
                  </code>
                  <CopyButton
                    text={`${window.location.origin}${window.location.pathname}#/mobile/share/${slip.signatureShareToken}`}
                    label="복사"
                  />
                </div>
              ) : null}
              {slip.signatureShareExpiresAt ? (
                <div>
                  <span className="label">만료:</span>
                  {slip.signatureShareExpiresAt.slice(0, 10)}
                </div>
              ) : null}
            </div>
            {/* [C5-2b] role==='MASTER' → canAccess('slip.signature', 'delete')
                BE @RequirePermission(page="slip.signature", action=DELETE) — MANAGER/MASTER 허용.
                IT: SlipPermissionControllerIT "signature invalidate" MANAGER DELETE 확인. */}
            {canAccess('slip.signature', 'delete') ? (
              <div className="slip-signature-card-actions">
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    setInvalidateReason('')
                    setInvalidateOpen(true)
                  }}
                  aria-label="서명 무효화"
                >
                  서명 무효화
                </Button>
                <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>
                  무효화 시 audit 로그에 영구 기록됩니다.
                </span>
              </div>
            ) : null}
          </>
        ) : (
          <p className="slip-signature-empty">
            아직 서명되지 않았습니다.
            <br />
            배송기사가 모바일 페이지에서 인수자 서명을 받으면 표시됩니다.
          </p>
        )}
      </Card>

      {/*
        signature-slice-C 신규: 무효화 confirm modal (MASTER only).
        Designer wireframes.md §3.3 — reason ≥10자 검증 + textarea + 카운터.
      */}
      <Modal
        open={invalidateOpen}
        onClose={() => {
          if (!invalidateSignatureMutation.isPending) {
            setInvalidateOpen(false)
          }
        }}
        title="서명 무효화"
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setInvalidateOpen(false)}
              disabled={invalidateSignatureMutation.isPending}
            >
              취소
            </Button>
            <Button
              variant="danger"
              loading={invalidateSignatureMutation.isPending}
              disabled={invalidateReason.trim().length < 10}
              onClick={() =>
                invalidateSignatureMutation.mutate(invalidateReason.trim())
              }
            >
              무효화
            </Button>
          </>
        }
      >
        <div className="slip-signature-invalidate-modal-body">
          <p style={{ margin: 0 }}>다음 서명을 무효화합니다.</p>
          {slip.signerName ? (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14 }}>
              <li>서명자: {slip.signerName}</li>
              <li>시각: {slip.signedAt?.slice(0, 16).replace('T', ' ') ?? '-'}</li>
            </ul>
          ) : null}
          <label htmlFor="invalidate-reason" style={{ fontSize: 13, fontWeight: 600 }}>
            사유 (필수, 최소 10자)
          </label>
          <textarea
            id="invalidate-reason"
            value={invalidateReason}
            onChange={(e) => setInvalidateReason(e.target.value.slice(0, 500))}
            maxLength={500}
            placeholder="무효화 사유를 입력해주세요 (감사 로그에 기록됩니다)"
          />
          <div className="reason-counter">{invalidateReason.length}/500</div>
          {invalidateSignatureMutation.isError ? (
            <div className="error-banner" role="alert">
              무효화에 실패했습니다.
            </div>
          ) : null}
        </div>
      </Modal>

      {/*
        반려 사유 입력 (필요 시) — 반려 가능 단계 (SENT/ACCEPTED) 에서 표시.
      */}
      {possibleActions.includes('reject') ? (
        <Card padding={4} shadow="sm" style={{ marginTop: 24 }}>
          <MobileCollapsible title="반려 사유">
          <h4 style={{ marginTop: 0 }}>반려 사유</h4>
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="반려 사유 (반려 시 필수, 최대 500자)"
            maxLength={500}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid var(--color-neutral-300)',
              fontSize: 14,
              width: '100%',
            }}
          />
          <div style={{ marginTop: 8 }}>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canAccess('slip.reject', 'update') || transitionMutation.isPending}
              onClick={() => handleTransition('reject')}
            >
              {ACTION_LABEL['reject']}
              {!canAccess('slip.reject', 'update') ? ' (권한 부족)' : ''}
            </Button>
          </div>
          </MobileCollapsible>
        </Card>
      ) : null}

      {isMobile ? (
        <MobileCollapsible title="코멘트" className="mobile-section-card" defaultOpen>
          <SlipCollaborationPanel
            slipId={id}
            currentValues={collabEditValues}
            editMode={collabEditMode}
            onEditModeChange={setCollabEditMode}
            onCommitted={() => {
              void queryClient.invalidateQueries({ queryKey: ['slip', id] })
              void queryClient.invalidateQueries({ queryKey: ['slipAuditLogs', id] })
              void queryClient.invalidateQueries({ queryKey: ['slipRedline', id] })
            }}
          />
        </MobileCollapsible>
      ) : (
        <SlipCollaborationPanel
          slipId={id}
          currentValues={collabEditValues}
          editMode={collabEditMode}
          onEditModeChange={setCollabEditMode}
          onCommitted={() => {
            void queryClient.invalidateQueries({ queryKey: ['slip', id] })
            void queryClient.invalidateQueries({ queryKey: ['slipAuditLogs', id] })
            void queryClient.invalidateQueries({ queryKey: ['slipRedline', id] })
          }}
        />
      )}

      {/*
        하단 액션 버튼 (사용자 명시) — 전표 복사 / 삭제 (경고창 필수) / 완료 (다음 단계).
      */}
      {!isMobile ? (
      <div className="slip-detail-footer-actions" role="toolbar" aria-label="전표 액션">
        <Button
          variant="secondary"
          disabled={duplicateMutation.isPending}
          onClick={handleDuplicate}
        >
          전표 복사
        </Button>
        <Button
          variant="ghost"
          disabled={
            !possibleActions.includes('cancel')
            || !canAccess(slipActionPageCode('cancel').pageCode, 'update')
            || transitionMutation.isPending
          }
          onClick={handleDeleteSlip}
          title={
            !possibleActions.includes('cancel')
              ? '현재 단계에서는 삭제(취소) 불가'
              : !canAccess(slipActionPageCode('cancel').pageCode, 'update')
                ? '삭제(취소) 권한이 없습니다'
                : undefined
          }
        >
          삭제
        </Button>
        {slip.status === 'COMPLETED' && canCollabEdit ? (
          <Button
            variant="primary"
            data-testid="slip-collab-edit-footer"
            onClick={() => setCollabEditMode(true)}
          >
            수정
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={
              !nextPrimaryAction
              || !canAccess(slipActionPageCode(nextPrimaryAction).pageCode, 'update')
              || transitionMutation.isPending
            }
            onClick={handleAdvanceStage}
            title={
              nextPrimaryAction
                ? `다음 단계: ${ACTION_LABEL[nextPrimaryAction]}`
                : '현재 단계에서 진행 가능한 다음 단계가 없습니다'
            }
          >
            {nextPrimaryAction ? `완료 (${ACTION_LABEL[nextPrimaryAction]})` : '완료'}
          </Button>
        )}
      </div>
      ) : null}

      {errorMessage ? (
        <div className="error-banner" role="alert" style={{ marginTop: 12 }}>
          {errorMessage}
        </div>
      ) : null}

      {/*
        PR-H3: CONFIRMED 전표 수정/삭제 요청 사유 입력 다이얼로그.
        type=null 이면 미오픈. mutation 진행 중이면 백드롭/Esc 차단 (이중 호출 방지).
      */}
      <SlipEditRequestDialog
        open={editRequestDialogType !== null}
        onClose={() => setEditRequestDialogType(null)}
        type={(editRequestDialogType ?? 'EDIT') as SlipEditRequestUiType}
        slipNo={slip.slipNo}
        submitting={editRequestMutation.isPending}
        errorMessage={
          editRequestMutation.isError
            ? (() => {
                const err = editRequestMutation.error
                if (axios.isAxiosError(err)) {
                  const data = err.response?.data as { message?: string } | undefined
                  return data?.message ?? '요청 전송에 실패했습니다.'
                }
                return '요청 전송에 실패했습니다.'
              })()
            : null
        }
        onSubmit={(reason) => {
          if (editRequestDialogType === null) return
          editRequestMutation.mutate({
            type: editRequestDialogType,
            reason,
          })
        }}
      />

      {/*
        SP-08-5-3: 매입 전표 삭제 확인 modal.
        - UUID 비공개 가드: slipNo 만 표시 (id 미노출).
        - 409 충돌 시 "최신 내용 불러오기" 배너 표시 + refetch 후 재시도.
      */}
      <Modal
        open={purchaseDeleteOpen}
        onClose={() => {
          if (!deletePurchaseSlipMutation.isPending) {
            setPurchaseDeleteOpen(false)
            setPurchaseDeleteConflict(false)
            setPurchaseDeleteInspectionAlert(null)
          }
        }}
        title="매입 전표 삭제"
        size="sm"
        data-testid="purchase-slip-delete-confirm"
        footer={(
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPurchaseDeleteOpen(false)
                setPurchaseDeleteConflict(false)
                setPurchaseDeleteInspectionAlert(null)
              }}
              disabled={deletePurchaseSlipMutation.isPending}
              data-testid="purchase-slip-delete-confirm-no"
            >
              취소
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={deletePurchaseSlipMutation.isPending}
              disabled={deletePurchaseSlipMutation.isPending}
              onClick={() => {
                if (deletePurchaseSlipMutation.isPending) return
                setPurchaseDeleteInspectionAlert(null)
                setPurchaseDeleteConflict(false)
                deletePurchaseSlipMutation.mutate()
              }}
              data-testid="purchase-slip-delete-confirm-yes"
            >
              삭제
            </Button>
          </>
        )}
      >
        <Card padding={4} shadow="none">
          <p style={{ margin: 0, marginBottom: 8, fontSize: 15 }}>
            정말 삭제하시겠습니까?
          </p>
          <p
            style={{
              margin: 0,
              marginBottom: 16,
              fontSize: 13,
              color: 'var(--color-neutral-600)',
            }}
          >
            전표번호: <strong>{slip.slipNo}</strong>
          </p>
          <p style={{ margin: 0, fontSize: 13 }} className="danger-text">
            삭제된 전표는 복구할 수 없습니다.
          </p>
          {purchaseDeleteInspectionAlert && (
            <div
              className="danger-banner"
              role="alert"
              data-testid="purchase-slip-delete-inspection-banner"
              style={{ marginTop: 12 }}
            >
              {purchaseDeleteInspectionAlert}
            </div>
          )}
          {purchaseDeleteConflict ? (
            <div
              className="danger-banner"
              role="alert"
              data-testid="purchase-slip-delete-conflict-banner"
              style={{ marginTop: 12 }}
            >
              <strong>다른 사용자가 먼저 수정했습니다. 최신 내용 불러오기 후 다시 시도해 주세요.</strong>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                style={{ marginTop: 8 }}
                onClick={async () => {
                  const result = await refetchDetail()
                  if (result.data) {
                    setPurchaseDeleteConflict(false)
                  }
                }}
              >
                최신 내용 불러오기
              </Button>
            </div>
          ) : null}
        </Card>
      </Modal>

      {/*
        SP-08-6-3: 매출 전표 삭제 확인 modal.
        - UUID 비공개 가드: slipNo 만 표시 (id 미노출).
        - 409 충돌 시 "최신 내용 불러오기" 배너 표시 + refetch 후 재시도.
        - 422 SHIPPED 시 삭제 불가 안내.
      */}
      <Modal
        open={salesDeleteOpen}
        onClose={() => {
          if (!deleteSalesSlipMutation.isPending) {
            setSalesDeleteOpen(false)
            setSalesDeleteConflict(false)
            setSalesDeleteShippedAlert(null)
            setSalesDeleteForbiddenAlert(null)
            setSalesDeleteErrorAlert(null)
          }
        }}
        title="매출 전표 삭제"
        size="sm"
        data-testid="sales-slip-delete-confirm"
        footer={(
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSalesDeleteOpen(false)
                setSalesDeleteConflict(false)
                setSalesDeleteShippedAlert(null)
                setSalesDeleteForbiddenAlert(null)
                setSalesDeleteErrorAlert(null)
              }}
              disabled={deleteSalesSlipMutation.isPending}
              data-testid="sales-slip-delete-confirm-no"
            >
              취소
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={deleteSalesSlipMutation.isPending}
              disabled={
                deleteSalesSlipMutation.isPending ||
                salesDeleteShippedAlert !== null ||
                salesDeleteForbiddenAlert !== null
              }
              onClick={() => {
                if (deleteSalesSlipMutation.isPending) return
                setSalesDeleteShippedAlert(null)
                setSalesDeleteConflict(false)
                setSalesDeleteForbiddenAlert(null)
                setSalesDeleteErrorAlert(null)
                deleteSalesSlipMutation.mutate()
              }}
              data-testid="sales-slip-delete-confirm-yes"
            >
              삭제
            </Button>
          </>
        )}
      >
        <Card padding={4} shadow="none">
          <p style={{ margin: 0, marginBottom: 8, fontSize: 15 }}>
            정말 삭제하시겠습니까?
          </p>
          <p
            style={{
              margin: 0,
              marginBottom: 16,
              fontSize: 13,
              color: 'var(--color-neutral-600)',
            }}
          >
            전표번호: <strong>{slip.slipNo}</strong>
            {slip.partnerName ? (
              <>
                <br />
                거래처: <strong>{slip.partnerName}</strong>
              </>
            ) : (
              <>
                <br />
                거래처: <strong>-</strong>
              </>
            )}
          </p>
          <p style={{ margin: 0, fontSize: 13 }} className="danger-text">
            삭제된 전표는 복구할 수 없습니다.
          </p>
          {salesDeleteShippedAlert && (
            <div
              className="danger-banner"
              role="alert"
              data-testid="sales-slip-delete-shipped-banner"
              style={{ marginTop: 12 }}
            >
              <strong>삭제 불가</strong>
              <p style={{ margin: '4px 0 0 0' }}>출고 진행 중이거나 완료된 매출 전표는 삭제할 수 없습니다.</p>
            </div>
          )}
          {salesDeleteForbiddenAlert && (
            <div
              className="danger-banner"
              role="alert"
              data-testid="sales-slip-delete-forbidden-banner"
              style={{ marginTop: 12 }}
            >
              {salesDeleteForbiddenAlert}
            </div>
          )}
          {salesDeleteErrorAlert && (
            <div
              className="danger-banner"
              role="alert"
              data-testid="sales-slip-delete-error-banner"
              style={{ marginTop: 12 }}
            >
              {salesDeleteErrorAlert}
            </div>
          )}
          {salesDeleteConflict ? (
            <div
              className="danger-banner"
              role="alert"
              data-testid="sales-slip-delete-conflict-banner"
              style={{ marginTop: 12 }}
            >
              <strong>다른 사용자가 먼저 수정했습니다. 최신 내용 불러오기 후 다시 시도해 주세요.</strong>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                style={{ marginTop: 8 }}
                onClick={async () => {
                  const result = await refetchDetail()
                  if (result.data) {
                    setSalesDeleteConflict(false)
                  }
                }}
              >
                최신 내용 불러오기
              </Button>
            </div>
          ) : null}
        </Card>
      </Modal>
    </>
  )

  /**
   * 수량 셀 편집. 로컬 state 는 함수형 patch 로 넘겨 setState 업데이터 내부의 최신(직전
   * patch 반영 후) 라인으로 계산한다(LinePatch 주석 — ref 스냅샷 경합 차단). Y.Doc 동기화는
   * {@code preEditLine}(JSX map 클로저 — 이번 편집 직전 스냅샷)으로 별도 계산해
   * {@link syncDetailAmountToDoc} 에 동기로 넘긴다(발견 2, #937 R1 근본수정 — 그 함수 주석이
   * "동기" 여야 하는 이유를 설명한다).
   */
  function updateDetailQuantity(
    index: number,
    update: (index: number, patch: LinePatch) => void,
    provider: DocCoeditProvider | null,
    preEditLine: PurchaseEditLine,
    value: string,
  ) {
    update(index, (line) => computeDetailQuantityChange(line, value))
    syncDetailAmountToDoc(provider, preEditLine, computeDetailQuantityChange(preEditLine, value))
  }

  /**
   * 단가 셀 편집 — 발견 1(#937 R1) 근본수정. {@link updateDetailQuantity} 와 동일 구조
   * (함수형 patch + preEditLine 스냅샷). 재조회 강조 해제(clearRepriceHighlight)는 호출부가
   * closure 의 `line.lineId` 로 직접 처리한다.
   */
  function updateDetailUnitPrice(
    index: number,
    update: (index: number, patch: LinePatch) => void,
    provider: DocCoeditProvider | null,
    preEditLine: PurchaseEditLine,
    value: string,
  ) {
    update(index, (line) => computeDetailUnitPriceChange(line, value))
    syncDetailAmountToDoc(provider, preEditLine, computeDetailUnitPriceChange(preEditLine, value))
  }

  function updateDetailVat(
    index: number,
    update: (index: number, patch: LinePatch) => void,
    authority: 'SUPPLY' | 'VAT',
    value: string,
  ) {
    update(index, (line) => detailAmountState(editSlipLineAmount(detailVatLine(line), authority, value), authority))
  }

  function updatePurchaseLine(index: number, patch: LinePatch) {
    // 단가를 직접 편집하면 그 행의 재조회 강조를 해제한다(사용자가 값을 확정/재확인).
    // 함수형 patch(수량/VAT 권위 편집의 파생값)는 사용자의 직접 단가 편집이 아니므로 대상 밖.
    if (typeof patch !== 'function' && patch.unitPrice !== undefined) {
      clearRepriceHighlight(purchaseEditLinesRef.current[index]?.lineId)
    }
    setPurchaseEditLines((prev) => prev.map((line, i) => (
      i === index ? { ...line, ...(typeof patch === 'function' ? patch(line) : patch) } : line
    )))
  }

  function removePurchaseLine(index: number) {
    clearRepriceHighlight(purchaseEditLinesRef.current[index]?.lineId)
    setPurchaseEditLines((prev) => {
      const next = prev.filter((_, i) => i !== index)
      slipFormCoeditProvider?.replaceItems(next)
      return next
    })
  }

  // SP-08-6-2: 매출 수정 라인 헬퍼
  function updateSalesLine(index: number, patch: LinePatch) {
    // 단가를 직접 편집하면 그 행의 재조회 강조를 해제한다(사용자가 값을 확정/재확인).
    if (typeof patch !== 'function' && patch.unitPrice !== undefined) {
      clearRepriceHighlight(salesEditLinesRef.current[index]?.lineId)
    }
    setSalesEditLines((prev) => prev.map((line, i) => (
      i === index ? { ...line, ...(typeof patch === 'function' ? patch(line) : patch) } : line
    )))
  }

  /** 재조회 강조에서 특정 lineId 를 제거한다(사용자 직접 편집 시). */
  function clearRepriceHighlight(lineId: string | null | undefined) {
    if (!lineId) return
    setRepriceChangedLineIds((prev) => {
      if (!prev.has(lineId)) return prev
      const next = new Set(prev)
      next.delete(lineId)
      return next
    })
    // 사용자가 단가를 직접 확정하면 자동 출처/미확보 경고도 해제한다.
    setRepriceOutcomeByLineId((prev) => {
      if (!prev.has(lineId)) return prev
      const next = new Map(prev)
      next.delete(lineId)
      return next
    })
  }

  function removeSalesLine(index: number) {
    clearRepriceHighlight(salesEditLinesRef.current[index]?.lineId)
    setSalesEditLines((prev) => {
      const next = prev.filter((_, i) => i !== index)
      slipFormCoeditProvider?.replaceItems(next)
      return next
    })
  }
}
