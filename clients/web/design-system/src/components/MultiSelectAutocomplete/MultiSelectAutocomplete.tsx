import {
  forwardRef,
  useCallback,
  useMemo,
  useRef,
  type ForwardedRef,
  type ReactNode,
} from 'react'
import { AsyncAutocomplete, type AsyncAutocompleteRenderContext } from '../AsyncAutocomplete'
import type { SearchResultSelectionMode } from '../SearchResultSelectionModal'
import { TagChip } from '../TagChip'
import styles from './MultiSelectAutocomplete.module.css'

export interface MultiSelectChipProps {
  /** 칩의 키 표시값. */
  label: string
  /** 칩의 실명·번호 등 사용자 표시값. */
  value: string
  /** 제거 버튼 접근성 라벨에 사용할 사용자 표시값. */
  removeLabel?: string
}

export interface MultiSelectAutocompleteProps<TOption, TSelected> {
  /** 현재 선택값. 칩 목록의 단일 진실원이다. */
  selected: TSelected[]
  /** 후보를 하나 추가하는 delta 콜백. */
  onAdd: (option: TOption) => void
  /** 선택값 하나를 제거하는 delta 콜백. */
  onRemove: (selected: TSelected) => void
  /** 비동기 후보 검색 함수. 이미 선택된 후보는 내부에서 제외한다. */
  search: (q: string) => Promise<TOption[]>
  /** 검색 후보의 opaque key. React key/dedup 전용이며 DOM에 렌더링하지 않는다. */
  getOptionKey: (option: TOption) => string
  /** 선택값의 opaque key. React key/dedup 전용이며 DOM에 렌더링하지 않는다. */
  getSelectedKey: (selected: TSelected) => string
  /** 후보의 입력 표시 레이블. */
  getInputLabel: (option: TOption) => string
  /** 후보 렌더러. */
  renderOption: (option: TOption, context?: AsyncAutocompleteRenderContext) => ReactNode
  /** listbox 접근성 레이블. */
  listboxLabel: string
  /** 기본 TagChip에 전달할 칩 표시값. renderChip보다 우선순위가 낮다. */
  getChipProps?: (selected: TSelected, index: number) => MultiSelectChipProps
  /** 칩을 직접 렌더링한다. 세부 testid와 화면별 표시 계약에 사용한다. */
  renderChip?: (
    selected: TSelected,
    index: number,
    onRemove: () => void,
  ) => ReactNode
  /** compact 모드 입력의 aria-label. */
  ariaLabel?: string
  /** 내부 input의 data-testid. */
  inputTestId?: string
  /** placeholder. */
  placeholder?: string
  /** 필수 표시. */
  required?: boolean
  /** 검색 입력 최소 글자 수. */
  minChars?: number
  /** 전체 비활성화. max 도달과 별개다. */
  disabled?: boolean
  /** 오류 메시지. */
  error?: string
  /** visible label. 없으면 compact 모드다. */
  label?: string
  /** 입력 debounce 시간 ms. */
  debounceMs?: number
  /** 최대 선택 수. 도달해도 기존 칩은 제거할 수 있다. */
  max?: number
  /** 지정하면 검색 결과 1건 즉시 확정, 2건 이상은 공용 선택 모달을 사용한다. */
  resultSelectionMode?: SearchResultSelectionMode
  /** 결과 선택 모달 제목. */
  resultSelectionTitle?: ReactNode
}

