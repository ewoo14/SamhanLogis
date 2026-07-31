import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TEMPLATE_AUTHORING_MODE,
  TEMPLATE_AUTHORING_MODE_LABEL,
  normalizeTemplateAuthoringMode,
} from './templateAuthoringMode'

describe('template authoring mode contract', () => {
  it('사용자 표시 라벨을 mode별로 고정한다', () => {
    expect(TEMPLATE_AUTHORING_MODE_LABEL).toEqual({ WORD: '워드 방식', EXCEL: '엑셀 방식' })
  })

  it('알려진 mode는 그대로 보존한다', () => {
    expect(normalizeTemplateAuthoringMode('WORD')).toBe('WORD')
    expect(normalizeTemplateAuthoringMode('EXCEL')).toBe('EXCEL')
  })

  it.each([undefined, null, '', 'word', 'PDF', 1, {}])(
    '누락·알 수 없는 값 %p은 legacy 기본값으로 normalize한다',
    (value) => {
      expect(normalizeTemplateAuthoringMode(value)).toBe(DEFAULT_TEMPLATE_AUTHORING_MODE)
    },
  )
})
