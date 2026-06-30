import React from 'react'
import type { SlipRedlineLayer } from '../../api/slipRedline'
import { presenceColorToHex } from '../../utils/presenceColor'

export interface RedlineCellProps {
  layers: SlipRedlineLayer[]
}

function formatValue(value: string | null | undefined): string {
  if (value == null || value === '') return '비움'
  return value
}

/** S2d-1 셀 인라인 레드라인. layers 는 오래된 값 → 최신 값 순서다. */
export function RedlineCell({ layers }: RedlineCellProps) {
  if (layers.length <= 1) {
    return (
      <span data-testid="redline-cell-plain" style={{ overflowWrap: 'anywhere' }}>
        {formatValue(layers[0]?.value)}
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
        style={{ color: currentColor, fontWeight: 700, overflowWrap: 'anywhere' }}
      >
        {current.actorName ? (
          <strong style={{ color: currentColor, marginRight: 6 }}>{current.actorName}</strong>
        ) : null}
        {formatValue(current.value)}
      </span>
      {reversed.slice(1).map((layer, index) => {
        const actorColor = presenceColorToHex(layer.actorColor)
        return (
          <span
            key={`${index}-${layer.changedAt ?? 'base'}-${layer.value ?? 'null'}`}
            data-testid="redline-cell-struck"
            style={{
              color: index === reversed.length - 2 ? 'var(--color-neutral-500)' : actorColor,
              textDecoration: 'line-through',
              overflowWrap: 'anywhere',
              fontSize: 12,
            }}
          >
            {layer.actorName ? (
              <strong style={{ color: actorColor, marginRight: 6 }}>{layer.actorName}</strong>
            ) : null}
            {formatValue(layer.value)}
          </span>
        )
      })}
    </span>
  )
}

export default RedlineCell
