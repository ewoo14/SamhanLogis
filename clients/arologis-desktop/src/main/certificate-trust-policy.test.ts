import { describe, it, expect } from 'vitest'
import { shouldPromptForTrustRoot } from './certificate-trust-policy'

describe('인증서 확인 시작 진리표', () => {
  it.each([
    { name: '개발 + env 미설정', isPackaged: false, skipEnv: undefined, expected: true },
    { name: '개발 + env=1', isPackaged: false, skipEnv: '1', expected: false },
    { name: '패키지 + env 미설정', isPackaged: true, skipEnv: undefined, expected: true },
    { name: '패키지 + env=1', isPackaged: true, skipEnv: '1', expected: true },
  ])('$name → prompt 실행=$expected', ({ isPackaged, skipEnv, expected }) => {
    expect(shouldPromptForTrustRoot(isPackaged, skipEnv)).toBe(expected)
  })
})
