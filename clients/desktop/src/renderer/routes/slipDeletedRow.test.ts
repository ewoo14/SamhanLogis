import { describe, expect, it } from 'vitest'
import {
  deletedSlipBadgeAriaLabel,
  deletedSlipBadgeLabel,
} from './slipDeletedRow'

describe('slipDeletedRow', () => {
  it('formats deleted slip badge with actor name only', () => {
    expect(deletedSlipBadgeLabel(' 김영업 ')).toBe('삭제: 김영업')
    expect(deletedSlipBadgeLabel('\u2063cafebabe-cafe-babe-cafe-babecafebabe\u2063')).toBe('삭제됨')
    expect(deletedSlipBadgeLabel('system')).toBe('삭제: 시스템')
  })

  it('does not guess a deleted actor name when it is absent', () => {
    expect(deletedSlipBadgeLabel(null)).toBe('삭제됨')
  })

  it('adds deleted time to accessible badge text when valid', () => {
    expect(
      deletedSlipBadgeAriaLabel('김영업', '2026-07-07T10:30:00+09:00'),
    ).toContain('삭제 시각:')
  })
})
