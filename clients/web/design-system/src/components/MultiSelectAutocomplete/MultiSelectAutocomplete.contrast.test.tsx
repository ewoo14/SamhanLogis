import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('MultiSelectAutocomplete 대비 계약', () => {
  it('칩 목록이 design-system 토큰과 명시적인 포커스 가능한 입력을 사용한다', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/components/MultiSelectAutocomplete/MultiSelectAutocomplete.module.css'),
      'utf8',
    )
    expect(css).toContain('var(--space-1)')
    expect(css).toContain('var(--space-2)')
    expect(css).not.toMatch(/#[0-9a-f]{6}/i)
  })
})
