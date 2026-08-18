import { describe, expect, it } from 'vitest'
import { dailyClosingSourceTableLabels } from './DailyClosingPage'

describe('일마감 원천행 표기', () => {
  it.each([
    ['OUTBOUND', '출고전표 원본행', '출고일'],
    ['INBOUND', '입고전표 원본행', '입고일'],
  ] as const)('%s는 원천 유형과 날짜축을 함께 표기한다', (slipType, heading, dateLabel) => {
    expect(dailyClosingSourceTableLabels(slipType)).toEqual({ heading, dateLabel })
  })
})
