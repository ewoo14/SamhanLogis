import { describe, expect, it } from 'vitest'
import { shouldNotifyConversation } from './conversation-notification'

describe('대화방 알림 포커스 계약', () => {
  it('대화방이 포커스면 알리지 않는다', () => {
    expect(shouldNotifyConversation(false)).toBe(false)
  })

  it('대화방이 뒤에 있으면 알린다', () => {
    expect(shouldNotifyConversation(true)).toBe(true)
  })
})
