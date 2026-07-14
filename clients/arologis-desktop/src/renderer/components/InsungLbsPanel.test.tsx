import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { InsungLbsPanel, type GpsSource } from './InsungLbsPanel'

/**
 * InsungLbsPanel 회귀 가드 — #785 family sweep.
 *
 * notifyResults 와 동일한 결함 패턴(BE 필드 누락 시 크래시)을 gpsSources 에도
 * 적용한 방어 로직 검증. undefined 전달 시 `[...gpsSources].sort()` /
 * `gpsSources.length` 접근에서 `TypeError: not iterable` 로 재크래시하지 않고
 * "위치 정보 없음" 을 렌더해야 한다.
 */
describe('InsungLbsPanel', () => {
  afterEach(() => {
    cleanup()
  })

  it('gpsSources 가 undefined 여도 크래시 없이 "위치 정보 없음" 렌더', () => {
    render(
      <InsungLbsPanel
        driverCode="INSUNG-001"
        gpsSources={undefined as unknown as GpsSource[]}
      />,
    )

    expect(screen.getByTestId('insung-lbs-panel')).not.toBeNull()
    expect(screen.getByText('위치 정보 없음')).not.toBeNull()
  })

  it('gpsSources 빈 배열이면 "위치 정보 없음" 렌더', () => {
    render(<InsungLbsPanel driverCode="INSUNG-001" gpsSources={[]} />)

    expect(screen.getByTestId('insung-lbs-panel')).not.toBeNull()
    expect(screen.getByText('위치 정보 없음')).not.toBeNull()
  })

  it('gpsSources 가 populated 이면 정상적으로 source row + 활성 소스 요약 렌더', () => {
    const sources: GpsSource[] = [
      {
        source: 'EXTERNAL_INSUNG_LBS',
        latitude: 37.5665,
        longitude: 126.978,
        lastReceivedAt: new Date().toISOString(),
        active: true,
      },
      {
        source: 'MANUAL',
        latitude: null,
        longitude: null,
        lastReceivedAt: null,
        active: false,
      },
    ]

    render(<InsungLbsPanel driverCode="INSUNG-002" gpsSources={sources} />)

    expect(screen.queryByText('위치 정보 없음')).toBeNull()
    expect(screen.getByTestId('gps-source-row-insung-lbs')).not.toBeNull()
    expect(screen.getByTestId('gps-source-row-manual')).not.toBeNull()
    expect(screen.getByTestId('gps-active-source-label').textContent).toBe('인성 LBS')
  })

  it('BE 가 계산한 config priority 순서를 보존해 렌더한다', () => {
    const sources: GpsSource[] = [
      {
        source: 'MANUAL',
        latitude: 37.1,
        longitude: 127.1,
        lastReceivedAt: '2026-07-14T10:00:00',
        active: true,
      },
      {
        source: 'APP_GPS_ACTIVE',
        latitude: 37.2,
        longitude: 127.2,
        lastReceivedAt: '2026-07-14T10:00:00',
        active: false,
      },
      {
        source: 'EXTERNAL_INSUNG_LBS',
        latitude: 37.3,
        longitude: 127.3,
        lastReceivedAt: '2026-07-14T10:00:00',
        active: false,
      },
    ]

    render(<InsungLbsPanel driverCode="INSUNG-003" gpsSources={sources} />)

    const rows = screen.getAllByText(/\[(1|2|3)\]/).map((row) =>
      row.parentElement?.getAttribute('data-testid'),
    )
    expect(rows).toEqual([
      'gps-source-row-manual',
      'gps-source-row-app-gps-active',
      'gps-source-row-insung-lbs',
    ])
  })
})
