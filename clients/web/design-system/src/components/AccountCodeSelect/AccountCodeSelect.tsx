import {
  forwardRef,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
} from 'react'
import styles from './AccountCodeSelect.module.css'

/**
 * 회계 표준 계정과목 단건 (한국 일반기업회계기준).
 *
 * 카테고리 분류 (BE 시드와 동일):
 * - `100` 자산 (현금성/매출채권/재고)
 * - `200` 부채 (매입채무/예수금/차입금)
 * - `300` 자본
 * - `400` 매출
 * - `500` 매출원가
 * - `800` 판매관리비 (인건비/지급수수료/광고선전비/...)
 * - `900` 영업외 (이자수익/이자비용)
 *
 * `code` 는 4자리 숫자, `name` 은 한국어 라벨, `category` 는 1~3자리 prefix.
 */
export interface Account {
  /** 4자리 코드. 예: `1010` 보통예금. */
  code: string
  /** 한국어 표시명. 예: `보통예금`. */
  name: string
  /** 카테고리 prefix (`100` / `200` / `300` / `400` / `500` / `800` / `900`). */
  category: string
  /** 정찰 보고서가 직접 확인한 이카운트 정본 코드. 미정/미확인 계정은 null. */
  ecountCode?: string | null
  /** 백엔드의 정본 판정 상태. */
  mappingStatus?: 'MAPPED' | 'UNDETERMINED' | 'UNMAPPED'
  /** 화면 표시용 정본 상태 또는 이카운트 코드. */
  mappingLabel?: string
}

export interface AccountCodeSelectProps {
  /** 현재 선택된 계정 코드. 미선택은 빈 문자열. */
  value: string
  /** 코드 변경 시 호출. (사용자 검색 후 항목 click / Enter / blur match) */
  onChange: (next: string) => void
  /** 선택지 — 보통 마스터 listAccounts() 응답을 그대로 전달. */
  accounts: Account[]
  /** 카테고리 prefix 필터 (예: `'800'` → 판매관리비만). 미지정 시 전체. */
  category?: string
  /** 필수 여부 — 빈 입력 + blur 시 에러 표시 트리거. */
  required?: boolean
  /** 외부에서 주입되는 에러 메시지 (예: "필수 항목"). */
  error?: string
  /** 비활성화 — POSTED 분개 셀. */
  disabled?: boolean
  /** placeholder. 기본 "계정과목 검색...". */
  placeholder?: string
  className?: string
  ariaLabel?: string
}

/**
 * 입력 문자열 → 계정 후보 검색.
 * 코드 prefix match (가장 우선) → name 부분일치.
 */
const searchAccounts = (
  accounts: Account[],
  query: string,
  category?: string,
): Account[] => {
  const filtered = category
    ? accounts.filter((a) => a.category === category)
    : accounts

  const trimmed = query.trim()
  if (!trimmed) return filtered.slice(0, 30)

  const lower = trimmed.toLowerCase()
  // 1차: code prefix
  const byCode = filtered.filter((a) =>
    a.code.toLowerCase().startsWith(lower),
  )
  // 2차: name 부분일치 (이미 1차에 포함된 항목 제외)
  const codeSet = new Set(byCode.map((a) => a.code))
  const byName = filtered.filter(
    (a) => !codeSet.has(a.code) && a.name.toLowerCase().includes(lower),
  )
  return [...byCode, ...byName].slice(0, 30)
}

/** 카테고리 코드 → 한국어 그룹명 (트리 렌더링용). */
const categoryLabel = (code: string): string => {
  switch (code) {
    case '100':
      return '자산'
    case '200':
      return '부채'
    case '300':
      return '자본'
    case '400':
      return '매출'
    case '500':
      return '매출원가'
    case '800':
      return '판매관리비'
    case '900':
      return '영업외'
    default:
      return code
  }
}

/**
 * AccountCodeSelect — 계정과목 검색 가능 select (autocomplete + 트리 표시).
 *
 * 동작:
 * - input 에 코드 / 이름 일부 타이핑 → 매칭되는 후보 dropdown
 * - 후보 항목은 카테고리 그룹 헤더로 묶여 트리 형태로 표시
 * - 항목 click / Enter / blur 시 정확 매칭이면 onChange(code)
 * - blur 시 매칭 실패면 입력값 비우고 onChange("") (free-text 입력 차단)
 *
 * UUID 비공개 가드: account 의 외부 키는 4자리 `code` 만 사용. 화면에는 코드와
 * 이름만 노출되며, BE PK UUID 는 본 컴포넌트가 인식하지 않는다.
 *
 * @example
 * ```tsx
 * <AccountCodeSelect
 *   value={accountCode}
 *   onChange={setAccountCode}
 *   accounts={accounts}
 *   category="800"  // 판매관리비만
 *   required
 * />
 * ```
 */
