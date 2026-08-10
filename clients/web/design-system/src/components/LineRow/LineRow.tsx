/**
 * `<LineRow>` — sales-form-polish + sales-polish-2-slice (Slice A) 갱신.
 *
 * Designer `components.md` § 3 (Slice A) spec 충실 반영:
 * - 기본 10-column CSS grid (체크박스 / drag / # / 모델명 / 품목명 / 규격 / 수량 / 단가 / 합계 / 삭제)
 * - VAT 포함 모드 12-column CSS grid (단가 뒤 공급가액 / 부가세 입력 열 추가)
 * - 행 높이 40px (dense ERP 표준)
 * - 5 states: default / hover / selected / dragging / error
 * - 자동 라인 번호 (drag 시 자동 갱신)
 * - 모델명 입력 + onBlur lookup + 우측 spinner (lookup 중)
 * - 품목명 read-only display (lookup 후 fade-in)
 * - **규격 input** (Slice A 신규 — 사용자 피드백 #4) — 100px 폭, placeholder "예: 220V"
 * - 수량 / 단가 / 합계 우측 정렬 + tabular-nums
 * - 합계 read-only computed (subtle bg)
 * - 삭제 버튼 (`⊗`) — hover 시 빨강
 * - drag handle 은 외부에서 `<DragHandle>` 주입 형태로 받지 않고 dragHandleProps 만 받음
 *
 * 본 컴포넌트는 design-system 패키지에서 `@dnd-kit/core` 의존성을 가지지 않는다.
 * 호출자 (`SlipFormPage`) 가 `useSortable()` 결과를 풀어서 `dragHandleProps` 로 전달.
 *
 * 접근성:
 * - 시각적 grid 행은 일반 컨테이너로 유지하고, 선택 상태는 체크박스와 `.selected` class로 표현
 * - 체크박스 / drag handle / 삭제 버튼 모두 aria-label
 * - Space: 체크박스 토글 (focus 시)
 * - Enter (모델명): blur trigger (lookup)
 *
 * UUID 비공개 가드: `productId` 는 부모 state 로만 보관, 화면에 노출 X.
 */
import { forwardRef, useId, type CSSProperties, type ReactNode } from 'react'
import styles from './LineRow.module.css'
import { Spinner } from '../Spinner/Spinner'
import { DragHandle } from '../DragHandle/DragHandle'

/**
 * 세트(BUNDLE) 전개 옵션 — BE `BundleSetOptions` 와 구조적 호환.
 * 모든 필드 optional 이며, 호출자(desktop)의 동명 타입과 structural 하게 assignable.
 */
export interface BundleSetOptions {
  /** 실외기 교체 모델코드 (미입력=기본). */
  remoteOption?: string | null
  /** 실외기 제외 여부. */
  remoteExcluded?: boolean | null
  /** 판넬 선택 모델코드 (미입력=기본). */
  panelOption?: string | null
  /** 판넬 360 형상값 — `''` | `'원형'` | `'사각'` (BE variant 정확 매칭, String). */
  panelShape360?: string | null
  /** 자재 포함 여부. */
  materialIncluded?: boolean | null
}

/**
 * 라인 입력 폼 상태 (SlipFormPage 와 공유).
 *
 * - `productId` 는 lookup 성공 시 채워지는 UUID — 화면 미노출
 * - `modelName` 이 사용자 입력 / 표시 식별자
 * - `lineSum` 는 부모에서 computed (수량 × 단가)
 * - `lookupError` / `lookupLoading` 라인별 lookup 상태
 */
