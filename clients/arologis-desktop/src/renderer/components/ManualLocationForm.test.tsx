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

  it('renders with the design-system Input/Button labels and an accessible form name', () => {
    render(
      <ManualLocationForm
        dispatchCode="dispatch-815"
        sequence={2}
        driverCode="DRV-001"
        onSaved={vi.fn()}
      />,
    )

    // design-system Input 은 label 을 htmlFor 로 연결한다 — getByLabelText 로 동일 input 을 찾을 수 있어야 한다.
    expect(screen.getByLabelText('위도')).toBe(screen.getByTestId('manual-location-lat'))
    expect(screen.getByLabelText('경도')).toBe(screen.getByTestId('manual-location-lng'))
    expect(screen.getByTestId('manual-location-form').getAttribute('aria-label')).toBe(
      '수동 위치 입력 — DRV-001',
    )
    expect(screen.getByText('수동 입력 — DRV-001')).not.toBeNull()
  })

  it('valid submit records manual location, shows a success indicator, and refreshes detail', async () => {
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
    // onSaved() 는 상위에서 백그라운드 재조회만 트리거하므로(stale-while-revalidate),
    // 저장 확인은 이 인라인 표시로 별도 제공된다.
    expect(screen.getByTestId('manual-location-success').textContent).toBe('저장됨')
    expect(screen.queryByTestId('manual-location-error')).toBeNull()
  })

  it('invalid out-of-range coordinates show a per-field error and do not call API', async () => {
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
    // 오류가 있는 필드(위도) 는 aria-invalid, 유효한 필드(경도) 는 아니다 — DS Input 필드별 오류.
    expect(screen.getByTestId('manual-location-lat').getAttribute('aria-invalid')).toBe('true')
    expect(screen.getByTestId('manual-location-lng').getAttribute('aria-invalid')).toBeNull()
    expect(mockedRecordManualLocation).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.queryByTestId('manual-location-success')).toBeNull()
  })

  it('API failure shows an error message and does not call onSaved', async () => {
    const onSaved = vi.fn()
    mockedRecordManualLocation.mockRejectedValueOnce(new Error('network error'))
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
      expect(screen.getByTestId('manual-location-error').textContent).toBe(
        '수동 입력 저장에 실패했습니다',
      )
    })
    expect(onSaved).not.toHaveBeenCalled()
    expect(screen.queryByTestId('manual-location-success')).toBeNull()
  })
})
