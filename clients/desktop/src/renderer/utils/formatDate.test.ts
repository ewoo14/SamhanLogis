import { describe, expect, it } from 'vitest'
import {
  formatKstDate,
  formatKstDateTimeInputValue,
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

  it('treats backend offset-less LocalDateTime as KST wall-clock time', () => {
    expect(formatKstDate('2026-06-27T23:30:00')).toBe('2026.06.27')
    expect(formatKstDateTimeInputValue('2026-06-27T10:00:00')).toBe('2026-06-27T10:00')
  })
})
