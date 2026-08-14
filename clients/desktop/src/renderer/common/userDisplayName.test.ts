import { describe, expect, it } from 'vitest'
import { sanitizeDisplayName } from './userDisplayName'

describe('공통 사용자 표시 경계', () => {
  it('헤더·목록·방·참여자·알림·인쇄물이 공유할 표시명에서 DEV-SEED를 제거한다', () => {
    expect(sanitizeDisplayName('[DEV-SEED] 개발마스터')).toBe('개발마스터')
    expect(sanitizeDisplayName('[dev-seed] 개발매니저')).toBe('개발매니저')
    expect(sanitizeDisplayName('김미선')).toBe('김미선')
  })
})
