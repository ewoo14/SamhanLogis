import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  DispatchDetailPage,
  type DispatchDetail,
} from './DispatchDetailPage'

describe('DispatchDetailPage', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders vehicle rows when notifyResults is omitted', () => {
    const dispatch: DispatchDetail = {
      id: 'dispatch-id',
      dispatchDate: '2026-07-12',
      dispatchTypeLabel: '일반',
      sandboxMode: false,
      vehicles: [
        {
          id: 'vehicle-id',
          sequence: 1,
          tonnageLabel: '1톤',
          routeLabel: '서울 -> 인천',
          stopCount: 2,
          matchStatus: 'PENDING',
          driverCode: null,
          vendorOrderId: null,
          gpsSources: [],
        },
      ],
    }

    render(<DispatchDetailPage dispatch={dispatch} />)

    expect(screen.queryByTestId('vehicle-row-1')).not.toBeNull()
    expect(screen.queryByTestId('notification-result-section')).toBeNull()
  })
})
