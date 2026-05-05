/**
 * 거래처 검색 자동완성 — 견적서 작성 화면 `cardOrderInfo` 의 거래처 검색 input 1:1 (v2 §정정 16).
 *
 * <p>legacy `fillCustomer(c)` (estimate index.html line 15283) 의 동작을 React 로 옮긴다.
 * 입력 키워드 → debounce 후 `searchPartners` 호출 → suggestion list 표시 → 선택 시
 * 부모로 PartnerSummary 전달 (부모는 거래처명/거래처코드/대표/연락처/주소/그룹/메모 모두 채움).
 *
 * <p>UUID 비공개 가드 — 사용자 노출 식별자는 사업자등록번호 (= partnerCode) + 거래처명만.
 */
import { useEffect, useRef, useState } from 'react'
import { searchPartners, type PartnerSummary } from '../../api/sales'
import styles from './sales.module.css'

interface Props {
  /** 현재 input 값 (부모가 selected.companyName 또는 빈 string 으로 제어). */
  value: string
  /** input 변경 시 호출 — 아직 거래처 미선택. */
  onChangeText: (text: string) => void
  /** suggestion 선택 시 호출 — 거래처 fields 자동 채움 source. */
  onSelect: (partner: PartnerSummary) => void
  placeholder?: string
  inputId?: string
}

export function PartnerAutocomplete({
  value,
  onChangeText,
  onSelect,
  placeholder = '거래처명 또는 사업자번호로 검색…',
  inputId,
}: Props) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<PartnerSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [hi, setHi] = useState(0)
  const debounceRef = useRef<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // 외부 클릭 시 닫기.
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [])

  // value 변경 → debounce 후 fetch (legacy debounce 패턴 1:1).
  useEffect(() => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current)
    }
    if (!value || value.trim().length < 1) {
      setItems([])
      return
    }
    debounceRef.current = window.setTimeout(() => {
      setLoading(true)
      searchPartners(value, 10)
        .then((res) => {
          setItems(res)
          setOpen(res.length > 0)
          setHi(0)
        })
        .catch(() => {
          setItems([])
          setOpen(false)
        })
        .finally(() => setLoading(false))
    }, 200)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [value])

  function handleSelect(p: PartnerSummary) {
    setOpen(false)
    onSelect(p)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHi((i) => Math.min(items.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHi((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = items[hi]
      if (pick) handleSelect(pick)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} className={styles['autocompleteWrap']}>
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={(e) => onChangeText(e.target.value)}
        onFocus={() => items.length > 0 && setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        aria-label="거래처 검색"
        aria-expanded={open}
        aria-controls="partner-suggestions"
      />
      {open ? (
        <ul
          id="partner-suggestions"
          role="listbox"
          className={styles['autocompleteList']}
        >
          {loading ? (
            <li className={styles['autocompleteEmpty']}>검색 중…</li>
          ) : items.length === 0 ? (
            <li className={styles['autocompleteEmpty']}>일치하는 거래처가 없습니다</li>
          ) : (
            items.map((p, idx) => (
              <li
                key={p.businessRegistrationNumber}
                role="option"
                aria-selected={idx === hi}
                className={
                  idx === hi
                    ? styles['autocompleteItemActive']
                    : styles['autocompleteItem']
                }
                onMouseEnter={() => setHi(idx)}
                onMouseDown={(e) => {
                  // input blur 전 선택 처리.
                  e.preventDefault()
                  handleSelect(p)
                }}
              >
                <div style={{ fontWeight: 600 }}>{p.companyName}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>
                  {p.businessRegistrationNumber}
                  {p.representativeName ? ` · ${p.representativeName}` : ''}
                </div>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
