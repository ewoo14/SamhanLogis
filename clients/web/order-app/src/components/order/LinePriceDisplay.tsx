/**
 * 라인 가격 표시 — 출고가 + DC% + 옵션 가산 + 최종가.
 *
 * <p>정정 #12: 사업자번호 입장 시 DC율 자동 적용된 가격 표시.
 *
 * <p>레이아웃 (단일 cell 내):
 * <pre>
 *   ₩2,400,000 (취소선, 작은 회색)   ← 출고가 (releasePrice)
 *   DC -46%   +₩70,000 (option)      ← 적용된 DC + 옵션 가산
 *   ₩1,366,000 (굵은 검정, 큰 글씨)  ← 최종가 (finalPrice)
 * </pre>
 *
 * <p>DC 미적용 (config = null 또는 SINGLE_SET / LEGACY) 인 경우:
 * - 출고가 = 최종가 → 단순 ₩2,400,000 만 표시
 *
 * <p>접근성: dcRate 와 옵션 가산을 aria-label 에 함께 노출.
 */
import { calcLineFinalPrice, formatDcRate } from '../../utils/calcDcPrice'
import type { EstimateCategory, LineOption, PartnerDcConfig } from '../../types'

interface Props {
  releasePrice: number
  category: EstimateCategory
  options?: LineOption[]
  config?: PartnerDcConfig | null
  /** 수량 곱 (소계 표기 모드). 미지정 시 단가만. */
  qty?: number
  /** 단가 모드 (출고가/DC/최종 모두) — qty 가 있어도 단가만 보고 싶을 때. */
  compact?: boolean
}

export function LinePriceDisplay({ releasePrice, category, options, config, qty, compact }: Props) {
  const breakdown = calcLineFinalPrice({ releasePrice, category, options, config: config ?? null })
  const hasDc = breakdown.dcRate > 0
  const hasOpt = breakdown.optionAdd !== 0

  const factor = qty && qty > 0 ? qty : 1
  const finalSubtotal = breakdown.finalPrice * factor
  const releaseSubtotal = breakdown.releasePrice * factor

  if (!hasDc && !hasOpt) {
    // DC 미적용 — 단순 표시
    return (
      <span aria-label={`${finalSubtotal.toLocaleString()} 원`}>
        {finalSubtotal.toLocaleString()}
      </span>
    )
  }

  const ariaLabel = `출고가 ${releaseSubtotal.toLocaleString()} 원, ${
    hasDc ? `DC ${Math.round(breakdown.dcRate * 100)}% 적용,` : ''
  }${hasOpt ? ` 옵션 가산 ${breakdown.optionAdd.toLocaleString()} 원,` : ''} 최종가 ${finalSubtotal.toLocaleString()} 원`

  return (
    <span className="line-price" aria-label={ariaLabel}>
      <span
        className="line-price-release"
        style={{
          display: 'block',
          fontSize: 11,
          color: 'var(--c-muted)',
          textDecoration: hasDc ? 'line-through' : 'none',
          lineHeight: 1.2,
        }}
      >
        {releaseSubtotal.toLocaleString()}
      </span>
      {(hasDc || hasOpt) && (
        <span
          className="line-price-dc"
          style={{
            display: 'block',
            fontSize: 10,
            color: hasDc ? '#dc2626' : '#059669',
            fontWeight: 600,
            lineHeight: 1.2,
          }}
        >
          {hasDc && <>DC {formatDcRate(breakdown.dcRate)}</>}
          {hasDc && hasOpt && ' '}
          {hasOpt && (
            <span style={{ color: breakdown.optionAdd > 0 ? '#059669' : '#dc2626' }}>
              {breakdown.optionAdd > 0 ? '+' : ''}
              {(breakdown.optionAdd * factor).toLocaleString()}
            </span>
          )}
        </span>
      )}
      <span
        className="line-price-final"
        style={{
          display: 'block',
          fontSize: compact ? 12 : 14,
          fontWeight: 700,
          color: '#0f172a',
          lineHeight: 1.3,
        }}
      >
        {finalSubtotal.toLocaleString()}
      </span>
    </span>
  )
}
