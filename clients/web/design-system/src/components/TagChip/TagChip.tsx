import { forwardRef, type HTMLAttributes } from 'react'
import styles from './TagChip.module.css'

export interface TagChipProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'onChange'> {
  /** 키. 예: "전압" */
  label: string
  /** 값. 예: "220V" */
  value: string
  /** 제거 버튼 접근성 라벨. 없으면 label 을 사용한다. */
  removeLabel?: string
  /** 제거 콜백. 있으면 우측 X 버튼이 표시됨. */
  onRemove?: () => void
}

/**
 * TagChip — `label : value` 형태의 키-값 표시용 chip.
 *
 * `onRemove` 가 있으면 우측 X 버튼이 표시되며, 없으면 read-only chip.
 */
export const TagChip = forwardRef<HTMLSpanElement, TagChipProps>(function TagChip(
  { label, value, removeLabel, onRemove, className, ...rest },
  ref,
) {
  const classes = [styles['chip'], className].filter(Boolean).join(' ')

  return (
    <span ref={ref} className={classes} {...rest}>
      <span className={styles['label']}>{label}</span>
      <span className={styles['separator']} aria-hidden="true">
        :
      </span>
      <span className={styles['value']} title={value}>
        {value}
      </span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className={styles['remove']}
          aria-label={`${removeLabel ?? label} 제거`}
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
