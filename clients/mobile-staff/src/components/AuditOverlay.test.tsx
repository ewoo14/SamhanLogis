import { render } from '@testing-library/react-native'
import AuditOverlay from './AuditOverlay'

describe('AuditOverlay actor display boundary', () => {
  it('does not render UUID-shaped actorFullName', () => {
    const { getByTestId } = render(
      <AuditOverlay
        field="partnerName"
        currentValue="현재"
        history={[{
          id: 'audit-1',
          fieldName: 'partnerName',
          previousValue: '이전',
          currentValue: '현재',
          actorId: 'cafebabe-cafe-babe-cafe-babecafebabe',
          actorFullName: '\u2063cafebabe-cafe-babe-cafe-babecafebabe\u2063',
          actorRole: 'USER',
          createdAt: '2026-08-12T00:00:00Z',
        } as never]}
      />,
    )

    const actor = getByTestId('audit-overlay-mobile-partnerName-actor')
    expect(actor.props.children).not.toContain('cafebabe')
    expect(actor.props.children).toContain('변경자 미상')
  })

  it('localizes a system actor at the display boundary', () => {
    const { getByTestId } = render(
      <AuditOverlay
        field="partnerName"
        currentValue="현재"
        history={[{
          id: 'audit-system',
          fieldName: 'partnerName',
          previousValue: '이전',
          currentValue: '현재',
          actorId: '00000000-0000-0000-0000-000000000000',
          actorFullName: 'system',
          actorRole: 'SYSTEM',
          createdAt: '2026-08-12T00:00:00Z',
        } as never]}
      />,
    )

    expect(getByTestId('audit-overlay-mobile-partnerName-actor').props.children).toContain('시스템')
  })
})
