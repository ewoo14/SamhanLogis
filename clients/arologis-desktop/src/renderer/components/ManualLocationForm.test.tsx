import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { recordManualLocation } from '../api/arologisDispatchDetail'
import { ManualLocationForm } from './ManualLocationForm'

vi.mock('../api/arologisDispatchDetail', () => ({
  recordManualLocation: vi.fn(),
}))

const mockedRecordManualLocation = vi.mocked(recordManualLocation)

describe('ManualLocationForm', () => {
  beforeEach(() => {
    mockedRecordManualLocation.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('valid submit records manual location and refreshes detail', async () => {
    const onSaved = vi.fn()
    mockedRecordManualLocation.mockResolvedValueOnce()
    render(
      <ManualLocationForm
        dispatchCode="dispatch-815"
        sequence={2}
        driverCode="DRV-001"
        onSaved={onSaved}
      />,
    )

    fireEvent.change(screen.getByTestId('manual-location-lat'), {
      target: { value: '37.1234567' },
    })
    fireEvent.change(screen.getByTestId('manual-location-lng'), {
      target: { value: '127.1234567' },
    })
    fireEvent.click(screen.getByTestId('manual-location-save'))

    await waitFor(() => {
      expect(mockedRecordManualLocation).toHaveBeenCalledWith(
        'dispatch-815',
        2,
        37.1234567,
        127.1234567,
      )
      expect(onSaved).toHaveBeenCalledTimes(1)
    })
    expect((screen.getByTestId('manual-location-lat') as HTMLInputElement).value).toBe('')
    expect((screen.getByTestId('manual-location-lng') as HTMLInputElement).value).toBe('')
  })

  it('invalid out-of-range coordinates show error and do not call API', async () => {
    const onSaved = vi.fn()
    render(
      <ManualLocationForm
        dispatchCode="dispatch-815"
        sequence={2}
        driverCode="DRV-001"
        onSaved={onSaved}
      />,
    )

    fireEvent.change(screen.getByTestId('manual-location-lat'), {
      target: { value: '91' },
    })
    fireEvent.change(screen.getByTestId('manual-location-lng'), {
      target: { value: '127' },
    })
    fireEvent.click(screen.getByTestId('manual-location-save'))

    expect(screen.getByTestId('manual-location-error').textContent).toContain('위도')
    expect(mockedRecordManualLocation).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })
})
