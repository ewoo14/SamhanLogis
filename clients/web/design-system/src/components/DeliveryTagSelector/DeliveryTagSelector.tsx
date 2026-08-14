import { useMemo, type ChangeEvent } from 'react'
import styles from './DeliveryTagSelector.module.css'
import { FormField } from '../FormField/FormField'

/**
 * 전표 종류 (Plan §3.1 첫 슬라이스 범위 — 출고/입고 한정).
 *
 * - `OUTBOUND` 출고 — 본사/창고 → 거래처
 * - `INBOUND`  입고 — 거래처/외부 → 본사/창고
 *
 * 각 배송태그는 둘 중 한 종류에만 적용 가능하다.
 */
export type SlipDirection = 'OUTBOUND' | 'INBOUND'

/**
 * 배송태그 코드 (BE `DeliveryTag` enum 과 1:1 대응, 12종).
 *
 * 출고 (OUTBOUND, 8종):
 * - `DAY`               당일 — 당일 출고/배송 (긴급)
 * - `STACK`             야적 — 출고일 야적, 익일 상차/하차 (autoMemo)
 * - `REGION`            지방 — 지방 배송 (autoMemo)
 * - `LOGEN`             로젠택배 — 외부 택배사 위탁
 * - `GYEONGDONG_PARCEL` 경동택배 — 외부 택배사 위탁 (소형)
 * - `GYEONGDONG_FREIGHT` 경동화물 — 외부 화물사 위탁 (대형)
 * - `RENTAL`            대여 — 대여 출고
 * - `RETURN_RENTAL`     반납 — 대여품 반납 출고
 *
 * 입고 (INBOUND, 4종):
 * - `PURCHASE`     구매 — 최초 구매 입고 (기본값)
 * - `RETURN_TRIP` 회차 — 차량 회차 입고
 * - `RETURN`      반품 — 거래처 반품 입고
 * - `BORROW`      차용 — 외부 차용품 입고
 */
export type DeliveryTagCode =
  | 'DAY'
  | 'STACK'
  | 'REGION'
  | 'LOGEN'
  | 'GYEONGDONG_PARCEL'
  | 'GYEONGDONG_FREIGHT'
  | 'RETURN_TRIP'
  | 'RETURN'
  | 'BORROW'
  | 'PURCHASE'
  | 'RENTAL'
  | 'RETURN_RENTAL'

/**
 * 배송태그 옵션 — BE 가 enum 으로 관리하는 태그 메타데이터의 1건.
 * 호출자 (이용 화면) 가 BE 응답을 그대로 props 로 주입한다.
 */
export interface DeliveryTagOption {
  /** 코드 (BE enum 값과 동일). */
  code: DeliveryTagCode
  /** 한국어 표시명. */
  displayName: string
  /** 적용 가능한 전표 종류. `direction` prop 과 일치하는 옵션만 노출된다. */
  direction: SlipDirection
  /**
   * 자동 메모 여부. 야적/지방 = `true`.
   * `true` 인 경우 선택 시 옆에 자동 메모 미리보기가 inline 표시된다.
   * 형식: `{출고일} 상차 → {다음날} 하차`
   */
  autoMemo: boolean
}

export interface DeliveryTagSelectorProps {
  /**
   * 호출자가 제공하는 11개 옵션 (BE 가 enum 으로 관리).
   * `direction` 과 일치하지 않는 옵션은 자동으로 필터링된다.
   */
  options: DeliveryTagOption[]
  /** 현재 선택된 태그 (controlled). 미선택은 `null`. */
  value: DeliveryTagCode | null
  /**
   * 변경 콜백.
   * 첫 번째 인자: 새 코드 (placeholder 선택 시 `null`).
   * 두 번째 인자: 매칭된 옵션 객체 (또는 `null`).
   */
  onChange: (
    code: DeliveryTagCode | null,
    option: DeliveryTagOption | null,
  ) => void
  /**
   * 전표 종류 — 이 종류에 해당하는 옵션만 dropdown 에 노출된다.
 * 출고면 OUTBOUND 8종, 입고면 INBOUND 4종.
   */
  direction: SlipDirection
  /** 라벨 (default `"배송태그"`). */
  label?: string
  /** placeholder (default `"태그를 선택하세요"`). */
  placeholder?: string
  /** 비활성화 (수락 이후 단계에서 잠금 처리할 때 사용). */
  disabled?: boolean
  /** 에러 메시지 — FormField 빨간 outline + 메시지 표시. */
  error?: string
  /**
   * 자동 메모 미리보기용 출고일자 (ISO `yyyy-MM-dd`).
   * 야적/지방 (autoMemo=true) 태그 선택 시 옆에 미리보기가 표시된다.
   * 미제공 시 placeholder 형태 (`{출고일} 상차 → {다음날} 하차`) 로 표시.
   */
  slipDate?: string
}

