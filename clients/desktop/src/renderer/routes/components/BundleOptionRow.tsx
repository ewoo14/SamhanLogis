/**
 * 세트(BUNDLE) 품목 라인 전개 옵션 입력 행 — PR-3b.
 *
 * <p>종합견적서 GAS 의 옵션 선택(실외기 교체/제외, 판넬 선택/360 형상, 자재 포함)을
 * 그대로 입력받아 BE `BundleSetOptions` 로 전달한다. BE BundleExpander 가 6:4 재분배 +
 * 옵션 필터링으로 구성품 라인을 전개하므로, 이 행은 "전개 전 선택"만 담당한다.
 *
 * <p>견적서(EstimateFormPage)·출고전표(SlipFormPage)·판매전표(SalesAccountingSlipFormPage)
 * 세 화면에서 공용. modelName lookup 결과 productType === "BUNDLE" 인 라인 아래에만 렌더.
 *
 * <p>옵션 modelCode 는 자유 입력(빈 값 → BE 기본값 사용). 실외기 제외 체크 시 교체 모델
 * 입력은 비활성화한다(상호배타). 판넬 360 형상은 BE 가 variant(`원형`/`사각`)와 정확 일치로
 * 매칭하므로 **문자열 선택**(미지정/원형/사각)으로 입력받는다(boolean 아님).
 */
import type { BundleSetOptions } from '../../api/slip'

interface BundleOptionRowProps {
  /** 표시용 — 어떤 라인의 옵션인지 식별 (modelName 노출, UUID 미노출). */
  line: { modelName: string; setOptions: BundleSetOptions }
  index: number
  disabled?: boolean
  onChange: (patch: Partial<BundleSetOptions>) => void
}

/** 판넬 360 형상 선택지 — BE BundleExpander variant 정확 매칭값. */
const PANEL_SHAPE_OPTIONS: Array<{ value: string; label: string }> = [
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

const accentStyle: React.CSSProperties = { accentColor: 'var(--action-brand, #2D77A8)' }

const optionInputStyle: React.CSSProperties = {
  height: 28,
  padding: '0 8px',
  border: '1px solid var(--color-neutral-300)',
  borderRadius: 4,
  fontSize: 12,
  minWidth: 160,
  background: 'var(--surface-card, #fff)',
}

export function BundleOptionRow({
  line,
  index,
  disabled,
  onChange,
}: BundleOptionRowProps) {
  const o = line.setOptions
  const remoteExcluded = Boolean(o.remoteExcluded)
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
      <span
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--color-brand-600, #2D77A8)',
        }}
      >
        세트 구성 옵션 ({line.modelName || '세트'})
      </span>

      {/* 실외기 제외 */}
      <label style={checkboxLabelStyle}>
        <input
          type="checkbox"
          style={accentStyle}
          checked={remoteExcluded}
          disabled={disabled}
          onChange={(e) => onChange({ remoteExcluded: e.target.checked })}
          data-testid={`bundle-options-${index}-remote-excluded`}
        />
        실외기 제외
      </label>

      {/* 실외기 교체 모델 — 제외 시 비활성 */}
      <label style={checkboxLabelStyle}>
        실외기 교체
        <input
          type="text"
          value={o.remoteOption ?? ''}
          placeholder="교체 모델코드 (미입력=기본)"
          disabled={disabled || remoteExcluded}
          onChange={(e) => onChange({ remoteOption: e.target.value })}
          style={{
            ...optionInputStyle,
            background: remoteExcluded
              ? 'var(--color-neutral-200, #F3F4F6)'
              : 'var(--surface-card, #fff)',
          }}
          data-testid={`bundle-options-${index}-remote-option`}
        />
      </label>

      {/* 판넬 선택 모델 */}
      <label style={checkboxLabelStyle}>
        판넬 선택
        <input
          type="text"
          value={o.panelOption ?? ''}
          placeholder="판넬 모델코드 (미입력=기본)"
          disabled={disabled}
          onChange={(e) => onChange({ panelOption: e.target.value })}
          style={optionInputStyle}
          data-testid={`bundle-options-${index}-panel-option`}
        />
      </label>

      {/* 판넬 360 형상 (문자열 선택 — BE variant 정확 매칭) */}
      <label style={checkboxLabelStyle}>
        판넬 360 형상
        <select
          value={o.panelShape360 ?? ''}
          disabled={disabled}
          onChange={(e) => onChange({ panelShape360: e.target.value })}
          style={{ ...optionInputStyle, minWidth: 90 }}
          data-testid={`bundle-options-${index}-panel-360`}
        >
          {PANEL_SHAPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      {/* 자재 포함 */}
      <label style={checkboxLabelStyle}>
        <input
          type="checkbox"
          style={accentStyle}
          checked={Boolean(o.materialIncluded)}
          disabled={disabled}
          onChange={(e) => onChange({ materialIncluded: e.target.checked })}
          data-testid={`bundle-options-${index}-material-included`}
        />
        자재 포함
      </label>
    </div>
  )
}