export interface LineDraft {
  /** 안정 ID (drag-and-drop key 용) — UUID 또는 'tmp-N'. 화면 미노출. */
  id: string
  /** lookup 성공 시 채워지는 product UUID — 화면 미노출. */
  productId: string | null
  /** 사용자 입력 모델명. */
  modelName: string
  /** lookup 후 자동 fill 되는 품목명. */
  productName: string
  /**
   * 규격 (예: "220V", "4HP") — 사용자 직접 입력. Slice A 신규 (피드백 #4).
   * 빈 값 허용. DB column varchar(50) 일치.
   */
  specification: string
  /** 수량 (string — input value 호환). */
  quantity: string
  /** 단가 (string — PriceField 호환). */
  unitPrice: string
  /** VAT 포함 모드의 라인 공급가액 — 부모 계산 상태. */
  supplyAmount?: string
  /** VAT 포함 모드의 라인 부가세 — 부모 계산 상태. */
  vatAmount?: string
  /** VAT 포함 모드의 라인 VAT 포함 합계 — 부모 계산 상태. */
  lineTotal?: string
  /** 마지막으로 편집한 금액 열. 화면 로컬 상태이며 서버에는 저장하지 않는다. */
  authority?: 'PRICE' | 'SUPPLY' | 'VAT' | 'TOTAL'
  /** 부가세가 공급가액의 10%와 다를 때 비차단 경고. */
  vatWarning?: boolean
  /**
   * 단가 출처 — 마커 라벨/설명 분기 기준.
   *
   * <p>- {@code REMEMBERED}: (거래처+품목) 최근단가 자동채움 → 마커 **`거래처 최근단가`**.
   *   단 {@code partnerSelected=false} 면 마커를 **해제**한다(D-R4-4) — 귀속시킬 거래처가 없는데
   *   "이 거래처에 마지막으로 저장된 단가" 라고 말할 수 없기 때문이다. 단가 **값과 priceSource 는
   *   호출자가 유지**해 재선택 시 재조회 자격을 보존한다.
   * <p>- {@code CATALOG}: 품목 판매가 폴백 → 마커 **`판매가`**.
   * <p>- {@code USER}: 사용자 확정값 → 마커 없음. 거래처 변경 자동재조회에서 보호된다.
   *
   * <p>⚠️ 라벨은 **`판매가`/`거래처 최근단가`** 다 — 구 `'정가'`(D-R4-1 에서 폐기: 출고가
   * releasePrice 계열 별칭이라 오도) 와 구 `'최근가'` 는 사용 금지.
   */
  priceSource?: 'REMEMBERED' | 'CATALOG' | 'USER' | null
  /** 판매가(catalog) fallback 값 — 거래처 변경 재조회 miss 시 사용. */
  catalogUnitPrice?: string | null
  /** 최근 단가 저장 시각 — tooltip 전용. */
  priceMemoryUpdatedAt?: string | null
  /** 거래처 변경으로 자동 단가가 실제 변경된 행 — 시각적 강조/고지용. */
  priceRefreshChanged?: boolean
  /** lookup 실패 메시지. */
  lookupError: string | null
  /** lookup 진행 중 — 우측 spinner 표시. */
  lookupLoading: boolean
  /** 품목 유형 (선택) — "SINGLE" | "BUNDLE". BUNDLE 일 때만 세트 옵션 노출. */
  productType?: string | null
  /** 품목 상태 — OUT_OF_STOCK은 수량 입력을 잠근다. */
  status?: string | null
  /** 품목코드 (선택) — 세트 전개 시 부모 modelCode. */
  modelCode?: string | null
  /** 저장 전표 DC 표시용 품목 카테고리/고정율 — 화면에는 UUID를 포함하지 않는다. */
  categoryKey?: string | null
  fixedDiscountRate?: number | null
  /** 거래처 전역DC 자격 — 거래처 변경 재가격 시에도 원 품목 자격을 보존한다. */
  hasVariableDiscount?: boolean | null
  /** 적용 규칙 사용자 안내용. */
  discountInfo?: string | null
  /** 세트 전개 옵션 (선택) — BUNDLE 라인에 한해 채움. */
  setOptions?: BundleSetOptions
  /** EXPAND 저장 계보 — 부모 세트 modelCode. */
  parentSetModel?: string | null
  /** EXPAND 저장 계보 — 첫 구성품 여부. */
  setHead?: boolean
  /** EXPAND 저장 가격기억의 원 부모 productId. 화면에는 표시하지 않는다. */
  bundleParentProductId?: string | null
  /** EXPAND 저장 가격기억의 원 부모 입력단가. 화면에는 표시하지 않는다. */
  bundleParentUnitPrice?: string | null
}

