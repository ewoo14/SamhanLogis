import { describe, expect, it } from 'vitest'
import { decideTrustRootPrompt, type TrustRootState } from './certificate-trust-policy'

describe('아로로지스 신뢰 루트 승인 정책', () => {
  it('거부하면 앱 사용을 막지 않고 다음 실행에 다시 물을 상태를 남긴다', () => {
    const state: TrustRootState = { installed: false, declined: false }
    const result = decideTrustRootPrompt(state, 'decline')

    expect(result).toEqual({ installed: false, declined: true, shouldAskNextRun: true, shouldBlockApp: false, updateDisabled: true })
    expect(result.shouldBlockApp).toBe(false)
  })

  it('거부 상태는 다시 묻되 자동 업데이트가 꺼져 있음을 표시한다', () => {
    expect(decideTrustRootPrompt({ installed: false, declined: true }, 'startup')).toEqual({
      installed: false,
      declined: true,
      shouldAskNextRun: true,
      shouldBlockApp: false,
      updateDisabled: true,
    })
  })

  it('승인하면 신뢰 루트 설치 후 자동 업데이트를 켠다', () => {
    expect(decideTrustRootPrompt({ installed: false, declined: true }, 'approve')).toEqual({
      installed: true,
      declined: false,
      shouldAskNextRun: false,
      shouldBlockApp: false,
      updateDisabled: false,
    })
  })
})
