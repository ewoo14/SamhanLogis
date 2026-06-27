import { describe, expect, it } from 'vitest'
import {
  formatKstDate,
  kstDateTimeInputToLocalDateTime,
} from './formatDate'

describe('formatDate', () => {
  it('converts datetime-local input to backend LocalDateTime without offset', () => {
    expect(kstDateTimeInputToLocalDateTime('2026-06-27T10:00')).toBe('2026-06-27T10:00:00')
    expect(kstDateTimeInputToLocalDateTime('2026-06-27T10:00:30+09:00')).toBe('2026-06-27T10:00:30')
  })

  it('keeps display date formatting in KST', () => {
    expect(formatKstDate('2026-06-27T09:00:00+09:00')).toBe('2026.06.27')
  })
})
