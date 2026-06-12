/**
 * AddVehicleModal — 차량 추가 modal (차종 12 + 톤수 10 2축).
 *
 * <p>Phase A FE-5.1.
 *
 * 차종 선택 → 유효 톤수만 동적 노출 → `onAdd({ vehicleBodyType, tonnage })` 호출.
 *
 * accessibility:
 * - 각 carousel 버튼 = `role="radio"` + `aria-checked` 로 선택 상태 표시.
 * - `Modal` (design-system) 의 focus trap + ESC 닫기 + 한국어 닫기 라벨 활용.
 */
import { useState } from 'react'
import { Modal } from '@samhan/design-system'
import {
  DISPATCH_TONNAGE_LABEL,
  DISPATCH_VEHICLE_BODY_TYPE_LABEL,
  DISPATCH_VEHICLE_TYPE_MATRIX,
  VEHICLE_BODY_TYPE_OPTIONS,
  type AddVehicleGroupPayload,
  type DispatchTonnage,
  type DispatchVehicleBodyType,
} from '../../../api/dispatchTask'

interface AddVehicleModalProps {
  onClose: () => void
  onAdd: (payload: AddVehicleGroupPayload) => void
  submitting: boolean
}

export function AddVehicleModal({ onClose, onAdd, submitting }: AddVehicleModalProps) {
  const [selectedBodyType, setSelectedBodyType] =
    useState<DispatchVehicleBodyType>('CARGO')
  const [selectedTonnage, setSelectedTonnage] = useState<DispatchTonnage>('T_1')
  const allowedTonnages = DISPATCH_VEHICLE_TYPE_MATRIX[selectedBodyType]
  const requiresTonnage = allowedTonnages.length > 0
  const canSubmit = !submitting && (!requiresTonnage || allowedTonnages.includes(selectedTonnage))

  function selectBodyType(bodyType: DispatchVehicleBodyType) {
    const currentRequiresTonnage = DISPATCH_VEHICLE_TYPE_MATRIX[selectedBodyType].length > 0
    setSelectedBodyType(bodyType)
    const nextTonnages = DISPATCH_VEHICLE_TYPE_MATRIX[bodyType]
    if (
      nextTonnages.length > 0 &&
      (!currentRequiresTonnage || !nextTonnages.includes(selectedTonnage))
    ) {
      setSelectedTonnage(nextTonnages[0] ?? 'T_1')
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="차량 추가"
      description="배차에 사용할 차종과 톤수를 선택하세요."
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
            disabled={!canSubmit}
            onClick={() =>
              onAdd({
                vehicleBodyType: selectedBodyType,
                tonnage: requiresTonnage ? selectedTonnage : null,
              })
            }
            data-testid="dispatch-board-add-vehicle-submit"
            style={{
              padding: '8px 16px',
              background: canSubmit
                ? 'var(--color-action-brand, #1E40AF)'
                : 'var(--color-neutral-200)',
              color: canSubmit ? 'var(--color-neutral-0)' : 'var(--color-neutral-500)',
              border: 'none',
              borderRadius: 4,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
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
        aria-label="차종 선택"
      >
        {VEHICLE_BODY_TYPE_OPTIONS.map((bodyType) => {
          const isSelected = selectedBodyType === bodyType
          const label = DISPATCH_VEHICLE_BODY_TYPE_LABEL[bodyType]
          return (
            <button
              key={bodyType}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => selectBodyType(bodyType)}
              data-testid={`dispatch-board-add-vehicle-body-option-${bodyType}`}
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
      {requiresTonnage ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 8,
            padding: '8px 0',
            borderTop: '1px solid var(--color-neutral-100)',
            marginTop: 8,
          }}
          role="radiogroup"
          aria-label="톤수 선택"
          data-testid="dispatch-board-add-vehicle-tonnage-options"
        >
          {allowedTonnages.map((tonnage) => {
            const isSelected = selectedTonnage === tonnage
            return (
              <button
                key={tonnage}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelectedTonnage(tonnage)}
                data-testid={`dispatch-board-add-vehicle-tonnage-option-${tonnage}`}
                style={{
                  padding: '10px 6px',
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
                  fontSize: 12,
                  fontWeight: isSelected ? 600 : 500,
                }}
              >
                {DISPATCH_TONNAGE_LABEL[tonnage]}
              </button>
            )
          })}
        </div>
      ) : null}
    </Modal>
  )
}
