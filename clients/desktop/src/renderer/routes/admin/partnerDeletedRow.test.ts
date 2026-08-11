import { describe, expect, it } from 'vitest'
import {
  deletedBadgeAriaLabel,
  deletedBadgeLabel,
} from './partnerDeletedRow'

describe('partnerDeletedRow', () => {
  it('deletedBadgeLabel 은 이름이 없으면 삭제됨만 표기한다', () => {
    expect(deletedBadgeLabel('홍길동')).toBe('삭제: 홍길동')
    expect(deletedBadgeLabel('urn：uuid：ＣＡＦＥＢＡＢＥ‐ＣＡＦＥ‐ＢＡＢＥ‐ＣＡＦＥ‐ＢＡＢＥＣＡＦＥＢＡＢＥ')).toBe('삭제됨')
    expect(deletedBadgeLabel('system')).toBe('삭제: 시스템')
    expect(deletedBadgeLabel('  ')).toBe('삭제됨')
    expect(deletedBadgeLabel(null)).toBe('삭제됨')
    expect(deletedBadgeLabel(undefined)).toBe('삭제됨')
  })

  it('deletedBadgeAriaLabel 은 삭제 시각을 보조기술 라벨에 포함한다', () => {
    expect(deletedBadgeAriaLabel('홍길동', '2026-07-02T10:20:00')).toContain('삭제: 홍길동 · 삭제 시각:')
  })
})