export const AccountCodeSelect = forwardRef<
  HTMLInputElement,
  AccountCodeSelectProps
>(function AccountCodeSelect(
  {
    value,
    onChange,
    accounts,
    category,
    required = false,
    error,
    disabled = false,
    placeholder = '계정과목 검색...',
    className,
    ariaLabel,
  },
  ref,
) {
  const reactId = useId()
  const fieldId = `ds-acct-${reactId}`
  const errorId = error ? `${fieldId}-error` : undefined

  // 현재 선택된 계정의 표시 레이블 ("1010 보통예금")
  const selectedLabel = useMemo(() => {
    if (!value) return ''
    const found = accounts.find((a) => a.code === value)
    return found ? `${found.code} ${found.name}` : value
  }, [value, accounts])

  // 사용자 input 임시 값 (포커스 중 + 검색 중)
  const [draft, setDraft] = useState<string>('')
  const [open, setOpen] = useState(false)
  const blurTimer = useRef<number | undefined>(undefined)

  const candidates = useMemo(
    () => searchAccounts(accounts, draft, category),
    [accounts, draft, category],
  )

  // 카테고리별 그룹화 (트리 렌더링)
  const grouped = useMemo(() => {
    const map = new Map<string, Account[]>()
    for (const a of candidates) {
      const list = map.get(a.category) ?? []
      list.push(a)
      map.set(a.category, list)
    }
    return Array.from(map.entries())
  }, [candidates])

  const handleFocus = () => {
    if (disabled) return
    if (blurTimer.current) {
      window.clearTimeout(blurTimer.current)
      blurTimer.current = undefined
    }
    setDraft(selectedLabel)
    setOpen(true)
  }

  const handleBlur = (_e: FocusEvent<HTMLInputElement>) => {
    // 항목 click 이벤트가 먼저 발생하도록 약간의 지연
    blurTimer.current = window.setTimeout(() => {
      setOpen(false)
      // blur 시 매칭 검사 — 입력값을 코드/이름으로 매칭
      const trimmed = draft.trim()
      if (!trimmed) {
        if (value) onChange('')
        return
      }
      const exact = accounts.find(
        (a) =>
          `${a.code} ${a.name}` === trimmed
          || a.code === trimmed,
      )
      if (exact) {
        if (exact.code !== value) onChange(exact.code)
      } else {
        // 매칭 실패 — 기존 값 복원 (free-text 입력 차단)
        setDraft(selectedLabel)
      }
    }, 120)
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value)
    if (!open) setOpen(true)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing && ['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) return
    if (e.key === 'Enter' && candidates.length > 0) {
      e.preventDefault()
      const first = candidates[0]!
      pick(first)
    } else if (e.key === 'Escape') {
      setOpen(false)
      setDraft(selectedLabel)
    }
  }

  const pick = (a: Account) => {
    onChange(a.code)
    setDraft(`${a.code} ${a.name}`)
    setOpen(false)
  }

  const wrapperClasses = [styles['wrapper'], className]
    .filter(Boolean)
    .join(' ')

  const fieldClasses = [
    styles['field'],
    disabled ? styles['disabled'] : null,
    error ? styles['hasError'] : null,
  ]
    .filter(Boolean)
    .join(' ')

  // 표시값 — 포커스 중에는 draft, 그 외엔 selectedLabel
  const displayValue = open ? draft : selectedLabel

  return (
    <div className={wrapperClasses}>
      <div className={fieldClasses}>
        <input
          ref={ref}
          id={fieldId}
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
          required={required}
          aria-label={ariaLabel ?? '계정과목'}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          aria-autocomplete="list"
          aria-expanded={open}
          role="combobox"
        />
      </div>
      {open && grouped.length > 0 ? (
        <ul className={styles['dropdown']} role="listbox">
          {grouped.map(([cat, list]) => (
            <li key={cat} className={styles['group']}>
              <div className={styles['groupHeader']} aria-hidden="true">
                {categoryLabel(cat)} ({cat})
              </div>
              <ul className={styles['groupList']}>
                {list.map((a) => (
                  <li
                    key={a.code}
                    className={
                      a.code === value
                        ? `${styles['option']} ${styles['optionSelected']}`
                        : styles['option']
                    }
                    role="option"
                    aria-selected={a.code === value}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pick(a)
                    }}
                  >
                    <span className={styles['optionCode']}>{a.code}</span>
                    <span className={styles['optionName']}>{a.name}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}
      {open && grouped.length === 0 ? (
        <div className={styles['empty']}>일치하는 계정이 없습니다.</div>
      ) : null}
      {error ? (
        <span id={errorId} className={styles['error']} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
})

export default AccountCodeSelect
