import { describe, expect, it } from 'vitest'
import { buildDispatchSmsClipboardText } from './dispatchSmsClipboard'

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
})
