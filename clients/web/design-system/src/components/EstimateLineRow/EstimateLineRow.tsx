import { useId, type ReactNode } from 'react'
import styles from './EstimateLineRow.module.css'

/**
 * 견적서/주문서의 단일 라인 행을 표시하는 grid row 컴포넌트.
 *
 * Legacy migration 사전 작업 (DS 6 신규 컴포넌트 중 1번).
 * 10-column grid: # | 모델명 | 품목명 | 규격 | 수량 | 출고가 | 인도가 | 할인율 | 소계 | 액션 (스펙 / 삭제).
 *
 * 기존 `<LineRow>` 와의 차이:
 * - LineRow: 단일 가격 (slip-service 전표용 — 단가 1열)
 * - EstimateLineRow: 견적서 전용 — `releasePrice` (출고가) + `deliveryPrice` (인도가) + `discountRate` (할인율) + `lineAmount` (소계 외부 계산)
 * - LineRow: lookup 진행 표시 등 작성 폼 중심
 * - EstimateLineRow: read 친화 — 견적/주문 라인 grid 의 "표시 + 최소 편집" 패턴 (수량 편집만 inline)
 *
 * UUID 비공개 가드 (`feedback_uuid_no_user_visibility.md`):
 * - 라인의 internal id 는 prop 으로 받지 않음. 사용자 노출 식별자 (`model`) 만 표시.
 *
 * 사용처: design-system 단위 테스트와 story에서 시각적 라인 레이아웃을 검증한다.
 *
 * 출처: `migration/analysis/06-frontend-design.md` §3.2
 */
export interface EstimateLineRowProps {
  /** 1부터 시작하는 라인 표시 번호. */
  lineNumber: number
  /** 모델명 (사용자 노출 식별자 — UUID 아님). */
  model: string
  /** 품목명 (선택). 없으면 모델명만 표시. */
  productName?: string
  /** 스펙 요약 (선택) — `<ProductSpecList layout='inline'>` 결과 또는 임의 ReactNode. */
  spec?: ReactNode
  /** 수량 (정수). 0 가능. */
  qty: number
  /** 출고가 (KRW 정수). */
  releasePrice: number
  /** 인도가 (KRW 정수). */
  deliveryPrice: number
  /** 할인율 (0~100, %). undefined = 할인 없음. */
  discountRate?: number
  /**
   * 라인 소계 (KRW 정수) — 외부 계산 (qty × deliveryPrice × (1 - discountRate/100) 등).
   * 본 컴포넌트는 표시만 책임지고 계산은 부모 책임.
   */
  lineAmount: number
  /** 수량 변경 콜백. NaN 은 전달되지 않음 (음수도 차단). */
  onQtyChange?: (next: number) => void
  /** 행 삭제 콜백. */
  onDelete?: () => void
  /** "스펙" 버튼 클릭 콜백 — 스펙 편집 modal 오픈 trigger. */
  onSpecClick?: () => void
  /** 읽기 전용 — 수량 input / 액션 버튼 모두 비활성. */
  readOnly?: boolean
  /** 추가 className. */
  className?: string
}

/** KRW 정수 → 천단위 콤마 string. */
const formatKrw = (n: number): string => {
  if (!Number.isFinite(n)) return '0'
  return Math.trunc(n).toLocaleString('ko-KR')
}

/** 사용자 입력 → 양의 정수. NaN/음수 시 `0`. */
const parseQty = (input: string): number => {
  const stripped = input.replace(/[^0-9]/g, '')
  if (!stripped) return 0
  const n = Number.parseInt(stripped, 10)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

/**
 * EstimateLineRow — 견적서/주문서 라인 1행 표시 + 인라인 수량 편집.
 *
 * @param props 라인 데이터 + 이벤트 핸들러
 * @example
 * ```tsx
 * <EstimateLineRow
 *   lineNumber={1}
 *   model="AC180RXADKG"
 *   productName="시스템 에어컨 4-way"
 *   qty={2}
 *   releasePrice={2890000}
 *   deliveryPrice={2700000}
 *   discountRate={5}
 *   lineAmount={5130000}
 *   onQtyChange={(n) => setQty(n)}
 *   onDelete={() => removeLine()}
 *   onSpecClick={() => openSpecModal()}
 * />
 * ```
 */
export function EstimateLineRow({
  lineNumber,
  model,
  productName,
  spec,
  qty,
  releasePrice,
  deliveryPrice,
  discountRate,
  lineAmount,
  onQtyChange,
  onDelete,
  onSpecClick,
  readOnly = false,
  className,
}: EstimateLineRowProps) {
  const reactId = useId()
  const qtyId = `eslr-qty-${reactId}`

  const rowClasses = [
    styles['row'],
    readOnly ? styles['readOnly'] : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={rowClasses} data-line-number={lineNumber}>
      {/* 1. 라인 번호 */}
      <div className={`${styles['cell']} ${styles['cellLineNo']}`}>
        {lineNumber}
      </div>

      {/* 2. 모델명 */}
      <div className={`${styles['cell']} ${styles['cellModel']}`} title={model}>
        {model}
      </div>

      {/* 3. 품목명 */}
      <div className={`${styles['cell']} ${styles['cellProduct']}`}>
        {productName ? (
          <span title={productName}>{productName}</span>
        ) : (
          <span className={styles['placeholder']}>-</span>
        )}
      </div>

      {/* 4. 규격 (외부 ReactNode) */}
      <div className={`${styles['cell']} ${styles['cellSpec']}`}>
        {spec ?? <span className={styles['placeholder']}>-</span>}
      </div>

      {/* 5. 수량 */}
      <div className={`${styles['cell']} ${styles['cellQty']}`}>
        {readOnly || !onQtyChange ? (
          <span className={styles['numDisplay']}>{qty}</span>
        ) : (
          <input
            id={qtyId}
            type="text"
            inputMode="numeric"
            className={styles['qtyInput']}
            value={qty === 0 ? '' : String(qty)}
            placeholder="0"
            onChange={(e) => onQtyChange(parseQty(e.target.value))}
            aria-label={`라인 ${lineNumber} 수량`}
          />
        )}
      </div>

      {/* 6. 출고가 */}
      <div className={`${styles['cell']} ${styles['cellPrice']}`}>
        {formatKrw(releasePrice)}
      </div>

      {/* 7. 인도가 */}
      <div className={`${styles['cell']} ${styles['cellPrice']}`}>
        {formatKrw(deliveryPrice)}
      </div>

      {/* 8. 할인율 */}
      <div className={`${styles['cell']} ${styles['cellDiscount']}`}>
        {typeof discountRate === 'number' && discountRate > 0 ? `${discountRate}%` : '-'}
      </div>

      {/* 9. 소계 */}
      <div className={`${styles['cell']} ${styles['cellAmount']}`} aria-label={`라인 ${lineNumber} 소계`}>
        {formatKrw(lineAmount)}
      </div>

      {/* 10. 액션 — 스펙 / 삭제 */}
      <div className={`${styles['cell']} ${styles['cellActions']}`}>
        {onSpecClick ? (
          <button
            type="button"
            className={styles['specBtn']}
            onClick={onSpecClick}
            disabled={readOnly}
            aria-label={`라인 ${lineNumber} 스펙 편집`}
            title="스펙 편집"
          >
            스펙
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            className={styles['deleteBtn']}
            onClick={onDelete}
            disabled={readOnly}
            aria-label={`라인 ${lineNumber} 삭제`}
            title="삭제"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
              <circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.2" />
              <path
                d="M4.5 4.5l5 5M9.5 4.5l-5 5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default EstimateLineRow