function MultiSelectAutocompleteInner<TOption, TSelected>(
  {
    selected,
    onAdd,
    onRemove,
    search,
    getOptionKey,
    getSelectedKey,
    getInputLabel,
    renderOption,
    listboxLabel,
    getChipProps,
    renderChip,
    ariaLabel,
    inputTestId,
    placeholder,
    required = false,
    minChars = 1,
    disabled = false,
    error,
    label,
    debounceMs = 250,
    max,
    resultSelectionMode,
    resultSelectionTitle,
  }: MultiSelectAutocompleteProps<TOption, TSelected>,
  ref: ForwardedRef<HTMLInputElement>,
) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const selectedKeys = useMemo(
    () => new Set(selected.map((item) => getSelectedKey(item))),
    [getSelectedKey, selected],
  )
  const maxReached = max !== undefined && selected.length >= max

  const searchUnselected = useCallback(
    async (query: string): Promise<TOption[]> => {
      if (maxReached) return []
      const candidates = await search(query)
      return candidates.filter((candidate) => !selectedKeys.has(getOptionKey(candidate)))
    },
    [getOptionKey, maxReached, search, selectedKeys],
  )

  const focusInput = useCallback(() => {
    inputRef.current?.focus()
  }, [])

  const add = useCallback(
    (option: TOption | null) => {
      if (!option || disabled || maxReached) return
      if (selectedKeys.has(getOptionKey(option))) return
      onAdd(option)
      // focus steal 방지(M3): 현재 포커스가 이 컴포넌트 내부에 있을 때만 입력으로 되돌린다.
      // click-pick(mousedown preventDefault 로 포커스 유지)·Enter-pick 은 내부이므로 refocus 하지만,
      // AsyncAutocomplete blur 자동선택(120ms)은 사용자가 이미 타 필드를 눌러 포커스가 밖으로 나간
      // 상태라 refocus 를 건너뛰어 포커스를 훔치지 않는다.
      if (wrapperRef.current?.contains(document.activeElement)) {
        focusInput()
      }
    },
    [disabled, focusInput, getOptionKey, maxReached, onAdd, selectedKeys],
  )

  const remove = useCallback(
    (item: TSelected) => {
      if (disabled) return
      onRemove(item)
      focusInput()
    },
    [disabled, focusInput, onRemove],
  )

  const mergedRef = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )

  return (
    <div className={styles['wrapper']} ref={wrapperRef}>
      <span
        className={styles['srOnly']}
        aria-live="polite"
        aria-atomic="true"
        data-testid="multiselect-chip-count"
      >
        {selected.length > 0 ? `${selected.length}개 선택됨` : ''}
      </span>
      {selected.length > 0 ? (
        <div className={styles['chips']} role="group" aria-label="선택한 항목">
          {selected.map((item, index) => {
            const key = `${getSelectedKey(item)}-${index}`
            const handleRemove = () => remove(item)
            if (renderChip) {
              return (
                <span className={styles['chipSlot']} key={key}>
                  {renderChip(item, index, handleRemove)}
                </span>
              )
            }
            if (!getChipProps) return null
            const chip = getChipProps(item, index)
            return (
              <TagChip
                key={key}
                label={chip.label}
                value={chip.value}
                removeLabel={chip.removeLabel}
                onRemove={disabled ? undefined : handleRemove}
              />
            )
          })}
        </div>
      ) : null}
      <AsyncAutocomplete<TOption>
        ref={mergedRef}
        value={null}
        onChange={add}
        search={searchUnselected}
        getKey={getOptionKey}
        getInputLabel={getInputLabel}
        renderOption={renderOption}
        listboxLabel={listboxLabel}
        ariaLabel={ariaLabel}
        inputTestId={inputTestId}
        placeholder={placeholder}
        required={required}
        minChars={minChars}
        disabled={disabled}
        error={error}
        label={label}
        debounceMs={debounceMs}
        resultSelectionMode={resultSelectionMode}
        resultSelectionTitle={resultSelectionTitle}
        selectedKeys={selected.map(getSelectedKey)}
        onResultsConfirmed={(options) => options.forEach(add)}
      />
    </div>
  )
}

export const MultiSelectAutocomplete = forwardRef(MultiSelectAutocompleteInner) as <
  TOption,
  TSelected,
>(
  props: MultiSelectAutocompleteProps<TOption, TSelected> & { ref?: ForwardedRef<HTMLInputElement> },
) => ReactNode

export default MultiSelectAutocomplete
