import { describe, expect, it } from 'vitest'
import { canAssignSlipToGroupTarget } from './DispatchBoardPage'

describe('DispatchBoardPage drag assign guard', () => {
  it('삭제된 차량 그룹에는 미배차 전표 drop 신규배정을 발화하지 않는다', () => {
    expect(canAssignSlipToGroupTarget({ dispatchStatus: 'PENDING', isDeleted: true })).toBe(false)
  })

  it('미발송 활성 차량 그룹만 신규배정 drop 대상이다', () => {
    expect(canAssignSlipToGroupTarget({ dispatchStatus: 'PENDING', isDeleted: false })).toBe(true)
    expect(canAssignSlipToGroupTarget({ dispatchStatus: 'DISPATCHED', isDeleted: false })).toBe(false)
    expect(canAssignSlipToGroupTarget(null)).toBe(false)
  })
})
