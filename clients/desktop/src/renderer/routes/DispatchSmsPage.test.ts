import { describe, expect, it } from 'vitest'
import {
  buildSendEntries,
  countSendableEntries,
  type EditedMessages,
} from './DispatchSmsPage'
import type { DispatchSmsPreviewResponse } from '../api/dispatchSmsApi'

const preview: DispatchSmsPreviewResponse = {
  date: '2026-08-02',
  totalSlips: 3,
  mappedSlips: 1,
  unmappedSlips: 2,
  chatRooms: [{
    chatRoomName: '매핑방',
    partners: [{
      partnerCode: 'P-MAPPED',
      partnerName: '매핑 거래처',
      slipNo: '2026/08/02-1',
      message: '매핑 본문',
      blocked: false,
    }],
  }],
  unmapped: [
    {
      partnerCode: 'P-FALLBACK',
      partnerName: '인수자번호 거래처',
      slipNo: '2026/08/02-2',
      message: 'fallback 본문',
      recipientPhone: '01000000001',
    },
    {
      partnerCode: 'P-NO-PHONE',
      partnerName: '번호 없음 거래처',
      slipNo: '2026/08/02-3',
      message: '번호 없음 본문',
      recipientPhone: null,
    },
  ],
}

describe('배차문자 발송 모집단', () => {
  it('화면 건수와 실제 요청이 같은 미매핑·인수자번호 대상 집합을 사용한다', () => {
    const edited: EditedMessages = { 'P-FALLBACK': '수정 본문' }
    const entries = buildSendEntries(preview, edited)

    expect(countSendableEntries(preview)).toBe(entries.length)
    expect(entries.map((entry) => entry.partnerCode)).toEqual(['P-FALLBACK'])
    expect(entries[0]).toMatchObject({
      partnerCode: 'P-FALLBACK',
      recipientPhone: '01000000001',
      message: '수정 본문',
    })
  })
})
