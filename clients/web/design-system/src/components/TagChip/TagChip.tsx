import {
  forwardRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
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
 *
 * **누름 가능(pressable) chip** — 호출자가 `onClick` + `role="button"` 을 함께 전달하면
 * (예: '전체' 범위를 명시적으로 선택하는 chip) 다음을 자동 처리한다(#825 슬5 FABLE5 R1 fix):
 * - 키보드 접근성: `Enter`/`Space` 로 `onClick` 을 트리거(누름 가능 chip 전용).
 * - `aria-pressed` 를 누름 가능 영역에 부여(값은 호출자가 `aria-pressed` prop 으로 전달).
 * - ARIA 중첩 위반 회피: `role="button"` 은 라벨/값 텍스트만 감싸는 내부 영역에 부여하고,
 *   제거 `<button>` 은 그 **형제**로 렌더한다(`role="button"` 요소 내부에 실제 `<button>` 이
 *   중첩되는 것은 ARIA/HTML 위반). 내부 wrapper 는 `display:contents` 대신 outer 와 동일한
 *   flex 속성을 복제해 시각적 폭/간격에 변화가 없다.
 * - 제거 버튼 클릭이 chip 자신의 `onClick` 으로 버블링되어 즉시 재선택되는 결함을 제거
 *   버튼에서 `stopPropagation` 으로 차단한다(근본 원인 — 종전에는 제거해도 즉시 재추가됨).
 */
export const TagChip = forwardRef<HTMLSpanElement, TagChipProps>(function TagChip(
  {
    label,
    value,
    removeLabel,
    onRemove,
    className,
    onClick,
    onKeyDown,
    role,
    tabIndex,
    'aria-pressed': ariaPressedProp,
    'aria-describedby': ariaDescribedBy,
    ...rest
  },
  ref,
) {
  const classes = [styles['chip'], className].filter(Boolean).join(' ')
  // label 미전달(또는 빈 문자열)이면 값만 노출한다 — spec §1② value-only 표시 계약.
  const hasLabel = label !== undefined && label !== ''
  // onClick + role="button" 을 함께 전달한 경우만 '누름 가능' chip 으로 취급한다 — 그 외
  // (제거만 가능한 read-only 선택 chip 등)는 종전과 동일한 비대화형 렌더를 유지한다.
  const isPressable = typeof onClick === 'function' && role === 'button'

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || !isPressable) return
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault()
      onClick?.(event as unknown as ReactMouseEvent<HTMLSpanElement>)
    }
  }

  const content: ReactNode = (
    <>
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
    </>
  )

  return (
    <span
      ref={ref}
      className={classes}
      // 누름 가능(onClick+role="button") 계약을 만족하지 못하는 호출(role 없이 onClick 만
      // 있거나 그 반대)은 종전과 동일하게 outer span 에 그대로 통과시켜 회귀를 원천 차단한다
      // — 새 내부 wrapper 는 오직 onClick+role="button" 조합일 때만 활성화된다.
      role={isPressable ? undefined : role}
      tabIndex={isPressable ? undefined : tabIndex}
      onClick={isPressable ? undefined : onClick}
      onKeyDown={isPressable ? undefined : onKeyDown}
      aria-pressed={isPressable ? undefined : ariaPressedProp}
      aria-describedby={isPressable ? undefined : ariaDescribedBy}
      {...rest}
    >
      {isPressable ? (
        <span
          className={styles['pressable']}
          role={role}
          tabIndex={tabIndex ?? 0}
          aria-pressed={ariaPressedProp ?? false}
          aria-describedby={ariaDescribedBy}
          onClick={onClick}
          onKeyDown={handleKeyDown}
        >
          {content}
        </span>
      ) : (
        content
      )}
      {onRemove ? (
        <button
          type="button"
          onClick={(event) => {
            // 근본 fix — chip 자신에게 onClick(예: '전체' 재선택)이 걸려 있으면 제거 클릭이
            // 버블링되어 제거 직후 즉시 재선택되는 결함이 있었다. 제거는 독립 동작이어야 한다.
            event.stopPropagation()
            onRemove()
          }}
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
