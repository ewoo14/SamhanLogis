import { describe, expect, it } from 'vitest'
import { getConversationBounds, saveConversationBounds, type WindowBounds } from './conversation-window-state'

describe('대화창 로컬 geometry 저장', () => {
  it('방별 저장값을 읽고 저장하지 않은 방은 기본값을 쓴다', () => {
    const defaults: WindowBounds = { width: 560, height: 760, x: 20, y: 30 }
    const saved = { 'room:ROOM-1': { width: 720, height: 800, x: 100, y: 120 } }
    expect(getConversationBounds(saved, 'room:ROOM-1', defaults)).toEqual(saved['room:ROOM-1'])
    expect(getConversationBounds(saved, 'room:ROOM-2', defaults)).toEqual(defaults)
  })

  it('geometry 저장은 다른 방의 geometry를 덮지 않는다', () => {
    const saved = saveConversationBounds({}, 'room:ROOM-1', { width: 600, height: 700, x: 1, y: 2 })
    expect(saveConversationBounds(saved, 'room:ROOM-2', { width: 800, height: 900, x: 3, y: 4 })).toEqual({
      'room:ROOM-1': { width: 600, height: 700, x: 1, y: 2 },
      'room:ROOM-2': { width: 800, height: 900, x: 3, y: 4 },
    })
  })
})
