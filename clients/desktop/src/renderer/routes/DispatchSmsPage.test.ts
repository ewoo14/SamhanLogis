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

  it('같은 날짜·같은 수신번호의 전표는 병합 문구 1건으로 요청한다', () => {
    const groupedPreview: DispatchSmsPreviewResponse = {
      ...preview,
      totalSlips: 4,
      unmappedSlips: 4,
      unmapped: [
        {
          partnerCode: 'P-GROUP-1',
          partnerName: '거래처 1',
          slipNo: '2026/08/02-10',
          message: '전표 내용 1',
          recipientPhone: '010-1111-2222',
        },
        {
          partnerCode: 'P-GROUP-2',
          partnerName: '거래처 2',
          slipNo: '2026/08/02-11',
          message: '전표 내용 2',
          recipientPhone: '010-1111-2222',
        },
        {
          partnerCode: 'P-GROUP-3',
          partnerName: '거래처 3',
          slipNo: '2026/08/02-12',
          message: '전표 내용 3',
          recipientPhone: '010-1111-2222',
        },
        {
          partnerCode: 'P-NO-PHONE-2',
          partnerName: '번호 없음 거래처 2',
          slipNo: '2026/08/02-13',
          message: '번호 없음 표본',
          recipientPhone: null,
        },
        {
          partnerCode: 'P-BLANK-PHONE',
          partnerName: '공백 번호 거래처',
          slipNo: '2026/08/02-14',
          message: '공백 번호 표본',
          recipientPhone: '   ',
        },
      ],
    }

    const entries = buildSendEntries(groupedPreview, {})

    expect(entries).toHaveLength(1)
    expect(countSendableEntries(groupedPreview)).toBe(1)
    expect(entries[0]).toMatchObject({
      recipientPhone: '010-1111-2222',
      message: expect.stringContaining('전표 내용 1'),
    })
    expect(entries[0].message).toContain('전표 내용 2')
    expect(entries[0].message).toContain('전표 내용 3')
  })

  it('R4 실데이터 후보 규모 1911건은 초과 1909건 없이 모든 문구를 보존한다', () => {
    const source = Array.from({ length: 1911 }, (_, index) => ({
      partnerCode: `P-REAL-${index}`,
      partnerName: `실데이터 거래처 ${index}`,
      slipNo: `2026/08/02-${index + 100}`,
      message: `실전표 내용 ${index}`,
      recipientPhone: index === 1910 ? '010-2222-3333' : '010-1111-2222',
    }))
    const realScalePreview: DispatchSmsPreviewResponse = {
      ...preview,
      totalSlips: 1911,
      unmappedSlips: 1911,
      unmapped: source,
    }

    const entries = buildSendEntries(realScalePreview, {})

    expect(source).toHaveLength(1911)
    expect(entries).toHaveLength(2)
    expect(1911 - entries.length).toBe(1909)
    expect(source.every((row) => entries.some((entry) => entry.message.includes(row.message)))).toBe(true)
  })
})
