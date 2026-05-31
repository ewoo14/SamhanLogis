/**
 * `<ProductAutocomplete>` — 품목 서버검색 자동완성 (typeahead, async).
 *
 * AC-2 슬라이스 신규 컴포넌트. `WarehouseAutocomplete` idiom 을 서버검색(async) 형태로 확장.
 *
 * 차이점:
 * - `searchProducts` 콜백을 호출자가 주입 (design-system 은 API 비의존, 순수성 유지).
 * - 입력 debounce → `searchProducts(q)` → 후보 listbox 표시.
 * - `minChars` 미만 입력 시 검색 안 함 + 안내 메시지.
 * - 로딩 / 빈("검색 결과 없음") / 에러 상태 표시.
 * - stale 응답 무시 — 요청 seq 비교로 최신 query 결과만 반영.
 * - 선택 시 입력란에 modelName 표시.
 * - blur 게이트: 미확정이면 이전 선택 복원 or null 유지. 더미 onChange 호출 금지.
 *
 * UUID 비공개 가드: `ProductOption.id` 는 내부 UUID — onChange 인자로만 흐르고 화면 노출 X.
 * 화면에는 modelName / productName 만 표시.
 *
 * @example
 * ```tsx
 * <ProductAutocomplete
 *   value={selectedProduct}
 *   onChange={(p) => updateLine(lineId, { productId: p?.id ?? null, modelName: p?.modelName ?? '' })}
 *   searchProducts={searchProductsApi}
 *   label="품목"
 *   required
 * />
 * ```
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
  type KeyboardEvent,
} from 'react'
import styles from './ProductAutocomplete.module.css'
import { FormField } from '../FormField/FormField'

/**
 * 품목 선택 옵션 — design-system 공개 타입.
 * `id` 는 UUID (화면 미노출), `modelName` / `productName` 이 사용자 표시 식별자.
 */
export interface ProductOption {
  /** product UUID — 내부 사용 전용 (화면 미노출). */
  id: string
  /** 모델명 (예: AJ040RXH4BC1) — 입력란 표시 / 비즈니스 식별자. */
  modelName: string
  /** 품목명 (예: 시스템에어컨 4Way 4HP). */
  productName: string
  /** 출고 단가 (선택 사항). */
  sellingPrice?: number
}

export interface ProductAutocompleteProps {
  /** 현재 선택 품목 (controlled). 미선택은 `null`. */
  value: ProductOption | null
  /** 선택 변경 콜백. null 은 선택 해제를 의미한다. */
  onChange: (product: ProductOption | null) => void
  /**
   * 비동기 품목 검색 함수 (호출자 주입).
   * `q` 를 받아 `ProductOption[]` 을 resolve. 실패 시 reject.
   * debounce 적용은 컴포넌트 내부 또는 외부에서 가능 — 내부 debounceMs 로도 제어.
   */
  searchProducts: (q: string) => Promise<ProductOption[]>
  /** 라벨 (default: "품목"). */
  label?: string
  /** placeholder (default: "모델명 또는 품목명 입력…"). */
  placeholder?: string
  /** 필수 표시 (라벨 옆 별표). */
  required?: boolean
  /** 에러 메시지 (FormField 통합 — 빨간 outline + 메시지). */
  error?: string
  /** 전체 비활성화. */
  disabled?: boolean
  /** 검색 시작 최소 입력 글자 수 (default: 1). */
  minChars?: number
  /** 입력 후 서버 검색까지 debounce 시간 ms (default: 250). */
  debounceMs?: number
}

/** 컴포넌트 내부 비동기 상태. */
type SearchStatus = 'idle' | 'loading' | 'done' | 'error'

/** 단조 증가 seq — stale 응답 무시용. */
let _globalSeq = 0

/**
 * ProductAutocomplete forwardRef — 호출자가 input 에 직접 focus/ref 가능.
 */
export const ProductAutocomplete = forwardRef<
  HTMLInputElement,
  ProductAutocompleteProps
