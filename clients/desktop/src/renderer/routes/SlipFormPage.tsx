/**
 * 전표 작성 화면 (출고/입고 공용) — sales-form-polish 슬라이스 v3.
 *
 * Designer (5-team) spec (`docs/design/sales-form-polish-slice/`) 충실 반영.
 *
 * v3 변경사항 (sales-form-polish 슬라이스 — 본 PR):
 * - 라인 입력 → `<LineRow>` 디자인 시스템 컴포넌트 (10-column dense table)
 * - drag-and-drop 라인 순서 변경 — `@dnd-kit/sortable`
 *   (DndContext + SortableContext + useSortable + 마우스 + 키보드 sensor)
 * - 행 체크박스 + 헤더 체크박스 (전체 선택 / indeterminate)
 * - 행 클릭/체크 시 selected state — 좌측 4px 파란 띠 + 배경 변화
 * - 헤더에 [선택 항목 재고조회] 버튼 — 가용/실/예약 재고 모달
 * - `<InventoryLookupModal>` 모달 (모델명 × 창고 matrix)
 * - 자동 라인 번호 (drag 시 자동 갱신)
 * - 합계 영역 헤더 — 4건 / 공급가액 / 부가세 / 총 (모던 미니멀 dense)
 * - 신규 디자인 토큰 (`--surface-*`, `--ink-*`, `--row-h` 등) 적용
 *
 * UUID 비공개 가드 (memory `feedback_uuid_no_user_visibility.md`):
 * - LineDraft.id 는 dnd-kit key 용 — 화면 미노출 (서버 UUID 또는 'tmp-N')
 * - LineDraft.productId 는 부모 state 로만 보관, 서버 호출 시 사용
 * - 모든 화면 표시 식별자는 modelName / productName / 창고 코드 등 비즈니스 라벨
 *
 * 본 컴포넌트는 `mode` prop 으로 OUTBOUND / INBOUND 양쪽 화면에서 재사용.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  Card,
  DeliveryTagSelector,
  FormField,
  Input,
  KOREAN_MOBILE_PHONE_PATTERN,
  LineRow,
  LineTableHeader,
  PartnerAutocomplete,
  PhoneInput,
  ProductAutocomplete,
  WarehouseAutocomplete,
  type BundleSetOptions,
  type DeliveryTagOption,
  type LineDraft,
  type PartnerOption,
  type ProductOption,
} from '@samhan/design-system'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import axios from 'axios'
import {
  listWarehouses,
  type StockBalanceLookupLine,
} from '../api/inventory'
import {
  createSlip,
  expandBundleLine,
  getPriceMemory,
  lookupPartnerForAutoFill,
  emptyBundleSetOptions,
  toApiBundleSetOptions,
  type SlipLineInput,
  type SlipType,
} from '../api/slip'
import { getPartnerDcConfig } from '../api/sales'
import type { PartnerDcConfig } from '../api/sales'
import {
  computeUnloadDate,
  isScheduledTag,
  scheduleLabel,
} from '../utils/deliverySchedule'
import { toLocalDateISO } from '../utils/dateUtils'
import { isAutoPriceSource, shouldAutoFillPrice } from '../utils/priceSourceRules'
import {
  appendBlankRowIfLastChanged,
  ensureTrailingBlankRow,
  removeLinePreservingMinimum,
} from '../utils/autoBlankRow'
import {
  changeLineQuantity,
  editSlipLineAmount,
  recalculateLineVat,
  sumDisplayedLineVatAmounts,
  type LineVatLine,
} from '../utils/lineVat'
import {
  isLineContentEqual,
  lineIncompleteReason,
  willLineBeSaved,
  type LineIncompleteReason,
} from '../utils/slipLineDraft'
import { calculateSlipDiscount, type SlipDiscountConfig } from '../utils/slipDiscount'
import {
  partnerRepriceSessionIsCurrent,
  usePartnerPriceRefresh,
  withPriceLookupTimeout,
  type PartnerRepriceCandidate,
} from '../utils/usePartnerPriceRefresh'
import { searchProducts as searchProductsApi } from '../api/productApi'
import { searchPartners as searchPartnersApi } from '../api/partnerApi'
import { useIsMobile } from '../hooks/useIsMobile'
import { usePageTitle } from '../hooks/usePageTitle'
import { InventoryLookupModal } from './components/InventoryLookupModal'
import { BundleOptionRow } from './components/BundleOptionRow'

/**
 * 본 슬라이스용 OUTBOUND 배송태그 옵션 — BE `DeliveryTag` enum 의 OUTBOUND 8종.
 */
const OUTBOUND_TAG_OPTIONS: DeliveryTagOption[] = [
  { code: 'DAY', displayName: '당일', direction: 'OUTBOUND', autoMemo: false },
  { code: 'STACK', displayName: '야적', direction: 'OUTBOUND', autoMemo: true },
  { code: 'REGION', displayName: '지방', direction: 'OUTBOUND', autoMemo: true },
  { code: 'LOGEN', displayName: '로젠택배', direction: 'OUTBOUND', autoMemo: false },
  { code: 'GYEONGDONG_PARCEL', displayName: '경동택배', direction: 'OUTBOUND', autoMemo: false },
  { code: 'GYEONGDONG_FREIGHT', displayName: '경동화물', direction: 'OUTBOUND', autoMemo: false },
  { code: 'RENTAL', displayName: '대여', direction: 'OUTBOUND', autoMemo: false },
  { code: 'RETURN_RENTAL', displayName: '반납', direction: 'OUTBOUND', autoMemo: false },
]

/** 임시 라인 ID 생성기 — UUID 노출 방지를 위해 프론트 prefix 사용. */
let __tempIdCounter = 0
const nextTempId = (): string => `tmp-${++__tempIdCounter}`

const emptyLine = (): LineDraft => ({
  id: nextTempId(),
  productId: null,
  modelName: '',
  productName: '',
  specification: '', // Slice A 신규 (피드백 #4)
  quantity: '1',
  unitPrice: '0',
  supplyAmount: '0',
  vatAmount: '0',
  lineTotal: '0',
  authority: 'PRICE',
  vatWarning: false,
  priceSource: null,
  catalogUnitPrice: null,
  priceMemoryUpdatedAt: null,
  lookupError: null,
  lookupLoading: false,
  productType: null,
  modelCode: null,
  setOptions: emptyBundleSetOptions(),
})

function asVatLine(line: LineDraft): LineDraft & LineVatLine {
  return {
    ...line,
    supplyAmount: line.supplyAmount ?? '0',
    vatAmount: line.vatAmount ?? '0',
    lineTotal: line.lineTotal ?? '0',
  }
}

const calcVatInclusiveLine = (
  quantity: string,
  unitPrice: string,
): { incl: number; supply: number; vat: number } => {
  const q = Number(quantity)
  const p = Number(unitPrice)
  if (!Number.isFinite(q) || !Number.isFinite(p)) {
    return { incl: 0, supply: 0, vat: 0 }
  }
  const incl = Math.round(q * p)
  // BLOCKING-2 계열(#824 R1): BE VatAmountCalculator 는 0 방향 절사(DOWN)다. incl/1.1 을 그대로
  // 나누면 1.1 의 이진부동소수 근사 오차가 섞이므로, incl×10 을 11 로 정수 나눗셈(트렁케이션)한다.
  const supply = Math.trunc((incl * 10) / 11)
  return { incl, supply, vat: incl - supply }
}

/**
 * #902 R3(개발책임자 직접 발견 회귀 fix, 모바일 표면 — LineRow.tsx 의 동일 로직과 대응).
 *
 * 이전 라운드(D7·H6)는 excludedFromSave 하나만 보고 공급가액/부가세/합계를 무조건 '0'으로
 * 강제했다 — 그 값이 controlled input 의 value 라서, 사용자가 이 칸들에 아무리 입력해도
 * 다음 렌더에서 곧바로 '0'으로 되돌아갔다(H6′·H8 회귀). 억제 대상은 lineVat 의 수량 클램프
 * (Math.max(1,...))가 실제로 왜곡해 만든 "가짜" 값이지, 사용자가 직접 친 값이 아니다.
 *
 * - authority 가 'SUPPLY'/'VAT'/'TOTAL' 이면 사용자가 그 권위 그룹의 금액을 직접 편집한
 *   것 — quantity 를 공급가액/부가세/합계 계산에 전혀 쓰지 않는다 — 클램프 미관여. 억제
 *   하지 않는다. (#902 R5 갱신 — 개발책임자 결정 2026-07-25 "금액 열 편집 정책": 이 화면의
 *   SUPPLY/VAT 편집은 이제 {@code lineVat.editSlipLineAmount} 를 거친다 — quantity 는
 *   물론 unitPrice 도 건드리지 않는 전용 함수라 이 결론이 전보다도 더 단순하게 성립한다.
 *   TOTAL 은 이 화면에 편집 UI 자체가 없어졌다(P1) — line.authority 타입에는 남아있지만
 *   이 화면에서 실제로 생성되지는 않는다. 그래도 혹시 남아있어도 이 억제 판정은 그대로
 *   안전하다: PRICE 가 아니라는 사실만으로 억제 대상에서 제외되기 때문.)
 * - authority 가 'PRICE'(기본값 포함)면 세 값이 quantity 를 그대로(클램프 거쳐) 곱해
 *   계산된다 — 실제 quantity 가 이미 1 이상으로 유효하면 클램프는 아무 것도 왜곡하지 않은
 *   것이라(무영향) 억제하지 않는다. 실제 quantity 가 0 이하(빈 값 포함)일 때만 클램프가
 *   "수량 1"을 대신 밀어넣어 값을 왜곡한다 — 이때만 억제해 H9(원 D7)의 모순을 막는다.
 */
function shouldSuppressComputedAmounts(line: LineDraft, excludedFromSave: boolean): boolean {
  if (!excludedFromSave) return false
  const isPriceAuthorityOrUnset = line.authority == null || line.authority === 'PRICE'
  const quantityInvalid = !(Number(line.quantity) > 0)
  return isPriceAuthorityOrUnset && quantityInvalid
}

/** 금액 입력은 숫자와 천단위 콤마만 허용하고, 잘못된 문자열은 숫자로 재조합하지 않는다. */
function parseEditableAmountInput(raw: string): string | null {
  if (/^\d*$/.test(raw)) return raw
  if (raw.includes(',,')) return null
  if (!/^\d{1,3}(?:,\d{0,3})+$/.test(raw)) return null
  return raw.replace(/,/g, '')
}

