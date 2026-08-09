import { describe, expect, it } from 'vitest'
import { formatTabRemark } from './SheetSyncPage'

describe('formatTabRemark', () => {
  it('RED-A: 오류와 동일 카운트를 함께 표시한다', () => {
    expect(
      formatTabRemark({
        error: '추천실외기 natural key 중복: key=HOME_MULTI|null|7|2.5HP, firstRow=3, duplicateRow=4',
        unchangedRows: 32,
        skippedOccurrences: 1,
      }),
    ).toBe(
      '추천실외기 natural key 중복: key=HOME_MULTI|null|7|2.5HP, firstRow=3, duplicateRow=4 / 변경 없음 32 / skip occurrence 1',
    )
  })

  it('RED-B: 카운트가 없으면 오류 안내만 표시한다', () => {
    expect(formatTabRemark({ error: '탭 처리 실패', unchangedRows: 0, skippedOccurrences: 0 })).toBe('탭 처리 실패')
  })

  it('RED-C: 오류가 없는 기존 비고 문자열을 그대로 유지한다', () => {
    expect(formatTabRemark({ unchangedRows: 32, skippedOccurrences: 1 })).toBe('변경 없음 32 / skip occurrence 1')
    expect(formatTabRemark({ unchangedRows: 0, skippedOccurrences: 0 })).toBe('—')
  })
})