export interface LineRowProps {
  /** 1부터 시작하는 사용자 표시용 라인 번호 (drag 시 자동 갱신). */
  lineNumber: number
  /** 행 데이터. */
  line: LineDraft
  /** 행 선택 여부 — 체크박스 + 행 배경 색에 동시 반영. */
  selected: boolean
  /** 선택 변경 콜백 (체크박스 toggle). */
  onSelect: (selected: boolean) => void
  /** 모델명 input 변경 (입력 도중 매 keystroke). */
  onModelNameChange: (value: string) => void
  /** 모델명 onBlur — 백엔드 lookup 호출 trigger. */
  onModelNameBlur: (value: string) => void
  /** 규격 변경 (입력 도중 매 keystroke). Slice A 신규 (피드백 #4). */
  onSpecificationChange: (value: string) => void
  /** 수량 변경. */
  onQuantityChange: (value: string) => void
  /** 단가 변경. */
  onUnitPriceChange: (value: string) => void
  /** 공급가액 변경 — VAT 포함 모드에서만 사용. */
  onSupplyAmountChange?: (value: string) => void
  /** 부가세 변경 — VAT 포함 모드에서만 사용. */
  onVatAmountChange?: (value: string) => void
  /** 합계 변경 — VAT 포함 모드에서만 사용. */
  onLineTotalChange?: (value: string) => void
  /** 세트 구성품 등 금액 열 편집 금지. */
  vatEditable?: boolean
  /** 행 삭제. */
  onDelete: () => void
  /** @dnd-kit/sortable useSortable() 결과의 일부. */
  dragHandleProps: {
    attributes?: Record<string, unknown>
    listeners?: Record<string, unknown> | undefined
    setActivatorNodeRef?: (node: HTMLElement | null) => void
  }
  /** drag 진행 중 — opacity / cursor 변화. */
  isDragging?: boolean
  /** 첫 행 + 행이 1건 뿐일 때 삭제 disable (UX: 빈 폼 방지). */
  canDelete?: boolean
  /** drag 시 transform 적용용 inline style (dnd-kit transform CSS). */
  style?: CSSProperties
  /**
   * 모델명 셀 커스텀 슬롯 (AC-2 신규).
   *
   * 제공 시 모델명 `<input>` 자리에 이 노드를 렌더한다 (예: `<ProductAutocomplete>`).
   * **미제공 시 기존 modelName input + onModelNameChange/onModelNameBlur 동작 그대로 유지** (backward compatible).
   * `modelCell` 사용 라인은 lookupError/lookupLoading 을 호출자가 자체 처리.
   */
  modelCell?: ReactNode
  /**
   * 단가 부가세포함 모드(opt-in, 2026-06-09 전표 단가 전환). true 면 `unitPrice` 를 VAT 포함
   * 단가로 보고 합계 셀에 **합계(VAT포함)=수량×단가** + 라인 단위 **공급가액/부가세**(round) 소표시.
   * 미지정(기본) 시 기존 동작(합계=수량×단가, VAT 미분해) — 견적 등 비전환 화면 호환.
   */
  vatInclusive?: boolean
  /**
   * 거래처 선택 여부 (#809 R4 D-R4-1·D-R4-4).
   *
   * - `false` 시 CATALOG 마커 설명이 거래처를 단정하지 않는다("판매가를 적용했습니다").
   * - `false` 시 REMEMBERED 마커는 렌더하지 않는다 — 거래처 해제 시 단가값은 유지하되
   *   마커(저장일 포함)만 해제(D-R4-4). 상태(priceSource)는 호출자가 유지해 재선택 시 재조회 가능.
   * - 미지정(기본 `true`) 시 기존 동작 유지 (backward compatible).
   */
  partnerSelected?: boolean
  /** 단건 최근단가 조회 Promise가 살아 있는 동안 확정 단가 표시를 숨긴다. */
  priceLookupPending?: boolean
  /**
   * 이 행이 저장 대상에서 제외될 예정(#902 R2 D7·H6, #902 R3 H6′로 정정) — 호출자의 저장
   * 판정(예: `productId && quantity > 0`)과 같은 조건이어야 한다.
   *
   * <p>계산 로직(lineVat.ts 의 {@code recalculateLineVat})은 수량을
   * {@code Math.max(1, ...)}로 클램프해 공급가액/부가세/합계를 계산한다(다른 화면·BE parity
   * 유지를 위해 그대로 둔다) — 그래서 수량 0(저장 제외 예정) 행의 "authority=PRICE 로 계산된"
   * 금액 필드는 "수량 1 로 계산된" 값이라, 화면에 그대로 보이면 "저장에서 제외됩니다" 밴드와
   * 실제로는 저장되지 않을 금액이 동시에 뜨는 모순이 생긴다(H9, 원 D7).
   *
   * <p>⚠️ #902 R3 정정: true 라고 해서 공급가액/부가세/합계 표시가 무조건 0 으로 강제되지
   * 않는다(그러면 controlled input 의 value 가 항상 0 이 되어 사용자가 그 칸에 입력할 수
   * 없어진다 — 개발책임자 발견 회귀). 억제는 {@code line.authority} 가 'PRICE'(또는 미설정)
   * 이고 실제 quantity 가 0 이하일 때만 적용된다 — 사용자가 공급가액/부가세/합계 중 하나를
   * 직접 편집(authority 승격)했거나, quantity 가 이미 유효(>0)해 클램프가 아무 것도 왜곡하지
   * 않았다면 실제 값을 그대로 보여준다(H6′·H8). 미지정(기본 false) 시 기존 동작 유지
   * (backward compatible).
   */
  excludedFromSave?: boolean
}

