import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Input, Select, Spinner } from '@samhan/design-system'
import {
  APPROVAL_REFERENCE_DOC_TYPE_LABEL,
  normalizeDocumentReferenceOption,
  searchByType,
  type ApprovalReferenceDocType,
  type DocumentReferenceOption,
} from '../../api/documentReferenceSearch'
import styles from './DocumentReferencePicker.module.css'

export interface DocumentReferenceValue {
  refDocType: ApprovalReferenceDocType
  refDocNo: string | null
  refDocLabel: string | null
  refPartnerCode: string | null
  refPartnerName: string | null
  refPeriod: string | null
}

interface DocumentReferencePickerProps {
  value: DocumentReferenceValue
  onChange: (next: DocumentReferenceValue) => void
  disabled?: boolean
  inputSize?: 'sm' | 'md' | 'lg'
  style?: CSSProperties
}

const DOCUMENT_REFERENCE_TYPES: ApprovalReferenceDocType[] = [
  'OUTBOUND_SLIP',
  'INBOUND_SLIP',
  'JOURNAL',
  'TAX_INVOICE',
  'STATEMENT',
  'PARTNER_LEDGER',
]

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function emptyValue(type: ApprovalReferenceDocType, period?: string | null): DocumentReferenceValue {
  return {
    refDocType: type,
    refDocNo: null,
    refDocLabel: null,
    refPartnerCode: null,
    refPartnerName: null,
    refPeriod: type === 'PARTNER_LEDGER' ? period || currentMonth() : null,
  }
}

function formatAmount(value: string | number | null): string {
  if (value === null || value === undefined || value === '') return '-'
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return String(value)
  return numeric.toLocaleString('ko-KR')
}

function optionKey(option: DocumentReferenceOption, index: number): string {
  return `${option.type}-${option.refDocNo ?? option.partnerCode ?? index}`
}

function optionAriaLabel(option: DocumentReferenceOption): string {
  const typeLabel = APPROVAL_REFERENCE_DOC_TYPE_LABEL[option.type]
  if (option.type === 'PARTNER_LEDGER') {
    return `${typeLabel} ${option.partnerName ?? '-'} ${option.partnerCode ?? ''}`
  }
  return `${typeLabel} ${option.refDocNo ?? '-'} ${option.summary ?? ''} ${formatAmount(option.amount)}원`
}

