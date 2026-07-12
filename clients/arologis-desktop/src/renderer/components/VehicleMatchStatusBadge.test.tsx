import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import {
  VehicleMatchStatusBadge,
  type VehicleMatchStatus,
} from './VehicleMatchStatusBadge'

describe('VehicleMatchStatusBadge', () => {
  afterEach(() => {
    cleanup()
  })

  it('unmapped status renders without crashing', () => {
    render(
      <VehicleMatchStatusBadge
        status={'CANCELLED' as VehicleMatchStatus}
        vendorOrderId="VO-001"
      />,
    )

    expect(screen.queryByTestId('vehicle-match-status-badge')).not.toBeNull()
    expect(screen.queryByText('CANCELLED')).not.toBeNull()
  })

  it('undefined status renders without crashing', () => {
    render(
      <VehicleMatchStatusBadge
        status={undefined as unknown as VehicleMatchStatus}
      />,
    )

    expect(screen.queryByTestId('vehicle-match-status-badge')).not.toBeNull()
  })
})
