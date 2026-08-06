import { describe, expect, it } from 'vitest'
import {
  actionsForStatus,
  canAccessSlipAction,
  canTransitionSlipAction,
  labelForAction,
  slipDetailErrorMessage,
} from './SlipDetailPage'

describe('출고 검수 전이 액션 계약', () => {
  it('PROCESSING은 complete, INSPECTING은 inspect를 호출한다', () => {
    expect(actionsForStatus('PROCESSING', 'OUTBOUND')).toEqual(['complete'])
    expect(actionsForStatus('INSPECTING', 'OUTBOUND')).toEqual(['inspect', 'reject'])
  })

  it('정적 UPDATE가 없는 결재선 개인은 데스크톱·모바일·클릭 가드에서 inspect가 허용된다', () => {
    const canAccess = () => false

    expect(canTransitionSlipAction('inspect', 'OUTBOUND', canAccess, true)).toBe(true)
  })

  it('결재선 밖 계정은 inspect 버튼이 비활성이고 전이를 호출할 수 없다', () => {
    const canAccess = () => false

    expect(canTransitionSlipAction('inspect', 'OUTBOUND', canAccess, false)).toBe(false)
  })

  it('RED-A/B: capability는 OUTBOUND inspect만 보완하고 다중 INBOUND 권한을 우회하지 않는다', () => {
    const transferOnly = (pageCode: string, action = 'view') =>
      pageCode === 'slip.transfer.process' && action === 'update'

    expect(canAccessSlipAction('inspect', 'OUTBOUND', () => false, true)).toBe(true)
    expect(canAccessSlipAction('inspect', 'OUTBOUND', () => true, false)).toBe(false)
    expect(canAccessSlipAction('inspect', 'INBOUND', transferOnly, true)).toBe(false)
    expect(canAccessSlipAction('save', 'INBOUND', transferOnly, true)).toBe(false)
  })

  it('INBOUND complete 라벨은 출고 완료가 아니다', () => {
    expect(labelForAction('complete', 'INBOUND')).toBe('입고 완료')
    expect(labelForAction('complete', 'INBOUND')).not.toBe('출고 완료')
    expect(labelForAction('complete', 'OUTBOUND')).toBe('출고 완료')
  })

  it('403 상세 조회는 일반 로드 실패가 아닌 명확한 접근 차단 안내를 반환한다', () => {
    expect(slipDetailErrorMessage({ response: { status: 403 } })).toContain('접근 권한')
    expect(slipDetailErrorMessage({ response: { status: 500 } })).toBe('전표를 불러오지 못했습니다.')
  })
})
