import { describe, expect, it } from 'vitest'
import {
  DELETED_ROW_TEXT_STYLE,
  deletedBadgeAriaLabel,
  deletedAtTooltip,
  deletedBadgeLabel,
} from '../../realtime/deletedRowDisplay'
import {
  activeSlipRows,
  activeVehicleGroups,
} from './dispatchDeletedRow'
import type { DispatchVehicleGroupResponse } from '../../api/dispatchTask'

function group(overrides: Partial<DispatchVehicleGroupResponse>): DispatchVehicleGroupResponse {
  return {
    id: 'g',
    sequence: 1,
    vehicleType: 'TONNAGE_1',
    vehicleTypeDisplay: '1톤',
    vehicleBodyType: 'CARGO',
    vehicleBodyTypeDisplay: '카고',
    tonnage: 'T_1',
    tonnageDisplay: '1톤',
    dispatchStatus: 'PENDING',
    isDeleted: false,
    deletedAt: null,
    deletedByName: null,
    slips: [],
    ...overrides,
  }
}

describe('dispatchDeletedRow 파생 유틸', () => {
  it('activeSlipRows 는 삭제행을 제외한다 (reorder/게이팅/카운트의 근간)', () => {
    const rows = activeSlipRows({
      slips: [
        { id: 'm1', slipId: 's1', sequence: 1, isDeleted: true } as never,
        { id: 'm2', slipId: 's2', sequence: 2, isDeleted: false } as never,
        { id: 'm3', slipId: 's3', sequence: 3 } as never, // isDeleted 필드 부재 = 활성(과거 응답 호환)
      ],
    })
    expect(rows.map((r) => r.slipId)).toEqual(['s2', 's3'])
  })

  it('activeVehicleGroups 는 삭제 그룹을 제외한다', () => {
    const groups = activeVehicleGroups([
      group({ id: 'a', isDeleted: true }),
      group({ id: 'b', isDeleted: false }),
    ])
    expect(groups.map((g) => g.id)).toEqual(['b'])
  })

  it('deletedBadgeLabel 은 이름이 없으면 삭제됨만 표기한다 (이름 추정 금지)', () => {
    expect(deletedBadgeLabel('홍길동')).toBe('삭제: 홍길동')
    expect(deletedBadgeLabel('\u2063cafebabe-cafe-babe-cafe-babecafebabe\u2063')).toBe('삭제됨')
    expect(deletedBadgeLabel('system')).toBe('삭제: 시스템')
    expect(deletedBadgeLabel('  ')).toBe('삭제됨')
    expect(deletedBadgeLabel(null)).toBe('삭제됨')
    expect(deletedBadgeLabel(undefined)).toBe('삭제됨')
  })

  it('deletedAtTooltip 은 파싱 불가/부재 값에 undefined 를 반환한다', () => {
    expect(deletedAtTooltip(null)).toBeUndefined()
    expect(deletedAtTooltip('not-a-date')).toBeUndefined()
    expect(deletedAtTooltip('2026-07-02T10:20:00')).toContain('삭제 시각:')
  })

  it('deletedBadgeAriaLabel 은 삭제자와 삭제 시각을 함께 제공한다', () => {
    expect(deletedBadgeAriaLabel('홍길동', '2026-07-02T10:20:00')).toContain('삭제: 홍길동 · 삭제 시각:')
    expect(deletedBadgeAriaLabel(null, null)).toBe('삭제됨')
  })

  it('삭제행 텍스트는 배차 상태별 배경에서 WCAG AA 대비를 만족하는 neutral-600 을 사용한다', () => {
    expect(DELETED_ROW_TEXT_STYLE).toMatchObject({
      textDecoration: 'line-through',
      color: 'var(--color-neutral-600)',
    })
  })
})
