import { describe, expect, it } from 'vitest'
import { buildDispatchSmsClipboardText } from './dispatchSmsClipboard'
import { syncDriverContactDates } from './DispatchSmsPage'

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

  it('배차일 변경 시 이미 추가한 기사 연락처 행의 날짜도 새 배차일로 동기화한다', () => {
    const rows = [{
      slipNo: '2026/08/01-1',
      companyName: '거래처 A',
      driverPhone: '010-1111-2222',
      date: '2026-08-03',
    }]

    expect(syncDriverContactDates(rows, '2026-08-01')).toEqual([{
      ...rows[0],
      date: '2026-08-01',
    }])
  })
})
