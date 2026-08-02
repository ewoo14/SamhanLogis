import { TagChip } from '@samhan/design-system'
import { MODEL_CHIPS, type ModelChip } from './inoutAnalysisModel'

interface InOutModelChipFilterProps {
  selected: ReadonlySet<ModelChip>
  counts: Readonly<Record<ModelChip, number>>
  totalCount: number
  onToggle: (chip: ModelChip) => void
  onClear: () => void
}

/** 입출고 내역 모델 분류 복수 선택 UI. 선택하지 않으면 전체 범위를 유지한다. */
export function InOutModelChipFilter({
  selected,
  counts,
  totalCount,
  onToggle,
  onClear,
}: InOutModelChipFilterProps) {
  return (
    <div aria-label="모델별 필터" data-testid="inout-model-chip-filter" style={containerStyle}>
      <TagChip
        value={`전체 (${totalCount})`}
        onClick={onClear}
        role="button"
        tabIndex={0}
        aria-pressed={selected.size === 0}
        data-testid="inout-model-chip-all"
      />
      {MODEL_CHIPS.map((chip) => (
        <TagChip
          key={chip}
          value={`${chip} (${counts[chip]})`}
          onClick={() => onToggle(chip)}
          role="button"
          tabIndex={0}
          aria-pressed={selected.has(chip)}
          data-testid={`inout-model-chip-${chip}`}
        />
      ))}
    </div>
  )
}

const containerStyle = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: 8,
  alignItems: 'center',
}