function PriceChangeIndicator({ id }: { id: string }) {
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
 * 사용자가 입력을 시작했지만 현행 저장 조건을 아직 만족하지 못한 행의 안내.
 * 초기 빈 행에는 렌더하지 않아, 입력 전부터 오류처럼 보이지 않게 한다.
 *
 * #902 R2 D4·H4: 문구는 `reason` 이 가리키는 실제 조건만 말한다 — 빈 행의 수량은 이미
 * '1'로 채워져 있어 "수량을 모두 입력하면"은 이미 만족된 조건이고(진짜 할 일=품목 선택이
 * 묻힘), 반대로 품목 선택 후 수량을 0/음수로 둔 행에는 "수량을 입력하면"이 틀린 말이었다
 * (진짜 조건은 "0보다 커야 한다").
 */
function IncompleteLineNotice({
  lineNumber,
  reason,
}: {
  lineNumber: number
  reason: LineIncompleteReason
}) {
  const message =
    reason === 'NEEDS_PRODUCT'
      ? '입력 중인 행입니다. 품목을 선택하면 저장되며, 현재는 저장에서 제외됩니다.'
      : '입력 중인 행입니다. 수량을 1 이상 입력하면 저장되며, 현재는 저장에서 제외됩니다.'
  return (
    <div
      role="note"
      data-testid={`line-${lineNumber}-incomplete-notice`}
      style={{
        padding: '6px 12px',
        color: 'var(--ink-secondary, #5C6773)',
        background: 'var(--surface-subtle, #F8FAFC)',
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      {message}
    </div>
  )
}

function SlipMobileLineCard(props: {
  line: LineDraft
  lineNumber: number
  selected: boolean
  canDelete: boolean
  /** 거래처 선택 여부 (R4-D4) — 미선택 시 CATALOG 카피 분기 + REMEMBERED 마커 해제(D-R4-4). */
  partnerSelected: boolean
  onSelect: (selected: boolean) => void
  onSpecificationChange: (value: string) => void
  onQuantityChange: (value: string) => void
  onUnitPriceChange: (value: string) => void
  onSupplyAmountChange: (value: string) => void
  onVatAmountChange: (value: string) => void
  vatEditable: boolean
  /**
   * 저장에서 제외될 예정(#902 R2 D7·H6) — true 라고 해서 금액 열 표시가 무조건 0 으로
   * 강제되지 않는다(#902 R3 정정 — {@link shouldSuppressComputedAmounts} 참고). 사용자가
   * 공급가액/부가세/합계 중 하나를 직접 편집했거나(authority 승격) quantity 가 이미
   * 유효(>0)하면 실제 값을 그대로 보여준다(H6′·H8) — 수량 클램프가 실제로 왜곡한 값만 억제.
   */
  excludedFromSave: boolean
  onDelete: () => void
  modelCell: ReactNode
  footer?: ReactNode
}) {
  const vatBreakdown = calcVatInclusiveLine(
    props.line.quantity,
    props.line.unitPrice,
  )
  const priceStatusId = `slip-mobile-price-status-${props.line.id}`
  const priceChangedStatusId = `slip-mobile-price-changed-${props.line.id}`
  // D-R4-1: 자동채움 실체 = 제품 등록 화면 '판매가'(sellingPrice) — '정가' 라벨 금지(출고가 별칭 오도).
  // D-R4-4: 거래처 해제 시 단가값은 유지하고 마커(저장일 포함)만 해제 — LineRow(데스크탑)와 동일 분기.
  const priceStatus = props.line.priceSource === 'REMEMBERED'
    ? (props.partnerSelected ? '거래처 최근단가' : null)
    : props.line.priceSource === 'CATALOG'
      ? '판매가'
      : null
  const priceStatusDescription = props.line.priceSource === 'REMEMBERED'
    ? (props.partnerSelected
        ? `이 거래처에 마지막으로 저장된 단가${props.line.priceMemoryUpdatedAt ? ` · ${props.line.priceMemoryUpdatedAt.slice(0, 10)} 저장` : ''}`
        : null)
    : props.line.priceSource === 'CATALOG'
      ? (props.partnerSelected
          ? '이 거래처에 저장된 최근단가가 없어 판매가를 적용했습니다'
          : '판매가를 적용했습니다')
      : null
  const priceDescribedBy = [
    priceStatusDescription ? priceStatusId : null,
    props.line.priceRefreshChanged ? priceChangedStatusId : null,
  ]
    .filter((id): id is string => id !== null)
    .join(' ') || undefined

  return (
    <div
      className={`mobile-line-card${props.line.priceRefreshChanged ? ' price-memory-refreshed-row' : ''}`}
      data-line-index={props.lineNumber}
    >
      <div className="mobile-line-card-header">
        <label className="mobile-line-check">
          <input
            type="checkbox"
            checked={props.selected}
            onChange={(e) => props.onSelect(e.target.checked)}
            aria-label={`라인 ${props.lineNumber} 선택`}
          />
          <span className="mobile-line-card-index">{props.lineNumber}</span>
        </label>
        {props.line.priceRefreshChanged ? <PriceChangeIndicator id={priceChangedStatusId} /> : null}
        <button
          type="button"
          className="mobile-line-remove-button"
          onClick={props.onDelete}
          disabled={!props.canDelete}
          aria-label={`라인 ${props.lineNumber} 삭제`}
        >
          삭제
        </button>
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">품목</label>
        {props.modelCell}
        {props.line.lookupError ? (
          <div className="mobile-line-error">{props.line.lookupError}</div>
        ) : null}
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">품목명</label>
        <div className="mobile-line-readonly">
          {props.line.productName || (props.line.lookupLoading ? '조회중...' : '모델명 조회 후 자동입력')}
        </div>
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">규격</label>
        <input
          type="text"
          className="mobile-line-text-input"
          value={props.line.specification}
          onChange={(e) => props.onSpecificationChange(e.target.value)}
          placeholder="예: 220V"
          maxLength={50}
          aria-label={`라인 ${props.lineNumber} 규격`}
        />
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">수량</label>
        <input
          type="number"
          min={1}
          className="mobile-line-text-input mobile-line-number-input"
          value={props.line.quantity}
          onChange={(e) => {
            // #902 R3 H7′(H7 대체, 개발책임자 회귀 지시 S5 — 데스크톱 LineRow 와 동일 규약):
            // 종전 D8 fix 는 문자 단위로 숫자가 아닌 문자만 제거해 "2.7"→"27"(10배 오주문),
            // "-3"→"3", "1e3"→"13" 처럼 자릿수가 재조합되어 사용자가 의도하지 않은 다른
            // 수량이 조용히 만들어졌다. 전체 문자열이 순수 자연수(빈 값 포함)일 때만 그대로
            // 받아들이고, 아니면 이 입력 자체를 반영하지 않는다(controlled input 이라 다음
            // 렌더에서 이전 값으로 자동 복귀).
            if (!/^\d*$/.test(e.target.value)) return
            props.onQuantityChange(e.target.value)
          }}
          aria-label={`라인 ${props.lineNumber} 수량`}
        />
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">단가(VAT포함)</label>
        <input
          type="text"
          inputMode="numeric"
          className="mobile-line-text-input mobile-line-number-input"
          value={props.line.unitPrice}
          onChange={(e) => {
            const numeric = parseEditableAmountInput(e.target.value)
            if (numeric !== null) props.onUnitPriceChange(numeric)
          }}
          aria-label={`라인 ${props.lineNumber} 단가`}
          aria-describedby={priceDescribedBy}
        />
        {/* R4-D2: 라인별 aria-live 제거 — 전역 고지는 배너(role="status") 1곳, 포커스 시 전달은
            aria-describedby 체인이 담당. */}
        {priceStatus && priceStatusDescription ? (
          <span
            id={priceStatusId}
            role="note"
            aria-label={priceStatusDescription}
            title={priceStatusDescription}
            className="price-source-note"
          >
            {priceStatus}
          </span>
        ) : null}
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">금액(VAT포함)</label>
        {/*
          P1(개발책임자 결정 2026-07-25 "금액 열 편집 정책"): 합계는 공급가액+부가세로만
          파생되고 사용자가 직접 입력할 수단이 없다. 종전에는 <input>으로 편집 가능했으나
          (그 경로 제거), 이제는 읽기전용 표시로 통일한다 — 데스크톱 LineRow.tsx의 동일
          변경과 대응.
        */}
        <div
          className="mobile-line-readonly"
          aria-label={`라인 ${props.lineNumber} 합계(VAT포함)`}
        >
          {shouldSuppressComputedAmounts(props.line, props.excludedFromSave) ? '0' : Number(props.line.lineTotal ?? vatBreakdown.incl).toLocaleString()}
        </div>
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">공급가액</label>
        <input
          type="text"
          inputMode="numeric"
          className="mobile-line-text-input mobile-line-number-input"
          value={shouldSuppressComputedAmounts(props.line, props.excludedFromSave) ? '0' : Number(props.line.supplyAmount ?? vatBreakdown.supply).toLocaleString()}
          onChange={(e) => {
            const numeric = parseEditableAmountInput(e.target.value)
            if (numeric !== null) props.onSupplyAmountChange(numeric)
          }}
          aria-label={`라인 ${props.lineNumber} 공급가액`}
          disabled={!props.vatEditable}
        />
      </div>

      <div className="mobile-line-field">
        <label className="mobile-line-field-label">부가세</label>
        <input
          type="text"
          inputMode="numeric"
          className="mobile-line-text-input mobile-line-number-input"
          value={shouldSuppressComputedAmounts(props.line, props.excludedFromSave) ? '0' : Number(props.line.vatAmount ?? vatBreakdown.vat).toLocaleString()}
          onChange={(e) => {
            const numeric = parseEditableAmountInput(e.target.value)
            if (numeric !== null) props.onVatAmountChange(numeric)
          }}
          aria-label={`라인 ${props.lineNumber} 부가세`}
          disabled={!props.vatEditable}
        />
        {props.line.vatWarning ? <span role="note">⚠ 부가세가 10%와 다릅니다</span> : null}
      </div>

      {props.footer}
    </div>
  )
}

export interface SlipFormPageProps {
  /** OUTBOUND (판매/출고) 또는 INBOUND (구매/입고). */
  mode: SlipType
}

interface ExpandedBundleOptionContext {
  parentProductId: string
  parentModelCode: string
  modelName: string
  specification: string
  quantity: string
  unitPrice: string
  /** 거래처 전환 시 이전 거래처 단가가 섞인 구성행 대신 부모 카탈로그 기준가로 재전개한다. */
  parentCatalogUnitPrice: string | null
  parentCategoryKey: LineDraft['categoryKey']
  parentFixedDiscountRate: number | null
  parentHasVariableDiscount: boolean | null
  setOptions: BundleSetOptions
  expansionPending: boolean
  /** 현재 부모 전개가 소유한 구성품 행 ID — 재전개 때 이전 형제 행까지 함께 교체한다. */
  componentLineIds?: string[]
}

/**
 * 지연된 세트 전개 응답을 반영할 때 비교하는 단일 최신성 스냅샷.
 * 품목·수량·단가·규격·모델 식별자·품목 유형·5개 세트 옵션을 여기서만 정의한다.
 */
interface BundleExpansionSnapshot {
  productId: string | null
  modelCode: string | null
  modelName: string
  productType: LineDraft['productType']
  quantity: string
  unitPrice: string
  specification: string
  setOptions: BundleSetOptions
}

const createBundleExpansionSnapshot = (line: LineDraft): BundleExpansionSnapshot => ({
  productId: line.productId,
  modelCode: line.modelCode ?? null,
  modelName: line.modelName,
  productType: line.productType,
  quantity: line.quantity,
  unitPrice: line.unitPrice,
  specification: line.specification,
  setOptions: {
    remoteOption: line.setOptions?.remoteOption ?? null,
    remoteExcluded: line.setOptions?.remoteExcluded ?? null,
    panelOption: line.setOptions?.panelOption ?? null,
    panelShape360: line.setOptions?.panelShape360 ?? null,
    materialIncluded: line.setOptions?.materialIncluded ?? null,
  },
})

const areBundleExpansionSnapshotsEqual = (
  left: BundleExpansionSnapshot | null,
  right: BundleExpansionSnapshot | null,
): boolean => {
  if (!left || !right) return left === right
  return left.productId === right.productId
    && left.modelCode === right.modelCode
    && left.modelName === right.modelName
    && left.productType === right.productType
    && left.quantity === right.quantity
    && left.unitPrice === right.unitPrice
    && left.specification === right.specification
    && left.setOptions.remoteOption === right.setOptions.remoteOption
    && left.setOptions.remoteExcluded === right.setOptions.remoteExcluded
    && left.setOptions.panelOption === right.setOptions.panelOption
    && left.setOptions.panelShape360 === right.setOptions.panelShape360
    && left.setOptions.materialIncluded === right.setOptions.materialIncluded
}

/**
 * dnd-kit useSortable 을 적용한 LineRow wrapper — SlipFormPage 내부 전용.
 *
 * useSortable 은 hook 이라 LineRow 외부에서 호출하고 setNodeRef + transform CSS
 * 를 wrapper div 에 부착, dragHandleProps 는 LineRow 의 DragHandle 에 전달.
 */
function SortableLineRow(props: {
  line: LineDraft
  lineNumber: number
  selected: boolean
  canDelete: boolean
  /** 거래처 선택 여부 (R4-D4) — LineRow 마커 카피 분기/해제에 전달. */
  partnerSelected: boolean
  onSelect: (s: boolean) => void
  onModelNameChange: (v: string) => void
  onModelNameBlur: (v: string) => void
  onSpecificationChange: (v: string) => void
  onQuantityChange: (v: string) => void
  onUnitPriceChange: (v: string) => void
  onSupplyAmountChange: (v: string) => void
  onVatAmountChange: (v: string) => void
  vatEditable: boolean
  /** 저장에서 제외될 예정(#902 R2 D7·H6) — LineRow 의 금액 표시 억제로 전달. */
  excludedFromSave: boolean
  onDelete: () => void
  /** AC-2: 모델명 셀 커스텀 렌더 slot (ProductAutocomplete 주입). */
  modelCell?: ReactNode
  /**
   * 라인 하단 부가 행 slot (세트 옵션 picker 등). sortable wrapper 내부에 렌더되어
   * 드래그 transform 이 라인+footer 를 하나로 이동시킨다(분리 방지).
   */
  footer?: ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.line.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // setNodeRef/transform 을 wrapper 에 부착 → LineRow + footer(옵션 picker) 동시 이동.
  return (
    <div ref={setNodeRef} style={style}>
      <LineRow
        isDragging={isDragging}
        vatInclusive
        vatEditable={props.vatEditable}
        excludedFromSave={props.excludedFromSave}
        lineNumber={props.lineNumber}
        line={props.line}
        selected={props.selected}
        canDelete={props.canDelete}
        partnerSelected={props.partnerSelected}
        onSelect={props.onSelect}
        onModelNameChange={props.onModelNameChange}
        onModelNameBlur={props.onModelNameBlur}
        onSpecificationChange={props.onSpecificationChange}
        onQuantityChange={props.onQuantityChange}
        onUnitPriceChange={props.onUnitPriceChange}
        onSupplyAmountChange={props.onSupplyAmountChange}
        onVatAmountChange={props.onVatAmountChange}
        onDelete={props.onDelete}
        modelCell={props.modelCell}
        dragHandleProps={{
          attributes: attributes as unknown as Record<string, unknown>,
          listeners: listeners as Record<string, unknown> | undefined,
          setActivatorNodeRef,
        }}
      />
      {props.footer}
    </div>
  )
}

/**
 * 출고/입고 공용 작성 화면.
 *
 * mode 별 차이 (출고전표 폼 정비 반영):
 * - OUTBOUND: 출고 창고 1개 + 출고구분(배송태그), 저장 후 `/sales` 로 이동
 * - INBOUND: 입고 창고 1개, 출고구분 미노출, 저장 후 `/purchases` 로 이동
 */
export function SlipFormPage({ mode }: SlipFormPageProps) {
  const navigate = useNavigate()
  const isOutbound = mode === 'OUTBOUND'
  const listPath = isOutbound ? '/sales' : '/purchases'
  const titleLabel = isOutbound ? '새 판매전표' : '새 입고전표'
  const isMobile = useIsMobile()

  // Slice A: AppHeader 동적 화면명 (Designer wireframes.md § 1.3)
  usePageTitle(titleLabel)

  const [sourceWh, setSourceWh] = useState<string | null>(null)
  const [destWh, setDestWh] = useState<string | null>(null)
  const [partnerName, setPartnerName] = useState('')
  const [memo, setMemo] = useState('')
  const [tag, setTag] = useState<DeliveryTagOption['code'] | null>(null)
  // 배송일정(M상N하) 에픽 — 지방/야적 선택 시 하차일(N)·당착 토글
  const [unloadDate, setUnloadDate] = useState<string>('')
  const [sameDay, setSameDay] = useState(false) // 당착 체크박스 (지방 한정)

  // 이카운트식 연속 입력을 위해 처음부터 빈 행 5개를 준비한다.
  const [lines, setLines] = useState<LineDraft[]>(() =>
    Array.from({ length: 5 }, () => emptyLine()),
  )
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [lineExpansionAnnouncement, setLineExpansionAnnouncement] = useState('')
  // #902 R2 D6·H5: 마지막 행 반복 증식 시 문구가 같은 라인 번호를 가리키면 완전히 동일한
  // 문자열이 되어 React 가 재렌더를 bail-out, 스크린리더가 재낭독하지 않는다. 매 증식마다
  // 이 카운터를 늘려 문구 끝에 보이지 않는 폭 없는 공백을 붙임으로써 DOM 텍스트 자체를
  // 실제로 바꾼다(시각적으로는 무영향 — 이 span 은 이미 스크린리더 전용으로 숨겨져 있다).
  const expansionSeqRef = useRef(0)
  /** 세트 전개 요청의 행별 최신성. 사용자 입력이 오면 이전 응답은 적용하지 않는다. */
  const bundleExpansionGenerationRef = useRef(new Map<string, number>())
  /** 빠른 1차 전개 뒤에도 옵션 입력을 유지할 구성품 행별 임시 세트 컨텍스트. */
  const [expandedBundleOptions, setExpandedBundleOptions] = useState<Record<string, ExpandedBundleOptionContext>>({})
  const expandedBundleOptionsRef = useRef(expandedBundleOptions)
  expandedBundleOptionsRef.current = expandedBundleOptions
  // link-dispatch-slice 신규 — 기사명 + 기사 휴대폰 (LinkDispatchListPage 자동 그룹의 키)
  const [driverName, setDriverName] = useState('')
  const [driverPhone, setDriverPhone] = useState('')

  // AC-3: 거래처 자동완성 선택 상태 (PartnerAutocomplete controlled value)
  const [selectedPartner, setSelectedPartner] = useState<PartnerOption | null>(null)
  const [partnerDcConfig, setPartnerDcConfig] = useState<PartnerDcConfig | null>(null)
  const [priceLookupAnnouncement, setPriceLookupAnnouncement] = useState('')
  const selectedPartnerIdRef = useRef<string | null>(null)
  const dcRequestSeqRef = useRef(0)
  selectedPartnerIdRef.current = selectedPartner?.id ?? null
  // R8-FE-3: 안내 낭독을 실제 적용 여부와 같은 조건으로 묶기 위한 최신 라인 스냅샷
  // (견적 EstimateFormPage.linesRef 와 동일 패턴 — 비대칭 해소).
  const linesRef = useRef(lines)
  linesRef.current = lines

  // D-R8-10: 거래처 변경 bulk 재조회는 전표 수정 모달(SlipDetailPage)과 공용 훅을 쓴다 —
  // 복붙 대신 단일 진실원(수명주기·조회·해석). LineDraft 적용은 아래 refreshAutoPricesForPartner.
  const partnerReprice = usePartnerPriceRefresh()

  // 거래처 snapshot — 자동완성 선택 시 채워짐(폼 미표시, 전표 기록/주소복사용).
  // eCount 12필드 입력 카드는 출고전표 폼 정비로 제거(ioType/timeDate/검수지/결제·할인·약정 등).
  const [customerTel, setCustomerTel] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')
  const [customerRepresentative, setCustomerRepresentative] = useState('')
  // 배송 정보 — 배송주소 / 감리주소 (V20 중 프로젝트명·인수자번호·입금예정일은 정비로 제거)
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [supervisionAddress, setSupervisionAddress] = useState('')
  const [supervisionSameAsDelivery, setSupervisionSameAsDelivery] = useState(false)
  // 자동 채움 상태
  const [autoFillError, setAutoFillError] = useState<string | null>(null)
  const [autoFillLoading, setAutoFillLoading] = useState(false)

  // 재고조회 모달 state — 신 InventoryLookupModal 은 자체 페치(useQuery).
  // 스냅샷은 모달 열린 채 라인 편집 시 표 흔들림 방지용으로 유지.
  const [stockModalOpen, setStockModalOpen] = useState(false)
  const [stockSelectedSnapshot, setStockSelectedSnapshot] = useState<
    StockBalanceLookupLine[]
  >([])
  /** 세트 전용 안내 스냅샷 (모달 열릴 때 확정) — §2-2 세트 재고 가드. */
  const [stockBundleOnlySnapshot, setStockBundleOnlySnapshot] = useState(false)
  /** 혼합 선택 시 제외된 세트 건수 스냅샷 (모달 열릴 때 확정) — P2-3 혼합선택 무고지 방지. */
  const [stockExcludedBundleSnapshot, setStockExcludedBundleSnapshot] = useState(0)

  const warehousesQuery = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  // KST 로컬 날짜 기준 (UTC 기준 toISOString().slice(0,10) 은 오전 0~8:59 에 하루 전 날짜를 반환함)
  const today = useMemo(() => toLocalDateISO(), [])

  // dnd-kit 마우스 + 키보드 sensor (Designer ux-flow.md § 1.2 + § 2.2 인용)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 }, // 4px 이상 드래그 시 시작 (text 선택 보호)
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  // ── 라인 조작 핸들러 ─────────────────────────────────────

  /**
   * 마지막 행이 이 편집으로 실제로 바뀌었으면(H2) 빈 행을 정확히 하나만 덧붙인다.
   *
   * #902 R2 근본원인 정정: 종전엔 "onChange 가 발화했는가"(touchedLineIds 이력)로 증식을
   * 트리거해, 화면상 아무 변화도 없는 제스처(단가 셀 Backspace 1회 등)도 빈 행을
   * 증식시켰다(D2). 이제는 `before`(편집 전 스냅샷)와 `after`(편집 후 값) 가 실제로
   * 다른지(`isLineContentEqual`)만 본다 — 값이 안 바뀌면 이력과 무관하게 증식하지 않는다.
   *
   * <p>위치 판정(`isLastLine`)은 유지한다 — 자동 증식으로 뒤에 새 빈 행이 생기면 그 순간
   * 이 행은 더 이상 "마지막 행"이 아니게 되어, 같은 행에 대한 후속 편집이 중복 증식을
   * 만들지 않는다(기존 "자동 증식 1회 1행" 불변식). 새 빈 행이 삭제돼 이 행이 다시
   * 마지막이 되면, 재편집(값이 실제로 다시 바뀌는 편집) 시 다시 증식한다 — 의도된 동작이다.
   *
   * <p>setLines updater 안에서 위치를 다시 확인해 연속 이벤트에도 중복 증식을 막는다.
   */
  const maybeExpandLastLine = (id: string, before: LineDraft, after: LineDraft) => {
    const isLastLine = linesRef.current[linesRef.current.length - 1]?.id === id
    if (!isLastLine || isLineContentEqual(before, after)) return
    const lineNumber = linesRef.current.length

    setLines((current) => {
      const idx = current.findIndex((line) => line.id === id)
      if (idx === -1 || idx !== current.length - 1) return current
      return appendBlankRowIfLastChanged(current, before, after, (line) => line.id, emptyLine, isLineContentEqual)
    })

    // D6·H5: 반복 증식이 같은 문구로 이어지지 않도록 보이지 않는 폭 없는 공백(U+200B)으로
    // 매번 문자열을 바꾼다(1~4개 순환 — 인접한 두 값은 항상 개수가 달라 문자열이 다르다).
    // 시각적으로는 무영향 — 이 span 은 이미 스크린리더 전용으로 화면에서 숨겨져 있다.
    expansionSeqRef.current += 1
    const zeroWidthSpace = '​'
    const rereadMarker = zeroWidthSpace.repeat((expansionSeqRef.current % 4) + 1)
    setLineExpansionAnnouncement(
      `라인 ${lineNumber} 입력 완료. 다음 입력 행 1개가 추가되었습니다.${rereadMarker}`,
    )
  }

  /** 사용자 셀 변경 공통 경로 — 제품 선택과 수량/금액/규격 입력이 같은 증식 규칙을 쓴다. */
  const updateLineFromUser = (id: string, updater: (line: LineDraft) => LineDraft) => {
    const before = linesRef.current.find((line) => line.id === id)
    bundleExpansionGenerationRef.current.set(id, (bundleExpansionGenerationRef.current.get(id) ?? 0) + 1)
    setLines((current) => current.map((line) => (
      line.id === id ? updater(line) : line
    )))
    if (!before) return
    const after = updater(before)
    const optionContext = expandedBundleOptionsRef.current[before.id]
    if (optionContext) {
      setExpandedBundleOptions((current) => ({
        ...current,
        [before.id]: {
          ...optionContext,
          specification: after.specification,
          quantity: after.quantity,
          unitPrice: after.unitPrice,
        },
      }))
    }
    maybeExpandLastLine(id, before, after)
  }

  const removeLine = (id: string) => {
    setLines((ls) => removeLinePreservingMinimum(
      ls,
      id,
      (line) => line.id,
      emptyLine,
      1,
      (line) => Boolean(line.productId),
    ))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setExpandedBundleOptions((current) => {
      const liveIds = new Set(linesRef.current.filter((line) => line.id !== id).map((line) => line.id))
      const next = Object.fromEntries(
        Object.entries(current).filter(([key]) => liveIds.has(key)),
      )
      return next
    })
    // #902 R2: 안내는 이제 이력(touchedLineIds)이 아니라 현재 내용의 순수 함수라(H1),
    // 행 삭제 시 별도로 지워줄 이력이 없다 — 배열에서 빠지는 즉시 안내도 함께 사라진다.
  }

  /** 품목명 재입력처럼 세트가 해제되는 사용자 행동은 해당 행의 전개만 무효화한다. */
  const invalidateBundleExpansionForLine = (id: string) => {
    bundleExpansionGenerationRef.current.set(id, (bundleExpansionGenerationRef.current.get(id) ?? 0) + 1)
    setExpandedBundleOptions((current) => {
      if (!current[id]) return current
      const next = { ...current }
      delete next[id]
      return next
    })
  }

  const updateLine = (id: string, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  /** 서버 저장과 같은 BundleExpander 결과로 선택 행을 구성품 행들로 교체한다. */
  const replaceWithExpandedBundleLines = (
    source: LineDraft,
    expanded: Awaited<ReturnType<typeof expandBundleLine>>,
    parentSpecification: string,
    discountConfig: SlipDiscountConfig | null = partnerDcConfig,
    parentContextOverrides: { unitPrice?: string } = {},
  ) => {
    const existingContext = expandedBundleOptionsRef.current[source.id]
    const context = existingContext ?? (source.productType === 'BUNDLE' && source.productId
      ? {
          parentProductId: source.productId,
          parentModelCode: source.modelCode ?? '',
          modelName: source.modelName,
          specification: parentSpecification,
          quantity: source.quantity,
          unitPrice: source.unitPrice,
          parentCatalogUnitPrice: source.catalogUnitPrice ?? null,
          parentCategoryKey: source.categoryKey ?? null,
          parentFixedDiscountRate: source.fixedDiscountRate ?? null,
          parentHasVariableDiscount: source.hasVariableDiscount ?? null,
          setOptions: source.setOptions ?? emptyBundleSetOptions(),
          expansionPending: false,
        }
      : null)
    const previousComponentLineIds = new Set([
      source.id,
      ...(existingContext?.componentLineIds ?? []),
    ])
    const parentProductId = context?.parentProductId ?? source.productId
    const parentModelCode = context?.parentModelCode ?? source.modelCode
    const parentUnitPrice = parentContextOverrides.unitPrice ?? context?.unitPrice ?? source.unitPrice
    const componentLines = expanded
      .filter((component) => component.productId)
      .map((component) => {
        const quantity = String(Math.max(1, Math.round(Number(component.quantity))))
        const catalogUnitPrice = String(component.unitPrice ?? '0')
        // 서버는 부모 세트 단가를 구성행에 이미 배분한다. 구성품 modelCode로
        // 정액DC를 다시 계산하면 플래그 구성품 수만큼 정액이 중복 차감된다.
        const unitPrice = catalogUnitPrice
        const isKeepParent = component.componentKind === null && source.productType === 'BUNDLE'
        const productType = isKeepParent
          ? 'BUNDLE'
          : 'SINGLE'
        const base = emptyLine()
        return {
          ...recalculateLineVat(asVatLine({
            ...base,
            productId: component.productId,
            modelName: component.modelName ?? '',
            productName: component.name ?? '',
            specification: component.specification ?? parentSpecification,
            quantity,
            unitPrice,
            productType,
            modelCode: component.modelCode ?? null,
            priceSource: 'CATALOG',
            catalogUnitPrice,
            discountInfo: null,
            ...(isKeepParent ? {} : {
              parentSetModel: parentModelCode ?? null,
              setHead: Boolean(component.setHead),
              bundleParentProductId: parentProductId,
              bundleParentUnitPrice: parentUnitPrice,
            }),
            setOptions: context?.setOptions ?? source.setOptions ?? emptyBundleSetOptions(),
          }), 'PRICE'),
          productId: component.productId,
          modelName: component.modelName ?? '',
          productName: component.name ?? '',
          specification: component.specification ?? parentSpecification,
          quantity,
          unitPrice,
          productType,
          modelCode: component.modelCode ?? null,
          priceSource: 'CATALOG',
          catalogUnitPrice,
          discountInfo: null,
          ...(isKeepParent ? {} : {
            parentSetModel: parentModelCode ?? null,
            setHead: Boolean(component.setHead),
            bundleParentProductId: parentProductId,
            bundleParentUnitPrice: parentUnitPrice,
          }),
          setOptions: context?.setOptions ?? source.setOptions ?? emptyBundleSetOptions(),
          lookupError: null,
          lookupLoading: false,
        } satisfies LineDraft
      })
    setLines((current) => {
      const index = current.findIndex((line) => line.id === source.id)
      if (index < 0) return current
      const remaining = current.filter((line) => !previousComponentLineIds.has(line.id))
      const insertionIndex = current
        .slice(0, index)
        .filter((line) => !previousComponentLineIds.has(line.id))
        .length
      const replacement = componentLines.length > 0
        ? componentLines
        : [{ ...emptyLine(), lookupError: '세트 구성품을 찾을 수 없습니다. 관리자에게 문의해 주세요.' }]
      const next = [
        ...remaining.slice(0, insertionIndex),
        ...replacement,
        ...remaining.slice(insertionIndex),
      ]
      return ensureTrailingBlankRow(next, emptyLine, (line) => Boolean(line.productId && Number(line.quantity) > 0))
    })
    setExpandedBundleOptions((current) => {
      // 컨텍스트 소유권은 화면의 실제 구성품 행 ID뿐이다. 재전개 중 사용자
      // 편집으로 남을 수 있는 productId 키 등 현재 행과 무관한 키를 함께 제거한다.
      const nextLineIds = new Set(linesRef.current.map((line) => line.id))
      nextLineIds.delete(source.id)
      componentLines.forEach((line) => nextLineIds.add(line.id))
      const next = Object.fromEntries(
        Object.entries(current).filter(([key]) => nextLineIds.has(key)),
      )
      const firstComponentLine = componentLines[0]
      const shouldExposeOptions = componentLines.length > 0
        && context
        && firstComponentLine !== undefined
        && (!existingContext || firstComponentLine.productId === source.productId)
      if (context && firstComponentLine && componentLines.length > 0) {
        // 전개 결과의 productId는 행 간에 재사용될 수 있으므로 옵션 컨텍스트의
        // 소유권은 항상 새로 만든 구성품 행 ID로 연결한다.
        const retainedContext = {
          ...context,
          unitPrice: parentContextOverrides.unitPrice ?? context.unitPrice,
          expansionPending: false,
          componentLineIds: componentLines.map((line) => line.id),
        }
        expandedBundleOptionsRef.current = {
          ...expandedBundleOptionsRef.current,
          [firstComponentLine.id]: retainedContext,
        }
        if (shouldExposeOptions) next[firstComponentLine.id] = retainedContext
      }
      return next
    })
    setSelectedIds((selected) => {
      const next = new Set(selected)
      next.delete(source.id)
      return next
    })
  }

  const expandSelectedBundle = async (
    source: LineDraft,
    selected: LineDraft,
    discountConfig: SlipDiscountConfig | null = partnerDcConfig,
    parentContextOverrides: { unitPrice?: string } = {},
  ): Promise<void> => {
    const generation = bundleExpansionGenerationRef.current.get(source.id) ?? 0
    const requestSnapshot = createBundleExpansionSnapshot(selected)
    const retryLatestBundleGeneration = async () => {
      const latest = linesRef.current.find((line) => line.id === source.id)
      const currentGeneration = bundleExpansionGenerationRef.current.get(source.id) ?? 0
      const context = expandedBundleOptionsRef.current[latest?.id ?? source.id]
      const latestBundle = latest?.productType === 'BUNDLE'
        ? latest
        : context
          ? {
              ...latest!,
              productId: context.parentProductId,
              modelCode: context.parentModelCode,
              modelName: context.modelName,
              specification: context.specification,
              quantity: context.quantity,
              unitPrice: context.unitPrice,
              productType: 'BUNDLE' as const,
              setOptions: context.setOptions,
            }
          : null
      const latestSnapshot = latestBundle ? createBundleExpansionSnapshot(latestBundle) : null
      if (areBundleExpansionSnapshotsEqual(requestSnapshot, latestSnapshot) && currentGeneration === generation) return false
      if (!latestBundle) return false
      await expandSelectedBundle(source, latestBundle, discountConfig)
      return true
    }
    const restorePreviousExpansion = (
      latest: LineDraft | undefined,
      context: ExpandedBundleOptionContext | undefined,
    ): boolean => {
      if (!latest || latest.productType === 'BUNDLE' || !context
        || context.parentProductId !== selected.productId) return false
      // 재전개 실패는 이미 저장 가능한 이전 구성품을 빈 행으로 바꾸지 않는다.
      // latest.setOptions는 실패한 요청 직전의 마지막 성공 옵션이다.
      const previousOptions = latest.setOptions ?? emptyBundleSetOptions()
      setLines((current) => current.map((line) => line.id === latest.id
        ? { ...line, setOptions: previousOptions, lookupError: null, lookupLoading: false }
        : line))
      setExpandedBundleOptions((current) => {
        const currentContext = current[latest.id]
        if (!currentContext) return current
        return {
          ...current,
          [latest.id]: { ...currentContext, setOptions: previousOptions, expansionPending: false },
        }
      })
      setLineExpansionAnnouncement('세트 구성품을 불러오지 못했습니다. 이전 구성을 유지합니다.')
      return true
    }
    try {
      const expanded = await expandBundleLine({
        parentModelCode: selected.modelCode ?? '',
        quantity: Number(selected.quantity),
        unitPrice: selected.unitPrice || '0',
        specification: selected.specification.trim() || undefined,
        setOptions: toApiBundleSetOptions(selected.productType, selected.setOptions),
      })
      const latest = linesRef.current.find((line) => line.id === source.id)
      if (await retryLatestBundleGeneration()) {
        return
      }
      const context = expandedBundleOptionsRef.current[latest?.id ?? source.id]
      const isCurrentBundle = latest
        && (latest.productType === 'BUNDLE'
          ? latest.productId === selected.productId
          : context?.parentProductId === selected.productId)
      const currentSnapshot = latest && isCurrentBundle
        ? createBundleExpansionSnapshot(latest.productType === 'BUNDLE'
          ? latest
          : {
              ...latest,
              productId: context!.parentProductId,
              modelCode: context!.parentModelCode,
              modelName: context!.modelName,
              productType: 'BUNDLE',
              quantity: context!.quantity,
              unitPrice: context!.unitPrice,
              specification: context!.specification,
              setOptions: context!.setOptions,
            })
        : null
      if (!isCurrentBundle || !areBundleExpansionSnapshotsEqual(requestSnapshot, currentSnapshot)) return
      if (expanded.filter((component) => component.productId).length === 0
        && restorePreviousExpansion(latest, context)) return
      replaceWithExpandedBundleLines(source, expanded, selected.specification, discountConfig, parentContextOverrides)
    } catch {
      const latest = linesRef.current.find((line) => line.id === source.id)
      if (await retryLatestBundleGeneration()) return
      const context = expandedBundleOptionsRef.current[latest?.id ?? source.id]
      const isCurrentBundle = latest
        && (latest.productType === 'BUNDLE'
          ? latest.productId === selected.productId
          : context?.parentProductId === selected.productId)
      const currentSnapshot = latest && isCurrentBundle
        ? createBundleExpansionSnapshot(latest.productType === 'BUNDLE'
          ? latest
          : {
              ...latest,
              productId: context!.parentProductId,
              modelCode: context!.parentModelCode,
              modelName: context!.modelName,
              productType: 'BUNDLE',
              quantity: context!.quantity,
              unitPrice: context!.unitPrice,
              specification: context!.specification,
              setOptions: context!.setOptions,
            })
        : null
      if (!isCurrentBundle
        || !areBundleExpansionSnapshotsEqual(requestSnapshot, currentSnapshot)) return
      if (restorePreviousExpansion(latest, context)) return
      replaceWithExpandedBundleLines(source, [], latest.specification, discountConfig, parentContextOverrides)
      setLineExpansionAnnouncement('세트 구성품을 불러오지 못했습니다. 다시 선택해 주세요.')
    }
  }

  const updatePrice = (id: string, unitPrice: string) =>
    updateLineFromUser(id, (line) => {
      if (line.id !== id) return line
      return {
        ...recalculateLineVat(asVatLine({ ...line, unitPrice }), 'PRICE'),
        unitPrice,
        priceSource: 'USER',
        priceMemoryUpdatedAt: null,
        priceRefreshChanged: false,
        lookupError: null,
        lookupLoading: false,
      }
    })

  const updateQuantity = (id: string, quantity: string) =>
    updateLineFromUser(id, (line) => changeLineQuantity(asVatLine(line), quantity))

  /**
   * 공급가액·부가세 편집 (개발책임자 결정 2026-07-25 "금액 열 편집 정책", 정정 포함).
   *
   * <p>{@link editSlipLineAmount} 를 쓴다 — 공유 {@code editLineVat} 의 SUPPLY/VAT 분기를
   * 고치지 않고 전표 화면 전용 함수로 분리했다(견적·전표 상세는 원래 방향을 그대로 씀,
   * lineVat.ts 의 함수 주석 참고). 합계(TOTAL) 편집은 이 화면에 UI 자체가 없다(P1) —
   * authority 는 SUPPLY/VAT 만 받는다.
   */
  const updateVatAmount = (
    id: string,
    authority: 'SUPPLY' | 'VAT',
    value: string,
  ) => updateLineFromUser(id, (line) => editSlipLineAmount(asVatLine(line), authority, value))

  const applyProductSelection = async (line: LineDraft, product: ProductOption | null) => {
    bundleExpansionGenerationRef.current.set(line.id, (bundleExpansionGenerationRef.current.get(line.id) ?? 0) + 1)
    setExpandedBundleOptions((current) => {
      const liveIds = new Set(linesRef.current.filter((candidate) => candidate.id !== line.id).map((candidate) => candidate.id))
      const next = Object.fromEntries(
        Object.entries(current).filter(([key]) => liveIds.has(key)),
      )
      return next
    })
    setPriceLookupAnnouncement('')
    const lineNumber = Math.max(1, lines.findIndex((candidate) => candidate.id === line.id) + 1)
    const productId = product?.id ?? null
    const fallbackUnitPrice =
      product?.sellingPrice != null ? String(product.sellingPrice) : line.unitPrice
    // 자동채움 판정은 견적과 공용 헬퍼(shouldAutoFillPrice) — 비대칭 재발 구조 차단(R4-F1).
    const shouldAutoFill = shouldAutoFillPrice(line.priceSource, line.unitPrice)
    const partnerId = selectedPartner?.id
    const partnerCode = selectedPartner?.partnerCode
    const category = product?.categoryKey === 'homemulti'
      ? 'HOMEMULTI'
      : product?.categoryKey === 'commercialMulti'
        ? 'COMMERCIAL_MULTI'
        : 'OTHER'
    const calculateWithConfig = (config: PartnerDcConfig | null) => product?.sellingPrice == null
      ? null
      : calculateSlipDiscount({
        listPrice: Number(product.sellingPrice),
        modelCode: product.modelCode,
        fixedDiscountRate: product.fixedDiscountRate,
        category,
        hasVariableDiscount: product.hasVariableDiscount,
      }, config)
    // 품목 UUID/정가는 DC 조회와 독립적으로 먼저 확정한다.
    const dcResult = shouldAutoFill && partnerCode && partnerDcConfig
      ? calculateWithConfig(partnerDcConfig)
      : null
    const nextUnitPrice = shouldAutoFill
      ? String(dcResult?.unitPrice ?? fallbackUnitPrice)
      : line.unitPrice
    const pricedLine = recalculateLineVat(asVatLine({ ...line, unitPrice: nextUnitPrice }), 'PRICE')
    const nextLine: LineDraft = {
      ...pricedLine,
      productId,
      modelName: product?.modelName ?? '',
      productName: product?.productName ?? '',
      unitPrice: nextUnitPrice,
      priceSource: shouldAutoFill ? 'CATALOG' : line.priceSource,
      catalogUnitPrice: product?.sellingPrice != null ? String(product.sellingPrice) : line.catalogUnitPrice ?? null,
      categoryKey: product?.categoryKey ?? null,
      fixedDiscountRate: product?.fixedDiscountRate ?? null,
      hasVariableDiscount: product?.hasVariableDiscount ?? null,
      discountInfo: dcResult?.info ?? null,
      priceMemoryUpdatedAt: null,
      priceRefreshChanged: false,
      productType: product?.productType ?? null,
      modelCode: product?.modelCode ?? null,
      lookupError: null,
      lookupLoading: Boolean(partnerId && productId && shouldAutoFill && !dcResult),
    }
    updateLine(line.id, nextLine)
    if (nextLine.productType === 'BUNDLE' && (!partnerId || !productId || !shouldAutoFill)) {
      await expandSelectedBundle(nextLine, nextLine, shouldAutoFill ? partnerDcConfig : null)
      return
    }
    // 품목 선택도 다른 셀 입력과 같은 증식 규칙을 쓴다(H2) — before(line)/after(nextLine)가
    // 실제로 다를 때만, 그리고 마지막 행일 때만 빈 행을 증식한다.
    maybeExpandLastLine(line.id, line, nextLine)
    if (!partnerId || !productId || !shouldAutoFill) {
      if (productId && shouldAutoFill) {
        setPriceLookupAnnouncement(`라인 ${lineNumber} ${dcResult?.info ?? '판매가 적용'}`)
      }
      return
    }
    let resolvedDcResult = dcResult
    let resolvedDiscountConfig: PartnerDcConfig | null = partnerDcConfig
    if (!resolvedDcResult && partnerCode) {
      try {
        const config = partnerDcConfig ?? await withPriceLookupTimeout(getPartnerDcConfig(partnerCode))
        if (selectedPartnerIdRef.current !== partnerId) return
        resolvedDiscountConfig = config
        if (!partnerDcConfig) setPartnerDcConfig(config)
        resolvedDcResult = calculateWithConfig(config)
        if (resolvedDcResult && resolvedDcResult.source !== 'NONE') {
          const discountedPrice = String(resolvedDcResult.unitPrice)
          setLines((currentLines) => currentLines.map((current) =>
            current.id === line.id
              && current.productId === productId
              && selectedPartnerIdRef.current === partnerId
              && current.priceSource !== 'USER'
              ? {
                ...recalculateLineVat(asVatLine({ ...current, unitPrice: discountedPrice }), 'PRICE'),
                unitPrice: discountedPrice,
                priceSource: 'CATALOG',
                discountInfo: resolvedDcResult?.info ?? null,
                lookupLoading: true,
              }
              : current,
          ))
        }
      } catch {
        // DC 실패/timeout은 이미 확정한 정가 fallback을 유지한다.
      }
    }
    /**
     * R8-FE-3: 응답 도착 시점에 이 라인에 단가를 실제로 쓸 수 있는가.
     *
     * <p>종전에는 안내가 setLines 의 stale guard <b>밖</b>에서 무조건 발화해, 응답이 늦게 오는
     * 사이 사용자가 거래처를 바꾸거나 단가를 직접 입력해 write 가 skip 돼도 aria-live 가
     * "적용" 이라 낭독했다(거짓 고지). 견적(EstimateFormPage)은 `if (applyPrice)` guard 안에서
     * 발화하고 있었으므로 이건 또 하나의 slip/estimate 비대칭이었다 — 여기서 정렬한다.
     *
     * <p>write guard(아래 setLines 내부)는 그대로 둔다 — 이 판정은 낭독 여부만 좁히며,
     * 어긋나더라도 "안내 누락"(무해)이지 "잘못된 write"가 되지 않는 방향으로만 틀린다.
     */
    const canStillApply = () => {
      const current = linesRef.current.find((candidate) => candidate.id === line.id)
      if (!current) return false
      if (current.productId !== productId) return false
      if (selectedPartnerIdRef.current !== partnerId) return false
      if (current.priceSource === 'USER') return false
      return true
    }
    try {
      const memory = await withPriceLookupTimeout(getPriceMemory(partnerId, productId))
      const remembered = memory?.unitPrice
      // 최근단가 miss/실패 시 이미 계산한 고정DC·전역DC 단가를 정가로 되돌리지 않는다.
      const hasAuthoritativeDiscount = resolvedDcResult != null && resolvedDcResult.source !== 'NONE'
      const resolvedUnitPrice = hasAuthoritativeDiscount || remembered == null
        ? String(resolvedDcResult?.unitPrice ?? fallbackUnitPrice)
        : String(remembered)
      const usesRememberedPrice = !hasAuthoritativeDiscount && remembered != null
      const latestBeforePriceApply = linesRef.current.find((candidate) => candidate.id === line.id)
      const applied = canStillApply()
      const latestBundle = latestBeforePriceApply
        && latestBeforePriceApply.productId === productId
        && latestBeforePriceApply.productType === 'BUNDLE'
        ? latestBeforePriceApply
        : null
      const bundleToExpand = latestBundle && latestBundle.priceSource === 'USER'
        ? latestBundle
        : latestBundle && { ...latestBundle, unitPrice: resolvedUnitPrice }
      const resolvedLines: LineDraft[] = linesRef.current.map((current): LineDraft => {
          if (current.id !== line.id) return current
          if (current.productId !== productId) return current
          if (selectedPartnerIdRef.current !== partnerId) return current
          if (current.priceSource === 'USER') return current
          return {
            ...recalculateLineVat(asVatLine({ ...current, unitPrice: resolvedUnitPrice }), 'PRICE'),
            unitPrice: resolvedUnitPrice,
            priceSource: usesRememberedPrice ? 'REMEMBERED' : 'CATALOG',
            priceMemoryUpdatedAt: usesRememberedPrice ? memory?.updatedAt ?? null : null,
            priceRefreshChanged: false,
            discountInfo: hasAuthoritativeDiscount ? resolvedDcResult?.info ?? null : null,
            lookupLoading: false,
          }
        })
      // 바로 이어지는 세트 전개도 방금 확정한 가격을 현재 스냅샷으로 본다.
      linesRef.current = resolvedLines
      setLines(resolvedLines)
      if (bundleToExpand) {
        await expandSelectedBundle(
          { ...line, ...bundleToExpand },
          { ...bundleToExpand, lookupLoading: false },
          resolvedDiscountConfig,
        )
        return
      }
      if (applied) {
        setPriceLookupAnnouncement(
          `라인 ${lineNumber} ${remembered == null ? (resolvedDcResult?.info ?? '판매가 적용') : '거래처 최근단가'} 적용`,
        )
      }
    } catch {
      // 가격기억 조회 실패는 품목 선택 자체를 막지 않는다. miss/오류 모두 판매가(catalog) fallback 유지.
      const applied = canStillApply()
      const latestBundle = linesRef.current.find((candidate) =>
        candidate.id === line.id
        && candidate.productId === productId
        && candidate.productType === 'BUNDLE',
      )
      setLines((currentLines) =>
        currentLines.map((current) =>
          current.id === line.id
            && current.productId === productId
            && selectedPartnerIdRef.current === partnerId
            ? { ...current, lookupLoading: false }
          : current,
        ),
      )
      if (latestBundle) {
        await expandSelectedBundle(
          { ...line, ...latestBundle },
          { ...latestBundle, lookupLoading: false },
          resolvedDiscountConfig,
        )
        return
      }
      if (applied) setPriceLookupAnnouncement(`라인 ${lineNumber} ${resolvedDcResult?.info ?? '판매가 적용'}`)
    }
  }

  /**
   * 거래처 변경 bulk 재조회 — 공용 훅(usePartnerPriceRefresh)이 수명주기·조회·해석을 맡고,
   * 여기서는 LineDraft(priceSource/catalog 규약) 로 후보를 뽑아 로컬 state 에 적용한다(D-R8-10).
   */
  const refreshAutoPricesForPartner = async (
    partnerId: string,
    discountConfigPromise: Promise<PartnerDcConfig | null>,
    requestSeq: number,
  ) => {
    // R6-M5: 재조회 시작 시 stale 단건 안내를 클리어(미클리어 시 배너 비활성 폴백이 aria-live 거짓 고지).
    setPriceLookupAnnouncement('')
    const bundleContexts = Object.entries(expandedBundleOptionsRef.current)
      .map(([lineId, context]) => ({
        lineId,
        context,
        source: linesRef.current.find((line) => line.id === lineId
          || context.componentLineIds?.includes(line.id)),
      }))
      .filter((entry): entry is {
        lineId: string
        context: ExpandedBundleOptionContext
        source: LineDraft
      } => entry.source != null)
    const expandedBundleComponentLineIds = new Set(
      bundleContexts.flatMap(({ lineId, context }) => context.componentLineIds?.length
        ? context.componentLineIds
        : [lineId]),
    )
    const candidates: PartnerRepriceCandidate[] = linesRef.current
      .filter((line) => line.productId
        && isAutoPriceSource(line.priceSource)
        && !expandedBundleComponentLineIds.has(line.id))
      .map((line) => ({
        key: line.id,
        productId: line.productId!,
        currentUnitPrice: line.unitPrice,
        // 카탈로그 미확보 시 옛 거래처 단가 fallback 금지 — 공용 훅이 UNAVAILABLE로 비운다.
        catalogFallback: line.catalogUnitPrice ?? null,
        discountInput: line.catalogUnitPrice == null
          ? undefined
          : {
            fixedDiscountRate: line.fixedDiscountRate,
            modelCode: line.modelCode,
            category: line.categoryKey === 'homemulti'
              ? 'HOMEMULTI'
              : line.categoryKey === 'commercialMulti'
                ? 'COMMERCIAL_MULTI'
                : 'OTHER',
            hasVariableDiscount: line.hasVariableDiscount,
          },
      }))
    if (candidates.length === 0 && bundleContexts.length === 0) {
      // 새 거래처에 재조회 대상이 없어도 이전 거래처 bulk 응답은 무효화한다.
      partnerReprice.invalidate(partnerId)
      // 직전 거래처의 bulk 조회가 남긴 busy 표시는 새 거래처에 후보가 없어도 정리한다.
      setLines((current) => current.map((line) => ({ ...line, lookupLoading: false })))
      return
    }
    const candidateIds = new Set(candidates.map((candidate) => candidate.key))
    setLines((current) =>
      current.map((line) =>
        candidateIds.has(line.id)
          ? { ...line, lookupLoading: true, priceRefreshChanged: false }
          : line,
      ),
    )
    const discountConfig = await discountConfigPromise
    // DC 응답을 기다리는 동안 거래처가 다시 바뀌었으면 이 run 자체를 시작하지 않는다.
    // 같은 거래처가 A→B→A로 재선택된 경우도 이전 요청 세대로부터 격리한다.
    if (selectedPartnerIdRef.current !== partnerId || dcRequestSeqRef.current !== requestSeq) return
    await Promise.all(bundleContexts.map(async ({ lineId, context, source }) => {
      if (context.parentCatalogUnitPrice == null) return
      const category = context.parentCategoryKey === 'homemulti'
        ? 'HOMEMULTI'
        : context.parentCategoryKey === 'commercialMulti'
          ? 'COMMERCIAL_MULTI'
          : 'OTHER'
      const parentDiscount = calculateSlipDiscount({
        listPrice: Number(context.parentCatalogUnitPrice),
        modelCode: context.parentModelCode,
        fixedDiscountRate: context.parentFixedDiscountRate,
        category,
        hasVariableDiscount: context.parentHasVariableDiscount,
      }, discountConfig)
      const parentUnitPrice = String(parentDiscount.unitPrice)
      setExpandedBundleOptions((current) => current[lineId]
        ? { ...current, [lineId]: { ...current[lineId], unitPrice: parentUnitPrice, expansionPending: true } }
        : current)
      await expandSelectedBundle(source, {
        ...source,
        productId: context.parentProductId,
        modelCode: context.parentModelCode,
        modelName: context.modelName,
        specification: context.specification,
        quantity: context.quantity,
        unitPrice: parentUnitPrice,
        productType: 'BUNDLE',
        setOptions: context.setOptions,
      }, discountConfig, { unitPrice: parentUnitPrice })
    }))
    const { outcomes, isCurrent } = await partnerReprice.run(partnerId, candidates, discountConfig)
    if (!partnerRepriceSessionIsCurrent(
      requestSeq,
      dcRequestSeqRef.current,
      partnerId,
      selectedPartnerIdRef.current ?? '',
      isCurrent(),
    )) return
    const outcomeById = new Map(outcomes.map((outcome) => [outcome.key, outcome]))
    setLines((current) =>
      current.map((candidate) => {
        const outcome = outcomeById.get(candidate.id)
        // 후보 build 이후 품목이 교체됐으면 스킵(계보 오귀속 방지).
        if (!outcome || candidate.productId !== outcome.productId) return candidate
        // build 이후 사용자 직접입력(USER)으로 전환됐으면 재조회 대상 아님.
        if (!isAutoPriceSource(candidate.priceSource)) {
          return { ...candidate, lookupLoading: false, priceRefreshChanged: false }
        }
        return {
          ...recalculateLineVat(asVatLine({ ...candidate, unitPrice: outcome.source === 'UNAVAILABLE' ? '' : outcome.unitPrice }), 'PRICE'),
          unitPrice: outcome.source === 'UNAVAILABLE' ? '' : outcome.unitPrice,
          priceSource: outcome.source === 'UNAVAILABLE' ? null : outcome.source,
          priceMemoryUpdatedAt: outcome.updatedAt,
          priceRefreshChanged: (outcome.source === 'UNAVAILABLE' ? '' : outcome.unitPrice) !== candidate.unitPrice,
          discountInfo: outcome.discountInfo,
          lookupError: outcome.source === 'UNAVAILABLE'
            ? '카탈로그 판매가를 확인할 수 없습니다. 단가를 직접 입력해 주세요.'
            : null,
          lookupLoading: false,
        }
      }),
    )
  }

  const updateSetOption = (id: string, patch: Partial<BundleSetOptions>) => {
    const line = linesRef.current.find((candidate) => candidate.id === id)
    const context = expandedBundleOptionsRef.current[line?.id ?? id]
    if (!context) {
      updateLineFromUser(id, (current) => ({
        ...current,
        setOptions: { ...(current.setOptions ?? emptyBundleSetOptions()), ...patch },
      }))
      return
    }
    const nextOptions = { ...context.setOptions, ...patch }
    if (context.expansionPending) {
      bundleExpansionGenerationRef.current.set(id, (bundleExpansionGenerationRef.current.get(id) ?? 0) + 1)
      setExpandedBundleOptions((current) => ({
        ...current,
        [line!.id]: { ...context, setOptions: nextOptions },
      }))
      return
    }
    setExpandedBundleOptions((current) => ({
      ...current,
      [line!.id]: { ...context, setOptions: nextOptions, expansionPending: true },
    }))
    bundleExpansionGenerationRef.current.set(id, (bundleExpansionGenerationRef.current.get(id) ?? 0) + 1)
    if (!line) return
    void expandSelectedBundle(line, {
      ...line,
      productId: context.parentProductId,
      modelCode: context.parentModelCode,
      modelName: context.modelName,
      specification: context.specification,
      quantity: context.quantity,
      unitPrice: context.unitPrice,
      productType: 'BUNDLE',
      setOptions: nextOptions,
    }, line.priceSource === 'USER' ? null : partnerDcConfig)
  }

  const toggleSelect = (id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (selected) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const toggleAll = (selected: boolean) => {
    if (selected) setSelectedIds(new Set(lines.map((l) => l.id)))
    else setSelectedIds(new Set())
  }

  // dnd-kit drag end 핸들러 — 라인 순서 변경 + selectedIds 유지
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setLines((ls) => {
      const oldIdx = ls.findIndex((l) => l.id === active.id)
      const newIdx = ls.findIndex((l) => l.id === over.id)
      if (oldIdx < 0 || newIdx < 0) return ls
      return arrayMove(ls, oldIdx, newIdx)
    })
  }

  /**
   * 모델명 onBlur — AC-2 이후 모든 라인이 `modelCell` 슬롯의 `ProductAutocomplete` 로 대체됨.
   *
   * LineRow backward-compat 유지를 위해 prop 으로 전달하지만
   * `modelCell` 제공 시 LineRow 가 기존 input 을 렌더하지 않으므로 실제 호출되지 않는다.
   *
   * @deprecated AC-2 이후 미사용. modelCell=ProductAutocomplete 로 대체.
   */
  const handleModelNameBlur = (_id: string, _modelName: string): void => {
    // no-op: AC-2 ProductAutocomplete 가 onChange 로 updateLine 직접 호출
  }

  // ── AC-3: PartnerAutocomplete onChange 핸들러 ────────────────────────────────

  /**
   * AC-3 거래처 자동완성 선택 핸들러 — 2단계 채움.
   *
   * 1단계: 검색 summary(PartnerOption)로 partnerCode/partnerName/customerTel 즉시 fill.
   * 2단계: GET /admin/partners/{partnerCode} → customerAddress/customerRepresentative 보강.
   *        (기존 handlePartnerAutoFill 로직 재사용 — address/representative 는 search 응답에 없음)
   *
   * partner=null(해제) 시 관련 필드 클리어.
   */
  const handlePartnerAutocompleteChange = async (
    partner: PartnerOption | null,
  ) => {
    const dcRequestSeq = ++dcRequestSeqRef.current
    setSelectedPartner(partner)
    setPartnerDcConfig(null)
    selectedPartnerIdRef.current = partner?.id ?? null
    // 거래처를 고른 즉시 직전 거래처의 DC/최근단가 세션을 stale 처리한다.
    // 새 DC가 끝나 새 bulk run을 시작하기 전에도 늦은 직전 outcome이 적용되지 않아야 한다.
    partnerReprice.invalidate(partner?.id ?? null)
    // 거래처 교체/무효화 직후 이전 요청의 busy 표시를 먼저 제거한다. 새 후보가 있으면
    // refreshAutoPricesForPartner 가 다시 true 로 올리고, 실패/무응답이면 timeout 경로가 내린다.
    setLines((current) => current.map((line) => ({ ...line, lookupLoading: false })))

    if (!partner) {
      setPartnerDcConfig(null)
      setLines((current) => current.map((line) => ({
        ...line,
        lookupLoading: false,
        priceRefreshChanged: false,
      })))
      // R8-FE-6(=R8-DESIGN-2·R7-FE-3): 해제 시 stale 단건 안내를 비운다 — 미클리어 시 배너
      // 비활성 폴백이 "라인 N 거래처 최근단가 적용" 을 계속 낭독한다(aria-live 거짓 고지).
      // R6-M5 는 재선택 refresh 시작에서만 비웠고 해제 분기엔 setter 가 없었다.
      // ⚠️ R7 은 이걸 "slip/estimate 비대칭" 이라 했으나 실측 결과 두 폼 모두 동일 결함이다 —
      // 양쪽 동시 수정(EstimateFormPage.handlePartnerOptionChange 미러).
      setPriceLookupAnnouncement('')
      // 선택 해제 — 관련 필드 클리어
      setPartnerName('')
      setCustomerTel('')
      setCustomerAddress('')
      setCustomerRepresentative('')
      setAutoFillError(null)
      return
    }
    if (partner.id) {
      const discountConfigPromise = withPriceLookupTimeout(getPartnerDcConfig(partner.partnerCode))
        .catch(() => null)
        .then((config) => {
          if (dcRequestSeqRef.current === dcRequestSeq && selectedPartnerIdRef.current === partner.id) {
            setPartnerDcConfig(config)
          }
          return config
        })
      void refreshAutoPricesForPartner(partner.id, discountConfigPromise, dcRequestSeq)
    }

    // 1단계: search summary 즉시 fill
    setPartnerName(partner.name)
    setCustomerTel(partner.phone ?? '')

    // 2단계: detail fetch → address/representative 보강 (기존 handlePartnerAutoFill 로직 재사용)
    setAutoFillLoading(true)
    setAutoFillError(null)
    try {
      const detail = await lookupPartnerForAutoFill(partner.partnerCode)
      if (detail.address) setCustomerAddress(detail.address)
      if (detail.representative) setCustomerRepresentative(detail.representative)
      // phone/name 은 summary 기준 우선, detail 로 보강
      if (!partner.phone && detail.phone) setCustomerTel(detail.phone)
    } catch (err) {
      const msg =
        axios.isAxiosError(err) && err.response?.status === 404
          ? `거래처 코드 '${partner.partnerCode}' 상세 정보를 찾을 수 없습니다.`
          : '거래처 상세 정보 조회에 실패했습니다.'
      setAutoFillError(msg)
    } finally {
      setAutoFillLoading(false)
    }
  }

  /** 선택된 라인 중 productId 가 있는 전체 라인 (BUNDLE 포함). */
  const selectedProductLines = useMemo(() => {
    return lines
      .filter((l) => selectedIds.has(l.id) && l.productId)
      .map((l) => ({
        productId: l.productId!,
        modelName: l.modelName,
        productName: l.productName,
        productType: l.productType ?? null,
      }))
  }, [lines, selectedIds])

  /**
   * 세트 재고 가드 (§2-2): BUNDLE 라인은 재고조회 대상 제외.
   * 선택 라인이 전부 BUNDLE 인 경우 bundleOnlyLines=true 로 모달에 안내 표시.
   */
  const nonBundleLookupLines = useMemo(
    () =>
      selectedProductLines
        .filter((l) => l.productType !== 'BUNDLE')
        .map(({ productId, modelName, productName }) => ({ productId, modelName, productName })),
    [selectedProductLines],
  )

  const allSelectedAreBundle =
    selectedProductLines.length > 0 &&
    selectedProductLines.every((l) => l.productType === 'BUNDLE')

  /** 선택 라인 중 세트(BUNDLE) 건수 — 혼합 선택 시 제외 고지에 사용 (P2-3). */
  const selectedBundleCount = useMemo(
    () => selectedProductLines.filter((l) => l.productType === 'BUNDLE').length,
    [selectedProductLines],
  )

  const openStockModal = () => {
    if (selectedProductLines.length === 0) return
    setStockSelectedSnapshot(nonBundleLookupLines)
    setStockBundleOnlySnapshot(allSelectedAreBundle)
    // 전부 세트면 bundleOnlyLines 안내가 표시되므로 혼합 캡션은 0 으로 둔다.
    setStockExcludedBundleSnapshot(allSelectedAreBundle ? 0 : selectedBundleCount)
    setStockModalOpen(true)
  }

  const closeStockModal = () => setStockModalOpen(false)

  // ── 합계 계산 (Designer components.md § 6.2 인용) ──────

  const totals = useMemo(() => {
    // 행이 현재 표시·저장하는 S/V/T를 그대로 합산한다. 행별 권위가 SUPPLY/VAT인
    // 경우에도 여기서 recalculateLineVat를 다시 호출하면 부가세 10% 재계산과 단가
    // 역산이 발생해 행 표시와 하단 합계가 갈라진다(D-1).
    const valid = lines.filter((l) => l.productId && Number(l.quantity) > 0)
    const displayed = sumDisplayedLineVatAmounts(valid.map(asVatLine))
    return { count: valid.length, ...displayed }
  }, [lines])

  // ── 저장 mutation ───────────────────────────────────────

  const mutation = useMutation({
    mutationFn: () => {
      const latestLines = linesRef.current
      const payload: Parameters<typeof createSlip>[0] = {
        slipType: mode,
        slipDate: today,
        sourceWarehouseId: sourceWh ?? undefined,
        destinationWarehouseId: destWh ?? undefined,
        partnerId: selectedPartner?.id || undefined,
        partnerName: partnerName.trim() || undefined,
        deliveryTag: isOutbound ? tag ?? undefined : undefined,
        memo: memo.trim() || undefined,
        // link-dispatch-slice — OUTBOUND 만 driver 정보 송신
        driverName: isOutbound && driverName.trim() ? driverName.trim() : undefined,
        driverPhone: isOutbound && driverPhone ? driverPhone : undefined,
        // 거래처 snapshot — 자동완성 선택 시 채워짐(폼 표시 X, 전표 기록용). ioType 는
        // 내부 코드라 BE 가 slipType 으로 자동 분기(미전송).
        customerTel: customerTel.trim() || undefined,
        customerAddress: customerAddress.trim() || undefined,
        customerRepresentative: customerRepresentative.trim() || undefined,
        // 배송 정보 — 배송주소 / 감리주소(배송주소와 동일 체크 시 복사)
        deliveryAddress: deliveryAddress.trim() || undefined,
        supervisionAddress: supervisionSameAsDelivery
          ? (deliveryAddress.trim() || undefined)
          : (supervisionAddress.trim() || undefined),
        // 배송일정(M상N하) — 지방/야적 태그 선택 시 하차일 전송.
        // 당착(sameDay) 시 slipDate(today)와 동일, 일반 시 사용자 편집값 or 계산값.
        unloadDate: isOutbound && isScheduledTag(tag)
          ? (sameDay ? today : (unloadDate || undefined))
          : undefined,
        lines: latestLines
          .filter((l) => l.productId && Number(l.quantity) > 0)
          .map<SlipLineInput>((l) => ({
            productId: l.productId!,
            productName: l.productName.trim() || undefined,
            modelName: l.modelName.trim() || undefined,
            specification: l.specification.trim() || undefined,
            quantity: Number(l.quantity),
            unitPrice: l.unitPrice || '0',
            setOptions: toApiBundleSetOptions(
              l.parentSetModel ? 'BUNDLE' : l.productType,
              expandedBundleOptionsRef.current[l.id]?.setOptions ?? l.setOptions,
            ),
            ...(l.parentSetModel
              ? {
                  parentSetModel: l.parentSetModel,
                  setHead: Boolean(l.setHead),
                  bundleParentProductId: l.bundleParentProductId,
                  bundleParentUnitPrice: l.bundleParentUnitPrice,
                }
              : {}),
            // 단가 부가세포함 — BE 가 라인 단위로 공급가액/부가세 분리(eCount 방식)
            priceVatInclusive: true,
            // VAT 열을 실제 편집한 라인만 권위 3값을 명시 전송한다. 미편집 라인은
            // 종전 payload/팩토리 그대로 지나가 legacy 왕복을 보존한다.
            ...(l.authority && l.authority !== 'PRICE'
              && l.supplyAmount != null && l.vatAmount != null && l.lineTotal != null
              ? {
                  supplyAmount: l.supplyAmount,
                  vatAmount: l.vatAmount,
                  lineTotalWithVat: l.lineTotal,
                }
              : {}),
          })),
        discountInfo: lines
          .filter((l) => l.productId && Number(l.quantity) > 0 && l.discountInfo)
          .map((l) => l.discountInfo)
          .filter((info, index, all): info is string => Boolean(info) && all.indexOf(info) === index)
          .join(', ') || undefined,
      }
      return createSlip(payload)
    },
    onSuccess: () => navigate(listPath),
  })

  const errorMessage = (() => {
    if (!mutation.isError) return null
    const err = mutation.error
    if (axios.isAxiosError(err)) {
      const data = err.response?.data as { message?: string } | undefined
      return data?.message ?? '전표 생성에 실패했습니다.'
    }
    return '알 수 없는 오류'
  })()

  const validLineCount = lines.filter(
    (l) => l.productId && Number(l.quantity) > 0,
  ).length
  const requiredWh = isOutbound ? sourceWh : destWh
  // 거래처 변경 최근단가 재조회/가격기억 조회가 in-flight 인 동안 저장하면 이전 거래처
  // 단가가 새 거래처(partnerId)로 전송되어 가격기억이 교차 오염된다 — 저장 차단(R4-F4).
  const priceResolutionBusy = partnerReprice.isPending || lines.some((l) => l.lookupLoading)
  const bundleExpansionPending = lines.some((line) => expandedBundleOptions[line.id]?.expansionPending)
  const hasUnresolvedCatalogPrice = lines.some((line) => line.lookupError && !line.unitPrice.trim())
  // R4-D4: 마커 카피 분기/해제 기준 — 가격기억 조회가 실제 가능한 상태(UUID 보유 거래처 선택)와 일치.
  const partnerSelected = Boolean(selectedPartner?.id)
  // R4-D9: 배너 live region 은 상시 마운트 — 내용과 함께 조건부 마운트하면 일부 SR 이 미낭독.
  const priceRefreshNoticeActive = lines.some((line) => line.priceRefreshChanged)
  const canSubmit =
    !!requiredWh && validLineCount > 0 && !mutation.isPending && !priceResolutionBusy
    && !bundleExpansionPending && !hasUnresolvedCatalogPrice

  // ── Header 체크박스 상태 ────────────────────────────────

  const allSelected = selectedIds.size === lines.length && lines.length > 0
  const someSelected = selectedIds.size > 0 && selectedIds.size < lines.length

  const stockButtonLabel =
    selectedProductLines.length === 0
      ? '재고조회'
      : selectedProductLines.length === 1
        ? '재고조회'
        : `선택 항목 재고조회 (${selectedProductLines.length}건)`

  const renderLineFooter = (line: LineDraft, index: number): ReactNode => {
    // #902 R2 H1: 안내는 이제 순수하게 "현재 내용"의 함수다(lineIncompleteReason) — 이력을
    // 남기지 않으므로, 입력을 원복하면 삭제 없이도 안내가 자동으로 사라진다(D1).
    const reason = lineIncompleteReason(line)
    const optionContext = expandedBundleOptions[line.id]
    const isBundle = line.productType === 'BUNDLE' || Boolean(optionContext)
    return (
      <>
        {isBundle ? (
          <BundleOptionRow
            line={{
              modelName: optionContext?.modelName ?? line.modelName,
              setOptions: optionContext?.setOptions ?? line.setOptions ?? emptyBundleSetOptions(),
            }}
            index={index}
            onChange={(patch) => updateSetOption(line.id, patch)}
          />
        ) : null}
        {line.lookupError ? (
          <div className="mobile-line-error" role="alert">{line.lookupError}</div>
        ) : null}
        {reason ? <IncompleteLineNotice lineNumber={index + 1} reason={reason} /> : null}
      </>
    )
  }

  /**
   * 저장 전 제외 행 요약(#902 R2 D3·H3) — 개별 행 안내(role="note")는 그 행이 화면에
   * 보일 때만 사실상 눈에 띈다. 이 요약은 총 및 제출 영역 근처에 항상 마운트되어(R4-D9
   * 계열 상시 마운트 관행과 동일) 스크롤 없이도 몇 행이 왜 제외되는지 알려주고,
   * role="status" 라이브 리전이라 스크린리더에도 전달된다(H5). 문구에 행 번호를 포함해
   * 개수가 같아도 대상 행이 바뀌면 문자열이 달라지게 한다(재낭독 보장).
   */
  const incompleteLines = lines
    .map((line, index) => ({ lineNumber: index + 1, reason: lineIncompleteReason(line) }))
    .filter((entry): entry is { lineNumber: number; reason: LineIncompleteReason } => entry.reason !== null)
  const incompleteSummaryText =
    incompleteLines.length > 0
      ? `입력 중인 행 ${incompleteLines.length}개(${incompleteLines.map((entry) => entry.lineNumber).join(', ')}행)가 저장에서 제외됩니다.`
      : ''

  // ── render ──────────────────────────────────────────────

  return (
    <div className="sales-form-polish">
      <div className="sfp-page-header">
        <h2 className="sfp-page-title">{titleLabel}</h2>
        <div className="sfp-page-actions">
          <Button variant="ghost" onClick={() => navigate(listPath)}>
            목록으로
          </Button>
        </div>
      </div>

      {/* 헤더 정보 카드 */}
      <Card padding={6} shadow="sm" className="sfp-card">
        <div className="sfp-section-title">헤더 정보</div>
        <div className="sfp-form-grid sfp-form-grid--2 mobile-form-grid">
          {/*
            출고전표는 '출고 창고' 1개, 입고전표는 '입고 창고' 1개만 입력(도착 창고 제거).
            OUTBOUND: 출고지=sourceWh / INBOUND: 입고지=destWh (requiredWh 와 일치).
          */}
          {isOutbound ? (
            <WarehouseAutocomplete
              label="출고 창고"
              required
              warehouses={Array.isArray(warehousesQuery.data) ? warehousesQuery.data : []}
              value={sourceWh}
              onChange={(id) => setSourceWh(id)}
              placeholder={warehousesQuery.isLoading ? '창고 목록 불러오는 중…' : '창고 코드 또는 이름 입력…'}
              hideVirtual
            />
          ) : (
            <WarehouseAutocomplete
              label="입고 창고"
              required
              warehouses={Array.isArray(warehousesQuery.data) ? warehousesQuery.data : []}
              value={destWh}
              onChange={(id) => setDestWh(id)}
              placeholder={warehousesQuery.isLoading ? '창고 목록 불러오는 중…' : '창고 코드 또는 이름 입력…'}
              hideVirtual
            />
          )}
          {isOutbound ? (
            <DeliveryTagSelector
              label="출고구분"
              options={OUTBOUND_TAG_OPTIONS}
              value={tag}
              onChange={(code) => {
                setTag(code)
                // 배송일정 자동 채움 — 지방/야적 선택 시 하차일(N) 기본 계산
                if (isScheduledTag(code)) {
                  const computed = computeUnloadDate(today, code)
                  setUnloadDate(computed ?? '')
                  setSameDay(false) // 태그 변경 시 당착 해제
                } else {
                  setUnloadDate('')
                  setSameDay(false)
                }
              }}
              direction="OUTBOUND"
              slipDate={today}
            />
          ) : (
            <span aria-hidden="true" />
          )}
        </div>

        {/* R4-D9: live region 은 빈 컨테이너로 상시 렌더하고 텍스트만 토글 — ARIA 관행상
            live region 이 선존재해야 SR 낭독이 신뢰된다. 비활성 시 class 미부여로 시각 0px. */}
        <div
          className={priceRefreshNoticeActive
            ? 'price-memory-refresh-banner'
            : priceLookupAnnouncement
              ? 'price-lookup-status'
              : undefined}
          role="status"
          aria-live="polite"
          data-testid="slip-price-refresh-banner"
        >
          {priceRefreshNoticeActive
            ? '거래처 변경으로 최근단가 재적용 · 변경된 행을 확인해 주세요.'
            : priceLookupAnnouncement || null}
        </div>

        {/*
          AC-3: 거래처 선택은 PartnerAutocomplete 단일 경로.
          기존 수동 '거래처명' FormField/input 제거 — P0 D-AC3-01 수정.
          partnerName state 는 PartnerAutocomplete onChange(handlePartnerAutocompleteChange)
          에서만 setPartnerName 을 호출하며, createSlip payload 의 partnerName 으로 전달됨.
          partnerCode 는 BE CreateSlipRequest 에 필드 없음(partnerId=UUID만 존재) —
          partnerName/customerTel/Address/Representative denormalize 전송이 설계 의도.
          회귀 아님: 기존 수동 input 도 partnerCode 를 payload 에 전송한 적 없음.
        */}
        <div style={{ marginTop: 16 }}>
          <PartnerAutocomplete
            value={selectedPartner}
            onChange={(p) => { void handlePartnerAutocompleteChange(p) }}
            searchPartners={searchPartnersApi}
            label="거래처"
            placeholder="거래처명 또는 코드 입력…"
            ariaLabel="거래처 자동완성"
            disabled={autoFillLoading}
          />
          {autoFillError ? (
            <div className="sfp-error-banner" role="alert" style={{ marginTop: 8 }}>
              <span aria-hidden="true">ⓘ</span>
              <span>{autoFillError}</span>
            </div>
          ) : null}
        </div>

        <div className="sfp-form-grid sfp-form-grid--1 mobile-form-grid" style={{ marginTop: 16 }}>
          <FormField
            label="메모"
            render={({ id }) => (
              <input
                id={id}
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                maxLength={1000}
                className="sfp-input"
              />
            )}
          />
        </div>

        {/*
          link-dispatch-slice 신규: 기사명 + 기사 휴대폰 (OUTBOUND 만)
          LinkDispatchListPage 자동 그룹의 키 (기사명 + 배송일자) 가 된다.
        */}
        {isOutbound ? (
          <div className="sfp-form-grid sfp-form-grid--driver mobile-form-grid" style={{ marginTop: 16 }}>
            <FormField
              label="기사명"
              hint="배송 기사 이름 (자동 그룹 키)"
              render={({ id }) => (
                <input
                  id={id}
                  value={driverName}
                  onChange={(e) => setDriverName(e.target.value)}
                  maxLength={50}
                  className="sfp-input"
                  placeholder="예: 홍길동"
                />
              )}
            />
            <PhoneInput
              label="기사 연락처"
              helperText="010-0000-0000 (자동 하이픈)"
              value={driverPhone}
              onChange={setDriverPhone}
              error={
                driverPhone && !KOREAN_MOBILE_PHONE_PATTERN.test(driverPhone)
                  ? '올바른 휴대폰 번호 형식이 아닙니다'
                  : undefined
              }
            />
          </div>
        ) : null}
      </Card>

      {/*
        배송 정보 — 배송주소 / 감리주소. (출고전표 폼 정비: eCount 12필드 카드 제거 +
        프로젝트명/인수자번호/입금예정일 제거. businessNumber 는 partnerId 로 BE 자동 resolve.)
      */}
      <Card padding={6} shadow="sm" className="sfp-card">
        <div className="sfp-section-title">배송 정보</div>

        {/* 배송주소 + 거래처 주소 복사 버튼 */}
        <div className="sfp-form-grid sfp-form-grid--2 mobile-form-grid" style={{ marginTop: 8 }}>
          <FormField
            label="배송주소"
            hint="배송 현장 주소 (최대 500자)"
            render={({ id }) => (
              <input
                id={id}
                value={deliveryAddress}
                onChange={(e) => {
                  setDeliveryAddress(e.target.value)
                  if (supervisionSameAsDelivery) {
                    setSupervisionAddress(e.target.value)
                  }
                }}
                maxLength={500}
                className="sfp-input"
                placeholder="예: 서울특별시 강남구 테헤란로 152"
                data-testid="slip-form-delivery-address"
              />
            )}
          />
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                if (customerAddress.trim()) {
                  setDeliveryAddress(customerAddress.trim())
                  if (supervisionSameAsDelivery) {
                    setSupervisionAddress(customerAddress.trim())
                  }
                }
              }}
              disabled={!customerAddress.trim()}
              data-testid="slip-form-copy-customer-address-btn"
            >
              거래처 주소 복사
            </Button>
          </div>
        </div>

        {/* 감리주소 + "배송주소와 동일" 체크박스 */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 600 }}>감리주소</label>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                color: 'var(--color-neutral-600)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={supervisionSameAsDelivery}
                onChange={(e) => {
                  setSupervisionSameAsDelivery(e.target.checked)
                  if (e.target.checked) {
                    setSupervisionAddress(deliveryAddress)
                  }
                }}
                data-testid="slip-form-supervision-same-checkbox"
              />
              배송주소와 동일
            </label>
          </div>
          <input
            value={supervisionSameAsDelivery ? deliveryAddress : supervisionAddress}
            onChange={(e) => {
              if (!supervisionSameAsDelivery) {
                setSupervisionAddress(e.target.value)
              }
            }}
            disabled={supervisionSameAsDelivery}
            maxLength={500}
            className="sfp-input"
            style={{ width: '100%', opacity: supervisionSameAsDelivery ? 0.6 : 1 }}
            placeholder="감리 현장 주소 (배송주소와 다를 경우)"
            data-testid="slip-form-supervision-address"
          />
        </div>

      </Card>

      {/*
        배송일정(M상N하) — 지방/야적 태그 선택 시만 노출하는 별도 섹션/카드.
        배송주소 카드와 분리하여 시각적 구분을 명확히 한다.
        출고일(M) = today(읽기전용 잠금), 하차일(N) = 편집 가능 date input.
        지방 한정: 당착 체크박스 (체크 시 N=M, 입력 비활성).
        특이사항 라벨 프리뷰: scheduleLabel 파생.
      */}
      {isOutbound && isScheduledTag(tag) ? (
        <Card padding={6} shadow="sm" className="sfp-card">
          <div className="sfp-section-title">배송일정</div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 8 }}>
            {/* 상차일(출고일) — 잠금 */}
            <div style={{ minWidth: 160 }}>
              <Input
                label="상차일"
                type="date"
                value={today}
                readOnly
                aria-label="출고일(상차일) — 읽기전용"
                disabled
                hint="출고일 (잠금)"
              />
            </div>

            {/* 하차일 — 편집 가능 */}
            <div style={{ minWidth: 160 }}>
              <Input
                label="하차일"
                type="date"
                value={sameDay ? today : unloadDate}
                onChange={(e) => {
                  if (!sameDay) setUnloadDate(e.target.value)
                }}
                disabled={sameDay}
                aria-label="하차일"
                data-testid="slip-form-unload-date"
              />
            </div>

            {/* 당착 체크박스 — 지방 한정 */}
            {tag === 'REGION' ? (
              <FormField
                label="당착"
                render={() => (
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 13,
                      cursor: 'pointer',
                      paddingBottom: 6,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={sameDay}
                      onChange={(e) => {
                        setSameDay(e.target.checked)
                        if (!e.target.checked) {
                          // 당착 해제 시 기본 계산값 복원
                          setUnloadDate(computeUnloadDate(today, tag) ?? '')
                        }
                      }}
                      data-testid="slip-form-same-day-checkbox"
                    />
                    당일 하차
                  </label>
                )}
              />
            ) : null}
          </div>

          {/* 특이사항 라벨 프리뷰 */}
          {(() => {
            const effectiveUnload = sameDay ? today : unloadDate
            const label = scheduleLabel(today, effectiveUnload || null, tag)
            return label ? (
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--color-neutral-500)' }}>배송일정 라벨:</span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: 'var(--color-primary-700, #1D4ED8)',
                    background: 'var(--color-primary-50, #EFF6FF)',
                    padding: '2px 8px',
                    borderRadius: 4,
                  }}
                  data-testid="slip-form-schedule-label-preview"
                >
                  {label}
                </span>
              </div>
            ) : null
          })()}
        </Card>
      ) : null}

      {/* 라인 카드 */}
      <Card padding={6} shadow="sm" className="sfp-card">
        <div className="sfp-line-toolbar">
          <div className="sfp-section-title">
            전표 라인
            <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--ink-secondary, #5C6773)', marginLeft: 8 }}>
              단가는 <b>부가세 포함</b> 단가 — 공급가액/부가세는 라인별 자동 분리
            </span>
          </div>
          <div className="sfp-line-actions">
            <Button
              variant="secondary"
              size="sm"
              data-testid="slip-form-inventory-lookup-btn"
              onClick={openStockModal}
              disabled={selectedProductLines.length === 0}
            >
              {stockButtonLabel}
            </Button>
          </div>
          {/* 자동 증식은 현재 입력 포커스를 유지하고, 추가 사실만 한 번 낭독한다. */}
          <span
            role="status"
            aria-live="polite"
            data-testid="slip-form-line-expansion-announcement"
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: 'hidden',
              clip: 'rect(0, 0, 0, 0)',
              whiteSpace: 'nowrap',
              border: 0,
            }}
          >
            {lineExpansionAnnouncement}
          </span>
        </div>

        {isMobile ? (
          <div className="mobile-line-card-list">
            {lines.map((line, idx) => {
              /**
               * AC-2: 현재 라인의 ProductOption 재구성.
               * productId / modelName / productName 이 모두 있으면 value 전달, 없으면 null.
               * UUID 비공개 가드: id 는 내부 state 전용, 화면 노출 X.
               */
              const lineProductValue: ProductOption | null =
                line.productId && line.modelName
                  ? {
                      id: line.productId,
                      modelName: line.modelName,
                      productName: line.productName,
                    }
                  : null
              const isBundle = line.productType === 'BUNDLE'
              return (
                <SlipMobileLineCard
                  key={line.id}
                  line={line}
                  lineNumber={idx + 1}
                  selected={selectedIds.has(line.id)}
                  canDelete={lines.length > 1}
                  partnerSelected={partnerSelected}
                  onSelect={(s) => toggleSelect(line.id, s)}
                  onSpecificationChange={(v) => updateLineFromUser(line.id, (current) => ({ ...current, specification: v }))}
                  onQuantityChange={(v) => updateQuantity(line.id, v)}
                  onUnitPriceChange={(v) => updatePrice(line.id, v)}
                  onSupplyAmountChange={(v) => updateVatAmount(line.id, 'SUPPLY', v)}
                  onVatAmountChange={(v) => updateVatAmount(line.id, 'VAT', v)}
                  vatEditable={!isBundle}
                  excludedFromSave={!willLineBeSaved(line)}
                  onDelete={() => removeLine(line.id)}
                  modelCell={
                    <ProductAutocomplete
                      value={lineProductValue}
                      onChange={(p) => void applyProductSelection(line, p)}
                      onInputCommitChange={(committed) => {
                        if (committed) return
                        invalidateBundleExpansionForLine(line.id)
                        updateLine(line.id, {
                          productId: null,
                          productName: '',
                          productType: null,
                          modelCode: null,
                        })
                      }}
                      searchProducts={(q) => searchProductsApi(q, { usageScope: 'PARTNER_ORDER' })}
                      label=""
                      ariaLabel={`라인 ${idx + 1} 품목`}
                      placeholder="모델명 또는 품목명"
                      resultSelectionMode="single"
                      debounceMs={250}
                    />
                  }
                  footer={renderLineFooter(line, idx)}
                />
              )
            })}
          </div>
        ) : (
          <div className="sfp-line-table">
            <LineTableHeader
              allSelected={allSelected}
              someSelected={someSelected}
              onToggleAll={toggleAll}
              vatInclusive
            />
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={lines.map((l) => l.id)}
                strategy={verticalListSortingStrategy}
              >
                {lines.map((line, idx) => {
                  /**
                   * AC-2: 현재 라인의 ProductOption 재구성.
                   * productId / modelName / productName 이 모두 있으면 value 전달, 없으면 null.
                   * UUID 비공개 가드: id 는 내부 state 전용, 화면 노출 X.
                   */
                  const lineProductValue: ProductOption | null =
                    line.productId && line.modelName
                      ? {
                          id: line.productId,
                          modelName: line.modelName,
                          productName: line.productName,
                        }
                      : null

                  const isBundle = line.productType === 'BUNDLE'
                  return (
                    <SortableLineRow
                      key={line.id}
                      line={line}
                      lineNumber={idx + 1}
                      selected={selectedIds.has(line.id)}
                      canDelete={lines.length > 1}
                      partnerSelected={partnerSelected}
                      onSelect={(s) => toggleSelect(line.id, s)}
                      onModelNameChange={(v) => updateLineFromUser(line.id, (current) => ({ ...current, modelName: v }))}
                      onModelNameBlur={(v) => void handleModelNameBlur(line.id, v)}
                      onSpecificationChange={(v) => updateLineFromUser(line.id, (current) => ({ ...current, specification: v }))}
                      onQuantityChange={(v) => updateQuantity(line.id, v)}
                      onUnitPriceChange={(v) => updatePrice(line.id, v)}
                      onSupplyAmountChange={(v) => updateVatAmount(line.id, 'SUPPLY', v)}
                      onVatAmountChange={(v) => updateVatAmount(line.id, 'VAT', v)}
                      vatEditable={!isBundle}
                      excludedFromSave={!willLineBeSaved(line)}
                      onDelete={() => removeLine(line.id)}
                      modelCell={
                        <ProductAutocomplete
                          value={lineProductValue}
                          onChange={(p) => void applyProductSelection(line, p)}
                          onInputCommitChange={(committed) => {
                            if (committed) return
                            invalidateBundleExpansionForLine(line.id)
                            updateLine(line.id, {
                              productId: null,
                              productName: '',
                              productType: null,
                              modelCode: null,
                            })
                          }}
                          searchProducts={(q) => searchProductsApi(q, { usageScope: 'PARTNER_ORDER' })}
                          label=""
                          ariaLabel={`라인 ${idx + 1} 품목`}
                          placeholder="모델명 또는 품목명"
                          resultSelectionMode="single"
                          debounceMs={250}
                        />
                      }
                      footer={renderLineFooter(line, idx)}
                    />
                  )
                })}
              </SortableContext>
            </DndContext>
          </div>
        )}

        {/* 합계 영역 (Designer wireframes.md § 1.1 인용) */}
        <div className="sfp-totals">
          <span className="sfp-totals-item">
            <span className="sfp-totals-label">합계</span>
            <span className="sfp-totals-value">{totals.count}건</span>
          </span>
          <span className="sfp-totals-divider" aria-hidden="true">|</span>
          <span className="sfp-totals-item">
            <span className="sfp-totals-label">공급가액</span>
            <span className="sfp-totals-value sfp-totals-num">
              ₩{totals.supply.toLocaleString()}
            </span>
          </span>
          <span className="sfp-totals-divider" aria-hidden="true">|</span>
          <span className="sfp-totals-item">
            <span className="sfp-totals-label">부가세</span>
            <span className="sfp-totals-value sfp-totals-num">
              ₩{totals.vat.toLocaleString()}
            </span>
          </span>
          <span className="sfp-totals-divider" aria-hidden="true">|</span>
          <span className="sfp-totals-item sfp-totals-item--strong">
            <span className="sfp-totals-label">총</span>
            <span className="sfp-totals-value sfp-totals-num">
              ₩{totals.total.toLocaleString()}
            </span>
          </span>
        </div>

        {/*
          #902 R2 D3·H3: 저장을 누르기 전에, 개별 행 안내(role="note")가 화면 밖에 있어도
          몇 행이 왜 제외되는지 알 수 있게 하는 요약. R4-D9 계열 상시 마운트 관행과 동일 —
          live region 이 빈 컨테이너로 먼저 존재해야 스크린리더 낭독이 신뢰된다(H5).
        */}
        <div
          role="status"
          aria-live="polite"
          data-testid="slip-form-incomplete-summary"
          data-incomplete-count={incompleteLines.length}
          className={incompleteLines.length > 0 ? 'sfp-incomplete-summary' : undefined}
        >
          {incompleteSummaryText || null}
        </div>

        {errorMessage ? (
          <div className="sfp-error-banner" role="alert">
            <span aria-hidden="true">ⓘ</span>
            <span>{errorMessage}</span>
          </div>
        ) : null}

        <div className="sfp-submit-bar">
          {/* 재조회 in-flight busy 단서 — 견적 폼과 대칭 문구(R4-F4).
              R4-D9 계열 sweep: live region 은 빈 span 으로 상시 렌더하고 텍스트만 토글 —
              ARIA 관행상 live region 이 선존재해야 SR 낭독이 신뢰된다. 비활성 시 스타일
              미부여 빈 인라인 span = 시각 0px (flex-end 정렬이라 gap 슬롯도 우측 그룹에
              가시 영향 없음). */}
          <span
            role="status"
            aria-live="polite"
            data-testid="slip-form-price-refresh-busy"
            style={
              priceResolutionBusy
                ? { fontSize: 12, color: 'var(--ink-secondary, #5C6773)', alignSelf: 'center' }
                : undefined
            }
          >
            {priceResolutionBusy ? '최근단가 확인 중…' : null}
          </span>
          <span
            role="status"
            aria-live="polite"
            aria-label={bundleExpansionPending ? '세트 구성품 반영 중' : undefined}
            data-testid="slip-form-bundle-expansion-busy"
            style={
              bundleExpansionPending
                ? { fontSize: 12, color: 'var(--ink-secondary, #5C6773)', alignSelf: 'center' }
                : undefined
            }
          >
            {bundleExpansionPending ? '세트 구성품 반영 중… 저장할 수 없습니다.' : null}
          </span>
          <Button variant="ghost" onClick={() => navigate(listPath)}>
            취소
          </Button>
          <Button
            variant="primary"
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!canSubmit}
          >
            저장
          </Button>
        </div>
      </Card>

      {/* 재고조회 모달 — 신 공용 InventoryLookupModal (가용/실/예약 자체 페치) */}
      {/* §2-2 세트 재고 가드: BUNDLE 라인은 제외 후 전달, 전부 세트면 bundleOnlyLines=true */}
      <InventoryLookupModal
        open={stockModalOpen}
        onClose={closeStockModal}
        lines={stockSelectedSnapshot}
        bundleOnlyLines={stockBundleOnlySnapshot}
        excludedBundleCount={stockExcludedBundleSnapshot}
      />
    </div>
  )
}
