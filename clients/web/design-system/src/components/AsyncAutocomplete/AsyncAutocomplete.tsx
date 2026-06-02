/**
 * `<AsyncAutocomplete<T>>` — 서버검색 자동완성 공통 base.
 *
 * ProductAutocomplete / PartnerAutocomplete 의 async typeahead 공통 로직.
 * design-system 은 API 비의존을 유지하고, 검색/표시/식별자 차이는 호출자가 어댑터로 주입한다.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type ForwardedRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import styles from './AsyncAutocomplete.module.css'
import { FormField } from '../FormField/FormField'

export interface AsyncAutocompleteProps<T> {
  /** 현재 선택 항목 (controlled). 미선택은 `null`. */
  value: T | null
  /** 선택 변경 콜백. null 은 선택 해제를 의미한다. */
  onChange: (item: T | null) => void
  /** 비동기 검색 함수 (호출자 주입). */
  search: (q: string) => Promise<T[]>
  /** React key / aria-activedescendant id / 선택 동일성 비교 키. */
  getKey: (item: T) => string
  /** 입력란 표시값 + blur exact-match 기준. */
  getInputLabel: (item: T) => string
  /** dropdown <li> 내부 내용. */
  renderOption: (item: T) => ReactNode
  /** listbox aria-label. */
  listboxLabel: string
  /** blur 정확 일치 판정. 기본은 getInputLabel 대소문자 무시 비교. */
  matchExact?: (item: T, trimmed: string) => boolean
  /** 라벨 텍스트 (FormField visible label). undefined 면 compact 렌더. */
  label?: string
  /** compact 모드 input 의 `aria-label` 속성. */
  ariaLabel?: string
  /** placeholder. */
  placeholder?: string
  /** 필수 표시. */
  required?: boolean
  /** 에러 메시지 (FormField 통합). */
  error?: string
  /** 전체 비활성화. */
  disabled?: boolean
  /** 검색 시작 최소 입력 글자 수. */
  minChars?: number
  /** 입력 후 서버 검색까지 debounce 시간 ms. */
  debounceMs?: number
}

/** 컴포넌트 내부 비동기 상태. */
type SearchStatus = 'idle' | 'loading' | 'done' | 'error'

