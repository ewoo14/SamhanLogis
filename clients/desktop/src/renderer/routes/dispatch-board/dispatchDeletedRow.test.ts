import { describe, expect, it } from 'vitest'
import {
  activeSlipRows,
  activeVehicleGroups,
  deletedAtTooltip,
  deletedBadgeLabel,
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
    expect(deletedBadgeLabel('  ')).toBe('삭제됨')
    expect(deletedBadgeLabel(null)).toBe('삭제됨')
    expect(deletedBadgeLabel(undefined)).toBe('삭제됨')
  })

  it('deletedAtTooltip 은 파싱 불가/부재 값에 undefined 를 반환한다', () => {
    expect(deletedAtTooltip(null)).toBeUndefined()
    expect(deletedAtTooltip('not-a-date')).toBeUndefined()
    expect(deletedAtTooltip('2026-07-02T10:20:00')).toContain('삭제 시각:')
  })
})
