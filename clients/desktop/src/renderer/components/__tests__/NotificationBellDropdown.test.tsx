// @vitest-environment jsdom
import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotificationBellDropdown } from '../NotificationBellDropdown'

vi.mock('../../api/notificationApi', () => ({
  acknowledgeNotification: vi.fn(async () => undefined),
  CHANNEL_LABEL: {},
  fetchMyUnread: vi.fn(async () => []),
  groupByChannel: vi.fn(() => ({})),
}))

function rect(left: number, right: number): DOMRect {
  return {
    bottom: 100,
    height: 100,
    left,
    right,
    top: 0,
    width: right - left,
    x: left,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect
}

function renderDropdown() {
  const queryClient = new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <NotificationBellDropdown />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('NotificationBellDropdown', () => {
  let panelRect = rect(0, 360)
  let getBoundingClientRect: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 390,
    })
    panelRect = rect(0, 360)
    getBoundingClientRect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function getMockRect() {
        if ((this as HTMLElement).dataset.testid === 'notification-bell-panel') {
          return panelRect
        }
        return rect(0, 36)
      })
  })

  afterEach(() => {
    cleanup()
    getBoundingClientRect.mockRestore()
  })

  it('opens inside the left viewport gutter and recalculates after window resize', () => {
    panelRect = rect(-122, 238)

    renderDropdown()
    fireEvent.click(screen.getByTestId('notification-bell'))

    const panel = screen.getByTestId('notification-bell-panel')
    expect(panel.style.translate).toBe('130px 0')
    expect(panel.style.transform).toBe('')

    panelRect = rect(20, 300)
    window.dispatchEvent(new Event('resize'))

    expect(panel.style.translate).toBe('')
  })

  it('opens inside the right viewport gutter', () => {
    panelRect = rect(50, 410)

    renderDropdown()
    fireEvent.click(screen.getByTestId('notification-bell'))

    expect(screen.getByTestId('notification-bell-panel').style.translate).toBe('-28px 0')
  })

  it('resets stale translate when reopened after closing', () => {
    panelRect = rect(-122, 238)

    renderDropdown()
    fireEvent.click(screen.getByTestId('notification-bell'))
    expect(screen.getByTestId('notification-bell-panel').style.translate).toBe('130px 0')

    fireEvent.click(screen.getByTestId('notification-bell'))
    expect(screen.queryByTestId('notification-bell-panel')).toBeNull()

    panelRect = rect(20, 300)
    fireEvent.click(screen.getByTestId('notification-bell'))
    expect(screen.getByTestId('notification-bell-panel').style.translate).toBe('')
  })
})
