import { describe, expect, it } from 'vitest'
import {
  PARTNER_REQUIRED_SEND_MESSAGE,
  shouldBlockPartnerlessSend,
} from './SlipDetailPage'

/**
 * 전송 preflight predicate 계약 테스트. mobile(handleTransition)·desktop(handleAdvanceStage)
 * 양 진입점이 이 shared predicate 를 호출하도록 배선돼 있으며(코드 대조), 실제 SAVED→SENT
 * 전송 차단의 권위 backstop 은 BE Slip.send() 가드다(라이브QA·SlipDomainIT 가 관통 검증).
 * 여기서는 preflight 판정 로직의 참/거짓 경계를 고정한다.
 */
describe('SlipDetailPage 거래처 필수 전송 preflight', () => {
  it('SAVED 거래처 없는 send 전이는 차단(true) — mobile·desktop 공통 predicate', () => {
    expect(shouldBlockPartnerlessSend({ status: 'SAVED', partnerId: null }, 'send')).toBe(true)
    expect(PARTNER_REQUIRED_SEND_MESSAGE).toBe(
      '거래처를 먼저 지정해야 전송할 수 있습니다 — 전표 수정에서 거래처를 지정하세요',
    )
  })

  it('거래처가 있으면 SAVED 전송을 차단하지 않는다(false)', () => {
    expect(shouldBlockPartnerlessSend(
      { status: 'SAVED', partnerId: 'partner-id' },
      'send',
    )).toBe(false)
  })

  it('DRAFT 저장·send 이외 전이는 거래처 없이도 차단하지 않는다(false)', () => {
    expect(shouldBlockPartnerlessSend({ status: 'DRAFT', partnerId: null }, 'save')).toBe(false)
    expect(shouldBlockPartnerlessSend({ status: 'SENT', partnerId: null }, 'accept')).toBe(false)
    // SAVED 라도 send 가 아닌 전이는 통과(다른 액션은 BE 상태머신이 처리)
    expect(shouldBlockPartnerlessSend({ status: 'SAVED', partnerId: null }, 'cancel')).toBe(false)
  })
})
