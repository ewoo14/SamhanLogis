import {
  forwardRef,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import styles from './WarehouseAutocomplete.module.css'
import { FormField } from '../FormField/FormField'
import {
  SearchResultSelectionModal,
  type SearchResultSelectionMode,
} from '../SearchResultSelectionModal'

/**
 * 창고 분류 enum (BE `WarehouseType` 와 1:1 대응).
 *
 * - `HEADQUARTERS` 본사창고 — 본사 보유 물리 창고
 * - `VEHICLE`       차량재고 — 차량 단위로 운영되는 이동 재고
 * - `CONSIGNMENT`   거래처위탁 — 위탁 보관된 외부 창고
 * - `VIRTUAL`       가상창고 — 서비스 인보이스 등 비물리. 재고 차감/이동 대상에서 제외.
 */
export type WarehouseType = 'HEADQUARTERS' | 'VEHICLE' | 'CONSIGNMENT' | 'VIRTUAL'

/** 창고 도메인 객체 (BE `/inventory/warehouses` 응답 형태). */
export interface Warehouse {
  /** 창고 UUID. */
  id: string
  /** 창고명 (한국어). */
  name: string
  /** 창고 코드 (예: HQ-001, VH-001). */
  code: string
  /** 창고 분류 — VIRTUAL 은 시각적 배지로 구분 표시. */
  type: WarehouseType
  /** 활성/비활성 여부. */
  active: boolean
}

export interface WarehouseAutocompleteProps {
  /** 선택 가능한 창고 목록 (BE `/inventory/warehouses` 응답). */
  warehouses: Warehouse[]
  /** 현재 선택된 창고 ID (controlled). 미선택은 `null`. */
  value: string | null
  /** 선택 변경 콜백. 두 번째 인자로 선택된 창고 객체 전달. */
  onChange: (warehouseId: string, warehouse: Warehouse) => void
  /** 라벨 (default: "창고"). */
  label?: string
  /** placeholder (default: "창고 코드 또는 이름 입력…"). */
  placeholder?: string
  /**
   * VIRTUAL 창고 숨김 여부.
   * 출고/이동 화면에선 `true` 권장 (가상창고는 물리 이동 대상이 아니므로).
   * default: `false`.
   */
  hideVirtual?: boolean
  /** 전체 비활성화. */
  disabled?: boolean
  /** 에러 메시지 (FormField 통합 — 빨간 outline + 메시지). */
  error?: string
  /** 필수 표시 (라벨 옆 별표). */
  required?: boolean
  /** 지정하면 2건 이상 후보를 공용 선택 모달로 표시한다. 기존 dropdown이 기본값이다. */
  resultSelectionMode?: SearchResultSelectionMode
  /** 결과 선택 모달 제목. */
  resultSelectionTitle?: ReactNode
  /** 지정하면 후보 1건을 모달 없이 즉시 확정한다. */
  autoSelectSingleResult?: boolean
}

/**
 * 입력 문자열 → 창고 후보 검색.
 *
 * 우선순위:
 * 1. `code` prefix 일치 (대소문자 무시)
 * 2. `name` 부분일치 (대소문자 무시)
 *
 * 빈 입력이면 전체 목록 반환 (창고 수가 적으므로 상한 없음).
 */
const searchWarehouses = (warehouses: Warehouse[], query: string): Warehouse[] => {
  const trimmed = query.trim()
  if (!trimmed) return warehouses

  const lower = trimmed.toLowerCase()
  // 1차: code prefix
  const byCode = warehouses.filter((w) => w.code.toLowerCase().startsWith(lower))
  // 2차: name 부분일치 (1차에 포함된 항목 제외)
  const codeSet = new Set(byCode.map((w) => w.id))
  const byName = warehouses.filter(
    (w) => !codeSet.has(w.id) && w.name.toLowerCase().includes(lower),
  )
  return [...byCode, ...byName]
}

/**
 * WarehouseAutocomplete — 창고 검색 가능 자동완성 (typeahead).
 *
 * `AccountCodeSelect` idiom 을 창고 도메인에 이식한 컴포넌트.
 * 기존 `WarehouseSelector`(native `<select>`) 와 **동일한 props 시그니처**를 가져
 * drop-in 교체가 가능하다.
 *
 * 동작:
 * - input 에 창고 코드/이름 일부 타이핑 → 매칭 후보 dropdown 표시
 * - 빈 입력 + 포커스 → 전체 창고 목록 표시 (창고가 소수라 전체 허용)
 * - `hideVirtual=true` 이면 VIRTUAL 타입 창고 제외
 * - 항목 click / Enter / blur 정확 매치 → `onChange(warehouseId, warehouse)` 호출
 * - blur 시 매칭 실패 → 입력값 이전 선택으로 복원 (free-text 입력 차단)
 * - 키보드 ↑↓ 로 후보 목록 탐색 가능
 *
 * UUID 비공개 가드: `onChange` 첫 번째 인자는 내부 id(UUID)지만 화면에는
 * "code · name" 형태만 노출. warehouseCode 는 부모 컴포넌트가 `warehouse.code` 로 추출.
 *
 * @example
 * ```tsx
 * <WarehouseAutocomplete
 *   warehouses={warehousesQuery.data ?? []}
 *   value={convertWarehouse?.id ?? null}
 *   onChange={(_id, warehouse) => setConvertWarehouse(warehouse)}
 *   label="출고 창고"
 *   hideVirtual
 *   required
 * />
 * ```
 */
export const WarehouseAutocomplete = forwardRef<
  HTMLInputElement,
  WarehouseAutocompleteProps
>(function WarehouseAutocomplete(
  {
    warehouses,
    value,
    onChange,
    label = '창고',
    placeholder = '창고 코드 또는 이름 입력…',
    hideVirtual = false,
    disabled = false,
    error,
    required = false,
    resultSelectionMode,
    resultSelectionTitle = '창고 검색 결과',
    autoSelectSingleResult = false,
  },
  ref,
) {
  const reactId = useId()
  const listId = `ds-wh-list-${reactId}`
  /** 도메인 id/코드와 분리한 후보 index 기반 opaque DOM/ARIA id. */
  const optionDomId = (index: number) => `${listId}-opt-${index}`

  /** `hideVirtual` 적용 후 표시될 후보 목록. */
  const visibleWarehouses = useMemo(
    () => (hideVirtual ? warehouses.filter((w) => w.type !== 'VIRTUAL') : warehouses),
    [warehouses, hideVirtual],
  )

  /** 현재 선택된 창고 객체. */
  const selectedWarehouse = useMemo(
    () => warehouses.find((w) => w.id === value) ?? null,
    [warehouses, value],
  )

  /** 선택된 창고의 표시 레이블 ("HQ-001 · 본사창고"). */
  const selectedLabel = useMemo(
    () => (selectedWarehouse ? `${selectedWarehouse.code} · ${selectedWarehouse.name}` : ''),
    [selectedWarehouse],
  )

  // 사용자 input 임시 값 (포커스 중 + 검색 중)
  const [draft, setDraft] = useState<string>('')
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState<number>(-1)
  const [selectionCandidates, setSelectionCandidates] = useState<Warehouse[]>([])
  const [selectionOpen, setSelectionOpen] = useState(false)
  const blurTimer = useRef<number | undefined>(undefined)
  // 검색 모달 취소로 input 포커스가 복원될 때 사용자의 draft를 보존한다.
  const preserveDraftOnNextFocusRef = useRef(false)
  const lastTypedDraftRef = useRef<string | null>(null)
  const canReopenSelectionRef = useRef(false)
  // 확정값과 포커스 복원 뒤의 검색 draft를 구분한다. 확정 직후 빈 draft로
  // 복원된 Enter는 기존 dropdown 첫 후보를 다시 pick하면 안 된다.
  const hasConfirmedSelectionRef = useRef(false)

  const candidates = useMemo(
    () => searchWarehouses(visibleWarehouses, draft),
    [visibleWarehouses, draft],
  )
  const hasListbox = open && candidates.length > 0

  const handleFocus = () => {
    if (disabled) return
    if (blurTimer.current) {
      window.clearTimeout(blurTimer.current)
      blurTimer.current = undefined
    }
    const preserveDraft = preserveDraftOnNextFocusRef.current
    preserveDraftOnNextFocusRef.current = false
    // F-2: 일반 포커스 시 draft 를 빈 문자열로 초기화 → 전체 후보 노출.
    // 모달 취소 직후 한 번만 사용자의 검색 draft를 복원한다.
    setDraft(preserveDraft ? (lastTypedDraftRef.current ?? '') : '')
    setActiveIndex(-1)
    setOpen(true)
  }

  const handleBlur = (_e: FocusEvent<HTMLInputElement>) => {
    // 항목 click 이벤트가 먼저 발생하도록 약간의 지연
    blurTimer.current = window.setTimeout(() => {
      setOpen(false)
      setActiveIndex(-1)
      // blur 시 매칭 검사 — 입력값을 코드/이름으로 매칭
      const trimmed = draft.trim()
      if (!trimmed) {
        // F-1: 빈 입력 blur 시 onChange 호출 금지 (게이트 우회 차단).
        //   - 기존 선택값이 있으면 draft 를 selectedLabel 로 복원 (이전 선택 유지).
        //   - 선택값이 없으면 draft 비운 상태 유지, 부모 상태 null 유지.
        if (selectedWarehouse) {
          setDraft(selectedLabel)
        }
        return
      }
      const exact = visibleWarehouses.find(
        (w) =>
          `${w.code} · ${w.name}` === trimmed ||
          w.code.toLowerCase() === trimmed.toLowerCase(),
      )
      if (exact) {
        if (exact.id !== value) onChange(exact.id, exact)
      } else {
        // 매칭 실패 — 기존 값 복원 (free-text 입력 차단)
        setDraft(selectedLabel)
      }
    }, 120)
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const nextDraft = e.target.value
    hasConfirmedSelectionRef.current = false
    lastTypedDraftRef.current = nextDraft
    setDraft(nextDraft)
    setActiveIndex(-1)
    if (!open) setOpen(true)

    if (resultSelectionMode && nextDraft.trim()) {
      const nextCandidates = searchWarehouses(visibleWarehouses, nextDraft)
      if (autoSelectSingleResult && nextCandidates.length === 1) {
        pick(nextCandidates[0]!)
      } else if (nextCandidates.length > 1) {
        setSelectionCandidates(nextCandidates)
        setSelectionOpen(true)
        setOpen(false)
      }
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing && ['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return

    if (
      e.key === 'Enter' &&
      resultSelectionMode &&
      canReopenSelectionRef.current &&
      draft.trim()
    ) {
      e.preventDefault()
      const nextCandidates = searchWarehouses(visibleWarehouses, draft)
      if (autoSelectSingleResult && nextCandidates.length === 1) {
        pick(nextCandidates[0]!)
      } else if (nextCandidates.length > 1) {
        setSelectionCandidates(nextCandidates)
        setSelectionOpen(true)
        setOpen(false)
      }
      return
    }

    if (e.key === 'Enter' && hasConfirmedSelectionRef.current && !draft.trim()) {
      e.preventDefault()
      return
    }

    if (!open) return

    if (e.key === 'Escape') {
      setOpen(false)
      setActiveIndex(-1)
      setDraft(selectedLabel)
      return
    }
    if (candidates.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((prev) => (prev < candidates.length - 1 ? prev + 1 : prev))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const target = activeIndex >= 0 ? candidates[activeIndex] : candidates[0]
      if (target) pick(target)
    }
  }

  const pick = (w: Warehouse) => {
    canReopenSelectionRef.current = false
    hasConfirmedSelectionRef.current = true
    onChange(w.id, w)
    setDraft(`${w.code} · ${w.name}`)
    setActiveIndex(-1)
    setOpen(false)
  }

  const closeSelection = () => {
    if (blurTimer.current !== undefined) {
      window.clearTimeout(blurTimer.current)
      blurTimer.current = undefined
    }
    preserveDraftOnNextFocusRef.current = true
    canReopenSelectionRef.current = true
    setSelectionOpen(false)
    setSelectionCandidates([])
    setDraft(lastTypedDraftRef.current ?? '')
    setOpen(false)
  }

  // 표시값 — 포커스 중에는 draft, 그 외엔 selectedLabel
  const displayValue = open || preserveDraftOnNextFocusRef.current ? draft : selectedLabel

  return (
    <FormField
      label={label}
      error={error}
      required={required}
      render={({ id, ariaDescribedBy, invalid, required: req }) => (
        <>
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
              aria-expanded={hasListbox}
              aria-controls={hasListbox ? listId : undefined}
              aria-activedescendant={
                hasListbox && activeIndex >= 0 && candidates[activeIndex]
                  ? optionDomId(activeIndex)
                  : undefined
              }
              role="combobox"
            />
          </div>
          {hasListbox ? (
            <ul
              id={listId}
              className={styles['dropdown']}
              role="listbox"
              aria-label="창고 목록"
            >
              {candidates.map((w, idx) => (
                <li
                  key={w.id}
                  id={optionDomId(idx)}
                  className={[
                    styles['option'],
                    w.id === value ? styles['optionSelected'] : null,
                    idx === activeIndex ? styles['optionActive'] : null,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="option"
                  aria-selected={w.id === value}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    pick(w)
                  }}
                >
                  <span className={styles['optionCode']}>{w.code}</span>
                  <span className={styles['optionName']}>{w.name}</span>
                  {!w.active ? (
                    <span className={styles['optionInactive']}>(비활성)</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {open && candidates.length === 0 ? (
            <div className={styles['empty']} role="status">
              일치하는 창고가 없습니다.
            </div>
          ) : null}
        </div>
        <SearchResultSelectionModal
          open={selectionOpen}
          mode={resultSelectionMode ?? 'single'}
          title={resultSelectionTitle}
          options={selectionCandidates}
          getKey={(warehouse) => warehouse.id}
          getLabel={(warehouse) => warehouse.code}
          renderOption={(warehouse) => (
            <span>
              <span className={styles['optionCode']}>{warehouse.code}</span>
              <span className={styles['optionName']}>{warehouse.name}</span>
            </span>
          )}
          columns={[
            { key: 'code', label: '창고 코드', render: (warehouse: Warehouse) => warehouse.code },
            { key: 'name', label: '창고명', render: (warehouse: Warehouse) => warehouse.name },
          ]}
          onConfirm={(items) => {
            if (items[0]) pick(items[0])
            setSelectionOpen(false)
            setSelectionCandidates([])
          }}
          onCancel={closeSelection}
        />
        </>
      )}
    />
  )
})

export default WarehouseAutocomplete