/**
 * 합계 셀 렌더용 — 수량 × 단가 계산 + 천단위 콤마.
 *
 * @param qty 수량 string
 * @param price 단가 string
 * @return 천단위 콤마 string ("0" 가능)
 */
function computeLineSum(qty: string, price: string): string {
  const q = Number(qty)
  const p = Number(price)
  if (!Number.isFinite(q) || !Number.isFinite(p)) return '0'
  return Math.round(q * p).toLocaleString()
}

/**
 * 단가 부가세포함 라인 분해 — 합계(VAT포함)=round(수량×단가), 공급가액=round(합계/1.1), 부가세=합계−공급가액.
 * BE {@code SlipLine.createFromVatInclusive} 와 동일 라인 단위 반올림(eCount 방식).
 */
function computeVatBreakdown(qty: string, price: string): { incl: number; supply: number; vat: number } {
  const q = Number(qty)
  const p = Number(price)
  if (!Number.isFinite(q) || !Number.isFinite(p)) return { incl: 0, supply: 0, vat: 0 }
  const incl = Math.round(q * p)
  // BLOCKING-2 계열(#824 R1): BE VatAmountCalculator 는 0 방향 절사(DOWN)다. incl/1.1 을 그대로
  // 나누면 1.1 의 이진부동소수 근사 오차가 섞이므로, incl×10 을 11 로 정수 나눗셈(트렁케이션)한다
  // — incl 이 안전정수 범위(≤2^53)인 한 (incl*10)/11 은 항상 정확히 절사된 몫이다.
  const supply = Math.trunc((incl * 10) / 11)
  return { incl, supply, vat: incl - supply }
}

/** 금액 입력은 숫자와 천단위 콤마만 허용하고, 잘못된 문자열은 숫자로 재조합하지 않는다. */
function parseEditableAmountInput(raw: string): string | null {
  if (/^\d*$/.test(raw)) return raw
  if (raw.includes(',,')) return null
  if (!/^\d{1,3}(?:,\d{0,3})+$/.test(raw)) return null
  return raw.replace(/,/g, '')
}

/**
 * LineRow forwardRef — sortable container 의 ref 를 받는다.
 */
