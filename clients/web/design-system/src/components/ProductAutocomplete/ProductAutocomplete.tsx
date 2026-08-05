/**
 * `<ProductAutocomplete>` — 품목 서버검색 자동완성 wrapper.
 *
 * 공개 API(`ProductOption`, `searchProducts`)는 유지하고,
 * 공통 async typeahead 동작은 `AsyncAutocomplete<T>`에 위임한다.
 */
import { forwardRef } from 'react'
import { AsyncAutocomplete } from '../AsyncAutocomplete/AsyncAutocomplete'
import { MultiSelectAutocomplete } from '../MultiSelectAutocomplete'
import type {
  SearchResultSelectionColumn,
  SearchResultSelectionMode,
} from '../SearchResultSelectionModal'
import { splitHighlightMatches } from '../AsyncAutocomplete/highlight'
import styles from '../AsyncAutocomplete/AsyncAutocomplete.module.css'

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
  /** 품목코드 (선택) — 세트 전개 시 부모 modelCode. */
  modelCode?: string
  /** 품목 유형 (선택) — "SINGLE" | "BUNDLE". BUNDLE 이면 세트 옵션 노출. */
  productType?: string
  /** 규격 (선택). ProductSummaryResponse가 제공하는 실제 규격을 모달에 표시한다. */
  specification?: string | null
}

export interface ProductAutocompleteProps {
  /** 현재 선택 품목 (controlled). 미선택은 `null`. */
  value: ProductOption | null
  /** 선택 변경 콜백. null 은 선택 해제를 의미한다. */
  onChange: (product: ProductOption | null) => void
  /** 선택된 품목을 다시 편집하면 false를 알린다. 저장 전 품목코드 확정 상태 해제에 사용한다. */
  onInputCommitChange?: (committed: boolean) => void
  /** blur 시점의 현재 입력 draft를 소비자에게 전달한다. */
  onInputBlur?: (draft: string) => void
  /**
   * 비동기 품목 검색 함수 (호출자 주입).
   * `q` 를 받아 `ProductOption[]` 을 resolve. 실패 시 reject.
   */
  searchProducts: (q: string) => Promise<ProductOption[]>
  /** 라벨 텍스트 (FormField visible label). */
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
  /** 검색 시작 최소 입력 글자 수 (default: 1). */
  minChars?: number
  /** 입력 후 서버 검색까지 debounce 시간 ms (default: 250). */
  debounceMs?: number
  /** 여러 후보를 별도 선택 모달로 보낼지 여부. null 이면 인라인 listbox 를 유지한다. */
  resultSelectionMode?: SearchResultSelectionMode | null
  /** 후보가 정확히 1건이면 즉시 확정한다. 기본값은 품목 입력의 일반 UX 계약인 true. */
  autoSelectSingleResult?: boolean
}

export interface ProductMultiSelectAutocompleteProps {
  selected: ProductOption[]
  onAdd: (product: ProductOption) => void
  onRemove: (product: ProductOption) => void
  searchProducts: (q: string) => Promise<ProductOption[]>
  label?: string
  ariaLabel?: string
  inputTestId?: string
  placeholder?: string
  disabled?: boolean
  minChars?: number
  debounceMs?: number
  max?: number
}

function HighlightedProductField({
  value,
  query,
  label,
  className,
}: {
  value: string
  query: string
  label: string
  className: string | undefined
}) {
  const parts = splitHighlightMatches(value, query)
  const isMatched = parts.some((part) => part.matched)

  return (
    <span className={[styles['highlightedField'], className].filter(Boolean).join(' ')}>
      <span className={styles['highlightedText']}>
        {parts.map((part, index) =>
          part.matched ? (
            <mark className={styles['matchMark']} key={`match-${index}`}>
              {part.text}
            </mark>
          ) : (
            <span key={`text-${index}`}>{part.text}</span>
          ),
        )}
      </span>
      {isMatched ? (
        <span className={styles['matchBadge']} aria-label={`매치 필드 ${label}`}>
          {label}
        </span>
      ) : null}
    </span>
  )
}

const productResultColumns: readonly SearchResultSelectionColumn<ProductOption>[] = [
  {
    key: 'modelName',
    label: '모델명',
    render: (product) => product.modelName,
  },
  {
    key: 'productName',
    label: '품목명',
    render: (product) => product.productName,
  },
  {
    key: 'specification',
    label: '규격',
    render: (product) => product.specification?.trim() || '—',
  },
  {
    key: 'sellingPrice',
    label: '단가',
    render: (product) => product.sellingPrice == null
      ? '—'
      : `${product.sellingPrice.toLocaleString('ko-KR')}원`,
  },
]

export const ProductAutocomplete = forwardRef<
  HTMLInputElement,
  ProductAutocompleteProps
>(function ProductAutocomplete(
  {
    searchProducts,
    label = '품목',
    placeholder = '모델명 또는 품목명 입력…',
    resultSelectionMode = 'single',
    autoSelectSingleResult = true,
    ...rest
  },
  ref,
) {
  return (
    <AsyncAutocomplete<ProductOption>
      ref={ref}
      search={searchProducts}
      getKey={(product) => product.id}
      getInputLabel={(product) => product.modelName}
      listboxLabel="품목 목록"
      renderOption={(product, context) => (
        <>
          <HighlightedProductField
            value={product.modelName}
            query={context?.query ?? ''}
            label="모델명"
            className={styles['optionPrimary']}
          />
          <span className={styles['optionSep']}>·</span>
          <HighlightedProductField
            value={product.productName}
            query={context?.query ?? ''}
            label="품목명"
            className={styles['optionSecondary']}
          />
        </>
      )}
      label={label}
      placeholder={placeholder}
      resultSelectionMode={resultSelectionMode ?? undefined}
      resultSelectionTitle="품목 검색 결과"
      resultSelectionColumns={productResultColumns}
      autoSelectSingleResult={autoSelectSingleResult}
      {...rest}
    />
  )
})

/** 품목 일괄 추가용 복수 선택 wrapper. 기존 ProductAutocomplete와 동작이 분리된 opt-in이다. */
export const ProductMultiSelectAutocomplete = forwardRef<
  HTMLInputElement,
  ProductMultiSelectAutocompleteProps
>(function ProductMultiSelectAutocomplete(
  { searchProducts, label = '품목', placeholder = '모델명 또는 품목명 입력…', ...rest },
  ref,
) {
  return (
    <MultiSelectAutocomplete<ProductOption, ProductOption>
      ref={ref}
      search={searchProducts}
      getOptionKey={(product) => product.id}
      getSelectedKey={(product) => product.id}
      getInputLabel={(product) => product.modelCode ?? product.modelName}
      listboxLabel="품목 목록"
      renderOption={(product, context) => (
        <>
          <HighlightedProductField
            value={product.modelCode ?? product.modelName}
            query={context?.query ?? ''}
            label="모델코드"
            className={styles['optionPrimary']}
          />
          <span className={styles['optionSep']}>·</span>
          <HighlightedProductField
            value={product.productName}
            query={context?.query ?? ''}
            label="품목명"
            className={styles['optionSecondary']}
          />
        </>
      )}
      getChipProps={(product) => ({
        label: product.modelCode ?? product.modelName,
        value: product.productName,
      })}
      ariaLabel={rest.ariaLabel ?? '품목'}
      label={label}
      placeholder={placeholder}
      resultSelectionMode="multiple"
      resultSelectionTitle="품목 검색 결과"
      autoSelectSingleResult
      {...rest}
    />
  )
})

export default ProductAutocomplete
