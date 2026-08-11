import { describe, expect, it } from 'vitest'
import { safeActorName } from './actorName'

const UUID32 = 'cafebabecafebabecafebabecafebabe'
const CANONICAL_UUID = 'cafebabe-cafe-babe-cafe-babecafebabe'

describe('safeActorName', () => {
  it.each([
    CANONICAL_UUID,
    UUID32,
    `{${CANONICAL_UUID}}`,
    `{${UUID32}}`,
    `urn:uuid:${CANONICAL_UUID}`,
    `urn:uuid:${UUID32}`,
    `\u200B${CANONICAL_UUID}\u200B`,
    `\u200B${UUID32}\u200B`,
    `\u200C{${UUID32}}\u200D`,
    `\uFEFFurn:uuid:${UUID32}\u2060`,
    `\u2063${CANONICAL_UUID}\u2063`,
    'urn：uuid：ＣＡＦＥＢＡＢＥ‐ＣＡＦＥ‐ＢＡＢＥ‐ＣＡＦＥ‐ＢＡＢＥＣＡＦＥＢＡＢＥ',
    'ｕｒｎ：ｕｕｉｄ：ＣＡＦＥＢＡＢＥ‐ＣＡＦＥ‐ＢＡＢＥ‐ＣＡＦＥ‐ＢＡＢＥＣＡＦＥＢＡＢＥ',
  ])('UUID 변형 %s 를 unknown 처리한다', (actorName) => {
    expect(safeActorName(actorName)).toBeNull()
  })

  it('정상 이름은 원문을 보존한다', () => {
    expect(safeActorName('김감사')).toBe('김감사')
    expect(safeActorName('Α팀')).toBe('Α팀')
  })

  it('SYSTEM 토큰은 화면 표기 정본인 시스템으로 변환한다', () => {
    expect(safeActorName('system')).toBe('시스템')
  })
})
