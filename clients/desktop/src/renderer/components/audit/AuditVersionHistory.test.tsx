// @vitest-environment jsdom
import React, { useState, type ComponentProps } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { AuditVersionHistory } from './AuditVersionHistory'
import type { AuditLogEntry } from '../../api/createAuditApi'

afterEach(() => {
  cleanup()
})

const logs: AuditLogEntry[] = [
  {
    revisionNo: 1,
    field: 'description',
    beforeValue: '기존 메모',
    afterValue: '첫 변경',
    actorId: 'actor-1',
    actorName: '김회계',
    changedAt: '2026-08-01T09:00:00+09:00',
  },
  {
    revisionNo: 2,
    field: 'description',
    beforeValue: '첫 변경',
    afterValue: '최신 메모',
    actorId: 'actor-2',
    actorName: '이회계',
    changedAt: '2026-08-02T09:00:00+09:00',
  },
  {
    revisionNo: 2,
    field: 'status',
    beforeValue: 'DRAFT',
    afterValue: 'ISSUED',
    actorId: 'actor-2',
    actorName: '이회계',
    changedAt: '2026-08-02T09:00:00+09:00',
  },
]

function renderHistory(
  props: Partial<ComponentProps<typeof AuditVersionHistory>> = {},
) {
  function Harness() {
    const [open, setOpen] = useState(props.open ?? false)
    return (
      <AuditVersionHistory
        logs={logs}
        open={open}
        onOpenChange={setOpen}
        testIdPrefix="audit-test"
        {...props}
      />
    )
  }

  return render(<Harness />)
}

describe('AuditVersionHistory', () => {
  it('버전이력 버튼으로 모달을 열고 최신 revision을 위에 두며 변경항목은 접는다', () => {
    renderHistory()

    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '버전이력' }))

    const list = screen.getByTestId('audit-test-version-history-list')
    const rows = within(list).getAllByRole('listitem')
    expect(rows[0]?.textContent).toContain('revision #2')
    expect(rows[1]?.textContent).toContain('revision #1')

    const changes = screen.getByTestId('audit-test-version-history-changes-2')
    expect(changes).toHaveProperty('open', false)
    fireEvent.click(within(changes).getByText('변경 항목 2개'))

    expect(screen.getByText('status')).toBeTruthy()
    expect(screen.getByText('DRAFT')).toBeTruthy()
    expect(screen.getByText('ISSUED')).toBeTruthy()
    expect(screen.getByTestId('audit-test-version-history-change-2-0').textContent).toContain('이회계')
  })

  it('이력 0건은 빈 상태를 표시하고 모달은 정상으로 열린다', () => {
    renderHistory({ logs: [] })

    fireEvent.click(screen.getByRole('button', { name: '버전이력' }))

    expect(screen.getByTestId('audit-test-version-history-empty').textContent).toContain(
      '아직 버전 이력이 없습니다.',
    )
  })

  it('권한/조회 오류는 기존 화면을 깨뜨리지 않고 모달에 오류를 표시한다', () => {
    renderHistory({ logs: [], isError: true })

    fireEvent.click(screen.getByRole('button', { name: '버전이력' }))

    expect(screen.getByTestId('audit-test-version-history-error').textContent).toContain(
      '버전 이력을 불러오지 못했습니다.',
    )
  })
})
