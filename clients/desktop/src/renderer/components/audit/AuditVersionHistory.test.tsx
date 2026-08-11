// @vitest-environment jsdom
import React, { useState, type ComponentProps } from 'react'
import { AxiosError } from 'axios'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { AuditOverlay } from '@samhan/design-system'
import {
  AuditVersionHistory,
  classifyAuditHistoryError,
  isAuditHistoryEndpointUnavailable,
} from './AuditVersionHistory'
import { AuditRevisionBadge } from './AuditOverlaySection'
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

  it('정상 빈 이력은 0회지만 조회 실패는 Badge와 Overlay에서 실패로 표시한다', () => {
    const { unmount } = render(
      <AuditRevisionBadge
        logs={[]}
        isError
        testIdPrefix="audit-test"
      />,
    )

    expect(screen.getByTestId('audit-test-revision-count').textContent).toContain('수정 이력 조회 실패')
    expect(screen.getByTestId('audit-test-revision-count').textContent).not.toContain('수정 0회')

    unmount()
    render(
      <AuditRevisionBadge
        logs={[]}
        testIdPrefix="audit-test"
      />,
    )
    expect(screen.getByTestId('audit-test-revision-count').textContent).toContain('수정 0회')

    cleanup()
    render(
      <AuditOverlay
        field="description"
        currentValue="현재 값"
        history={[]}
        isError
      />,
    )
    expect(screen.getByTestId('audit-overlay-description').textContent).toContain('변경 이력 조회 실패')
    expect(screen.getByTestId('audit-overlay-description').textContent).not.toContain('변경 이력 없음')

    cleanup()
    render(
      <AuditOverlay
        field="description"
        currentValue="현재 값"
        history={logs.slice(0, 1)}
        isError
      />,
    )
    expect(screen.getByTestId('audit-overlay-description').textContent).toContain('변경 이력 조회 실패')
    expect(screen.getByTestId('audit-overlay-description').textContent).not.toContain('이전 값')
  })

  it('미조회·로딩중은 정상 빈 이력과 다른 상태로 표시한다', () => {
    const { unmount } = render(
      <AuditRevisionBadge
        logs={[]}
        isFetched={false}
        testIdPrefix="audit-state"
      />,
    )
    expect(screen.getByTestId('audit-state-revision-count').textContent).toContain('수정 이력 미조회')
    expect(screen.getByTestId('audit-state-revision-count').getAttribute('data-audit-state')).toBe('unqueried')

    unmount()
    render(
      <AuditRevisionBadge
        logs={[]}
        isFetched
        isLoading
        testIdPrefix="audit-state"
      />,
    )
    expect(screen.getByTestId('audit-state-revision-count').textContent).toContain('수정 이력 불러오는 중')
    expect(screen.getByTestId('audit-state-revision-count').getAttribute('data-audit-state')).toBe('loading')

    cleanup()
    render(
      <AuditOverlay
        field="description"
        currentValue="현재 값"
        history={[]}
        isFetched={false}
      />,
    )
    expect(screen.getByTestId('audit-overlay-description').textContent).toContain('변경 이력 미조회')

    cleanup()
    renderHistory({ logs: [], open: true, isFetched: false })
    expect(screen.getByTestId('audit-test-version-history-unqueried').textContent).toContain(
      '버전 이력 조회를 시작합니다.',
    )

    cleanup()
    renderHistory({
      logs: [],
      open: true,
      isFetched: false,
      isError: true,
      error: axiosError(500),
    })
    expect(screen.getByTestId('audit-test-version-history-error').textContent).toContain(
      '버전 이력을 불러오지 못했습니다.',
    )
  })

  it('404만 endpoint 부재 gate 대상이고 403·500은 일시 상태로 남긴다', () => {
    expect(isAuditHistoryEndpointUnavailable(axiosError(404))).toBe(true)
    expect(isAuditHistoryEndpointUnavailable(axiosError(403))).toBe(false)
    expect(isAuditHistoryEndpointUnavailable(axiosError(500))).toBe(false)
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

  it('현재 A 계열 계약에서 404는 endpoint 미제공 상태로 표시한다', () => {
    renderHistory({
      logs: [],
      isError: true,
      error: axiosError(404),
    })

    fireEvent.click(screen.getByRole('button', { name: '버전이력' }))

    const error = screen.getByTestId('audit-test-version-history-error')
    expect(error.getAttribute('data-error-kind')).toBe('not-supported')
    expect(error.textContent).toContain('아직 제공되지 않습니다.')
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
