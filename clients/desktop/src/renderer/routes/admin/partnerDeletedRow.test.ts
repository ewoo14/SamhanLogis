import { describe, expect, it } from 'vitest'
import {
  activePartnerRows,
  deletedBadgeAriaLabel,
  deletedBadgeLabel,
} from './partnerDeletedRow'
import type { PartnerSummary } from '../../api/adminApi'

const partner = (overrides: Partial<PartnerSummary>): PartnerSummary => ({
  partnerCode: 'P-1',
  name: '테스트거래처',
  bizNo: '123-45-67890',
  phone: null,
  status: 'ACTIVE',
  creditLimit: '0',
  outstandingBalance: '0',
  isDeleted: false,
  deletedAt: null,
  deletedByName: null,
  ...overrides,
})

describe('partnerDeletedRow', () => {
  it('deletedBadgeLabel 은 이름이 없으면 삭제됨만 표기한다', () => {
    expect(deletedBadgeLabel('홍길동')).toBe('삭제: 홍길동')
    expect(deletedBadgeLabel('  ')).toBe('삭제됨')
    expect(deletedBadgeLabel(null)).toBe('삭제됨')
    expect(deletedBadgeLabel(undefined)).toBe('삭제됨')
  })

  it('deletedBadgeAriaLabel 은 삭제 시각을 보조기술 라벨에 포함한다', () => {
    expect(deletedBadgeAriaLabel('홍길동', '2026-07-02T10:20:00')).toContain('삭제: 홍길동 · 삭제 시각:')
  })

  it('activePartnerRows 는 삭제행을 제외한 파생 목록을 반환한다', () => {
    expect(activePartnerRows([
      partner({ partnerCode: 'P-A', isDeleted: false }),
      partner({ partnerCode: 'P-D', isDeleted: true }),
    ])).toEqual([partner({ partnerCode: 'P-A', isDeleted: false })])
  })
})
