import { describe, expect, it } from 'vitest'
import {
  PARTNER_REQUIRED_SEND_MESSAGE,
  shouldBlockPartnerlessSend,
} from './SlipDetailPage'

describe('SlipDetailPage 거래처 필수 전송 preflight', () => {
  it.each([
    ['mobile', 'handleTransition'],
    ['desktop', 'handleAdvanceStage'],
  ])('%s %s는 SAVED 거래처 없는 SENT 전이를 차단한다', (surface, entryPoint) => {
    expect(shouldBlockPartnerlessSend({ status: 'SAVED', partnerId: null }, 'send')).toBe(true)
    expect(PARTNER_REQUIRED_SEND_MESSAGE).toBe(
      '거래처를 먼저 지정해야 전송할 수 있습니다 — 전표 수정에서 거래처를 지정하세요',
    )
    expect(`${surface}:${entryPoint}`).toBeTruthy()
  })

  it('거래처가 있으면 SAVED 전송을 차단하지 않는다', () => {
    expect(shouldBlockPartnerlessSend(
      { status: 'SAVED', partnerId: 'partner-id' },
      'send',
    )).toBe(false)
  })

  it('DRAFT 저장과 send 이외의 전이는 거래처 없이도 차단하지 않는다', () => {
    expect(shouldBlockPartnerlessSend({ status: 'DRAFT', partnerId: null }, 'save')).toBe(false)
    expect(shouldBlockPartnerlessSend({ status: 'SENT', partnerId: null }, 'accept')).toBe(false)
  })
})
