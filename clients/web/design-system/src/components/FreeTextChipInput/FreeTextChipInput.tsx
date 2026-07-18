import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type ClipboardEvent,
  type ForwardedRef,
  type KeyboardEvent,
} from 'react'
import { Input } from '../Input'
import { TagChip } from '../TagChip'
import styles from './FreeTextChipInput.module.css'

export interface FreeTextChipInputProps {
  /** 현재 문자열 목록. */
  value: string[]
  /** 문자열 목록 변경 콜백. */
  onChange: (next: string[]) => void
  /** 입력과 칩 제거를 함께 비활성화한다. */
  disabled?: boolean
  /** 입력 placeholder. */
  placeholder?: string
  /** compact 입력의 aria-label. */
  ariaLabel?: string
  /** 내부 input의 data-testid. */
  inputTestId?: string
  /** 각 옵션에 허용할 최대 글자 수. */
  maxLength?: number
}

/**
 * FreeTextChipInput 명령형 핸들.
 *
 * <p>`flush()` 는 아직 확정되지 않은 draft(입력 중 텍스트)를 즉시 칩으로 확정한다.
 * 저장 버튼 click 이 input blur 보다 먼저 stale value 를 읽는 경쟁을 막기 위해,
 * 소비처가 저장 직전 각 입력을 flush 한다.
 */
export interface FreeTextChipInputHandle {
  /** 미확정 draft 를 즉시 확정한다(비어 있으면 no-op). */
  flush: () => void
  /** 내부 입력에 포커스한다. */
  focus: () => void
}

/**
 * `current` 를 그대로 보존하고 `additions` 중 current(대소문자 무시)에 없는 신규 항목만
 * trim·maxLength 적용 후 append 한다. current 항목 자체는 재정규화·삭제하지 않는다.
 *
 * <p>회귀 방지: 과거 구현은 current 까지 재정규화(trim/slice/lowercase dedup)해
 * `["Apple","apple"]` 같은 기존 변종을 삭제했다. 값의 진실원은 부모가 넘긴 current 이므로
 * append 는 순수 추가만 수행한다.
 */
function appendValues(
  current: string[],
  additions: string[],
  maxLength: number | undefined,
): string[] {
  const result = [...current]
  // dedup 비교 키는 current 실제값의 소문자. current 는 변형하지 않는다.
  const seen = new Set(current.map((item) => item.toLocaleLowerCase()))
  for (const item of additions) {
    const trimmed = item.trim()
    if (!trimmed) continue
    const limited = maxLength === undefined ? trimmed : trimmed.slice(0, maxLength)
    if (!limited) continue
    const comparisonKey = limited.toLocaleLowerCase()
    if (seen.has(comparisonKey)) continue
    seen.add(comparisonKey)
    result.push(limited)
  }
  return result
}

function FreeTextChipInputInner(
  {
    value,
    onChange,
    disabled = false,
    placeholder = '입력 후 Enter 또는 쉼표로 추가',
    ariaLabel = '문자열 입력',
    inputTestId,
    maxLength,
  }: FreeTextChipInputProps,
  ref: ForwardedRef<FreeTextChipInputHandle>,
) {
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  // 최신 draft 미러 — flush/blur 가 stale 클로저를 읽지 않도록 ref 로 동기 보관한다.
  const draftRef = useRef('')

  const updateDraft = useCallback(
    (next: string) => {
      const limited = maxLength === undefined ? next : next.slice(0, maxLength)
      draftRef.current = limited
      setDraft(limited)
    },
    [maxLength],
  )

  const clearDraft = useCallback(() => {
    draftRef.current = ''
    setDraft('')
  }, [])

  const commit = useCallback(
    (parts: string[]): boolean => {
      if (disabled) return false
      if (!parts.some((part) => part.trim())) return false
      const next = appendValues(value, parts, maxLength)
      if (next.length === value.length && next.every((item, index) => item === value[index])) {
        return false
      }
      onChange(next)
      return true
    },
    [disabled, maxLength, onChange, value],
  )

  /** 현재 draft 를 확정한다. 빈/공백 draft 는 no-op(부모 미호출). */
  const commitDraft = useCallback(() => {
    if (disabled) return
    const current = draftRef.current
    if (!current.trim()) return
    commit([current])
    // 확정 성공 여부와 무관하게 입력 텍스트는 비운다(중복 입력은 이미 칩으로 존재).
    clearDraft()
  }, [clearDraft, commit, disabled])

  const focusInput = useCallback(() => {
    inputRef.current?.focus()
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      flush: () => commitDraft(),
      focus: () => focusInput(),
    }),
    [commitDraft, focusInput],
  )

  const handleChange = (next: string) => {
    if (disabled) return
    if (!next.includes(',')) {
      updateDraft(next)
      return
    }
    const parts = next.split(',')
    const remainder = parts.pop() ?? ''
    commit(parts)
    updateDraft(remainder)
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return
    const pasted = event.clipboardData.getData('text')
    if (!pasted.includes(',')) return
    event.preventDefault()
    // 쉼표가 포함된 paste는 paste 전체를 delimiter 입력으로 보고 마지막 토큰까지 확정한다.
    commit(`${draftRef.current}${pasted}`.split(','))
    clearDraft()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled || event.nativeEvent.isComposing) return
    if (event.key !== 'Enter' && event.key !== ',') return
    event.preventDefault()
    commitDraft()
  }

  // blur 시 미확정 draft 를 확정한다(H1: 저장 직전 소실 방지). 빈 draft 는 no-op.
  const handleBlur = () => {
    commitDraft()
  }

  const handleRemove = (index: number) => {
    if (disabled) return
    onChange(value.filter((_, itemIndex) => itemIndex !== index))
    // 제거 후 입력으로 포커스를 되돌린다(WCAG 2.4.3 focus order).
    focusInput()
  }

  return (
    <div className={styles['wrapper']}>
      <span
        className={styles['srOnly']}
        aria-live="polite"
        aria-atomic="true"
        data-testid="free-text-chip-count"
      >
        {value.length > 0 ? `${value.length}개 선택됨` : ''}
      </span>
      {value.length > 0 ? (
        <div className={styles['chips']} role="group" aria-label="입력한 항목">
          {value.map((item, index) => (
            <TagChip
              key={`${item}-${index}`}
              value={item}
              removeLabel={item}
              onRemove={disabled ? undefined : () => handleRemove(index)}
            />
          ))}
        </div>
      ) : null}
      <Input
        ref={inputRef}
        value={draft}
        onChange={(event) => handleChange(event.target.value)}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        data-testid={inputTestId}
        maxLength={maxLength}
        inputSize="sm"
      />
    </div>
  )
}

export const FreeTextChipInput = forwardRef(FreeTextChipInputInner)

export default FreeTextChipInput
