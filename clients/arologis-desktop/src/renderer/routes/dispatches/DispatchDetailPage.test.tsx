import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  DispatchDetailPage,
  type DispatchDetail,
  type VehicleDetail,
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

  it('gpsSources 가 비어 있으면 매칭 완료 차량도 GPS 빈 패널을 렌더하지 않는다', () => {
    const dispatch: DispatchDetail = {
      id: 'dispatch-id',
      dispatchDate: '2026-07-12',
      dispatchTypeLabel: '일반',
      sandboxMode: false,
      vehicles: [
        {
          sequence: 1,
          tonnageLabel: '1톤',
          routeLabel: '서울 -> 인천',
          stopCount: 2,
          matchStatus: 'ASSIGNED',
          driverCode: 'INSUNG-001',
          vendorOrderId: null,
          gpsSources: [],
        },
      ],
    }

    render(<DispatchDetailPage dispatch={dispatch} />)

    expect(screen.queryByTestId('vehicle-row-1')).not.toBeNull()
    expect(screen.queryByTestId('insung-lbs-panel')).toBeNull()
  })

  it('vehicles 가 undefined 여도 크래시 없이 "차량 0대" 렌더', () => {
    const dispatch: DispatchDetail = {
      id: 'dispatch-id',
      dispatchDate: '2026-07-12',
      dispatchTypeLabel: '일반',
      sandboxMode: false,
      vehicles: undefined as unknown as VehicleDetail[],
    }

    const { container } = render(<DispatchDetailPage dispatch={dispatch} />)

    expect(container.textContent).toContain('차량 0대')
    expect(screen.queryByTestId('vehicle-row-1')).toBeNull()
  })
})
