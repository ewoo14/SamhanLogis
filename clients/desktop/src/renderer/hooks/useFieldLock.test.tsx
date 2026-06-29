/* @vitest-environment jsdom */
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useFieldLock } from './useFieldLock'
import type { FieldLockClient, FieldLockEntry } from '../realtime/createPresenceClient'
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
})
