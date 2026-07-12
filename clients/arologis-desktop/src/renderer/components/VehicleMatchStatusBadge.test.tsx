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

  it('PENDING 상태 — "대기 중" 한국어 라벨 렌더', () => {
    render(<VehicleMatchStatusBadge status="PENDING" />)

    expect(screen.getByTestId('vehicle-match-status-badge')).not.toBeNull()
    expect(screen.getByText('대기 중')).not.toBeNull()
  })

  it('MATCHING 상태 — "매칭 중..." 한국어 라벨 렌더', () => {
    render(<VehicleMatchStatusBadge status="MATCHING" />)

    expect(screen.getByTestId('vehicle-match-status-badge')).not.toBeNull()
    expect(screen.getByText('매칭 중...')).not.toBeNull()
  })

  it('ASSIGNED 상태 — "매칭 완료" 한국어 라벨 렌더', () => {
    render(
      <VehicleMatchStatusBadge status="ASSIGNED" driverCode="INSUNG-001" />,
    )

    expect(screen.getByTestId('vehicle-match-status-badge')).not.toBeNull()
    expect(screen.getByText('매칭 완료')).not.toBeNull()
  })

  it('DELIVERED 상태 — "배송 완료" 한국어 라벨 렌더', () => {
    render(
      <VehicleMatchStatusBadge status="DELIVERED" driverCode="INSUNG-001" />,
    )

    expect(screen.getByTestId('vehicle-match-status-badge')).not.toBeNull()
    expect(screen.getByText('배송 완료')).not.toBeNull()
  })

  // BE VehicleStatus 6값 정합 회귀 가드 (#785 fix) — 아래 2건
  it('DEPARTED 상태(BE 6값 정합) — "출발" 한국어 라벨 렌더', () => {
    render(
      <VehicleMatchStatusBadge status="DEPARTED" driverCode="INSUNG-001" />,
    )

    expect(screen.getByTestId('vehicle-match-status-badge')).not.toBeNull()
    expect(screen.getByText('출발')).not.toBeNull()
  })

  it('CANCELLED 상태(BE 6값 정합) — "취소됨" 한국어 라벨 렌더', () => {
    render(<VehicleMatchStatusBadge status="CANCELLED" />)

    expect(screen.getByTestId('vehicle-match-status-badge')).not.toBeNull()
    expect(screen.getByText('취소됨')).not.toBeNull()
  })

  it('진짜 미지값(향후 BE 확장분)은 raw 영문 대신 "상태 확인 필요" fallback 렌더', () => {
    render(
      <VehicleMatchStatusBadge
        status={'ZZZ' as VehicleMatchStatus}
        vendorOrderId="VO-001"
      />,
    )

    expect(screen.queryByTestId('vehicle-match-status-badge')).not.toBeNull()
    expect(screen.queryByText('ZZZ')).toBeNull()
    expect(screen.queryByText('상태 확인 필요')).not.toBeNull()
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
