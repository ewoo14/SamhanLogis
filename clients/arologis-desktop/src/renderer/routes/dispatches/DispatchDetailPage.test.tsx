import { afterEach, describe, expect, it, vi } from 'vitest'
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
          matchSource: null,
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

  it('gpsSources 가 비어 있어도 매칭 완료 차량은 GPS 빈 패널을 렌더한다', () => {
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
          matchSource: 'EXTERNAL_INSUNG_QUICK',
          driverCode: 'INSUNG-001',
          vendorOrderId: null,
          gpsSources: [],
        },
      ],
    }

    render(<DispatchDetailPage dispatch={dispatch} />)

    expect(screen.queryByTestId('vehicle-row-1')).not.toBeNull()
    expect(screen.queryByTestId('insung-lbs-panel')).not.toBeNull()
    expect(screen.getByText('위치 정보 없음')).not.toBeNull()
  })

  it('ASSIGNED 차량과 기사 코드가 있으면 수동 위치 입력 폼을 렌더한다', () => {
    const onDataChanged = vi.fn()
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
          matchSource: 'EXTERNAL_INSUNG_QUICK',
          driverCode: 'INSUNG-001',
          vendorOrderId: null,
          gpsSources: [],
        },
      ],
    }

    render(<DispatchDetailPage dispatch={dispatch} onDataChanged={onDataChanged} />)

    expect(screen.queryByTestId('manual-location-form')).not.toBeNull()
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

  it('routeLabel 이 빈 문자열이면 헤더에 " · " 구분자/화살표 없이 톤수·정차수만 렌더한다 (F1 고아 방지)', () => {
    const dispatch: DispatchDetail = {
      id: 'dispatch-id',
      dispatchDate: '2026-07-12',
      dispatchTypeLabel: '일반',
      sandboxMode: false,
      vehicles: [
        {
          sequence: 1,
          tonnageLabel: '1톤',
          routeLabel: '',
          stopCount: 0,
          matchStatus: 'PENDING',
          matchSource: null,
          driverCode: null,
          vendorOrderId: null,
          gpsSources: [],
        },
      ],
    }

    render(<DispatchDetailPage dispatch={dispatch} />)

    const row = screen.getByTestId('vehicle-row-1')
    expect(row.textContent).toContain('1톤 (정차 0)')
    expect(row.textContent).not.toContain(' · ')
    expect(row.textContent).not.toContain('→')
  })

  it('renders populated ALIGO notifyResults with status and masked phone', () => {
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
          matchSource: 'INTERNAL_APP',
          driverCode: 'DRV-001',
          vendorOrderId: null,
          gpsSources: [],
          notifyResults: [
            {
              channel: 'aligo',
              status: 'FAILED',
              sentAt: '2026-07-12T10:30:00',
              recipientPhone: '010-1111-2222',
              errorCode: 'HTTP_500',
            },
          ],
        },
      ],
    }

    render(<DispatchDetailPage dispatch={dispatch} />)

    expect(screen.queryByTestId('notify-row-aligo')).not.toBeNull()
    expect(screen.queryByTestId('channel-badge-aligo')).not.toBeNull()
    expect(screen.queryByTestId('notification-status-chip-failed')).not.toBeNull()
    expect(screen.queryByTestId('notification-masked-phone')?.textContent).toBe('010-XXXX-2222')
    // FIX2 (#819 ③-B re-review): 원본 errorCode 는 노출하지 않고 한국어 메시지로 치환,
    // 원본 코드는 title tooltip 에만 보존 (ops 디버깅용).
    const failReason = screen.queryByTestId('notification-fail-reason')
    expect(failReason?.textContent).toBe('(발송 서버 오류 (HTTP_500))')
    expect(failReason?.getAttribute('title')).toBe('HTTP_500')
  })

  it('errorCode 가 TOKEN_MISSING/PHONE_MISSING 등 BE 실 코드일 때 한국어 메시지로 치환한다', () => {
    const buildDispatch = (errorCode: string): DispatchDetail => ({
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
          matchSource: 'INTERNAL_APP',
          driverCode: 'DRV-001',
          vendorOrderId: null,
          gpsSources: [],
          notifyResults: [
            {
              channel: 'aligo',
              status: 'FAILED',
              sentAt: '2026-07-12T10:30:00',
              recipientPhone: '010-1111-2222',
              errorCode,
            },
          ],
        },
      ],
    })

    const cases: Array<[string, string]> = [
      ['TOKEN_MISSING', '(설정 오류 — 관리자 문의)'],
      ['PHONE_MISSING', '(수신 번호 없음)'],
      ['CLIENT_EXCEPTION', '(발송 서버 연결 오류)'],
      ['SEND_FAILED', '(발송 실패 — 잠시 후 재시도)'],
      ['INVALID_RESPONSE', '(발송 응답 오류)'],
      ['UNKNOWN_WEIRD_CODE', '(알 수 없는 오류)'],
    ]

    for (const [errorCode, expectedText] of cases) {
      const { unmount } = render(<DispatchDetailPage dispatch={buildDispatch(errorCode)} />)
      const failReason = screen.queryByTestId('notification-fail-reason')
      expect(failReason?.textContent).toBe(expectedText)
      expect(failReason?.getAttribute('title')).toBe(errorCode)
      unmount()
    }
  })
})
