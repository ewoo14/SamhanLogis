/* @vitest-environment jsdom */
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useFieldLock } from './useFieldLock'
import type { FieldLockClient, FieldLockEntry, FieldLockUser } from '../realtime/createPresenceClient'
import type { RealtimeEvent } from '../realtime/createRealtimeClient'

const authProvider = {
  getSession: vi.fn(),
}

vi.mock('../auth/authProvider', () => ({
  getAuthProvider: () => authProvider,
  isElectronPlatform: false,
  isCapacitorPlatform: false,
}))

function Probe({ client }: { client: FieldLockClient }) {
  const fieldLock = useFieldLock({
    entityId: 'slip-1',
    client,
    enabled: true,
  })

  return (
    <>
      <input
        aria-label="메모"
        onFocus={() => void fieldLock.acquire('memo')}
        onBlur={() => void fieldLock.release('memo')}
      />
      <div data-testid="memo-locks">
        {fieldLock.lockedBy('memo').map((entry) => entry.displayName).join(',')}
      </div>
    </>
  )
}

describe('useFieldLock', () => {
  beforeEach(() => {
    authProvider.getSession.mockResolvedValue({
      userId: 'me-user',
      fullName: '나',
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  test('초기 목록과 SSE 이벤트를 반영하고 focus/blur 에 acquire/release 를 호출한다', async () => {
    const events: Array<(event: RealtimeEvent) => void> = []
    const listEntry: FieldLockEntry = {
      fieldPath: 'memo',
      sessionId: 'other-session-1',
      displayName: '타인',
      color: 'GREEN',
    }
    const client: FieldLockClient = {
      list: vi.fn(async () => [listEntry]),
      acquire: vi.fn(async (_entityId, user) => ({
        fieldPath: user.fieldPath,
        sessionId: user.sessionId,
        displayName: user.displayName,
        color: 'BLUE',
      })),
      release: vi.fn(async () => undefined),
      subscribe: vi.fn((_entityId, onEvent) => {
        events.push(onEvent)
        return new AbortController()
      }),
    }

    render(<Probe client={client} />)

    await waitFor(() => expect(screen.getByTestId('memo-locks').textContent).toContain('타인'))

    fireEvent.focus(screen.getByLabelText('메모'))
    await waitFor(() => expect(client.acquire).toHaveBeenCalledWith(
      'slip-1',
      expect.objectContaining({
        fieldPath: 'memo',
        displayName: '나',
      }),
      expect.any(AbortSignal),
    ))

    act(() => {
      events[0]?.({
        event: 'presence:field-lock-acquired',
        data: {
          fieldPath: 'memo',
          sessionId: 'other-session-2',
          displayName: '동시편집자',
          color: 'AMBER',
        },
        raw: '',
      })
    })
    expect(screen.getByTestId('memo-locks').textContent).toContain('동시편집자')

    act(() => {
      events[0]?.({
        event: 'presence:field-lock-released',
        data: listEntry,
        raw: '',
      })
    })
    expect(screen.getByTestId('memo-locks').textContent).not.toContain('타인')

    fireEvent.blur(screen.getByLabelText('메모'))
    await waitFor(() => expect(client.release).toHaveBeenCalledWith(
      'slip-1',
      expect.objectContaining({
        fieldPath: 'memo',
        displayName: '나',
      }),
      expect.any(AbortSignal),
    ))
  })

  test('heartbeat 가 활성 필드를 30초마다 재-acquire 한다', async () => {
    vi.useFakeTimers()
    try {
      const acquire = vi.fn(async (_entityId: string, user: FieldLockUser) => ({
        fieldPath: user.fieldPath,
        sessionId: user.sessionId,
        displayName: user.displayName,
        color: 'BLUE' as const,
      }))
      const client: FieldLockClient = {
        list: vi.fn(async () => []),
        acquire,
        release: vi.fn(async () => undefined),
        subscribe: vi.fn(() => new AbortController()),
      }
      render(<Probe client={client} />)
      // mount 비동기(resolveCurrentUser→refresh→heartbeat setInterval) flush
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })

      fireEvent.focus(screen.getByLabelText('메모'))
      await act(async () => { await vi.advanceTimersByTimeAsync(0) })
      const callsAfterFocus = acquire.mock.calls.length
      expect(callsAfterFocus).toBeGreaterThanOrEqual(1)

      // 30초 경과 → heartbeat 가 활성 필드(memo) 재-acquire
      await act(async () => { await vi.advanceTimersByTimeAsync(30_001) })
      expect(acquire.mock.calls.length).toBeGreaterThan(callsAfterFocus)
    } finally {
      vi.useRealTimers()
    }
  })

  test('언마운트 시 활성 필드 락을 release 한다', async () => {
    const release = vi.fn(async () => undefined)
    const client: FieldLockClient = {
      list: vi.fn(async () => []),
      acquire: vi.fn(async (_entityId, user) => ({
        fieldPath: user.fieldPath,
        sessionId: user.sessionId,
        displayName: user.displayName,
        color: 'BLUE' as const,
      })),
      release,
      subscribe: vi.fn(() => new AbortController()),
    }
    const { unmount } = render(<Probe client={client} />)
    await waitFor(() => expect(client.list).toHaveBeenCalled())

    fireEvent.focus(screen.getByLabelText('메모'))
    await waitFor(() => expect(client.acquire).toHaveBeenCalled())

    unmount()
    // cleanup 은 signal 없이 release 호출(useFieldLock useEffect cleanup)
    await waitFor(() => expect(release).toHaveBeenCalledWith(
      'slip-1',
      expect.objectContaining({ fieldPath: 'memo' }),
    ))
  })

  test('빠른 focus→blur 는 acquire 와 release 를 모두 호출해 stale 락을 남기지 않는다', async () => {
    const acquire = vi.fn(async (_entityId: string, user: FieldLockUser) => ({
      fieldPath: user.fieldPath,
      sessionId: user.sessionId,
      displayName: user.displayName,
      color: 'BLUE' as const,
    }))
    const release = vi.fn(async () => undefined)
    const client: FieldLockClient = {
      list: vi.fn(async () => []),
      acquire,
      release,
      subscribe: vi.fn(() => new AbortController()),
    }
    render(<Probe client={client} />)
    await waitFor(() => expect(client.list).toHaveBeenCalled())

    const input = screen.getByLabelText('메모')
    fireEvent.focus(input)
    fireEvent.blur(input)

    await waitFor(() => expect(acquire).toHaveBeenCalledWith(
      'slip-1', expect.objectContaining({ fieldPath: 'memo' }), expect.any(AbortSignal)))
    await waitFor(() => expect(release).toHaveBeenCalledWith(
      'slip-1', expect.objectContaining({ fieldPath: 'memo' }), expect.any(AbortSignal)))
  })
})