export const LineRow = forwardRef<HTMLDivElement, LineRowProps>(function LineRow(
  {
    lineNumber,
    line,
    selected,
    onSelect,
    onModelNameChange,
    onModelNameBlur,
    onSpecificationChange,
    onQuantityChange,
    onUnitPriceChange,
    onDelete,
    dragHandleProps,
    isDragging = false,
    canDelete = true,
    style,
    modelCell,
    vatInclusive = false,
    partnerSelected = true,
    onSupplyAmountChange,
    onVatAmountChange,
    // onLineTotalChange: P1(개발책임자 결정 2026-07-25)로 합계 편집 UI 자체가 사라져 더 이상
    // 쓰이지 않는다 — 구조분해에서 뺐다(호출자가 여전히 넘겨도 무해, 인터페이스는 하위 호환
    // 유지).
    vatEditable = true,
    excludedFromSave = false,
    priceLookupPending = false,
  },
  ref,
) {
  const reactId = useId()
  const checkboxId = `lr-check-${reactId}`
  const modelId = `lr-model-${reactId}`
  const specId = `lr-spec-${reactId}`
  const qtyId = `lr-qty-${reactId}`
  const priceId = `lr-price-${reactId}`
  const priceStatusId = `${priceId}-status`
  const priceChangedStatusId = `${priceId}-changed`

  const hasError = !!line.lookupError
  const isOutOfStock = line.status === 'OUT_OF_STOCK'
  const sumDisplay = computeLineSum(line.quantity, line.unitPrice)
  const vatBreakdown = vatInclusive ? computeVatBreakdown(line.quantity, line.unitPrice) : null
  const hasVatAmounts = vatInclusive && line.supplyAmount != null
    && line.vatAmount != null && line.lineTotal != null
  const rowGridClass = vatInclusive ? styles['lineRowVat'] : undefined
  /**
   * #902 R3(개발책임자 직접 발견 회귀 fix): 이전 라운드(D7·H6)는 excludedFromSave 하나만
   * 보고 무조건 '0'을 강제했다 — 그 값이 controlled input 의 value 라서, 사용자가 공급가액/
   * 부가세/합계 칸에 아무리 입력해도 다음 렌더에서 곧바로 '0'으로 되돌아갔다(H6′·H8 회귀).
   *
   * <p>억제해야 할 대상은 lineVat 의 수량 클램프(Math.max(1,...))가 실제로 왜곡해 만든
   * "가짜" 값이지, 사용자가 직접 친 값이 아니다(H6′ 단서). 이 둘은 두 신호로 구별한다.
   * <ul>
   *   <li>{@code authority} 가 'SUPPLY'/'VAT'/'TOTAL' 이면 사용자가 그 권위 그룹의 금액을
   *       직접 편집한 것이다 — 이 컴포넌트는 계산 자체를 하지 않고 호출자가 이미 계산한
   *       supplyAmount/vatAmount/lineTotal 을 그대로 받는다. 호출자(예: 데스크톱
   *       SlipFormPage 의 {@code lineVat.editSlipLineAmount})가 그 계산에서 quantity 를
   *       쓰지 않는 한 클램프는 관여하지 않는다. 억제하지 않는다. (#902 R5: SUPPLY/VAT 는
   *       이제 quantity 는 물론 unitPrice 도 건드리지 않는 전용 함수를 거친다 — P4/P6,
   *       2026-07-25 결정. TOTAL 은 이 컴포넌트의 합계 칸이 읽기전용으로 바뀌어 이 화면에서는
   *       편집 UI 로 도달할 수 없지만, authority 값 자체는 여전히 유효한 타입이라 아래
   *       판정에서 함께 다룬다.)
   *   <li>{@code authority} 가 'PRICE'(기본값 포함)면 세 값이 quantity 를 그대로(클램프
   *       거쳐) 곱해 계산된다 — 이때 실제 quantity 가 이미 1 이상으로 유효하면 클램프는
   *       아무 것도 왜곡하지 않은 것이라(무영향) 억제하지 않는다 — "제외 예정"(예: 품목
   *       미선택) 그 자체는 억제 사유가 아니다(이카운트 방식 "금액 먼저" 입력 흐름 보존).
   *       실제 quantity 가 0 이하(빈 값 포함)일 때만 클램프가 "수량 1"을 대신 밀어넣어
   *       값을 왜곡한다 — 이때만 억제해 H9(원 D7)의 모순을 막는다.
   * </ul>
   */
  const suppressComputedAmounts = excludedFromSave
    && (line.authority == null || line.authority === 'PRICE')
    && !(Number(line.quantity) > 0)
  const amountDisplay = (value: string | undefined, fallback: number): string =>
    suppressComputedAmounts ? '0' : Number(value ?? fallback).toLocaleString()
  // `unitPrice=''` is intentionally not used for pending state: this component's
  // normal fallback below turns falsy values into "0". Pending masks the
  // controlled input display here while preserving the draft value in state.
  const priceDisplay = priceLookupPending
    ? ''
    : line.unitPrice ? Number(line.unitPrice).toLocaleString() : '0'
  // D-R4-1: 자동채움 값의 실체는 제품 등록 화면의 '판매가'(sellingPrice) — '정가' 라벨은
  // 기존 용어체계에서 출고가(releasePrice) 계열 별칭이라 오도되므로 사용 금지.
  // D-R4-4: 거래처 미선택(partnerSelected=false) 시 REMEMBERED 마커는 해제(단가값은 호출자가 유지),
  // CATALOG 설명은 거래처를 단정하지 않는 카피로 분기.
  const priceStatus = priceLookupPending
    ? null
    : line.priceSource === 'REMEMBERED'
    ? (partnerSelected ? '거래처 최근단가' : null)
    : line.priceSource === 'CATALOG'
      ? '판매가'
      : null
  const priceStatusDescription = priceLookupPending
    ? null
    : line.priceSource === 'REMEMBERED'
    ? (partnerSelected
        ? `이 거래처에 마지막으로 저장된 단가${line.priceMemoryUpdatedAt ? ` · ${line.priceMemoryUpdatedAt.slice(0, 10)} 저장` : ''}`
        : null)
    : line.priceSource === 'CATALOG'
      ? (partnerSelected
          ? '이 거래처에 저장된 최근단가가 없어 판매가를 적용했습니다'
          : '판매가를 적용했습니다')
      : null
  const priceDescribedBy = [
    priceLookupPending ? null : priceStatusDescription ? priceStatusId : null,
    priceLookupPending ? null : line.priceRefreshChanged ? priceChangedStatusId : null,
  ]
    .filter((id): id is string => id !== null)
    .join(' ') || undefined

  const rowClass = [
    styles['lineRow'],
    selected ? styles['selected'] : null,
    isDragging ? styles['dragging'] : null,
    hasError ? styles['error'] : null,
    line.priceRefreshChanged ? styles['priceRefreshed'] : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <div
        ref={ref}
        className={`${rowClass}${rowGridClass ? ` ${rowGridClass}` : ''}`}
        style={style}
        data-line-number={lineNumber}
      >
        {/* 1. 체크박스 */}
        <div className={`${styles['cell']} ${styles['cellCheckbox']}`}>
          <input
            id={checkboxId}
            type="checkbox"
            className={styles['checkbox']}
            checked={selected}
            onChange={(e) => onSelect(e.target.checked)}
            aria-label={`라인 ${lineNumber} 선택`}
          />
        </div>

        {/* 2. drag handle */}
        <div className={styles['cell']}>
          <DragHandle
            label={`라인 ${lineNumber} 드래그`}
            dragging={isDragging}
            attributes={dragHandleProps.attributes}
            listeners={dragHandleProps.listeners}
            setActivatorNodeRef={dragHandleProps.setActivatorNodeRef}
          />
        </div>

        {/* 3. 라인 번호 */}
        <div className={`${styles['cell']} ${styles['cellLineNo']}`}>{lineNumber}</div>

        {/* 4. 모델명 — modelCell slot 제공 시 커스텀 렌더, 미제공 시 기존 input 유지 */}
        <div className={`${styles['cell']} ${styles['cellModel']}`}>
          {modelCell != null ? (
            modelCell
          ) : (
            <>
              <input
                id={modelId}
                type="text"
                className={`${styles['input']} ${styles['modelInput']}`}
                value={line.modelName}
                onChange={(e) => onModelNameChange(e.target.value)}
                onBlur={(e) => onModelNameBlur(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.currentTarget.blur()
                  }
                }}
                placeholder="예: AJ040RXH4BC1"
                aria-label={`라인 ${lineNumber} 모델명`}
                aria-invalid={hasError || undefined}
                aria-describedby={hasError ? `${modelId}-err` : undefined}
                spellCheck={false}
                autoComplete="off"
              />
              {line.lookupLoading ? (
                <span className={styles['modelSpinner']} aria-hidden="true">
                  <Spinner size="xs" tone="var(--action-brand)" />
                </span>
              ) : null}
            </>
          )}
        </div>

        {/* 5. 품목명 (read-only display) */}
        <div className={`${styles['cell']} ${styles['cellProduct']}`}>
          {line.productName ? (
            <span className={styles['productName']} title={line.productName}>{line.productName}</span>
          ) : (
            <span className={styles['productPlaceholder']}>
              {line.lookupLoading ? '조회중...' : '모델명 조회 후 자동입력'}
            </span>
          )}
          {line.priceRefreshChanged && !priceLookupPending ? (
            <span id={priceChangedStatusId} className={styles['priceChangedStatus']}>
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="M3 2v7m0 0L1.5 7.5M3 9l1.5-1.5M9 10V3m0 0L7.5 4.5M9 3l1.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              단가 변경
            </span>
          ) : null}
        </div>

        {/* 6. 규격 (Slice A 신규 — 피드백 #4) */}
        <div className={`${styles['cell']} ${styles['cellSpec']}`}>
          <input
            id={specId}
            type="text"
            className={`${styles['input']} ${styles['specInput']}`}
            value={line.specification}
            onChange={(e) => onSpecificationChange(e.target.value)}
            placeholder="예: 220V"
            maxLength={50}
            aria-label={`라인 ${lineNumber} 규격`}
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        {/* 7. 수량 */}
        <div className={`${styles['cell']} ${styles['cellQty']}`}>
          <input
            id={qtyId}
            type="number"
            min={1}
            className={`${styles['input']} ${styles['numInput']}`}
            value={line.quantity}
            disabled={isOutOfStock}
            onChange={(e) => {
              // #902 R3 H7′(H7 대체, 개발책임자 회귀 지시 S5): 종전 D8 fix 는 문자 단위로
              // 숫자가 아닌 문자만 제거해 "2.7"→"27"(10배 오주문), "0.5"→"05"→5, "-3"→"3",
              // "1e3"→"13" 처럼 자릿수가 재조합되어 사용자가 의도하지 않은 다른 수량이
              // 조용히 만들어졌다 — 원래 결함(BE 에서 2.7→2 절사)보다 더 나빴다(PM 실측).
              // 전체 문자열이 순수 자연수(빈 값 포함)일 때만 그대로 받아들이고, 아니면 이
              // 입력 자체를 반영하지 않는다 — controlled input 이라 다음 렌더에서 이전
              // 값으로 자동 복귀한다(자릿수 재조합 없이 "받지 않음"으로 처리).
              if (!/^\d*$/.test(e.target.value)) return
              onQuantityChange(e.target.value)
            }}
            aria-label={`라인 ${lineNumber} 수량${isOutOfStock ? ' 품절' : ''}`}
          />
          {isOutOfStock ? <span role="status">품절</span> : null}
        </div>

        {/* 8. 단가 */}
        <div className={`${styles['cell']} ${styles['cellPrice']}`}>
          <span className={styles['priceInputWrap']}>
            <input
              id={priceId}
              type="text"
              inputMode="numeric"
              className={`${styles['input']} ${styles['numInput']}`}
              value={priceDisplay}
              onChange={(e) => {
                const numeric = parseEditableAmountInput(e.target.value)
                if (numeric !== null) onUnitPriceChange(numeric)
              }}
              aria-label={`라인 ${lineNumber} 단가`}
              aria-describedby={priceDescribedBy}
            />
            {/* R4-D2: 라인별 aria-live 금지 — 라인 N개 flip 시 N회 낭독 폭주. 비동기 재적용의
                전역 고지는 페이지 배너(role="status") 1곳이 담당하고, 포커스 시 전달은
                aria-describedby 체인으로 충분하다(spec 40행). */}
            {priceStatus && priceStatusDescription ? (
              <span
                id={priceStatusId}
                role="note"
                aria-label={priceStatusDescription}
                className={styles['priceMemoryNote']}
                title={priceStatusDescription}
              >
                {priceStatus}
              </span>
            ) : null}
          </span>
        </div>

        {vatInclusive ? (
          <>
            <div className={`${styles['cell']} ${styles['cellVatAmount']}`}>
              {hasVatAmounts && onSupplyAmountChange ? (
                <input
                  type="text"
                  inputMode="numeric"
                  className={`${styles['input']} ${styles['numInput']}`}
                  value={amountDisplay(line.supplyAmount, vatBreakdown?.supply ?? 0)}
                  onChange={(e) => {
                    const numeric = parseEditableAmountInput(e.target.value)
                    if (numeric !== null) onSupplyAmountChange(numeric)
                  }}
                  aria-label={`라인 ${lineNumber} 공급가액`}
                  disabled={!vatEditable}
                />
              ) : (
                amountDisplay(line.supplyAmount, vatBreakdown?.supply ?? 0)
              )}
            </div>
            <div className={`${styles['cell']} ${styles['cellVatAmount']}`}>
              <span className={styles['vatAmountWrap']}>
                {hasVatAmounts && onVatAmountChange ? (
                  <input
                    type="text"
                    inputMode="numeric"
                    className={`${styles['input']} ${styles['numInput']}`}
                    value={amountDisplay(line.vatAmount, vatBreakdown?.vat ?? 0)}
                    onChange={(e) => {
                      const numeric = parseEditableAmountInput(e.target.value)
                      if (numeric !== null) onVatAmountChange(numeric)
                    }}
                    aria-label={`라인 ${lineNumber} 부가세`}
                    disabled={!vatEditable}
                  />
                ) : (
                  amountDisplay(line.vatAmount, vatBreakdown?.vat ?? 0)
                )}
                {line.vatWarning ? (
                  <span role="note" className={styles['vatWarning']}>⚠ 10%와 다름</span>
                ) : null}
              </span>
            </div>
          </>
        ) : null}

        {/*
          9. 합계 — 읽기전용(P1, 개발책임자 결정 2026-07-25 "금액 열 편집 정책"): 합계는
          공급가액+부가세로만 파생되고 사용자가 직접 입력할 수단이 없다. 종전에는 VAT 포함
          모드에서 hasVatAmounts && onLineTotalChange 조건일 때 편집 가능한 <input>을
          렌더했으나(그 분기 제거), 이제는 상태와 무관하게 항상 읽기전용 표시로 통일한다 —
          onLineTotalChange prop은 하위 호환을 위해 인터페이스에 남겨두되(다른 소비처가 아직
          넘길 수 있음) 렌더에서는 쓰지 않는다(TOTAL 권위는 lineVat.ts 공유 함수 안에는 여전히
          살아있다 — 견적/전표 상세가 계속 쓴다 — 다만 이 화면의 UI에서는 도달 불가하다).
        */}
        <div className={`${styles['cell']} ${styles['cellSum']}`} aria-label={`라인 ${lineNumber} 합계`}>
          {vatBreakdown ? (
            <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.25 }}>
              <span aria-label={`라인 ${lineNumber} 합계(VAT포함)`}>
                {hasVatAmounts ? amountDisplay(line.lineTotal, vatBreakdown.incl) : vatBreakdown.incl.toLocaleString()}
              </span>
              <span style={{ fontSize: 10, color: 'var(--ink-secondary, #5C6773)' }}
                aria-label={`라인 ${lineNumber} 공급가액/부가세`}>
                공급 {hasVatAmounts ? amountDisplay(line.supplyAmount, vatBreakdown.supply) : vatBreakdown.supply.toLocaleString()} · VAT {hasVatAmounts ? amountDisplay(line.vatAmount, vatBreakdown.vat) : vatBreakdown.vat.toLocaleString()}
              </span>
            </span>
          ) : (
            sumDisplay
          )}
        </div>

        {/* 10. 삭제 */}
        <div className={`${styles['cell']} ${styles['cellDelete']}`}>
          <button
            type="button"
            className={styles['deleteBtn']}
            onClick={onDelete}
            disabled={!canDelete}
            aria-label={`라인 ${lineNumber} 삭제`}
            title={canDelete ? '삭제' : '마지막 행은 삭제할 수 없습니다'}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <path
                d="M4.5 4.5l5 5M9.5 4.5l-5 5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* 에러 메시지 (행 아래) */}
      {hasError ? (
        <div
          id={`${modelId}-err`}
          role="alert"
          className={styles['errorMessage']}
          style={{
            paddingLeft: 'calc(var(--col-checkbox) + var(--col-drag) + var(--col-line-no) + var(--space-row-x))',
            background: selected ? 'var(--surface-selected)' : 'var(--surface-card)',
            borderBottom: '1px solid var(--line-default)',
            display: 'block',
          }}
        >
          <span aria-hidden="true">ⓘ</span> {line.lookupError}
        </div>
      ) : null}
    </>
  )
})

export default LineRow
