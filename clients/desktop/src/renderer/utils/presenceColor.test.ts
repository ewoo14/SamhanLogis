import { describe, expect, it } from 'vitest'
import { presenceColorFromUserId, presenceHexFromUserId, presenceColorToHex } from './presenceColor'

describe('presenceColor', () => {
  it('BE PresenceColor.fromUserId 와 동일한 Java hash 팔레트를 사용한다', () => {
    expect(presenceColorFromUserId(null)).toBe('BLUE')
    expect(presenceColorFromUserId('account-user-1')).toBe('PINK')
    expect(presenceColorFromUserId('dev-master')).toBe('AMBER')
    expect(presenceColorFromUserId('warehouse-user')).toBe('CYAN')
    expect(presenceHexFromUserId('warehouse-user')).toBe('#0E7490')
  })

  it('presence enum 과 coedit hex 입력을 같은 렌더 색상으로 정규화한다', () => {
    expect(presenceColorToHex('GREEN')).toBe('#15803D')
    expect(presenceColorToHex('#123456')).toBe('#123456')
  })
})
