import { describe, expect, it } from 'vitest'
import { canResetPartnerPassword } from './orderAppAccess'

describe('주문서 앱 접근권한 설정 비밀번호 초기화 게이트', () => {
  it('미리보기 대상이 아니면 권한이 있어도 실행할 수 없다', () => {
    expect(canResetPartnerPassword('P999', new Set(['P001']), true)).toBe(false)
  })

  it('권한과 미리보기 대상이 모두 있으면 실행할 수 있다', () => {
    expect(canResetPartnerPassword('P001', new Set(['P001']), true)).toBe(true)
  })
})
