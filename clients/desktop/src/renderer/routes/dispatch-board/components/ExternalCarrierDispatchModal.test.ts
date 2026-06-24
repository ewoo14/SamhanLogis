import { describe, expect, it } from 'vitest'
import {
  canViewExternalDispatchPrint,
  canCreateExternalDispatch,
  externalDispatchPrintPath,
  resolveDispatchFeedback,
  validateExternalDispatchSelection,
} from './ExternalCarrierDispatchModal'

describe('ExternalCarrierDispatchModal model', () => {
  it('전표와 기사 선택이 모두 있어야 발송 가능하다', () => {
    expect(validateExternalDispatchSelection([], 'carrier-001')).toBe('발송할 전표를 선택하세요.')
    expect(validateExternalDispatchSelection([{ id: 'slip-001' }], null)).toBe('외부기사/배송사를 선택하세요.')
    expect(validateExternalDispatchSelection([{ id: 'slip-001' }], 'carrier-001')).toBeNull()
  })

  it('dispatch.board CREATE 권한으로 타배송사 발송 액션을 노출한다', () => {
    expect(canCreateExternalDispatch(() => true)).toBe(true)
    expect(canCreateExternalDispatch(() => false)).toBe(false)
  })

  it('dispatch.board VIEW 권한으로 배차의뢰서 인쇄 액션을 노출한다', () => {
    expect(canViewExternalDispatchPrint(() => true)).toBe(true)
    expect(canViewExternalDispatchPrint(() => false)).toBe(false)
  })

  it('SENT 응답만 성공 메시지를 띄운다 (P1 거짓양성 회귀 가드)', () => {
    const sent = resolveDispatchFeedback({ status: 'SENT', carrierName: '한빛퀵', slipCount: 2, channel: 'SMS' })
    expect(sent.successMessage).toContain('발송 완료')
    expect(sent.errorMessage).toBeNull()
  })

  it('PRINT 성공은 SMS 표현 없이 인쇄 안내를 띄운다', () => {
    const sent = resolveDispatchFeedback({ status: 'SENT', carrierName: '한빛퀵', slipCount: 2, channel: 'PRINT' })
    expect(sent.successMessage).toContain('인쇄 배차의뢰서 생성 완료')
    expect(sent.successMessage).not.toContain('SMS')
    expect(sent.errorMessage).toBeNull()
  })

  it('BOTH 성공은 SMS와 인쇄 안내를 함께 띄운다', () => {
    const sent = resolveDispatchFeedback({ status: 'SENT', carrierName: '한빛퀵', slipCount: 2, channel: 'BOTH' })
    expect(sent.successMessage).toContain('SMS 발송 및 인쇄 배차의뢰서 생성 완료')
    expect(sent.errorMessage).toBeNull()
  })

  it('FAILED 응답(HTTP 200)은 성공이 아니라 실패 피드백을 띄운다 (P1)', () => {
    // BE 가 SMS 실패 시에도 200 + status=FAILED 로 응답 → 성공으로 오인하면 미발송 누락.
    const failed = resolveDispatchFeedback({ status: 'FAILED', carrierName: '한빛퀵', slipCount: 2, channel: 'BOTH' })
    expect(failed.successMessage).toBeNull()
    expect(failed.errorMessage).toContain('실패')
  })

  it('PRINT/BOTH 성공 응답의 dispatchId 로 인쇄 라우트를 만든다', () => {
    expect(externalDispatchPrintPath({
      id: 'dispatch-001',
      status: 'SENT',
      channel: 'PRINT',
    })).toBe('/dispatch/external-dispatch/dispatch-001/print')
    expect(externalDispatchPrintPath({
      id: 'dispatch-002',
      status: 'SENT',
      channel: 'BOTH',
    })).toBe('/dispatch/external-dispatch/dispatch-002/print')
    expect(externalDispatchPrintPath({
      id: 'dispatch-003',
      status: 'SENT',
      channel: 'SMS',
    })).toBeNull()
  })
})
