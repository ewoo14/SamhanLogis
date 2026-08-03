import { describe, expect, it } from 'vitest'
import { buildDispatchSmsClipboardText, type DispatchSmsClipboardRow } from './dispatchSmsClipboard'

describe('배차 SMS 선택 복사', () => {
  const rows: DispatchSmsClipboardRow[] = [
    {
      id: 'partner-a',
      partnerName: '거래처 A',
      slipNo: '2026/08/01-1',
      message: '배차 안내 A',
      chatRoomName: '방 A',
    },
    {
      id: 'partner-b',
      partnerName: '거래처 B',
      slipNo: '2026/08/01-2',
      message: '배차 안내 B',
      chatRoomName: '방 B',
    },
  ]

  it('선택한 행만 거래처명·전표번호·코멘트·단톡방을 탭/줄바꿈으로 직렬화한다', () => {
    expect(buildDispatchSmsClipboardText(rows, new Set(['partner-b']))).toBe(
      '거래처 B\t2026/08/01-2\t배차 안내 B\t방 B',
    )
  })

  it('선택된 행이 없으면 빈 문자열을 반환한다', () => {
    expect(buildDispatchSmsClipboardText(rows, new Set())).toBe('')
  })
})
