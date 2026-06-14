import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Input, Spinner } from '@samhan/design-system'
import {
  approvalSlipTypeLabel,
  searchSlips,
  toApprovalSlipReferenceType,
  type SlipSearchResult,
} from '../../api/slipSearch'

interface SlipReferencePickerProps {
  slipNo: string
  refSlipType: string
  onChange: (next: { refSlipNo: string; refSlipType: string }) => void
  disabled?: boolean
  inputSize?: 'sm' | 'md' | 'lg'
  style?: CSSProperties
}

function formatAmount(value: string | number | null): string {
  if (value === null || value === undefined || value === '') return '-'
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return String(value)
  return numeric.toLocaleString('ko-KR')
}

function optionLabel(option: SlipSearchResult): string {
  const typeLabel = approvalSlipTypeLabel(toApprovalSlipReferenceType(option.slipType))
  return `${option.slipNo} ${option.partnerName ?? ''} ${formatAmount(option.totalAmount)}원 ${typeLabel}`
}

export function SlipReferencePicker({
  slipNo,
  refSlipType,
  onChange,
  disabled = false,
  inputSize = 'sm',
  style,
}: SlipReferencePickerProps) {
  const listboxId = useId()
  const debounceRef = useRef<number | undefined>(undefined)
  const suppressNextSearchRef = useRef(false)
  const [query, setQuery] = useState(slipNo)
  const [options, setOptions] = useState<SlipSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    setQuery(slipNo)
  }, [slipNo])

  useEffect(() => {
    window.clearTimeout(debounceRef.current)
    const keyword = query.trim()
    if (!keyword || disabled) {
      setOptions([])
      setOpen(false)
      setLoading(false)
      return
    }
    if (suppressNextSearchRef.current) {
      suppressNextSearchRef.current = false
      return
    }
    debounceRef.current = window.setTimeout(() => {
      setLoading(true)
      searchSlips(keyword, 10)
        .then((result) => {
          setOptions(result)
          setOpen(result.length > 0)
          setActiveIndex(result.length > 0 ? 0 : -1)
        })
        .catch(() => {
          setOptions([])
          setOpen(false)
          setActiveIndex(-1)
        })
        .finally(() => setLoading(false))
    }, 300)
    return () => window.clearTimeout(debounceRef.current)
  }, [disabled, query])

  const selectedTypeLabel = useMemo(
    () => approvalSlipTypeLabel(refSlipType) || '전표 선택 시 자동',
    [refSlipType],
  )

  const selectOption = (option: SlipSearchResult) => {
    const nextType = toApprovalSlipReferenceType(option.slipType)
    suppressNextSearchRef.current = true
    setQuery(option.slipNo)
    setOptions([])
    setOpen(false)
    setActiveIndex(-1)
    onChange({ refSlipNo: option.slipNo, refSlipType: nextType })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!open && options.length > 0) setOpen(true)
      setActiveIndex((current) => Math.min(current + 1, options.length - 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) => Math.max(current - 1, 0))
      return
    }
    if (event.key === 'Enter' && open && activeIndex >= 0 && options[activeIndex]) {
      event.preventDefault()
      selectOption(options[activeIndex])
      return
    }
    if (event.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  return (
    <div
      style={{
        ...style,
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: 'minmax(180px, 1fr) minmax(120px, 150px)',
        gap: 8,
        alignItems: 'end',
      }}
    >
      <Input
        label="전표번호"
        value={query}
        onChange={(event) => {
          const next = event.target.value
          setQuery(next)
          onChange({ refSlipNo: next, refSlipType: '' })
        }}
        onFocus={() => {
          if (options.length > 0) setOpen(true)
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={handleKeyDown}
        inputSize={inputSize}
        disabled={disabled}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        autoComplete="off"
        data-testid="slip-ref-search-input"
      />
      <Input
        label="전표유형"
        value={selectedTypeLabel}
        inputSize={inputSize}
        disabled
        readOnly
      />
      {loading ? (
        <div style={{ position: 'absolute', right: 160, bottom: 8 }}>
          <Spinner size="sm" label="전표 검색 중" />
        </div>
      ) : null}
      {open ? (
        <div
          id={listboxId}
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 20,
            top: '100%',
            left: 0,
            right: 0,
            marginTop: 4,
            maxHeight: 220,
            overflowY: 'auto',
            border: '1px solid var(--color-neutral-300)',
            borderRadius: 4,
            background: 'var(--color-neutral-0, #fff)',
            boxShadow: '0 8px 20px rgba(15, 23, 42, 0.12)',
          }}
        >
          {options.map((option, index) => {
            const selected = index === activeIndex
            const typeLabel = approvalSlipTypeLabel(toApprovalSlipReferenceType(option.slipType))
            return (
              <button
                key={`${option.slipNo}-${option.slipType}`}
                id={`${listboxId}-${index}`}
                type="button"
                role="option"
                aria-selected={selected}
                data-testid="slip-ref-search-option"
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault()
                  selectOption(option)
                }}
                style={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: 'minmax(120px, 1.1fr) minmax(100px, 1fr) 90px 80px',
                  gap: 8,
                  alignItems: 'center',
                  padding: '8px 10px',
                  border: 0,
                  background: selected ? 'var(--color-brand-50)' : 'transparent',
                  color: 'var(--color-neutral-900)',
                  cursor: 'pointer',
                  font: 'inherit',
                  textAlign: 'left',
                }}
                aria-label={optionLabel(option)}
              >
                <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{option.slipNo}</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {option.partnerName ?? '-'}
                </span>
                <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {formatAmount(option.totalAmount)}
                </span>
                <span>{typeLabel}</span>
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
