/**
 * AddVehicleModal — 차량 추가 modal (9 종류 carousel).
 *
 * <p>Phase A FE-5.1.
 *
 * 9 종류 grid 형태 carousel:
 *   오토바이 / 다마스 / 1톤 / 1.5톤 / 2.5톤 / 3톤 / 5톤 / 10톤 / 20톤
 *
 * 선택 → 추가 버튼 enable → `onAdd(vehicleType)` 호출 → 부모가 mutation.
 *
 * accessibility:
 * - 각 carousel 버튼 = `aria-pressed` 로 선택 상태 표시.
 * - `Modal` (design-system) 의 focus trap + ESC 닫기 + 한국어 닫기 라벨 활용.
 */
import { useState } from 'react'
import { Modal } from '@samhan/design-system'
import {
  DISPATCH_VEHICLE_TYPE_LABEL,
  DISPATCH_VEHICLE_TYPE_OPTIONS,
  type DispatchVehicleType,
} from '../../../api/dispatchTask'

interface AddVehicleModalProps {
  onClose: () => void
  onAdd: (vehicleType: DispatchVehicleType) => void
  submitting: boolean
}

export function AddVehicleModal({ onClose, onAdd, submitting }: AddVehicleModalProps) {
  const [selected, setSelected] = useState<DispatchVehicleType | null>(null)

  return (
    <Modal
      open
      onClose={onClose}
      title="차량 추가"
      description="배차에 사용할 차량 종류를 선택하세요."
      size="md"
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            data-testid="dispatch-board-add-vehicle-cancel"
            style={{
              padding: '8px 16px',
              background: 'var(--color-neutral-100)',
              color: 'var(--color-neutral-800)',
              border: '1px solid var(--color-neutral-200)',
              borderRadius: 4,
              cursor: submitting ? 'not-allowed' : 'pointer',
              fontSize: 13,
            }}
          >
            취소
          </button>
          <button
            type="button"
            disabled={!selected || submitting}
            onClick={() => selected && onAdd(selected)}
            data-testid="dispatch-board-add-vehicle-submit"
            style={{
              padding: '8px 16px',
              background: selected
                ? 'var(--color-action-brand, #1E40AF)'
                : 'var(--color-neutral-200)',
              color: selected ? 'var(--color-neutral-0)' : 'var(--color-neutral-500)',
              border: 'none',
              borderRadius: 4,
              cursor: selected && !submitting ? 'pointer' : 'not-allowed',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {submitting ? '추가하는 중…' : '추가'}
          </button>
        </div>
      }
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          padding: '8px 0',
        }}
        role="radiogroup"
        aria-label="차량 종류 선택"
      >
        {DISPATCH_VEHICLE_TYPE_OPTIONS.map((vt) => {
          const isSelected = selected === vt
          const label = DISPATCH_VEHICLE_TYPE_LABEL[vt]
          return (
            <button
              key={vt}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelected(vt)}
              data-testid={`dispatch-board-add-vehicle-option-${vt}`}
              style={{
                padding: '12px 8px',
                background: isSelected
                  ? 'var(--color-action-brandSubtle, #DBEAFE)'
                  : 'var(--color-neutral-0)',
                color: isSelected
                  ? 'var(--color-action-brand, #1E40AF)'
                  : 'var(--color-neutral-800)',
                border: isSelected
                  ? '2px solid var(--color-action-brand, #1E40AF)'
                  : '1px solid var(--color-neutral-200)',
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: isSelected ? 600 : 500,
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
