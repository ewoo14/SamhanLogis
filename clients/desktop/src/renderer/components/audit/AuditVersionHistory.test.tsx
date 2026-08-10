// @vitest-environment jsdom
import React, { useState, type ComponentProps } from 'react'
import { AxiosError } from 'axios'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { AuditVersionHistory, classifyAuditHistoryError } from './AuditVersionHistory'
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

function axiosError(status: number): AxiosError {
  return new AxiosError(`HTTP ${status}`, undefined, undefined, undefined, {
    status,
    statusText: 'Error',
    headers: {},
    config: {},
    data: {},
  })
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

  it.each([
    [403, 'forbidden', '버전 이력을 조회할 권한이 없습니다.'],
    [500, 'temporary', '버전 이력을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'],
  ] as const)('%s 응답은 빈 이력과 구분되는 상태를 표시한다', (status, kind, message) => {
    renderHistory({ logs: [], isError: true, error: axiosError(status) })

    fireEvent.click(screen.getByRole('button', { name: '버전이력' }))

    const error = screen.getByTestId('audit-test-version-history-error')
    expect(error.getAttribute('data-error-kind')).toBe(kind)
    expect(error.textContent).toContain(message)
    expect(screen.queryByTestId('audit-test-version-history-empty')).toBeNull()
  })

  it('endpoint 미제공 여부에 따라 404를 대상 부재와 구분한다', () => {
    renderHistory({
      logs: [],
      isError: true,
      error: axiosError(404),
      treat404AsNotSupported: true,
    })

    fireEvent.click(screen.getByRole('button', { name: '버전이력' }))

    const error = screen.getByTestId('audit-test-version-history-error')
    expect(error.getAttribute('data-error-kind')).toBe('not-supported')
    expect(error.textContent).toContain('아직 제공되지 않습니다.')

    cleanup()
    renderHistory({ logs: [], isError: true, error: axiosError(404) })
    fireEvent.click(screen.getByRole('button', { name: '버전이력' }))

    expect(screen.getByTestId('audit-test-version-history-error').getAttribute('data-error-kind')).toBe(
      'not-found',
    )
    expect(screen.getByTestId('audit-test-version-history-error').textContent).toContain(
      '해당 대상의 버전 이력을 찾을 수 없습니다.',
    )
  })

  it('네트워크 오류도 화면을 깨뜨리지 않고 일시 실패로 표시한다', () => {
    const networkError = new Error('network disconnected')
    renderHistory({ logs: [], isError: true, error: networkError })

    fireEvent.click(screen.getByRole('button', { name: '버전이력' }))

    expect(classifyAuditHistoryError(networkError)).toBe('temporary')
    expect(screen.getByTestId('audit-test-version-history-error').getAttribute('data-error-kind')).toBe(
      'temporary',
    )
    expect(screen.queryByTestId('audit-test-version-history-empty')).toBeNull()
  })
})
