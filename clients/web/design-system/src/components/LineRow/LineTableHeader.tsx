/**
 * `<LineTableHeader>` — `<LineRow>` 와 같은 10-column grid 의 시각적 grid header.
 *
 * Designer wireframes.md § 1.1 의 thead h-44px 사양 + Slice A § 3.6 (규격 컬럼) 반영.
 * 헤더 체크박스로 전체 라인 선택/해제. drag/번호 컬럼은 빈 셀.
 *
 * Slice A: 모델명/품목명 사이에 "규격" 컬럼 신규 추가 (피드백 #4).
 */
import styles from './LineRow.module.css'

export interface LineTableHeaderProps {
  /** 전체 선택 여부 (모든 라인 선택 시 true). */
  allSelected: boolean
  /** 일부만 선택 시 indeterminate 표기 (HTML checkbox indeterminate). */
  someSelected?: boolean
  /** 헤더 체크박스 toggle. */
  onToggleAll: (selected: boolean) => void
  /** VAT 포함 모드의 공급가액·부가세 열을 표시한다. */
  vatInclusive?: boolean
}

export function LineTableHeader({
  allSelected,
  someSelected = false,
  onToggleAll,
  vatInclusive = false,
}: LineTableHeaderProps) {
  return (
    <div className={`${styles['lineHeader']}${vatInclusive ? ` ${styles['lineHeaderVat']}` : ''}`}>
      <div className={`${styles['cell']} ${styles['cellCheckbox']}`}>
        <input
          type="checkbox"
          className={styles['checkbox']}
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = !allSelected && someSelected
          }}
          onChange={(e) => onToggleAll(e.target.checked)}
          aria-label="모든 라인 선택"
        />
      </div>
      <div className={styles['cell']} aria-hidden="true" />
      <div className={`${styles['cell']} ${styles['cellLineNo']}`}>#</div>
      <div className={styles['cell']}>모델명</div>
      <div className={styles['cell']}>품목명</div>
      <div className={`${styles['cell']} ${styles['cellSpec']}`}>규격</div>
      <div className={`${styles['cell']} ${styles['cellQty']}`}>수량</div>
      <div className={`${styles['cell']} ${styles['cellPrice']}`}>단가</div>
      {vatInclusive ? (
        <>
          <div className={`${styles['cell']} ${styles['cellVatAmount']}`}>공급가액</div>
          <div className={`${styles['cell']} ${styles['cellVatAmount']}`}>부가세</div>
        </>
      ) : null}
      <div className={`${styles['cell']} ${styles['cellSum']}`}>합계</div>
      <div className={styles['cell']} aria-hidden="true" />
    </div>
  )
}

export default LineTableHeader