>(function ProductAutocomplete(
  {
    value,
    onChange,
    searchProducts,
    label = '품목',
    placeholder = '모델명 또는 품목명 입력…',
    required = false,
    error,
    disabled = false,
    minChars = 1,
    debounceMs = 250,
  },
  ref,
) {
  const reactId = useId()
  const listId = `ds-prod-list-${reactId}`

  // 사용자 입력 임시 값 (포커스 중 + 검색 중)
  const [draft, setDraft] = useState<string>('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const [candidates, setCandidates] = useState<ProductOption[]>([])
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // blur timer — 항목 click 이벤트보다 먼저 닫히는 것 방지
  const blurTimer = useRef<number | undefined>(undefined)
  // debounce timer
  const debounceTimer = useRef<number | undefined>(undefined)
  // stale 응답 무시: 최신 요청 seq 추적
  const latestSeq = useRef<number>(0)

  /** 선택 품목의 입력란 표시 레이블 (modelName). */
  const selectedLabel = value?.modelName ?? ''

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

  const handleBlur = (_e: FocusEvent<HTMLInputElement>) => {
    blurTimer.current = window.setTimeout(() => {
      setOpen(false)
      setActiveIndex(-1)
      const trimmed = draft.trim()

      if (!trimmed) {
        // 빈 입력 blur — 더미 onChange 금지 (blur 게이트 원칙).
        // 기존 선택이 있으면 draft 는 blur 후 selectedLabel 로 복원됨 (displayValue 로직).
        return
      }

      // 입력한 값이 현재 선택과 정확히 일치하면 별도 처리 불필요.
      if (value && trimmed === value.modelName) {
        return
      }

      // 일치하는 후보가 있으면 자동 선택.
      const exact = candidates.find(
        (p) =>
          p.modelName.toLowerCase() === trimmed.toLowerCase(),
      )
      if (exact) {
        pick(exact)
        return
      }

      // 일치 없음 — 기존 선택값 유지 (free-text 차단). onChange 미호출.
      // draft 를 selectedLabel 로 복원은 displayValue 가 자동 처리.
    }, 120)
  }

  /** 입력 변경 — debounce 후 서버 검색 */
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setDraft(v)
    setActiveIndex(-1)
    if (!open) setOpen(true)

    // debounce 리셋
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current)

    const trimmed = v.trim()
    if (trimmed.length < minChars) {
      setCandidates([])
      setStatus('idle')
      return
    }

    debounceTimer.current = window.setTimeout(() => {
      void performSearch(trimmed)
    }, debounceMs)
  }

  /** 서버 검색 실행 — stale 응답 무시 포함. */
  const performSearch = useCallback(
    async (q: string) => {
      const seq = ++_globalSeq
      latestSeq.current = seq

      setStatus('loading')
      setErrorMsg(null)

      try {
        const results = await searchProducts(q)
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
    [searchProducts],
  )

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
      const target = activeIndex >= 0 ? candidates[activeIndex] : (candidates.length === 1 ? candidates[0] : null)
      if (target) pick(target)
    } else if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
    }
  }

  const pick = (p: ProductOption) => {
    onChange(p)
    setDraft(p.modelName)
    setActiveIndex(-1)
    setOpen(false)
    setCandidates([])
    setStatus('idle')
  }

  // 표시값 — 포커스 중에는 draft, 그 외엔 selectedLabel
  const displayValue = open ? draft : selectedLabel

  const showDropdown = open && (
    status === 'loading' || candidates.length > 0 || status === 'done' || status === 'error'
  )
  const showEmpty = open && status === 'done' && candidates.length === 0
  const showMinCharsHint = open && draft.trim().length > 0 && draft.trim().length < minChars

  return (
    <FormField
      label={label}
      error={error}
      required={required}
      render={({ id, ariaDescribedBy, invalid, required: req }) => (
        <div className={styles['wrapper']}>
          <div
            className={[
              styles['field'],
              disabled ? styles['disabled'] : null,
              (Boolean(error) || invalid) ? styles['hasError'] : null,
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <input
              ref={ref}
              id={id}
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
              aria-invalid={invalid || undefined}
              aria-describedby={ariaDescribedBy}
              aria-required={req || undefined}
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={open ? listId : undefined}
              aria-activedescendant={
                open && activeIndex >= 0 && candidates[activeIndex]
                  ? `${listId}-${candidates[activeIndex]!.id}`
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

          {/* 후보 dropdown */}
          {showDropdown && candidates.length > 0 ? (
            <ul
              id={listId}
              className={styles['dropdown']}
              role="listbox"
              aria-label="품목 목록"
            >
              {candidates.map((p, idx) => (
                <li
                  key={p.id}
                  id={`${listId}-${p.id}`}
                  className={[
                    styles['option'],
                    value?.id === p.id ? styles['optionSelected'] : null,
                    idx === activeIndex ? styles['optionActive'] : null,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="option"
                  aria-selected={value?.id === p.id}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pick(p)
                  }}
                >
                  <span className={styles['optionModel']}>{p.modelName}</span>
                  <span className={styles['optionSep']}>·</span>
                  <span className={styles['optionName']}>{p.productName}</span>
                </li>
              ))}
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
      )}
    />
  )
})

export default ProductAutocomplete