export function DocumentReferencePicker({
  value,
  onChange,
  disabled = false,
  inputSize = 'sm',
  style,
}: DocumentReferencePickerProps) {
  const listboxId = useId()
  const debounceRef = useRef<number | undefined>(undefined)
  const suppressNextSearchRef = useRef(false)
  const [selectedType, setSelectedType] = useState<ApprovalReferenceDocType>(value.refDocType)
  const [query, setQuery] = useState(value.refDocType === 'PARTNER_LEDGER'
    ? value.refPartnerName ?? value.refPartnerCode ?? ''
    : value.refDocNo ?? '')
  const [options, setOptions] = useState<DocumentReferenceOption[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)

  useEffect(() => {
    setSelectedType(value.refDocType)
  }, [value.refDocType])

  useEffect(() => {
    setQuery(value.refDocType === 'PARTNER_LEDGER'
      ? value.refPartnerName ?? value.refPartnerCode ?? ''
      : value.refDocNo ?? '')
  }, [value.refDocNo, value.refDocType, value.refPartnerCode, value.refPartnerName])

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
      searchByType(selectedType, keyword, 10)
        .then((result) => {
          const nextOptions = result.map((row) => normalizeDocumentReferenceOption(selectedType, row))
          setOptions(nextOptions)
          setOpen(nextOptions.length > 0)
          setActiveIndex(nextOptions.length > 0 ? 0 : -1)
        })
        .catch(() => {
          setOptions([])
          setOpen(false)
          setActiveIndex(-1)
        })
        .finally(() => setLoading(false))
    }, 300)
    return () => window.clearTimeout(debounceRef.current)
  }, [disabled, query, selectedType])

  const selectOption = (option: DocumentReferenceOption) => {
    suppressNextSearchRef.current = true
    setQuery(option.type === 'PARTNER_LEDGER' ? option.partnerName ?? option.partnerCode ?? '' : option.refDocNo ?? '')
    setOptions([])
    setOpen(false)
    setActiveIndex(-1)
    onChange({
      refDocType: option.type,
      refDocNo: option.refDocNo,
      refDocLabel: option.refDocLabel,
      refPartnerCode: option.type === 'PARTNER_LEDGER' ? option.partnerCode : null,
      refPartnerName: option.type === 'PARTNER_LEDGER' ? option.partnerName : null,
      refPeriod: option.type === 'PARTNER_LEDGER' ? value.refPeriod || currentMonth() : null,
    })
  }

  const handleTypeChange = (type: ApprovalReferenceDocType) => {
    setSelectedType(type)
    setQuery('')
    setOptions([])
    setOpen(false)
    setActiveIndex(-1)
    onChange(emptyValue(type, value.refPeriod))
  }

  const handleQueryChange = (next: string) => {
    setQuery(next)
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
        gridTemplateColumns: selectedType === 'PARTNER_LEDGER'
          ? '150px minmax(180px, 1fr) 130px'
          : '150px minmax(220px, 1fr)',
        gap: 8,
        alignItems: 'end',
      }}
    >
      <Select
        label="문서 유형"
        value={selectedType}
        onChange={(event) => handleTypeChange(event.target.value as ApprovalReferenceDocType)}
        selectSize={inputSize}
        disabled={disabled}
        data-testid="doc-ref-type-select"
      >
        {DOCUMENT_REFERENCE_TYPES.map((type) => (
          <option key={type} value={type}>
            {APPROVAL_REFERENCE_DOC_TYPE_LABEL[type]}
          </option>
        ))}
      </Select>
      <Input
        label={selectedType === 'PARTNER_LEDGER' ? '거래처명/코드' : '번호/키워드'}
        value={query}
        onChange={(event) => handleQueryChange(event.target.value)}
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
        placeholder={selectedType === 'PARTNER_LEDGER' ? '거래처명 또는 코드' : '번호 또는 거래처/적요'}
        data-testid="doc-ref-search-input"
      />
      {selectedType === 'PARTNER_LEDGER' ? (
        <Input
          label="기간"
          type="month"
          value={value.refPeriod ?? currentMonth()}
          onChange={(event) => onChange({ ...value, refDocType: selectedType, refPeriod: event.target.value })}
          inputSize={inputSize}
          disabled={disabled}
        />
      ) : null}
      {loading ? (
        <div style={{ position: 'absolute', right: selectedType === 'PARTNER_LEDGER' ? 138 : 8, bottom: 8 }}>
          <Spinner size="sm" label="문서 검색 중" />
        </div>
      ) : null}
      {open ? (
        <ul
          id={listboxId}
          role="listbox"
          className={styles['dropdown']}
        >
          {options.map((option, index) => {
            const selected = index === activeIndex
            return (
              <li
                key={optionKey(option, index)}
                id={`${listboxId}-${index}`}
                role="option"
                aria-selected={selected}
                data-testid="doc-ref-search-option"
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault()
                  selectOption(option)
                }}
                className={[
                  styles['option'],
                  option.type === 'PARTNER_LEDGER' ? styles['optionPartner'] : styles['optionDocument'],
                  selected ? styles['optionActive'] : null,
                ].filter(Boolean).join(' ')}
                aria-label={optionAriaLabel(option)}
              >
                {option.type === 'PARTNER_LEDGER' ? (
                  <>
                    <span className={styles['strongEllipsis']}>
                      {option.partnerName ?? '-'}
                    </span>
                    <span className={styles['numeric']}>{option.partnerCode ?? '-'}</span>
                    <span>{APPROVAL_REFERENCE_DOC_TYPE_LABEL[option.type]}</span>
                  </>
                ) : (
                  <>
                    <span className={styles['strongNumeric']}>
                      {option.refDocNo ?? '-'}
                    </span>
                    <span className={styles['ellipsis']}>
                      {option.summary ?? '-'}
                    </span>
                    <span className={styles['amount']}>
                      {formatAmount(option.amount)}
                    </span>
                    <span className={styles['numeric']}>{option.date ?? '-'}</span>
                  </>
                )}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
