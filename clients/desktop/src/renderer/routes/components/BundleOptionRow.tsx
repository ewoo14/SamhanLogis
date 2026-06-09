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
 * 입력은 비활성화한다(상호배타).
 */
import type { BundleSetOptions } from '../../api/slip'

interface BundleOptionRowProps {
  /** 표시용 — 어떤 라인의 옵션인지 식별 (modelName 노출, UUID 미노출). */
  line: { modelName: string; setOptions: BundleSetOptions }
  index: number
  disabled?: boolean
  onChange: (patch: Partial<BundleSetOptions>) => void
}

const checkboxLabelStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 12,
  color: 'var(--ink-secondary, #4B5563)',
  cursor: 'pointer',
}

const optionInputStyle: React.CSSProperties = {
  height: 28,
  padding: '0 8px',
  border: '1px solid var(--color-neutral-300)',
  borderRadius: 4,
  fontSize: 12,
  minWidth: 160,
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
        background: '#F8FAFF',
        borderLeft: '3px solid var(--color-primary-400, #6366F1)',
        borderBottom: '1px solid #F3F4F6',
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
          color: 'var(--color-primary-600, #4F46E5)',
        }}
      >
        세트 구성 옵션 ({line.modelName || '세트'})
      </span>

      {/* 실외기 제외 */}
      <label style={checkboxLabelStyle}>
        <input
          type="checkbox"
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
            background: remoteExcluded ? '#F3F4F6' : '#fff',
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
          style={{ ...optionInputStyle, background: '#fff' }}
          data-testid={`bundle-options-${index}-panel-option`}
        />
      </label>

      {/* 판넬 360 형상 */}
      <label style={checkboxLabelStyle}>
        <input
          type="checkbox"
          checked={Boolean(o.panelShape360)}
          disabled={disabled}
          onChange={(e) => onChange({ panelShape360: e.target.checked })}
          data-testid={`bundle-options-${index}-panel-360`}
        />
        판넬 360 형상
      </label>

      {/* 자재 포함 */}
      <label style={checkboxLabelStyle}>
        <input
          type="checkbox"
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
