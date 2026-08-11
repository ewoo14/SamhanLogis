import { Badge, safeActorName } from '@samhan/design-system'
import type { PresenceColor, PresenceEntry } from '../../realtime/createPresenceClient'
import { presenceColorToHex } from '../../utils/presenceColor'

function isPresenceEntry(value: unknown): value is PresenceEntry {
  return typeof value === 'object'
    && value !== null
    && 'sessionId' in value
    && 'displayName' in value
    && 'color' in value
}

export interface PresenceIndicatorProps {
  entries: PresenceEntry[] | unknown
  size?: 'md' | 'lg'
}

const PRESENCE_INDICATOR_SIZE = {
  md: {
    gap: 8,
    labelFontSize: 12,
    chipGap: 6,
    chipPadding: '2px 8px',
    chipFontSize: 12,
    dotSize: 8,
    maxWidth: 200,
  },
  lg: {
    gap: 10,
    labelFontSize: 14,
    chipGap: 8,
    chipPadding: '4px 10px',
    chipFontSize: 14,
    dotSize: 10,
    maxWidth: 240,
  },
} as const

export function PresenceIndicator({ entries, size = 'md' }: PresenceIndicatorProps) {
  const sizeStyle = PRESENCE_INDICATOR_SIZE[size]
  const list = Array.isArray(entries) ? entries.filter(isPresenceEntry) : []
  const deduped = Array.from(
    list.reduce((acc, entry) => {
      const key = `${entry.displayName}|${entry.color}`
      if (!acc.has(key)) acc.set(key, entry)
      return acc
    }, new Map<string, PresenceEntry>()).values(),
  )
  const visible = deduped.slice(0, 3)
  const hiddenCount = Math.max(deduped.length - visible.length, 0)
  const displayEntryName = (entry: PresenceEntry): string =>
    safeActorName(entry.displayName) ?? '변경자 미상'
  const hiddenNames = deduped.slice(3).map(displayEntryName).join(', ')
  if (deduped.length === 0) return null

  return (
    <div
      data-testid="presence-indicator"
      aria-label={`현재 보고 있음 ${deduped.length}명`}
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: sizeStyle.gap,
        rowGap: sizeStyle.chipGap,
        maxWidth: '100%',
        minWidth: 0,
      }}
    >
      <span
        style={{
          color: 'var(--color-neutral-500, #64748B)',
          fontSize: sizeStyle.labelFontSize,
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        현재 보는 중:
      </span>
      {visible.map((entry) => (
        <span
          key={entry.sessionId}
          title={`${displayEntryName(entry)} 현재 보고 있음`}
          aria-label={`${displayEntryName(entry)} 현재 보고 있음`}
          style={{
            borderRadius: 999,
            display: 'inline-flex',
            alignItems: 'center',
            gap: sizeStyle.chipGap,
            padding: sizeStyle.chipPadding,
            border: '1px solid var(--color-neutral-200, #E2E8F0)',
            background: 'var(--color-neutral-50, #F8FAFC)',
            color: 'var(--color-neutral-900, #0F172A)',
            fontSize: sizeStyle.chipFontSize,
            lineHeight: 1.5,
            maxWidth: sizeStyle.maxWidth,
            boxSizing: 'border-box',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: sizeStyle.dotSize,
              height: sizeStyle.dotSize,
              borderRadius: '50%',
              background: presenceColorToHex(entry.color),
              flex: '0 0 auto',
            }}
          />
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {displayEntryName(entry)}
          </span>
        </span>
      ))}
      {hiddenCount > 0 ? (
        <Badge variant="neutral" title={hiddenNames} aria-label={hiddenNames}>
          +{hiddenCount}
        </Badge>
      ) : null}
    </div>
  )
}
