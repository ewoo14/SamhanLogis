import { useMemo, type ChangeEvent } from 'react'
import styles from './WarehouseSelector.module.css'
import { FormField } from '../FormField/FormField'
import { Badge } from '../Badge/Badge'

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
  /** 활성/비활성 여부. 비활성은 dropdown 에서 회색 처리 + disabled. */
  active: boolean
}

export interface WarehouseSelectorProps {
  /** 선택 가능한 창고 목록 (BE `/inventory/warehouses` 응답). */
  warehouses: Warehouse[]
  /** 현재 선택된 창고 ID (controlled). 미선택은 `null`. */
  value: string | null
  /** 선택 변경 콜백. 두 번째 인자로 선택된 창고 객체 전달. */
  onChange: (warehouseId: string, warehouse: Warehouse) => void
  /** 라벨 (default: "창고"). */
  label?: string
  /** placeholder (default: "창고를 선택하세요"). */
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
}

/**
 * WarehouseType 별 한국어 표시명.
 *
 * @internal — 옵션 라벨 보강용. 외부 export 하지 않음.
 */
const TYPE_LABEL: Record<WarehouseType, string> = {
  HEADQUARTERS: '본사',
  VEHICLE: '차량',
  CONSIGNMENT: '위탁',
  VIRTUAL: '가상',
}

/**
 * WarehouseSelector — 창고 선택 dropdown 컴포넌트.
 *
 * 4-tier 창고 모델 (HEADQUARTERS / VEHICLE / CONSIGNMENT / VIRTUAL) 을 한 번에 다루며,
 * VIRTUAL 창고는 우측에 "가상" Badge 로 구분 표시한다.
 * 출고/이동 화면처럼 가상창고를 노출하면 안 되는 컨텍스트에서는
 * `hideVirtual={true}` 로 옵션 자체에서 제외할 수 있다.
 *
 * - 비활성 창고(`active: false`) 는 옵션이 disabled + 회색 처리되어 선택 불가.
 * - `FormField` 와 통합되어 라벨/에러/required 표시를 일관되게 처리.
 * - 선택값은 controlled (`value` + `onChange`) 로만 다루며 내부 state 미보유.
 *
 * @deprecated 모든 창고 선택 UI 가 {@link WarehouseAutocomplete}(타이핑 검색 combobox)로 일원화됨
 *   (2026-06-03). 신규 사용 금지 — `WarehouseAutocomplete` 를 사용할 것. 본 컴포넌트는
 *   `Warehouse`/`WarehouseType` 타입 export 호환을 위해 유지된다(JSX 사용처 0).
 */
export function WarehouseSelector({
  warehouses,
  value,
  onChange,
  label = '창고',
  placeholder = '창고를 선택하세요',
  hideVirtual = false,
  disabled = false,
  error,
  required = false,
}: WarehouseSelectorProps) {
  /**
   * `hideVirtual` 적용 후 표시될 옵션 목록.
   * useMemo 로 props 변경 시에만 재계산.
   */
  const visibleWarehouses = useMemo(
    () => (hideVirtual ? warehouses.filter((w) => w.type !== 'VIRTUAL') : warehouses),
    [warehouses, hideVirtual],
  )

  /** 현재 선택된 창고 객체. value 가 null 또는 미존재 ID 면 undefined. */
  const selected = useMemo(
    () => warehouses.find((w) => w.id === value),
    [warehouses, value],
  )

  /**
   * native select 의 change 이벤트를 도메인 콜백으로 변환.
   * 빈 문자열(placeholder 선택) 또는 매칭 실패 시 콜백 호출하지 않는다.
   */
  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const nextId = e.target.value
    if (!nextId) return
    const next = warehouses.find((w) => w.id === nextId)
    if (next) onChange(nextId, next)
  }

  return (
    <FormField
      label={label}
      error={error}
      required={required}
      render={({ id, ariaDescribedBy, invalid, required: req }) => (
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
            aria-required={req || undefined}
            required={req}
          >
            <option value="" disabled>
              {placeholder}
            </option>
            {visibleWarehouses.map((w) => (
              <option
                key={w.id}
                value={w.id}
                disabled={!w.active}
                className={!w.active ? styles['optionInactive'] : undefined}
              >
                {`${w.code} · ${w.name} (${TYPE_LABEL[w.type]})`}
                {w.active ? '' : ' — 비활성'}
              </option>
            ))}
          </select>
          {selected?.type === 'VIRTUAL' ? (
            <span className={styles['badgeSlot']}>
              <Badge variant="warning">가상</Badge>
            </span>
          ) : null}
        </div>
      )}
    />
  )
}

export default WarehouseSelector
