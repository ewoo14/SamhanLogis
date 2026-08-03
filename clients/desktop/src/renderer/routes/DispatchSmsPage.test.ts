import { describe, expect, it } from 'vitest'
import { buildDispatchSmsClipboardText } from './dispatchSmsClipboard'
import {
  getDriverContactsForDate,
  setDriverContactsForDate,
} from './DispatchSmsPage'

describe('배차안내문자 표시·복사 경로', () => {
  it('편집된 하차일별 안내 문구를 선택 행의 복사 텍스트에 그대로 보존한다', () => {
    const text = buildDispatchSmsClipboardText([
      {
        id: 'P-1013',
        partnerName: '거래처 A',
        slipNo: '2026/08/03-1',
        message: '8일 하차 건 배송기사님 연락처를 안내드립니다.\n수정된 안내 문구',
        chatRoomName: 'A방',
      },
    ], new Set(['P-1013']))

    expect(text).toContain('거래처 A')
    expect(text).toContain('2026/08/03-1')
    expect(text).toContain('수정된 안내 문구')
    expect(text).toContain('A방')
  })

  it('RED-A: 날짜를 바꾼 뒤 새로 입력한 연락처는 그 날짜 요청에 반영된다', () => {
    const state = setDriverContactsForDate({}, '2026-08-01', [{
      slipNo: '1',
      companyName: '거래처 B',
      driverPhone: '010-2026-0801',
      date: '2026-08-01',
    }])

    expect(getDriverContactsForDate(state, '2026-08-01')).toEqual([{
      slipNo: '1',
      companyName: '거래처 B',
      driverPhone: '010-2026-0801',
      date: '2026-08-01',
    }])
  })

  it('RED-B: A의 연락처는 B를 거쳐 A로 돌아와도 A에만 남는다', () => {
    let state = setDriverContactsForDate({}, '2026-08-03', [{
      slipNo: '1',
      companyName: '거래처 A',
      driverPhone: '010-2026-0803',
      date: '2026-08-03',
    }])
    state = setDriverContactsForDate(state, '2026-08-01', [{
      slipNo: '1',
      companyName: '거래처 B',
      driverPhone: '010-2026-0801',
      date: '2026-08-01',
    }])

    expect(getDriverContactsForDate(state, '2026-08-03')[0].driverPhone).toBe('010-2026-0803')
    expect(getDriverContactsForDate(state, '2026-08-01')[0].driverPhone).toBe('010-2026-0801')
  })
})
