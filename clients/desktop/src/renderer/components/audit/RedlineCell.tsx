import React from 'react'
import type { SlipRedlineLayer } from '../../api/slipRedline'
import { presenceColorToHex } from '../../utils/presenceColor'

export interface RedlineCellProps {
  layers: SlipRedlineLayer[]
  format?: (value: string) => string
}

function formatValue(value: string | null | undefined, format?: (value: string) => string): string {
  if (value == null || value.trim() === '') return '비움'
  return format ? format(value) : value
}

/** S2d-1 셀 인라인 레드라인. layers 는 오래된 값 → 최신 값 순서다. */
export function RedlineCell({ layers, format }: RedlineCellProps) {
  if (layers.length <= 1) {
    return (
      <span data-testid="redline-cell-plain" style={{ overflowWrap: 'anywhere' }}>
        {formatValue(layers[0]?.value, format)}
      </span>
    )
  }

  const reversed = layers.slice().reverse()
  const current = reversed[0]!
  const currentColor = presenceColorToHex(current.actorColor)

  return (
    <span
      data-testid="redline-cell"
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        gap: 2,
        minWidth: 0,
        verticalAlign: 'top',
      }}
    >
      <span
        data-testid="redline-cell-current"
        aria-label={`현재값: ${current.actorName ? `${current.actorName}, ` : ''}${formatValue(current.value, format)}`}
        style={{ color: currentColor, fontWeight: 700, overflowWrap: 'anywhere' }}
      >
        {current.actorName ? (
          <>
            <strong style={{ color: currentColor }}>{current.actorName}</strong>
            <span aria-hidden="true" style={{ marginRight: 6 }}>: </span>
          </>
        ) : null}
        {formatValue(current.value, format)}
      </span>
      {reversed.slice(1).map((layer, index) => {
        const actorColor = presenceColorToHex(layer.actorColor)
        const isBase = index === reversed.length - 2
        return (
          <span
            key={`${index}-${layer.changedAt ?? 'base'}-${layer.value ?? 'null'}`}
            data-testid="redline-cell-struck"
            aria-label={`${isBase ? '기준값' : '이전값'}: ${layer.actorName ? `${layer.actorName}, ` : ''}${formatValue(layer.value, format)}`}
            style={{
              color: isBase ? 'var(--color-neutral-500)' : actorColor,
              textDecoration: 'line-through',
              overflowWrap: 'anywhere',
              fontSize: 12,
            }}
          >
            {layer.actorName ? (
              <>
                <strong style={{ color: actorColor }}>{layer.actorName}</strong>
                <span aria-hidden="true" style={{ marginRight: 6 }}>: </span>
              </>
            ) : null}
            {formatValue(layer.value, format)}
          </span>
        )
      })}
    </span>
  )
}

export default RedlineCell
