import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuditOverlay } from './AuditOverlay'

describe('PR #1134 UUID actorName guard', () => {
  it('does not render a UUID actorName in the visible overlay', () => {
    render(
      <AuditOverlay
        field="memo"
        currentValue="이후"
        history={[{
          revisionNo: 1,
          beforeValue: '이전',
          actorId: '550e8400-e29b-41d4-a716-446655440000',
          actorName: '550e8400-e29b-41d4-a716-446655440000',
          changedAt: '2026-08-10T09:01:00+09:00',
        }, {
          revisionNo: 2,
          beforeValue: '중간',
          actorId: 'actor-2',
          actorName: '[DEV-SEED] 개발영업',
          changedAt: '2026-08-10T09:02:00+09:00',
        }]}
      />,
    )

    fireEvent.click(screen.getByTestId('audit-overlay-memo-expand'))

    expect(screen.getByText('[DEV-SEED] 개발영업')).toBeTruthy()
    expect(screen.getByText('변경자 미상')).toBeTruthy()
    expect(screen.queryByText('550e8400-e29b-41d4-a716-446655440000')).toBeNull()
  })

  it.each([
    '{550e8400-e29b-41d4-a716-446655440000}',
    'urn:uuid:550e8400-e29b-41d4-a716-446655440000',
    '550e8400e29b41d4a716446655440000',
  ])('hides R15 non-canonical UUID actorName %s', (actorName) => {
    render(
      <AuditOverlay
        field="memo"
        currentValue="이후"
        history={[{
          revisionNo: 1,
          beforeValue: '이전',
          actorId: 'actor-1',
          actorName,
          changedAt: '2026-08-10T09:01:00+09:00',
        }]}
      />,
    )

    expect(screen.getByText('변경자 미상')).toBeTruthy()
    expect(screen.queryByText(actorName)).toBeNull()
  })

  it('preserves 32-character non-UUID display names', () => {
    const actorName = '0000000000000000000000000000000G'
    render(
      <AuditOverlay
        field="memo"
        currentValue="이후"
        history={[{
          revisionNo: 1,
          beforeValue: '이전',
          actorId: 'actor-1',
          actorName,
          changedAt: '2026-08-10T09:01:00+09:00',
        }]}
      />,
    )

    expect(screen.getByText(actorName)).toBeTruthy()
  })

  it('continues hiding uppercase and padded canonical UUID actorName', () => {
    render(
      <AuditOverlay
        field="memo"
        currentValue="이후"
        history={[{
          revisionNo: 1,
          beforeValue: '이전',
          actorId: 'actor-1',
          actorName: '  550E8400-E29B-41D4-A716-446655440000  ',
          changedAt: '2026-08-10T09:01:00+09:00',
        }]}
      />,
    )

    expect(screen.getByText('변경자 미상')).toBeTruthy()
  })
})
