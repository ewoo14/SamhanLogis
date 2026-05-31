/**
 * `<LineRow>` — sales-form-polish + sales-polish-2-slice (Slice A) 갱신.
 *
 * Designer `components.md` § 3 (Slice A) spec 충실 반영:
 * - 10-column CSS grid (체크박스 / drag / # / 모델명 / 품목명 / **규격(NEW)** / 수량 / 단가 / 합계 / 삭제)
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
 * - role="row" + aria-selected={selected}
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
  /** lookup 실패 메시지. */
  lookupError: string | null
  /** lookup 진행 중 — 우측 spinner 표시. */
  lookupLoading: boolean
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
  },
  ref,
) {
  const reactId = useId()
  const checkboxId = `lr-check-${reactId}`
  const modelId = `lr-model-${reactId}`
  const specId = `lr-spec-${reactId}`
  const qtyId = `lr-qty-${reactId}`
  const priceId = `lr-price-${reactId}`

  const hasError = !!line.lookupError
  const sumDisplay = computeLineSum(line.quantity, line.unitPrice)
  const priceDisplay = line.unitPrice ? Number(line.unitPrice).toLocaleString() : '0'

  const rowClass = [
    styles['lineRow'],
    selected ? styles['selected'] : null,
    isDragging ? styles['dragging'] : null,
    hasError ? styles['error'] : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <>
      <div
        ref={ref}
        role="row"
        aria-selected={selected}
        className={rowClass}
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
            <span title={line.productName}>{line.productName}</span>
          ) : (
            <span className={styles['productPlaceholder']}>
              {line.lookupLoading ? '조회중...' : '모델명 조회 후 자동입력'}
            </span>
          )}
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
            onChange={(e) => onQuantityChange(e.target.value)}
            aria-label={`라인 ${lineNumber} 수량`}
          />
        </div>

        {/* 8. 단가 */}
        <div className={`${styles['cell']} ${styles['cellPrice']}`}>
          <input
            id={priceId}
            type="text"
            inputMode="numeric"
            className={`${styles['input']} ${styles['numInput']}`}
            value={priceDisplay}
            onChange={(e) => {
              const numeric = e.target.value.replace(/[^0-9]/g, '')
              onUnitPriceChange(numeric)
            }}
            aria-label={`라인 ${lineNumber} 단가`}
          />
        </div>

        {/* 9. 합계 (read-only computed) */}
        <div className={`${styles['cell']} ${styles['cellSum']}`} aria-label={`라인 ${lineNumber} 합계`}>
          {sumDisplay}
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
