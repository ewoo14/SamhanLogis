import type { BundleSetOptions } from '../../api/slip'

interface BundleOptionRowProps {
  line: { modelName: string; setOptions: BundleSetOptions }
  index: number
  disabled?: boolean
  onChange: (patch: Partial<BundleSetOptions>) => void
}

const PANEL_SHAPE_OPTIONS = [
  { value: '', label: '미지정' },
  { value: '원형', label: '원형' },
  { value: '사각', label: '사각' },
]

const checkboxLabelStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: 'var(--ink-secondary, #5C6773)',
  cursor: 'pointer',
}

const optionInputStyle: React.CSSProperties = {
  height: 28,
  padding: '0 8px',
  border: '1px solid var(--color-neutral-300)',
  borderRadius: 4,
  fontSize: 12,
  minWidth: 160,
  background: 'var(--surface-card, #fff)',
}

/** BUNDLE 라인의 전개 전 옵션을 견적·전표 화면에서 동일한 계약으로 편집한다. */
export function BundleOptionRow({ line, index, disabled, onChange }: BundleOptionRowProps) {
  const options = line.setOptions
  const remoteExcluded = Boolean(options.remoteExcluded)
  return (
    <div
      data-testid={`bundle-options-${index}`}
      style={{
        padding: '8px 12px 12px 44px',
        marginBottom: 4,
        background: 'var(--color-bg-subtle, #F8FAFF)',
        borderLeft: '3px solid var(--color-brand-400, #5BA3C9)',
        borderBottom: '1px solid var(--color-neutral-200, #F3F4F6)',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 16,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-brand-600, #2D77A8)' }}>
        세트 구성 옵션 ({line.modelName || '세트'})
      </span>
      <label style={checkboxLabelStyle}>
        <input
          type="checkbox"
          checked={remoteExcluded}
          disabled={disabled}
          onChange={(event) => onChange({ remoteExcluded: event.target.checked })}
          data-testid={`bundle-options-${index}-remote-excluded`}
        />
        실외기 제외
      </label>
      <label style={checkboxLabelStyle}>
        실외기 교체
        <input
          type="text"
          value={options.remoteOption ?? ''}
          placeholder="교체 모델코드 (미입력=기본)"
          disabled={disabled || remoteExcluded}
          onChange={(event) => onChange({ remoteOption: event.target.value })}
          style={{ ...optionInputStyle, background: remoteExcluded ? 'var(--color-neutral-200, #F3F4F6)' : 'var(--surface-card, #fff)' }}
          data-testid={`bundle-options-${index}-remote-option`}
        />
      </label>
      <label style={checkboxLabelStyle}>
        판넬 선택
        <input
          type="text"
          value={options.panelOption ?? ''}
          placeholder="판넬 모델코드 (미입력=기본)"
          disabled={disabled}
          onChange={(event) => onChange({ panelOption: event.target.value })}
          style={optionInputStyle}
          data-testid={`bundle-options-${index}-panel-option`}
        />
      </label>
      <label style={checkboxLabelStyle}>
        판넬 360 형상
        <select
          value={options.panelShape360 ?? ''}
          disabled={disabled}
          onChange={(event) => onChange({ panelShape360: event.target.value })}
          style={{ ...optionInputStyle, minWidth: 90 }}
          data-testid={`bundle-options-${index}-panel-360`}
        >
          {PANEL_SHAPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label style={checkboxLabelStyle}>
        <input
          type="checkbox"
          checked={Boolean(options.materialIncluded)}
          disabled={disabled}
          onChange={(event) => onChange({ materialIncluded: event.target.checked })}
          data-testid={`bundle-options-${index}-material-included`}
        />
        자재 포함
      </label>
    </div>
  )
}
