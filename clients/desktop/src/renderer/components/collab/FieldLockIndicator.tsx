import { Badge } from '@samhan/design-system'
import {
  PRESENCE_COLOR_HEX,
  isFieldLockEntry,
  type FieldLockEntry,
} from '../../realtime/createPresenceClient'

export interface FieldLockIndicatorProps {
  entries: FieldLockEntry[] | unknown
}

export function FieldLockIndicator({ entries }: FieldLockIndicatorProps) {
  const list = Array.isArray(entries) ? entries.filter(isFieldLockEntry) : []
  // 세션 단위 dedup — sessionId 가 유니크(동명이인·동일 색상 hash 충돌로 별개 편집자가 1명으로 합산되는 것 방지).
  const deduped = Array.from(
    list.reduce((acc, entry) => {
      if (!acc.has(entry.sessionId)) acc.set(entry.sessionId, entry)
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
      aria-label={`다른 사용자 ${deduped.length}명 편집 중`}
      title={`${names} 편집 중`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        minHeight: 20,
        color: 'var(--color-warning-700, #B47A1F)',
        fontSize: 'var(--font-size-xs)',
        lineHeight: 1.4,
      }}
    >
      <span
        aria-hidden="true"
        style={{ display: 'inline-flex', alignItems: 'center', marginRight: 2 }}
      >
        {visible.map((entry, index) => (
          <span
            key={entry.sessionId}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: PRESENCE_COLOR_HEX[entry.color] ?? '#64748B',
              border: '1px solid var(--color-neutral-0, #FFFFFF)',
              marginLeft: index === 0 ? 0 : -3,
              boxSizing: 'border-box',
            }}
          />
        ))}
      </span>
      {/* 한국어 어순: 주체(이름) 먼저, 술어(편집 중) 뒤 */}
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
      <span style={{ whiteSpace: 'nowrap' }}>편집 중</span>
      {hiddenCount > 0 ? (
        <Badge variant="neutral" aria-label={names} title={names}>
          +{hiddenCount}
        </Badge>
      ) : null}
    </span>
  )
}
