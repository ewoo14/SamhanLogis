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
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ChangeEvent,
  type FocusEvent,
  type ForwardedRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import styles from './AsyncAutocomplete.module.css'
import { FormField } from '../FormField/FormField'
import {
  SearchResultSelectionModal,
  type SearchResultSelectionColumn,
  type SearchResultSelectionMode,
} from '../SearchResultSelectionModal'
import { getAutocompleteSelectionStart } from '../autocompleteSelection'

export interface AsyncAutocompleteProps<T> {
  /** 현재 선택 항목 (controlled). 미선택은 `null`. */
  value: T | null
  /** 선택 변경 콜백. null 은 선택 해제를 의미한다. */
  onChange: (item: T | null) => void
  /** 표시 중 입력이 마지막 확정 선택(getKey)과 일치하는지 알린다. */
  onInputCommitChange?: (committed: boolean) => void
  /** blur 시점의 현재 입력 draft를 소비자에게 전달한다. */
  onInputBlur?: (draft: string) => void
  /** 비동기 검색 함수 (호출자 주입). */
  search: (q: string) => Promise<T[]>
  /**
   * React key + 선택 동일성 비교 전용 키.
   * 각 후보에서 유일해야 하며, 중복 시 React key 충돌과 선택 상태 오판이
   * 발생하므로 소비자가 유일성을 보장한다. DOM/ARIA id에는 사용하지 않는다.
   */
  getKey: (item: T) => string
  /** 입력란 표시값 + blur exact-match 기준. */
  getInputLabel: (item: T) => string
  /**
   * dropdown <li> 내부 내용.
   * @param context 후보를 만든 응답 검색어. 기존 1-인자 renderer는 그대로 동작한다.
   */
  renderOption: (item: T, context?: AsyncAutocompleteRenderContext) => ReactNode
  /** listbox aria-label. */
  listboxLabel: string
  /** blur 정확 일치 판정. 기본은 getInputLabel 대소문자 무시 비교. */
  matchExact?: (item: T, trimmed: string) => boolean
  /** 라벨 텍스트 (FormField visible label). undefined 면 compact 렌더. */
  label?: string
  /** compact 모드 input 의 `aria-label` 속성. */
  ariaLabel?: string
  /** 내부 input 의 data-testid. */
  inputTestId?: string
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
  /** dropdown 을 body floating layer 로 렌더한다. overflow 컨테이너 안에서는 기본 true 를 유지한다. */
  portal?: boolean
  /** 결과 선택 모달을 활성화한다. 기본값 legacy는 기존 dropdown 동작이다. */
  resultSelectionMode?: SearchResultSelectionMode
  /** multiple 모달에서 확정된 후보 묶음. */
  onResultsConfirmed?: (items: T[]) => void
  /** 결과 선택 모달 제목. */
  resultSelectionTitle?: ReactNode
  /** 결과 선택 모달에 표시할 표 열. 지정하면 후보 내용을 행 단위로 읽는다. */
  resultSelectionColumns?: readonly SearchResultSelectionColumn<T>[]
  /** multiple 모달에서 이미 선택한 후보의 opaque key. */
  selectedKeys?: string[]
  /** 기존 wrapper가 1건 후보를 즉시 확정하던 명시적 계약. 기본값 false. */
  autoSelectSingleResult?: boolean
}

/** 후보 표시 renderer에 전달하는 응답 시점 검색 context. */
export interface AsyncAutocompleteRenderContext {
  /** 현재 표시 후보를 만든 검색어. draft가 아닌 resolved query다. */
  query: string
}

/** 컴포넌트 내부 비동기 상태. */
type SearchStatus = 'idle' | 'loading' | 'done' | 'error'

