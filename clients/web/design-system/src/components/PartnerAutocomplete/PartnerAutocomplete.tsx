/**
 * `<PartnerAutocomplete>` — 거래처 서버검색 자동완성 wrapper.
 *
 * 공개 API(`PartnerOption`, `searchPartners`)는 유지하고,
 * 공통 async typeahead 동작은 `AsyncAutocomplete<T>`에 위임한다.
 */
import { forwardRef } from 'react'
import { AsyncAutocomplete } from '../AsyncAutocomplete/AsyncAutocomplete'
import styles from '../AsyncAutocomplete/AsyncAutocomplete.module.css'

/**
 * 거래처 선택 옵션 — design-system 공개 타입.
 * UUID 비공개 가드: partnerCode 가 사용자 표시 식별자 (UUID 없음).
 */
export interface PartnerOption {
  /** 거래처 코드 (사용자 표시 식별자). 예: P-2026-0001 */
  partnerCode: string
  /** 거래처 상호. */
  name: string
  /** 사업자등록번호 (선택 사항, 보조 정보). */
  bizNo?: string
  /** 대표 연락처 (선택 사항). */
  phone?: string
}

export interface PartnerAutocompleteProps {
  /** 현재 선택 거래처 (controlled). 미선택은 `null`. */
  value: PartnerOption | null
  /** 선택 변경 콜백. null 은 선택 해제를 의미한다. */
  onChange: (partner: PartnerOption | null) => void
  /**
   * 비동기 거래처 검색 함수 (호출자 주입).
   * `q` 를 받아 `PartnerOption[]` 을 resolve. 실패 시 reject.
   */
  searchPartners: (q: string) => Promise<PartnerOption[]>
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
}

export const PartnerAutocomplete = forwardRef<
  HTMLInputElement,
  PartnerAutocompleteProps
>(function PartnerAutocomplete(
  {
    searchPartners,
    label = '거래처',
    placeholder = '거래처명 또는 코드 입력…',
    ...rest
  },
  ref,
) {
  return (
    <AsyncAutocomplete<PartnerOption>
      ref={ref}
      search={searchPartners}
      getKey={(partner) => partner.partnerCode}
      getInputLabel={(partner) => partner.name}
      listboxLabel="거래처 목록"
      renderOption={(partner) => (
        <>
          <span className={styles['optionPrimary']}>{partner.name}</span>
          <span className={styles['optionSep']}>·</span>
          <span className={styles['optionSecondary']}>{partner.partnerCode}</span>
          {partner.bizNo ? (
            <>
              <span className={styles['optionSep']}>·</span>
              <span className={styles['optionTertiary']}>{partner.bizNo}</span>
            </>
          ) : null}
        </>
      )}
      label={label}
      placeholder={placeholder}
      {...rest}
    />
  )
})

export default PartnerAutocomplete
