import type { CSSProperties } from 'react'
import { Button } from '@samhan/design-system'

export interface FilterChip {
  key: string
  label: string
  value: string
  onRemove: () => void
}

export interface FilterChipBarProps {
  filters: FilterChip[]
  onResetAll: () => void
}

export function FilterChipBar({ filters, onResetAll }: FilterChipBarProps) {
  if (filters.length === 0) return null

  return (
    <div style={barStyle} aria-label="적용된 필터" data-testid="filter-chip-bar">
      <div style={chipListStyle}>
        {filters.map((filter) => (
          <span key={filter.key} style={chipStyle} data-testid={`filter-chip-${filter.key}`}>
            <span style={labelStyle}>{filter.label}:</span>
            <span style={valueStyle}>{filter.value}</span>
            <button
              type="button"
              aria-label={`${filter.label} 필터 제거`}
              title={`${filter.label} 필터 제거`}
              onClick={filter.onRemove}
              style={removeButtonStyle}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path
                  d="M3 3l6 6M9 3L3 9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </span>
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={onResetAll}>
        전체 초기화
      </Button>
    </div>
  )
}

const barStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 10,
  flexWrap: 'wrap',
  padding: '10px 12px',
  border: '1px solid var(--line-default)',
  borderRadius: 6,
  background: 'var(--surface-card)',
  fontFamily: 'Pretendard, var(--font-family-sans, system-ui, sans-serif)',
}

const chipListStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  flexWrap: 'wrap',
}

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  minHeight: 28,
  padding: '3px 6px 3px 10px',
  border: '1px solid var(--color-brand-200)',
  borderRadius: 999,
  background: 'var(--color-brand-50)',
  color: 'var(--ink-primary)',
  fontSize: 12,
  lineHeight: 1.4,
}

const labelStyle: CSSProperties = {
  color: 'var(--ink-secondary)',
  fontWeight: 600,
}

const valueStyle: CSSProperties = {
  maxWidth: 220,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontWeight: 600,
}

const removeButtonStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  marginLeft: 2,
  border: 'none',
  borderRadius: 10,
  background: 'transparent',
  color: 'var(--color-brand-700)',
  cursor: 'pointer',
  padding: 0,
}
