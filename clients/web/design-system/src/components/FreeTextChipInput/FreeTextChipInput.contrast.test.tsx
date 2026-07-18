import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('FreeTextChipInput 대비 계약', () => {
  it('칩 간격과 입력 레이아웃이 design-system 토큰을 사용한다', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/components/FreeTextChipInput/FreeTextChipInput.module.css'),
      'utf8',
    )
    expect(css).toContain('var(--space-1)')
    expect(css).toContain('var(--space-2)')
    expect(css).not.toMatch(/#[0-9a-f]{6}/i)
  })
})