function AsyncAutocompleteInner<T>(
  {
    value,
    onChange,
    onInputCommitChange,
    onInputBlur,
    search,
    getKey,
    getInputLabel,
    renderOption,
    listboxLabel,
    matchExact,
    label,
    ariaLabel,
    inputTestId,
    placeholder,
    required = false,
    error,
    disabled = false,
    minChars = 1,
    debounceMs = 250,
    portal = true,
    resultSelectionMode,
    onResultsConfirmed,
    resultSelectionTitle = '검색 결과 선택',
    resultSelectionColumns,
    selectedKeys = [],
    autoSelectSingleResult = false,
  }: AsyncAutocompleteProps<T>,
  ref: ForwardedRef<HTMLInputElement>,
) {
  const reactId = useId()
  const listId = `ds-aac-list-${reactId}`
  /** DOM/ARIA 식별자는 도메인 키와 분리한 후보 index 기반 opaque id다. */
  const optionDomId = (index: number) => `${listId}-opt-${index}`

  // 사용자 입력 임시 값 (포커스 중 + 검색 중)
  const [draft, setDraft] = useState<string>('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  /** 후보와 후보를 만든 검색어를 한 응답 시점에 함께 교체한다. */
  const [searchState, setSearchState] = useState<{
    candidates: T[]
    resolvedQuery: string
  }>({ candidates: [], resolvedQuery: '' })
  const [status, setStatus] = useState<SearchStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [selectionCandidates, setSelectionCandidates] = useState<T[]>([])
  const [selectionOpen, setSelectionOpen] = useState(false)
  const [selectionRequest, setSelectionRequest] = useState(0)
  const [floatingStyle, setFloatingStyle] = useState<CSSProperties | undefined>(undefined)
  const [, setCommittedState] = useState(true)

  const wrapperRef = useRef<HTMLDivElement | null>(null)
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
  const committedRef = useRef(true)
  const commitCallbackRef = useRef(onInputCommitChange)
  const previousValueKeyRef = useRef<string | null>(value ? getKey(value) : null)
  // 모달 취소 뒤 Modal의 포커스 복원은 새 검색 시작이 아니므로 draft를 유지한다.
  const preserveDraftOnNextFocusRef = useRef(false)
  // 이번 포커스 이후 입력 이벤트가 없으면 null, 사용자가 입력했으면 draft를 보관한다.
  // 빈 문자열도 실제 지움 이벤트의 결과이므로 포커스-only와 구별해야 한다.
  const lastTypedDraftRef = useRef<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const isComposingRef = useRef(false)
  const pendingSelectionRef = useRef<{ start: number; end: number } | null>(null)
  const userSelectionRef = useRef<{ start: number; end: number } | null>(null)

  const { candidates, resolvedQuery } = searchState

  const cancelDebouncedSearch = useCallback(() => {
    if (debounceTimer.current !== undefined) {
      window.clearTimeout(debounceTimer.current)
      debounceTimer.current = undefined
    }
  }, [])

  /** 선택 항목의 입력란 표시 레이블. */
  const selectedLabel = value ? getInputLabel(value) : ''

  useLayoutEffect(() => {
    const pending = pendingSelectionRef.current
    if (!pending || isComposingRef.current || !inputRef.current) return
    if (userSelectionRef.current) {
      inputRef.current.setSelectionRange(userSelectionRef.current.start, userSelectionRef.current.end)
      userSelectionRef.current = null
      pendingSelectionRef.current = null
      return
    }
    if (inputRef.current.selectionStart !== inputRef.current.selectionEnd) {
      pendingSelectionRef.current = null
      return
    }
    inputRef.current.setSelectionRange(pending.start, pending.end)
    pendingSelectionRef.current = null
  }, [draft, open, selectedLabel, selectionRequest])

  const setCommitted = useCallback((next: boolean) => {
    if (committedRef.current === next) return
    committedRef.current = next
    setCommittedState(next)
    commitCallbackRef.current?.(next)
  }, [])

  useEffect(() => {
    commitCallbackRef.current = onInputCommitChange
  }, [onInputCommitChange])

  useEffect(() => {
    // 초기 상태도 부모가 출력 계약을 즉시 알 수 있게 한다.
    commitCallbackRef.current?.(committedRef.current)
  }, [])

  /** 열릴 때 draft 초기화 → 전체 검색 마찰 없이 즉시 후보 표시 가능. */
  const handleFocus = () => {
    if (disabled) return
    cancelDebouncedSearch()
    if (blurTimer.current !== undefined) {
      window.clearTimeout(blurTimer.current)
      blurTimer.current = undefined
    }
    const preserveDraft = preserveDraftOnNextFocusRef.current
    // 모달 취소 직후 포커스 복원 1회만 검색어를 보존하고, 다음 왕복부터는 정리한다.
    preserveDraftOnNextFocusRef.current = false
    if (!preserveDraft) {
      lastTypedDraftRef.current = null
      setDraft('')
    }
    setActiveIndex(-1)
    latestSeq.current = ++instanceSeq.current
    setSearchState({ candidates: [], resolvedQuery: '' })
    setStatus('idle')
    setErrorMsg(null)
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
    (item: T, selectGeneratedSuffix = false) => {
      if (isComposingRef.current) return
      cancelDebouncedSearch()
      const nextLabel = getInputLabel(item)
      if (selectGeneratedSuffix && inputRef.current && inputRef.current.selectionStart !== inputRef.current.selectionEnd) {
        userSelectionRef.current = {
          start: inputRef.current.selectionStart ?? 0,
          end: inputRef.current.selectionEnd ?? 0,
        }
      }
      if (selectGeneratedSuffix && !isComposingRef.current) {
        pendingSelectionRef.current = {
          start: getAutocompleteSelectionStart(nextLabel, lastTypedDraftRef.current ?? draft),
          end: nextLabel.length,
        }
        setSelectionRequest((previous) => previous + 1)
      }
      lastTypedDraftRef.current = null
      setCommitted(true)
      onChange(item)
      setDraft(nextLabel)
      setActiveIndex(-1)
      setOpen(false)
      latestSeq.current = ++instanceSeq.current
      setSearchState({ candidates: [], resolvedQuery: '' })
      setStatus('idle')
      setErrorMsg(null)
    },
    [cancelDebouncedSearch, draft, getInputLabel, onChange, setCommitted],
  )

  const handleBlur = (_e: FocusEvent<HTMLInputElement>) => {
    // 결과 모달을 열기 위한 blur는 아직 사용자의 확정/취소 결정 전이다.
    // 이 시점에 소비자 exact lookup을 시작하면 취소 뒤에도 값이 확정된다.
    const movingToSelectionModal = preserveDraftOnNextFocusRef.current
    if (!movingToSelectionModal) onInputBlur?.(draft)
    if (blurTimer.current !== undefined) {
      window.clearTimeout(blurTimer.current)
    }
    blurTimer.current = window.setTimeout(() => {
      blurTimer.current = undefined
      cancelDebouncedSearch()
      latestSeq.current = ++instanceSeq.current
      setOpen(false)
      setActiveIndex(-1)

      // 결과 모달로 포커스가 이동한 blur는 검색 취소가 아니므로 입력어를 복원하지 않는다.
      if (preserveDraftOnNextFocusRef.current) {
        setSearchState({ candidates: [], resolvedQuery: '' })
        setStatus('idle')
        setErrorMsg(null)
        return
      }

      const trimmed = draft.trim()

      if (!trimmed) {
        // 확정값을 비운 뒤 blur하면 null을 실제 선택 해제로 전달한다.
        // 값이 이미 null인 입력은 더미 callback을 만들지 않는다.
        setSearchState({ candidates: [], resolvedQuery: '' })
        setStatus('idle')
        setErrorMsg(null)
        const wasEdited = lastTypedDraftRef.current !== null
        lastTypedDraftRef.current = null
        if (value && wasEdited) onChange(null)
        setDraft('')
        setCommitted(true)
        return
      }

      // 입력한 값이 현재 선택과 정확히 일치하면 별도 처리 불필요.
      if (value && matchesExact(value, trimmed)) {
        setSearchState({ candidates: [], resolvedQuery: '' })
        setStatus('idle')
        setErrorMsg(null)
        setDraft(selectedLabel)
        setCommitted(true)
        return
      }

      // exact 후보가 하나일 때만 자동 선택한다. 동명이 복수면 임의 선택 금지.
      const exact = candidates.filter((item) => matchesExact(item, trimmed))
      if (exact.length === 1) {
        pick(exact[0]!)
        return
      }

      // 일치 없음 — 기존 선택값 유지 (free-text 차단). onChange 미호출.
      // draft 를 selectedLabel 로 복원은 displayValue 가 자동 처리.
      setSearchState({ candidates: [], resolvedQuery: '' })
      setStatus('idle')
      setErrorMsg(null)
      setDraft(selectedLabel)
      setCommitted(true)
    }, 120)
  }

  /** 서버 검색 실행 — stale 응답 무시 포함. */
  /** 검색 결과 확정·취소 뒤 검색 dropdown 잔여 상태를 정리한다. */
  const closeSearchSurface = useCallback(
    ({ resetDraft = true }: { resetDraft?: boolean } = {}) => {
      cancelDebouncedSearch()
      if (blurTimer.current !== undefined) {
        window.clearTimeout(blurTimer.current)
        blurTimer.current = undefined
      }
      latestSeq.current = ++instanceSeq.current
      setOpen(false)
      setActiveIndex(-1)
      setSearchState({ candidates: [], resolvedQuery: '' })
      setStatus('idle')
      setErrorMsg(null)
      // 확정은 새 선택값을 표시해야 하므로 draft를 비우고, 모달 취소는 사용자의 검색어를 보존한다.
      if (resetDraft) setDraft('')
    },
    [cancelDebouncedSearch],
  )

  const performSearch = useCallback(
    async (q: string) => {
      // 인스턴스별 seq — 다른 인스턴스와 완전 격리
      const seq = ++instanceSeq.current
      latestSeq.current = seq

      // 새 검색이 시작되면 이전 후보와 이전 검색어를 함께 폐기한다.
      setSearchState({ candidates: [], resolvedQuery: '' })
      setStatus('loading')
      setErrorMsg(null)

      try {
        const results = await search(q)
        // stale 응답 — 더 최신 요청이 발행됐으면 버림
        if (latestSeq.current !== seq) return
        // 후보와 그 후보를 만든 검색어를 원자적으로 갱신한다.
        // autoSelectSingleResult가 켜진 wrapper는 단일 후보를 즉시 확정한다.
        // 꺼진 일반 AsyncAutocomplete은 정확 입력·키보드 선택·기존 클릭 사용자 흐름을
        // 유지하며 1건을 dropdown에 남긴다. 모달 계약은 2건 이상일 때만 적용한다.
        if (autoSelectSingleResult && results.length === 1) {
          if (resultSelectionMode === 'multiple' && onResultsConfirmed) {
            onResultsConfirmed(results)
            closeSearchSurface({ resetDraft: true })
            return
          }
          if (resultSelectionMode !== 'multiple') {
            pick(results[0]!, !isComposingRef.current)
            return
          }
        }
        if (resultSelectionMode && results.length > 1) {
          setSelectionCandidates(results)
          // Modal이 닫히며 입력으로 포커스를 복원할 때까지 검색어를 보존한다.
          preserveDraftOnNextFocusRef.current = true
          setSelectionOpen(true)
          closeSearchSurface({ resetDraft: false })
          return
        }
        setSearchState({ candidates: results, resolvedQuery: q })
        setStatus('done')
      } catch {
        if (latestSeq.current !== seq) return
        setSearchState({ candidates: [], resolvedQuery: '' })
        setStatus('error')
        setErrorMsg('검색 중 오류가 발생했습니다.')
      }
    },
    [
      autoSelectSingleResult,
      closeSearchSurface,
      onResultsConfirmed,
      pick,
      resultSelectionMode,
      search,
    ],
  )

  /** 입력 변경 — debounce 후 서버 검색 */
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextDraft = e.target.value
    userSelectionRef.current = null
    preserveDraftOnNextFocusRef.current = false
    lastTypedDraftRef.current = nextDraft
    setDraft(nextDraft)
    // value=null인 빈 입력만 확정 상태로 남기고, 한 글자라도 편집하면 미확정이다.
    setCommitted(value === null && nextDraft.trim() === '')
    setActiveIndex(-1)
    if (!open) setOpen(true)

    // stale 가드 — 이미 발행된(in-flight) 검색 응답이 새 입력 이후 도착하면 폐기된다.
    latestSeq.current = ++instanceSeq.current

    // debounce 리셋
    cancelDebouncedSearch()

    const trimmed = nextDraft.trim()
    setStatus('idle')
    setErrorMsg(null)
    if (trimmed.length < minChars) {
      // 검색이 예약되지 않는 입력 — 직전 후보를 비워 stale 후보 노출을 막는다.
      setSearchState({ candidates: [], resolvedQuery: '' })
      setStatus('idle')
      return
    }

    // debounce 대기 중에는 직전 searchState(후보 + resolvedQuery)·status 를 그대로 유지한다.
    // — "listbox 표시 ⟹ 후보 존재" 불변식 복원: 대기 창에 빈 후보 + "검색 중…" listbox 가
    //   뜨지 않아 키보드 선택(↓/Enter)이 항상 실제 후보를 대상으로 동작한다 (#825 CI 회귀 fix).
    // — false-empty flash 근본 해소: 후보가 있던 화면이 대기 중 "검색 결과 없음"(done+빈 후보)
    //   으로 바뀌는 상태 자체가 생기지 않는다 (R1 의 즉시 loading 우회를 대체).
    // — 오강조 불가: 하이라이트는 draft 가 아닌 resolvedQuery(유지된 후보를 만든 검색어) 기준.
    // 실제 loading 전환·이전 후보 폐기·결과 반영은 performSearch 가 실행 시점에 원자적으로 수행한다.
    debounceTimer.current = window.setTimeout(() => {
      debounceTimer.current = undefined
      void performSearch(trimmed)
    }, debounceMs)
  }

  /** 클린업: unmount 시 타이머 정리 */
  useEffect(() => {
    return () => {
      if (blurTimer.current !== undefined) window.clearTimeout(blurTimer.current)
      cancelDebouncedSearch()
      latestSeq.current = ++instanceSeq.current
    }
  }, [cancelDebouncedSearch])

  /** controlled value 교체는 현재 편집을 닫고 표시/계약을 새 값에 맞춘다. */
  useEffect(() => {
    const nextKey = value ? getKey(value) : null
    if (previousValueKeyRef.current === nextKey) return

    // 사용자가 확정값을 다시 편집하면 소비자는 입력 중인 선택을 저장 대상에서
    // 먼저 제외하기 위해 controlled value를 null로 바꿀 수 있다. 이 null은 외부
    // 동기화가 아니라 현재 draft의 결과이므로, surface/draft를 닫거나 덮어쓰면
    // 첫 글자와 검색어가 사라진다. blur에서 실제 onChange(null)이 오기 전까지
    // 진행 중 검색을 그대로 보존한다.
    if (nextKey === null && lastTypedDraftRef.current !== null) {
      previousValueKeyRef.current = nextKey
      return
    }

    previousValueKeyRef.current = nextKey
    lastTypedDraftRef.current = null
    cancelDebouncedSearch()
    if (blurTimer.current !== undefined) {
      window.clearTimeout(blurTimer.current)
      blurTimer.current = undefined
    }
    latestSeq.current = ++instanceSeq.current
    setOpen(false)
    setActiveIndex(-1)
    setSearchState({ candidates: [], resolvedQuery: '' })
    setStatus('idle')
    setErrorMsg(null)
    setDraft(selectedLabel)
    setCommitted(true)
  }, [cancelDebouncedSearch, getKey, selectedLabel, setCommitted, value])

  /**
   * disabled 전환 시 열림 상태를 강제로 닫는다 (R8-QA-9).
   *
   * <p>포커스된 combobox 가 `open=true` 인 채로 `disabled=true` 로 플립되면 — 예: 전표 수정
   * 진입 시 focus effect 가 거래처 입력에 `.focus()` 를 준 직후 coedit provider 로딩으로
   * `disabled` 가 켜질 때 — 브라우저는 요소를 블러하지만 <b>React 는 disabled 요소에 onBlur 를
   * 발화하지 않는다</b>. 그 결과 `open` 이 닫히지 못하고 고착되어
   * `displayValue = open ? draft : selectedLabel` 이 빈 draft 를 계속 표시하고
   * (aria-expanded 도 true 로 고착) 선택된 값이 화면에서 사라진다. disabled 전이를 직접 감지해
   * blur 타이머·open 을 정리함으로써 그 고착을 끊는다 — displayValue 가 selectedLabel 로 복원된다.
   */
  useEffect(() => {
    if (!disabled) return
    cancelDebouncedSearch()
    if (blurTimer.current !== undefined) {
      window.clearTimeout(blurTimer.current)
      blurTimer.current = undefined
    }
    latestSeq.current = ++instanceSeq.current
    setOpen(false)
    setActiveIndex(-1)
    setSearchState({ candidates: [], resolvedQuery: '' })
    setStatus('idle')
    setErrorMsg(null)
    setDraft(selectedLabel)
    setCommitted(true)
  }, [cancelDebouncedSearch, disabled, selectedLabel, setCommitted])

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // 확정값에 focus하면 화면 draft를 비워 둔다. 이 상태에서 Backspace/Delete는
    // 브라우저가 값 변경 input을 만들지 않으므로, 실제 삭제 의도를 별도로 기록해야
    // focus-only blur(null sentinel)과 구분할 수 있다(R28 B).
    if (value && e.currentTarget.value === '' && (e.key === 'Backspace' || e.key === 'Delete')) {
      lastTypedDraftRef.current = ''
    }
    const isComposing = e.nativeEvent.isComposing || isComposingRef.current
    if (isComposing && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        isComposingRef.current = false
      }
      return
    }
    if (!open) return
    const candidatesAreFresh = draft.trim() === resolvedQuery

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!candidatesAreFresh) return
      setActiveIndex((prev) =>
        candidates.length > 0
          ? prev < candidates.length - 1
            ? prev + 1
            : prev
          : -1,
      )
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!candidatesAreFresh) return
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (!candidatesAreFresh) return
      const target =
        activeIndex >= 0
          ? candidates[activeIndex]
          : candidates.length === 1
            ? candidates[0]
            : null
      if (target) pick(target)
    } else if (e.key === 'Escape') {
      if (blurTimer.current !== undefined) {
        window.clearTimeout(blurTimer.current)
        blurTimer.current = undefined
      }
      cancelDebouncedSearch()
      latestSeq.current = ++instanceSeq.current
      setOpen(false)
      setActiveIndex(-1)
      setSearchState({ candidates: [], resolvedQuery: '' })
      setStatus('idle')
      setErrorMsg(null)
      setDraft(selectedLabel)
      setCommitted(true)
    }
  }

  const closeSelection = useCallback((preserveDraft: boolean) => {
    preserveDraftOnNextFocusRef.current = preserveDraft
    if (preserveDraft) setDraft(lastTypedDraftRef.current ?? '')
    setSelectionOpen(false)
    setSelectionCandidates([])
    closeSearchSurface({ resetDraft: !preserveDraft })
    setCommitted(true)
  }, [closeSearchSurface, setCommitted])

  // 표시값 — 포커스 중에는 draft, 그 외엔 selectedLabel
  // 모달 취소로 검색 surface만 닫혀도, 아직 확정되지 않은 검색어는 입력란에 남긴다.
  const displayValue = open || draft.length > 0 ? draft : selectedLabel

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

  const hasFloatingLayer = showMinCharsHint || showLoadingRow || showDropdown || showEmpty
  const hasListbox = showLoadingRow || (open && candidates.length > 0)

  const updateFloatingPosition = useCallback(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const rect = wrapper.getBoundingClientRect()
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth
    const maxWidth = Math.min(640, Math.max(rect.width, viewportWidth - 16))
    const left = Math.min(rect.left, Math.max(8, viewportWidth - maxWidth - 8))
    setFloatingStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left,
      right: 'auto',
      width: 'max-content',
      minWidth: rect.width,
      maxWidth,
      zIndex: 1000,
    })
  }, [])

  useLayoutEffect(() => {
    if (!portal || !hasFloatingLayer) return
    updateFloatingPosition()

    window.addEventListener('resize', updateFloatingPosition)
    window.addEventListener('scroll', updateFloatingPosition, true)
    return () => {
      window.removeEventListener('resize', updateFloatingPosition)
      window.removeEventListener('scroll', updateFloatingPosition, true)
    }
  }, [hasFloatingLayer, portal, updateFloatingPosition])

  const renderFloatingLayer = (node: ReactNode) => {
    if (!portal || typeof document === 'undefined' || !document.body) {
      return node
    }
    return createPortal(node, document.body)
  }

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
    <>
    <div className={styles['wrapper']} ref={wrapperRef}>
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
          ref={(node) => {
            inputRef.current = node
            if (typeof ref === 'function') ref(node)
            else if (ref) ref.current = node
          }}
          id={inputId}
          type="text"
          autoComplete="off"
          className={styles['input']}
          value={displayValue}
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onSelect={() => {
            userSelectionRef.current = {
              start: inputRef.current?.selectionStart ?? 0,
              end: inputRef.current?.selectionEnd ?? 0,
            }
          }}
          onCompositionStart={() => {
            isComposingRef.current = true
          }}
          onCompositionEnd={() => {
            isComposingRef.current = false
            window.setTimeout(() => {
              const item = candidates.length === 1 ? candidates[0] : undefined
              if (
                item &&
                autoSelectSingleResult &&
                draft.trim() === resolvedQuery &&
                lastTypedDraftRef.current !== getInputLabel(item)
              ) {
                pick(item, true)
              }
            }, 0)
          }}
          placeholder={placeholder}
          disabled={disabled}
          required={req}
          aria-label={isCompact ? ariaLabel : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={ariaDescribedBy}
          aria-required={req || undefined}
          aria-autocomplete="list"
          aria-expanded={hasListbox}
          aria-controls={hasListbox ? listId : undefined}
          aria-activedescendant={
            hasListbox && activeIndex >= 0 && candidates[activeIndex]
              ? optionDomId(activeIndex)
              : undefined
          }
          role="combobox"
          data-testid={inputTestId}
        />
        {open && status === 'loading' ? (
          <span className={styles['loadingSpinner']} aria-hidden="true">
            <span className={styles['spinnerDot']} />
          </span>
        ) : null}
      </div>

      {/* minChars 미달 안내 */}
      {showMinCharsHint ? (
        renderFloatingLayer(
          <div
            className={styles['hint']}
            style={portal ? floatingStyle : undefined}
            role="status"
          >
            {minChars}글자 이상 입력하면 검색합니다.
          </div>,
        )
      ) : null}

      {/* 로딩 중 — dropdown 박스에 "검색 중…" 표시 */}
      {showLoadingRow ? (
        renderFloatingLayer(
          <ul
            id={listId}
            className={styles['dropdown']}
            style={portal ? floatingStyle : undefined}
            role="listbox"
            aria-label={listboxLabel}
          >
            <li
              className={styles['statusRow']}
              role="option"
              aria-selected={false}
              aria-disabled="true"
            >
              <span className={styles['spinnerDot']} aria-hidden="true" />
              <span>검색 중…</span>
            </li>
          </ul>,
        )
      ) : null}

      {/* 후보 dropdown */}
      {showDropdown && candidates.length > 0 ? (
        renderFloatingLayer(
          <ul
            id={listId}
            className={styles['dropdown']}
            style={portal ? floatingStyle : undefined}
            role="listbox"
            aria-label={listboxLabel}
          >
            {candidates.map((item, idx) => {
              const key = getKey(item)
              // 선택 여부는 getKey 비교 "단일 계산"을 시각 class(optionSelected)와
              // aria-selected 가 공유한다 — 두 분기가 각자 비교하면 한쪽만
              // 참조비교(value === item)로 회귀하는 드리프트가 가능하다 (#825 CODEX LOW).
              const isSelected = value ? getKey(value) === key : false
              const candidatesAreFresh = draft.trim() === resolvedQuery
              return (
                <li
                  key={key}
                  id={optionDomId(idx)}
                  className={[
                    styles['option'],
                    isSelected ? styles['optionSelected'] : null,
                    idx === activeIndex ? styles['optionActive'] : null,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={!candidatesAreFresh || undefined}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    if (candidatesAreFresh) pick(item)
                  }}
                >
                  {renderOption(item, { query: resolvedQuery })}
                </li>
              )
            })}
          </ul>,
        )
      ) : null}

      {/* 빈 결과 */}
      {showEmpty ? (
        renderFloatingLayer(
          <div
            className={styles['empty']}
            style={portal ? floatingStyle : undefined}
            role="status"
          >
            검색 결과 없음
          </div>,
        )
      ) : null}

      {/* 에러 */}
      {open && status === 'error' && errorMsg ? (
        renderFloatingLayer(
          <div
            className={styles['empty']}
            style={portal ? floatingStyle : undefined}
            role="status"
          >
            {errorMsg}
          </div>,
        )
      ) : null}
    </div>
    <SearchResultSelectionModal
      key={selectionCandidates.map(getKey).join('|')}
      open={selectionOpen}
      mode={resultSelectionMode ?? 'single'}
      title={resultSelectionTitle}
      options={selectionCandidates}
      getKey={getKey}
      getLabel={getInputLabel}
      renderOption={(item) => renderOption(item, { query: draft.trim() })}
      columns={resultSelectionColumns}
      initialSelectedKeys={selectedKeys}
      onConfirm={(items) => {
        if (resultSelectionMode === 'multiple') onResultsConfirmed?.(items)
        else if (items[0]) pick(items[0])
        closeSelection(false)
      }}
      onCancel={() => closeSelection(true)}
    />
    </>
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
