import { forwardRef, type HTMLAttributes } from 'react'
import styles from './TagChip.module.css'

export interface TagChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'onChange'> {
  /**
   * 키. 예: "전압". 생략하면 값만 렌더하며 `키 : 값` 구분자를 숨긴다.
   * (자유 문자열 칩처럼 값 자체가 유일한 표시 대상인 화면용.)
   */
  label?: string
  /** 값. 예: "220V" */
  value: string
  /** 제거 버튼 접근성 라벨. 없으면 value 를 사용한다. */
  removeLabel?: string
  /** 제거 콜백. 있으면 우측 X 버튼이 표시됨. */
  onRemove?: () => void
}

/**
 * TagChip — `label : value` 형태의 키-값 표시용 chip.
 *
 * `label` 을 생략하면 값만 표시하는 value-only chip 이 되며 구분자(`:`)를 숨긴다.
 * `onRemove` 가 있으면 우측 X 버튼이 표시되며, 없으면 read-only chip.
 */
export const TagChip = forwardRef<HTMLSpanElement, TagChipProps>(function TagChip(
  { label, value, removeLabel, onRemove, className, ...rest },
  ref,
) {
  const classes = [styles['chip'], className].filter(Boolean).join(' ')
  // label 미전달(또는 빈 문자열)이면 값만 노출한다 — spec §1② value-only 표시 계약.
  const hasLabel = label !== undefined && label !== ''

  return (
    <span ref={ref} className={classes} {...rest}>
      {hasLabel ? (
        <>
          <span className={styles['label']}>{label}</span>
          <span className={styles['separator']} aria-hidden="true">
            :
          </span>
        </>
      ) : null}
      <span className={styles['value']} title={value}>
        {value}
      </span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className={styles['remove']}
          aria-label={`${removeLabel ?? value} 제거`}
        >
          <svg
            viewBox="0 0 12 12"
            width="10"
            height="10"
            aria-hidden="true"
            focusable="false"
          >
            <path
              d="M2 2 L10 10 M10 2 L2 10"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}
    </span>
  )
})

export default TagChip