function AsyncAutocompleteInner<T>(
  {
    value,
    onChange,
    search,
    getKey,
    getInputLabel,
    renderOption,
    listboxLabel,
    matchExact,
    label,
    ariaLabel,
    placeholder,
    required = false,
    error,
    disabled = false,
    minChars = 1,
    debounceMs = 250,
  }: AsyncAutocompleteProps<T>,
  ref: ForwardedRef<HTMLInputElement>,
) {
  const reactId = useId()
  const listId = `ds-aac-list-${reactId}`

  // 사용자 입력 임시 값 (포커스 중 + 검색 중)
  const [draft, setDraft] = useState<string>('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const [candidates, setCandidates] = useState<T[]>([])
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // blur timer — 항목 click 이벤트보다 먼저 닫히는 것 방지
  const blurTimer = useRef<number | undefined>(undefined)
  // debounce timer
  const debounceTimer = useRef<number | undefined>(undefined)
  /**
   * stale 응답 무시: 인스턴스별 단조 증가 seq.
   * 멀티 필드에서 필드 A 검색이 필드 B seq 에 의해 버려지는 오염을 방지한다.
   */
  const instanceSeq = useRef<number>(0)
  const latestSeq = useRef<number>(0)

  /** 선택 항목의 입력란 표시 레이블. */
  const selectedLabel = value ? getInputLabel(value) : ''

  /** 열릴 때 draft 초기화 → 전체 검색 마찰 없이 즉시 후보 표시 가능. */
  const handleFocus = () => {
    if (disabled) return
    if (blurTimer.current) {
      window.clearTimeout(blurTimer.current)
      blurTimer.current = undefined
    }
    setDraft('')
    setActiveIndex(-1)
    setCandidates([])
    setStatus('idle')
    setOpen(true)
  }

  const matchesExact = useCallback(
    (item: T, trimmed: string) =>
      matchExact
        ? matchExact(item, trimmed)
        : getInputLabel(item).toLowerCase() === trimmed.toLowerCase(),
    [getInputLabel, matchExact],
  )

  const pick = useCallback(
    (item: T) => {
      onChange(item)
      setDraft(getInputLabel(item))
      setActiveIndex(-1)
      setOpen(false)
      setCandidates([])
      setStatus('idle')
    },
    [getInputLabel, onChange],
  )

  const handleBlur = (_e: FocusEvent<HTMLInputElement>) => {
    blurTimer.current = window.setTimeout(() => {
      setOpen(false)
      setActiveIndex(-1)
      const trimmed = draft.trim()

      if (!trimmed) {
        // 빈 입력 blur — 더미 onChange 금지 (blur 게이트 원칙).
        return
      }

      // 입력한 값이 현재 선택과 정확히 일치하면 별도 처리 불필요.
      if (value && trimmed === getInputLabel(value)) {
        return
      }

      // 일치하는 후보가 있으면 자동 선택.
      const exact = candidates.find((item) => matchesExact(item, trimmed))
      if (exact) {
        pick(exact)
        return
      }

      // 일치 없음 — 기존 선택값 유지 (free-text 차단). onChange 미호출.
      // draft 를 selectedLabel 로 복원은 displayValue 가 자동 처리.
    }, 120)
  }

  /** 서버 검색 실행 — stale 응답 무시 포함. */
  const performSearch = useCallback(
    async (q: string) => {
      // 인스턴스별 seq — 다른 인스턴스와 완전 격리
      const seq = ++instanceSeq.current
      latestSeq.current = seq

      setStatus('loading')
      setErrorMsg(null)

      try {
        const results = await search(q)
        // stale 응답 — 더 최신 요청이 발행됐으면 버림
        if (latestSeq.current !== seq) return
        setCandidates(results)
        setStatus('done')
      } catch {
        if (latestSeq.current !== seq) return
        setCandidates([])
        setStatus('error')
        setErrorMsg('검색 중 오류가 발생했습니다.')
      }
    },
    [search],
  )

  /** 입력 변경 — debounce 후 서버 검색 */
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextDraft = e.target.value
    setDraft(nextDraft)
    setActiveIndex(-1)
    if (!open) setOpen(true)

    // debounce 리셋
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current)

    const trimmed = nextDraft.trim()
    if (trimmed.length < minChars) {
      setCandidates([])
      setStatus('idle')
      return
    }

    debounceTimer.current = window.setTimeout(() => {
      void performSearch(trimmed)
    }, debounceMs)
  }

  /** 클린업: unmount 시 타이머 정리 */
  useEffect(() => {
    return () => {
      if (blurTimer.current) window.clearTimeout(blurTimer.current)
      if (debounceTimer.current) window.clearTimeout(debounceTimer.current)
    }
  }, [])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) =>
        candidates.length > 0
          ? prev < candidates.length - 1
            ? prev + 1
            : prev
          : -1,
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target =
        activeIndex >= 0
          ? candidates[activeIndex]
          : candidates.length === 1
            ? candidates[0]
            : null
      if (target) pick(target)
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  // 표시값 — 포커스 중에는 draft, 그 외엔 selectedLabel
  const displayValue = open ? draft : selectedLabel

  // 로딩/결과/에러 등 dropdown 표시 여부
  const showDropdown =
    open &&
    (status === 'loading' ||
      candidates.length > 0 ||
      status === 'done' ||
      status === 'error')
  const showLoadingRow = open && status === 'loading' && candidates.length === 0
  const showEmpty = open && status === 'done' && candidates.length === 0
  const showMinCharsHint =
    open && draft.trim().length > 0 && draft.trim().length < minChars

  /**
   * label 이 비어 있거나 undefined 인 경우 compact 모드:
   * - FormField 를 건너뛰고 wrapper div 만 렌더.
   * - `ariaLabel` 을 input aria-label 로 직접 적용.
   */
  const isCompact = !label || label === ''

  /**
   * 공통 dropdown 영역.
   */
  const renderControls = (
    inputId: string,
    invalid: boolean,
    req: boolean,
    ariaDescribedBy: string | undefined,
  ) => (
    <div className={styles['wrapper']}>
      <div
        className={[
          styles['field'],
          disabled ? styles['disabled'] : null,
          Boolean(error) || invalid ? styles['hasError'] : null,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <input
          ref={ref}
          id={inputId}
          type="text"
          autoComplete="off"
          className={styles['input']}
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          required={req}
          aria-label={isCompact ? ariaLabel : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={ariaDescribedBy}
          aria-required={req || undefined}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-activedescendant={
            open && activeIndex >= 0 && candidates[activeIndex]
              ? `${listId}-${getKey(candidates[activeIndex]!)}`
              : undefined
          }
          role="combobox"
        />
        {status === 'loading' ? (
          <span className={styles['loadingSpinner']} aria-hidden="true">
            <span className={styles['spinnerDot']} />
          </span>
        ) : null}
      </div>

      {/* minChars 미달 안내 */}
      {showMinCharsHint ? (
        <div className={styles['hint']} role="status">
          {minChars}글자 이상 입력하면 검색합니다.
        </div>
      ) : null}

      {/* 로딩 중 — dropdown 박스에 "검색 중…" 표시 */}
      {showLoadingRow ? (
        <ul
          id={listId}
          className={styles['dropdown']}
          role="listbox"
          aria-label={listboxLabel}
        >
          <li
            className={styles['statusRow']}
            role="option"
            aria-selected={false}
          >
            <span className={styles['spinnerDot']} aria-hidden="true" />
            <span>검색 중…</span>
          </li>
        </ul>
      ) : null}

      {/* 후보 dropdown */}
      {showDropdown && candidates.length > 0 ? (
        <ul
          id={listId}
          className={styles['dropdown']}
          role="listbox"
          aria-label={listboxLabel}
        >
          {candidates.map((item, idx) => {
            const key = getKey(item)
            return (
              <li
                key={key}
                id={`${listId}-${key}`}
                className={[
                  styles['option'],
                  value && getKey(value) === key ? styles['optionSelected'] : null,
                  idx === activeIndex ? styles['optionActive'] : null,
                ]
                  .filter(Boolean)
                  .join(' ')}
                role="option"
                aria-selected={value ? getKey(value) === key : false}
                onMouseDown={(e) => {
                  e.preventDefault()
                  pick(item)
                }}
              >
                {renderOption(item)}
              </li>
            )
          })}
        </ul>
      ) : null}

      {/* 빈 결과 */}
      {showEmpty ? (
        <div className={styles['empty']} role="status">
          검색 결과 없음
        </div>
      ) : null}

      {/* 에러 */}
      {open && status === 'error' && errorMsg ? (
        <div className={styles['empty']} role="status">
          {errorMsg}
        </div>
      ) : null}
    </div>
  )

  // compact 모드: label 없이 wrapper+input 만 렌더
  if (isCompact) {
    return renderControls(reactId, Boolean(error), required, undefined)
  }

  // 일반 모드: FormField 로 visible label + 에러/힌트 연결
  return (
    <FormField
      label={label}
      error={error}
      required={required}
      render={({ id, ariaDescribedBy, invalid, required: req }) =>
        renderControls(id, invalid, req, ariaDescribedBy)
      }
    />
  )
}

export const AsyncAutocomplete = forwardRef(AsyncAutocompleteInner) as <T>(
  props: AsyncAutocompleteProps<T> & { ref?: ForwardedRef<HTMLInputElement> },
) => ReturnType<typeof AsyncAutocompleteInner>

export default AsyncAutocomplete
