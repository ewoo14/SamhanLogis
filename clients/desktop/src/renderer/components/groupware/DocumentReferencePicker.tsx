import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { Input, Select, Spinner, splitHighlightMatches } from '@samhan/design-system'
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
  'SALES_COMMISSION_SETTLEMENT',
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

interface DropdownPosition {
  position: 'fixed'
  left: number
  width: number
  maxHeight: number
  top?: number
  bottom?: number
}

const DROPDOWN_GAP = 4
const DROPDOWN_VIEWPORT_INSET = 8
const DROPDOWN_MAX_HEIGHT = 240
const DROPDOWN_MIN_FLIP_SPACE = 160

function HighlightedReferenceValue({ value, query }: { value: string; query: string }) {
  return (
    <>
      {splitHighlightMatches(value, query).map((part, index) =>
        part.matched ? (
          // [#825 R1 L4] design-system matchMark 토큰 미러 — 브라우저 기본 노랑 <mark> 방지.
          <mark className={styles['matchMark']} key={`match-${index}`}>{part.text}</mark>
        ) : (
          <span key={`text-${index}`}>{part.text}</span>
        ),
      )}
    </>
  )
}

export function DocumentReferencePicker({
  value,
  onChange,
  disabled = false,
  inputSize = 'sm',
  style,
}: DocumentReferencePickerProps) {
  const listboxId = useId()
  const pickerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<number | undefined>(undefined)
  const blurTimerRef = useRef<number | undefined>(undefined)
  const suppressNextSearchRef = useRef<string | null>(null)
  const requestIdRef = useRef(0)
  const refocusSearchRef = useRef(false)
  const [selectedType, setSelectedType] = useState<ApprovalReferenceDocType>(value.refDocType)
  const [query, setQuery] = useState(value.refDocType === 'PARTNER_LEDGER'
    ? value.refPartnerName ?? value.refPartnerCode ?? ''
    : value.refDocNo ?? '')
  /**
   * [#825 R1 L5] 후보와 "후보를 만든 응답 시점 검색어(resolvedQuery)"를 한 상태로 원자 갱신
   * — AsyncAutocomplete resolvedQuery 하드닝 이식. 하이라이트가 라이브 query(디바운스 창의
   * draft)를 참조하면 이전 응답 후보에 새 입력이 오강조되므로, 강조는 항상 resolvedQuery 기준.
   */
  const [searchState, setSearchState] = useState<{
    options: DocumentReferenceOption[]
    resolvedQuery: string
  }>({ options: [], resolvedQuery: '' })
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [dropdownPosition, setDropdownPosition] = useState<DropdownPosition | null>(null)

  const { options, resolvedQuery } = searchState

  const updateDropdownPosition = useCallback(() => {
    const picker = pickerRef.current
    if (!picker || !open) return

    const rect = picker.getBoundingClientRect()
    if (rect.bottom < 0 || rect.top > window.innerHeight) {
      setDropdownPosition(null)
      setOpen(false)
      return
    }

    const belowSpace = window.innerHeight - rect.bottom - DROPDOWN_GAP - DROPDOWN_VIEWPORT_INSET
    const aboveSpace = rect.top - DROPDOWN_GAP - DROPDOWN_VIEWPORT_INSET
    const opensAbove = belowSpace < DROPDOWN_MIN_FLIP_SPACE && aboveSpace > belowSpace
    const availableSpace = Math.max(0, opensAbove ? aboveSpace : belowSpace)
    const maxHeight = Math.min(DROPDOWN_MAX_HEIGHT, availableSpace)
    const width = Math.min(rect.width, Math.max(0, window.innerWidth - DROPDOWN_VIEWPORT_INSET * 2))
    const maxLeft = Math.max(DROPDOWN_VIEWPORT_INSET, window.innerWidth - DROPDOWN_VIEWPORT_INSET - width)
    const left = Math.min(Math.max(rect.left, DROPDOWN_VIEWPORT_INSET), maxLeft)

    setDropdownPosition({
      position: 'fixed',
      left,
      width,
      maxHeight,
      ...(opensAbove
        ? { bottom: window.innerHeight - rect.top + DROPDOWN_GAP }
        : { top: rect.bottom + DROPDOWN_GAP }),
    })
  }, [open])

  useLayoutEffect(() => {
    if (!open) {
      setDropdownPosition(null)
      return undefined
    }

    updateDropdownPosition()
    const handleViewportChange = () => updateDropdownPosition()
    const scrollContainers: Array<Window | HTMLElement> = [window]
    let parent = pickerRef.current?.parentElement
    while (parent) {
      const style = getComputedStyle(parent)
      if (['auto', 'scroll', 'overlay'].includes(style.overflowY)
        || ['auto', 'scroll', 'overlay'].includes(style.overflow)) {
        scrollContainers.push(parent)
      }
      parent = parent.parentElement
    }

    window.addEventListener('resize', handleViewportChange)
    window.visualViewport?.addEventListener('resize', handleViewportChange)
    for (const container of scrollContainers) container.addEventListener('scroll', handleViewportChange)
    const anchor = pickerRef.current
    const resizeObserver = typeof ResizeObserver === 'undefined' || !anchor
      ? null
      : new ResizeObserver(handleViewportChange)
    if (resizeObserver && anchor) resizeObserver.observe(anchor)
    return () => {
      window.removeEventListener('resize', handleViewportChange)
      window.visualViewport?.removeEventListener('resize', handleViewportChange)
      for (const container of scrollContainers) container.removeEventListener('scroll', handleViewportChange)
      resizeObserver?.disconnect()
    }
  }, [open, updateDropdownPosition])

  const cancelDebounce = useCallback(() => {
    if (debounceRef.current !== undefined) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = undefined
    }
  }, [])

  const scheduleSearch = useCallback((keyword: string, type: ApprovalReferenceDocType, requestId: number) => {
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = undefined
      if (requestIdRef.current !== requestId) return
      setLoading(true)
      searchByType(type, keyword, 10)
        .then((result) => {
          if (requestIdRef.current !== requestId) return
          const nextOptions = result.map((row) => normalizeDocumentReferenceOption(type, row))
          // [#825 R1 L5] 후보와 그 후보를 만든 keyword 를 함께 교체 — 하이라이트 오강조 방지.
          setSearchState({ options: nextOptions, resolvedQuery: keyword })
          setOpen(nextOptions.length > 0)
          setActiveIndex(nextOptions.length > 0 ? 0 : -1)
        })
        .catch(() => {
          if (requestIdRef.current !== requestId) return
          setSearchState({ options: [], resolvedQuery: '' })
          setOpen(false)
          setActiveIndex(-1)
        })
        .finally(() => {
          // stale finally가 새 요청의 spinner를 끄지 않도록 loading owner도 세대 소유로 둔다.
          if (requestIdRef.current === requestId) setLoading(false)
        })
    }, 300)
  }, [])

  useEffect(() => {
    const nextQuery = value.refDocType === 'PARTNER_LEDGER'
      ? value.refPartnerName ?? value.refPartnerCode ?? ''
      : value.refDocNo ?? ''
    setSelectedType(value.refDocType)
    setQuery(nextQuery)
    suppressNextSearchRef.current = nextQuery.trim() || null
    cancelDebounce()
    requestIdRef.current += 1
    setSearchState({ options: [], resolvedQuery: '' })
    setOpen(false)
    setLoading(false)
    setActiveIndex(-1)
  }, [cancelDebounce, value.refDocNo, value.refDocType, value.refPartnerCode, value.refPartnerName])

  useEffect(() => {
    cancelDebounce()
    const requestId = ++requestIdRef.current
    const keyword = query.trim()
    if (!keyword || disabled) {
      setSearchState({ options: [], resolvedQuery: '' })
      setOpen(false)
      setLoading(false)
      return () => {
        cancelDebounce()
        requestIdRef.current += 1
      }
    }
    if (suppressNextSearchRef.current === keyword) {
      suppressNextSearchRef.current = null
      setSearchState({ options: [], resolvedQuery: '' })
      setOpen(false)
      setLoading(false)
      setActiveIndex(-1)
      return () => {
        cancelDebounce()
        requestIdRef.current += 1
      }
    }
    suppressNextSearchRef.current = null
    scheduleSearch(keyword, selectedType, requestId)
    return () => {
      cancelDebounce()
      requestIdRef.current += 1
    }
  }, [cancelDebounce, disabled, query, scheduleSearch, selectedType])

  useEffect(() => {
    return () => {
      if (blurTimerRef.current !== undefined) window.clearTimeout(blurTimerRef.current)
      cancelDebounce()
      requestIdRef.current += 1
    }
  }, [cancelDebounce])

  const selectOption = (option: DocumentReferenceOption) => {
    const nextQuery = option.type === 'PARTNER_LEDGER' ? option.partnerName ?? option.partnerCode ?? '' : option.refDocNo ?? ''
    suppressNextSearchRef.current = nextQuery.trim() || null
    cancelDebounce()
    requestIdRef.current += 1
    setQuery(nextQuery)
    setSearchState({ options: [], resolvedQuery: '' })
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
    cancelDebounce()
    requestIdRef.current += 1
    suppressNextSearchRef.current = null
    setSelectedType(type)
    setQuery('')
    setSearchState({ options: [], resolvedQuery: '' })
    setOpen(false)
    setActiveIndex(-1)
    onChange(emptyValue(type, value.refPeriod))
  }

  const handleQueryChange = (next: string) => {
    cancelDebounce()
    requestIdRef.current += 1
    suppressNextSearchRef.current = null
    setSearchState({ options: [], resolvedQuery: '' })
    setOpen(false)
    setLoading(false)
    setActiveIndex(-1)
    setQuery(next)
  }

  const handleFocus = () => {
    if (disabled) return
    if (blurTimerRef.current !== undefined) {
      window.clearTimeout(blurTimerRef.current)
      blurTimerRef.current = undefined
    }
    if (!refocusSearchRef.current) {
      if (options.length > 0) setOpen(true)
      return
    }
    refocusSearchRef.current = false
    const keyword = query.trim()
    if (!keyword) return
    suppressNextSearchRef.current = null
    cancelDebounce()
    const requestId = ++requestIdRef.current
    setSearchState({ options: [], resolvedQuery: '' })
    setOpen(false)
    setActiveIndex(-1)
    setLoading(false)
    scheduleSearch(keyword, selectedType, requestId)
  }

  const handleBlur = () => {
    refocusSearchRef.current = true
    cancelDebounce()
    requestIdRef.current += 1
    if (blurTimerRef.current !== undefined) window.clearTimeout(blurTimerRef.current)
    blurTimerRef.current = window.setTimeout(() => {
      blurTimerRef.current = undefined
      requestIdRef.current += 1
      setOpen(false)
      setSearchState({ options: [], resolvedQuery: '' })
      setLoading(false)
      setActiveIndex(-1)
    }, 120)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return
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
      cancelDebounce()
      requestIdRef.current += 1
      refocusSearchRef.current = false
      if (blurTimerRef.current !== undefined) {
        window.clearTimeout(blurTimerRef.current)
        blurTimerRef.current = undefined
      }
      setOpen(false)
      setSearchState({ options: [], resolvedQuery: '' })
      setLoading(false)
      setActiveIndex(-1)
    }
  }

  return (
    <div
      ref={pickerRef}
      className={['mobile-filter-grid', styles['picker']].join(' ')}
      style={{
        ...style,
        position: 'relative',
        display: 'grid',
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        gridTemplateColumns: selectedType === 'PARTNER_LEDGER'
          ? '150px minmax(180px, 1fr) 130px'
          : '150px minmax(220px, 1fr)',
        gap: 8,
        alignItems: 'end',
        overflowX: 'hidden',
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
        onFocus={handleFocus}
        onBlur={handleBlur}
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
        dropdownPosition
          ? createPortal(
            <ul
              id={listboxId}
              role="listbox"
              className={styles['dropdown']}
              style={dropdownPosition}
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
                          {/* [#825 R1 L5] 강조는 응답 시점 resolvedQuery 기준 — 디바운스 창 오강조 방지 */}
                          <HighlightedReferenceValue value={option.partnerName ?? '-'} query={resolvedQuery} />
                        </span>
                        <span className={styles['numeric']}>
                          <HighlightedReferenceValue value={option.partnerCode ?? '-'} query={resolvedQuery} />
                        </span>
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
            </ul>,
            document.body,
          )
          : null
      ) : null}
    </div>
  )
}
