// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AuditOverlay, type AuditLogEntry } from './AuditOverlay'

const ACTOR_UUID = '123e4567-e89b-12d3-a456-426614174000'

function entry(actorName: string): AuditLogEntry {
  return {
    revisionNo: 1,
    beforeValue: '이전 값',
    actorId: ACTOR_UUID,
    actorName,
    changedAt: '2026-08-11T10:20:00+09:00',
  }
}

describe('AuditOverlay actorName 표시', () => {
  it.each([
    '\u200B',
    '\u200C',
    '\u200D',
    '\uFEFF',
    '\u00AD',
    '\u2060',
    '   ',
    `\u200B${ACTOR_UUID}`,
    `${ACTOR_UUID}\u200B`,
  ])('보이지 않는 문자로 감싼 빈 이름/UUID를 노출하지 않는다', (actorName) => {
    render(<AuditOverlay field="memo" currentValue="현재 값" history={[entry(actorName)]} />)

    const overlay = screen.getByTestId('audit-overlay-memo')
    expect(overlay.textContent).toContain('변경자 미상')
    expect(overlay.textContent).not.toContain(ACTOR_UUID)
  })

  it('정상 이름과 퍼센트·플러스·하이픈 식별자를 보존한다', () => {
    for (const actorName of ['김감사', '김%20감사', '김+감사', '1-1-1-1-1']) {
      const { unmount } = render(
        <AuditOverlay field="memo" currentValue="현재 값" history={[entry(actorName)]} />,
      )
      expect(screen.getByTestId('audit-overlay-memo').textContent).toContain(actorName)
      unmount()
    }
  })
})
