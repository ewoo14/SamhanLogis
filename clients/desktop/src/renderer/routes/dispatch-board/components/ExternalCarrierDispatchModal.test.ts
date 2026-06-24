import { describe, expect, it } from 'vitest'
import {
  canCreateExternalDispatch,
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
})
