// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DetailWindowControls } from './DetailWindowControls'

describe('DetailWindowControls', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('toggles maximize label and closes through the detail-window bridge', async () => {
    const toggleMaximize = vi.fn().mockResolvedValue(true)
    const close = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window, 'samhanDetailWindow', {
      configurable: true,
      value: { toggleMaximize, close, onMaximizedChange: () => () => undefined },
    })

    render(<DetailWindowControls />)
    fireEvent.click(screen.getByRole('button', { name: '전체창' }))
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))

    expect(toggleMaximize).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
    expect(await screen.findByRole('button', { name: '축소창' })).toBeTruthy()
  })
})
