import {
  forwardRef,
  useCallback,
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

function appendValues(
  current: string[],
  additions: string[],
  maxLength: number | undefined,
): string[] {
  const next: string[] = []
  const seen = new Set<string>()
  for (const item of [...current, ...additions]) {
    const trimmed = item.trim()
    if (!trimmed) continue
    const limited = maxLength === undefined ? trimmed : trimmed.slice(0, maxLength)
    if (!limited) continue
    const comparisonKey = limited.toLocaleLowerCase()
    if (seen.has(comparisonKey)) continue
    seen.add(comparisonKey)
    next.push(limited)
  }
  return next
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
  ref: ForwardedRef<HTMLInputElement>,
) {
  const [draft, setDraft] = useState('')

  const commit = useCallback(
    (parts: string[]) => {
      if (disabled) return
      if (!parts.some((part) => part.trim())) return
      const next = appendValues(value, parts, maxLength)
      if (next.length === value.length && next.every((item, index) => item === value[index])) return
      onChange(next)
    },
    [disabled, maxLength, onChange, value],
  )

  const setDraftLimited = (next: string) => {
    setDraft(maxLength === undefined ? next : next.slice(0, maxLength))
  }

  const handleChange = (next: string) => {
    if (disabled) return
    if (!next.includes(',')) {
      setDraftLimited(next)
      return
    }
    const parts = next.split(',')
    const remainder = parts.pop() ?? ''
    commit(parts)
    setDraftLimited(remainder)
  }

  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    if (disabled) return
    const pasted = event.clipboardData.getData('text')
    if (!pasted.includes(',')) return
    event.preventDefault()
    // 쉼표가 포함된 paste는 paste 전체를 delimiter 입력으로 보고 마지막 토큰까지 확정한다.
    commit(`${draft}${pasted}`.split(','))
    setDraft('')
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (disabled || event.nativeEvent.isComposing) return
    if (event.key !== 'Enter' && event.key !== ',') return
    event.preventDefault()
    commit([draft])
    setDraft('')
  }

  const handleRemove = (index: number) => {
    if (disabled) return
    onChange(value.filter((_, itemIndex) => itemIndex !== index))
  }

  return (
    <div className={styles['wrapper']}>
      {value.length > 0 ? (
        <div className={styles['chips']}>
          {value.map((item, index) => (
            <TagChip
              key={`${item}-${index}`}
              label="항목"
              value={item}
              removeLabel={item}
              onRemove={disabled ? undefined : () => handleRemove(index)}
            />
          ))}
        </div>
      ) : null}
      <Input
        ref={ref}
        value={draft}
        onChange={(event) => handleChange(event.target.value)}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
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
