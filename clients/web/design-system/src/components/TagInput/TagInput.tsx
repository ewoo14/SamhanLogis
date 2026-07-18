import { forwardRef, useState, type KeyboardEvent } from 'react'
import styles from './TagInput.module.css'
import { Input } from '../Input/Input'
import { Button } from '../Button/Button'
import { TagChip } from '../TagChip/TagChip'

export interface TagInputProps {
  /** controlled value: { key: value } map. */
  value: Record<string, string>
  /** controlled change. */
  onChange: (next: Record<string, string>) => void
  /** disabled 시 추가/삭제 모두 비활성. */
  disabled?: boolean
  className?: string
}

/**
 * TagInput — `Map<string,string>` 편집기.
 *
 * `TagChip` 리스트 + 키/값 input + 추가 Button 으로 구성.
 * Product specs (HVAC 사양 등) 입력에 사용.
 */
export const TagInput = forwardRef<HTMLDivElement, TagInputProps>(function TagInput(
  { value, onChange, disabled = false, className },
  ref,
) {
  const [draftKey, setDraftKey] = useState('')
  const [draftValue, setDraftValue] = useState('')

  const trimmedKey = draftKey.trim()
  const trimmedValue = draftValue.trim()
  const canAdd = !disabled && trimmedKey.length > 0 && trimmedValue.length > 0

  const handleAdd = () => {
    if (!canAdd) return
    const next = { ...value, [trimmedKey]: trimmedValue }
    onChange(next)
    setDraftKey('')
    setDraftValue('')
  }

  const handleRemove = (key: string) => {
    if (disabled) return
    const next = { ...value }
    delete next[key]
    onChange(next)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && canAdd) {
      e.preventDefault()
      handleAdd()
    }
  }

  const classes = [styles['wrapper'], className].filter(Boolean).join(' ')
  const entries = Object.entries(value)

  return (
    <div ref={ref} className={classes}>
      {entries.length > 0 ? (
        <div className={styles['chips']}>
          {entries.map(([k, v]) => (
            <TagChip
              key={k}
              label={k}
              value={v}
              removeLabel={k}
              onRemove={disabled ? undefined : () => handleRemove(k)}
            />
          ))}
        </div>
      ) : null}

      <div className={styles['row']}>
        <div className={styles['field']}>
          <Input
            placeholder="키 (예: 전압)"
            value={draftKey}
            onChange={(e) => setDraftKey(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            inputSize="sm"
            aria-label="태그 키"
          />
        </div>
        <div className={styles['field']}>
          <Input
            placeholder="값 (예: 220V)"
            value={draftValue}
            onChange={(e) => setDraftValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            inputSize="sm"
            aria-label="태그 값"
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleAdd}
          disabled={!canAdd}
        >
          추가
        </Button>
      </div>
    </div>
  )
})

export default TagInput
