import { Badge } from '@samhan/design-system'
import type { FieldLockEntry, PresenceColor } from '../../realtime/createPresenceClient'

const COLOR_HEX: Record<PresenceColor, string> = {
  BLUE: '#2563EB',
  GREEN: '#15803D',
  AMBER: '#B45309',
  ROSE: '#E11D48',
  VIOLET: '#7C3AED',
  CYAN: '#0E7490',
  LIME: '#4D7C0F',
  PINK: '#DB2777',
}

function isFieldLockEntry(value: unknown): value is FieldLockEntry {
  return typeof value === 'object'
    && value !== null
    && 'fieldPath' in value
    && 'sessionId' in value
    && 'displayName' in value
    && 'color' in value
}

export interface FieldLockIndicatorProps {
  entries: FieldLockEntry[] | unknown
}

export function FieldLockIndicator({ entries }: FieldLockIndicatorProps) {
  const list = Array.isArray(entries) ? entries.filter(isFieldLockEntry) : []
  const deduped = Array.from(
    list.reduce((acc, entry) => {
      const key = `${entry.displayName}|${entry.color}`
      if (!acc.has(key)) acc.set(key, entry)
      return acc
    }, new Map<string, FieldLockEntry>()).values(),
  )
  if (deduped.length === 0) return null

  const visible = deduped.slice(0, 2)
  const hiddenCount = Math.max(deduped.length - visible.length, 0)
  const names = deduped.map((entry) => entry.displayName).join(', ')

  return (
    <span
      data-testid="field-lock-indicator"
      aria-label={`다른 사용자 편집 중 ${deduped.length}명`}
      title={`${names} 편집 중`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        minHeight: 20,
        color: 'var(--color-warning-700, #A16207)',
        fontSize: 12,
        lineHeight: 1.4,
      }}
    >
      <span
        aria-hidden="true"
        style={{ display: 'inline-flex', alignItems: 'center', marginRight: 2 }}
      >
        {visible.map((entry, index) => (
          <span
            key={`${entry.fieldPath}-${entry.sessionId}`}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: COLOR_HEX[entry.color] ?? '#64748B',
              border: '1px solid var(--color-neutral-0, #FFFFFF)',
              marginLeft: index === 0 ? 0 : -3,
              boxSizing: 'border-box',
            }}
          />
        ))}
      </span>
      <span style={{ whiteSpace: 'nowrap' }}>
        편집 중
      </span>
      <span
        style={{
          maxWidth: 120,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {visible.map((entry) => entry.displayName).join(', ')}
      </span>
      {hiddenCount > 0 ? (
        <Badge variant="neutral" aria-label={names} title={names}>
          +{hiddenCount}
        </Badge>
      ) : null}
    </span>
  )
}
