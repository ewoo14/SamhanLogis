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

  it('EXTERNAL_INSUNG_QUICK ASSIGNED 만 INSUNG vendor pill 을 표시한다', () => {
    render(
      <VehicleMatchStatusBadge
        status="ASSIGNED"
        driverCode="INSUNG-001"
        matchSource="EXTERNAL_INSUNG_QUICK"
      />,
    )

    expect(screen.getByTestId('insung-vendor-badge')).not.toBeNull()
  })

  it('EXTERNAL_KAKAO ASSIGNED 는 INSUNG vendor pill 을 표시하지 않는다', () => {
    render(
      <VehicleMatchStatusBadge
        status="ASSIGNED"
        driverCode="KAKAO-001"
        matchSource="EXTERNAL_KAKAO"
      />,
    )

    expect(screen.queryByTestId('insung-vendor-badge')).toBeNull()
    expect(screen.getByText('매칭 완료')).not.toBeNull()
  })

  it('MANUAL ASSIGNED 는 INSUNG vendor pill 을 표시하지 않는다', () => {
    render(
      <VehicleMatchStatusBadge
        status="ASSIGNED"
        driverCode="DRV-MANUAL"
        matchSource="MANUAL"
      />,
    )

    expect(screen.queryByTestId('insung-vendor-badge')).toBeNull()
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

  // matchSource gating (R2 HIGH + R3 F-new-1) — pill / 서브텍스트 / 툴팁 / aria 4개 표식 대칭 검증
  it('MATCHING + EXTERNAL_INSUNG_QUICK 는 INSUNG pill 과 인성 서브텍스트를 표시한다', () => {
    render(
      <VehicleMatchStatusBadge status="MATCHING" matchSource="EXTERNAL_INSUNG_QUICK" />,
    )

    expect(screen.getByTestId('insung-vendor-badge')).not.toBeNull()
    expect(screen.getByText('인성 퀵프로그램 기사 배정 중')).not.toBeNull()
  })

  it('MATCHING + 비-인성(EXTERNAL_KAKAO)은 INSUNG pill 없이 중립 서브텍스트(인성 문구 누출 방지)', () => {
    render(
      <VehicleMatchStatusBadge status="MATCHING" matchSource="EXTERNAL_KAKAO" />,
    )

    expect(screen.queryByTestId('insung-vendor-badge')).toBeNull()
    expect(screen.getByText('기사 배정 중')).not.toBeNull()
    expect(screen.queryByText('인성 퀵프로그램 기사 배정 중')).toBeNull()
  })

  it('vendorOrderId 툴팁은 EXTERNAL_INSUNG_QUICK 에만 노출한다', () => {
    render(
      <VehicleMatchStatusBadge
        status="ASSIGNED"
        driverCode="INSUNG-001"
        matchSource="EXTERNAL_INSUNG_QUICK"
        vendorOrderId="VO-804"
      />,
    )

    const title = screen.getByTestId('vehicle-match-status-badge').getAttribute('title')
    expect(title).toContain('인성 주문 ID')
  })

  it('비-인성(EXTERNAL_KAKAO)은 vendorOrderId 가 있어도 인성 주문 툴팁을 노출하지 않는다', () => {
    render(
      <VehicleMatchStatusBadge
        status="ASSIGNED"
        driverCode="KAKAO-001"
        matchSource="EXTERNAL_KAKAO"
        vendorOrderId="VO-804"
      />,
    )

    expect(screen.getByTestId('vehicle-match-status-badge').getAttribute('title')).toBeNull()
  })

  it('비-인성 ASSIGNED 의 aria-label 은 인성 문구 없이 "기사 매칭 완료" 이다', () => {
    render(
      <VehicleMatchStatusBadge
        status="ASSIGNED"
        driverCode="KAKAO-001"
        matchSource="EXTERNAL_KAKAO"
      />,
    )

    const aria = screen.getByTestId('vehicle-match-status-badge').getAttribute('aria-label') ?? ''
    expect(aria).toContain('기사 매칭 완료')
    expect(aria).not.toContain('인성')
  })
})