/**
 * ISO `yyyy-MM-dd` 문자열을 `yyyy/MM/dd` 표시 형식으로 변환.
 * 잘못된 입력은 그대로 반환 (방어적).
 *
 * @internal — 자동 메모 미리보기 렌더링 helper.
 */
function formatSlipDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  return `${m[1]}/${m[2]}/${m[3]}`
}

/**
 * ISO `yyyy-MM-dd` 의 다음 날을 같은 표시 형식으로 반환.
 * 월/연 경계도 `Date` 가 자동 처리.
 *
 * @internal — 자동 메모 미리보기의 "하차" 일자 계산.
 */
function nextDay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  d.setDate(d.getDate() + 1)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}/${mm}/${dd}`
}

/**
 * 자동 메모 텍스트 빌드.
 * `slipDate` 가 있으면 실제 일자가 들어간 메모, 없으면 placeholder 형태.
 *
 * @internal — preview 렌더링 helper.
 */
function buildAutoMemoText(slipDate?: string): string {
  if (!slipDate) return '{출고일} 상차 → {다음날} 하차'
  return `${formatSlipDate(slipDate)} 상차 → ${nextDay(slipDate)} 하차`
}

/**
 * DeliveryTagSelector — 12종 배송태그 single-select dropdown.
 *
 * 전표 종류 (`direction`) 에 따라 옵션이 자동 필터링된다.
 * 자동 메모 태그 (야적/지방) 선택 시 옆에 inline 미리보기가 표시되며,
 * `slipDate` 가 제공되면 실제 일자로, 미제공 시 placeholder 형태로 노출된다.
 *
 * 선택값은 controlled (`value` + `onChange`) 로만 다루며 내부 state 미보유.
 *
 * @example
 * ```tsx
 * <DeliveryTagSelector
 *   options={tagOptions}
 *   value={tag}
 *   onChange={(code) => setTag(code)}
 *   direction="OUTBOUND"
 *   slipDate="2026-05-04"
 * />
 * ```
 */
export function DeliveryTagSelector({
  options,
  value,
  onChange,
  direction,
  label = '배송태그',
  placeholder = '태그를 선택하세요',
  disabled = false,
  error,
  slipDate,
}: DeliveryTagSelectorProps) {
  /**
   * `direction` 으로 필터링된 표시 옵션 목록.
   * useMemo 로 props 변경 시에만 재계산.
   */
  const visibleOptions = useMemo(
    () => options.filter((o) => o.direction === direction),
    [options, direction],
  )

  /** 현재 선택된 옵션 객체. value 가 null 또는 미존재 코드면 undefined. */
  const selected = useMemo(
    () => options.find((o) => o.code === value),
    [options, value],
  )

  /**
   * native select 의 change 이벤트를 도메인 콜백으로 변환.
   * 빈 문자열(placeholder 선택) 시 `(null, null)` 로 호출.
   */
  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const nextCode = e.target.value as DeliveryTagCode | ''
    if (!nextCode) {
      onChange(null, null)
      return
    }
    const next = options.find((o) => o.code === nextCode) ?? null
    onChange(nextCode, next)
  }

  return (
    <FormField
      label={label}
      error={error}
      render={({ id, ariaDescribedBy, invalid }) => (
        <div className={styles['row']}>
          <select
            id={id}
            className={[
              styles['select'],
              invalid ? styles['hasError'] : null,
            ]
              .filter(Boolean)
              .join(' ')}
            value={value ?? ''}
            onChange={handleChange}
            disabled={disabled}
            aria-invalid={invalid || undefined}
            aria-describedby={ariaDescribedBy}
          >
            <option value="">{placeholder}</option>
            {visibleOptions.map((o) => (
              <option key={o.code} value={o.code}>
                {o.displayName}
                {o.autoMemo ? ' (자동 메모)' : ''}
              </option>
            ))}
          </select>
          {selected?.autoMemo ? (
            <span
              className={styles['autoMemoPreview']}
              role="note"
              aria-label="자동 메모 미리보기"
            >
              <span className={styles['autoMemoIcon']} aria-hidden="true">
                📝
              </span>
              <span className={styles['autoMemoLabel']}>자동 메모:</span>
              <span className={styles['autoMemoText']}>
                {buildAutoMemoText(slipDate)}
              </span>
            </span>
          ) : null}
        </div>
      )}
    />
  )
}

export default DeliveryTagSelector
