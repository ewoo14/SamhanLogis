import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * MultiSelectAutocomplete 대비 계약.
 *
 * <p>이 컴포넌트의 칩은 `label : value` TagChip 이다. 과거 테스트는 spacing 토큰 존재만
 * 확인하고 실제 칩 색은 검사하지 않아 허위였다. 여기서는 TagChip.module.css 의 실제 색 토큰을
 * tokens.css 실효값(light `:root` + dark 오버라이드)으로 해석해 WCAG 대비를 실측한다 —
 * label·value(본문 텍스트) ≥ 4.5:1, remove(X 버튼 그래픽) ≥ 3:1.
 *
 * <p>[[feedback_css_var_token_not_fallback]] — 토큰 정의 시 토큰값이 렌더되므로 tokens.css
 * 실효값을 재계산한다. brand-700(label)/text(value)/text-muted(remove) 어느 쪽이 대비를 깨는
 * 값으로 바뀌거나 raw hex 로 회귀하면 RED.
 */

function channel(value: number): number {
  const normalized = value / 255
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const rgb = hex.match(/[0-9a-f]{2}/gi)
  if (!rgb || rgb.length !== 3) throw new Error(`invalid color: ${hex}`)
  const [r, g, b] = rgb.map((value) => channel(Number.parseInt(value, 16)))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(foreground: string, background: string): number {
  const lighter = Math.max(luminance(foreground), luminance(background))
  const darker = Math.min(luminance(foreground), luminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

type Theme = 'light' | 'dark'

/** tokens.css 를 light(`:root`)/dark(`[data-theme="dark"]`) 로 나눠 실효값을 재귀 해석한다. */
function loadThemeResolver(): (theme: Theme, name: string) => string | undefined {
  const css = readFileSync(join(process.cwd(), 'src/tokens/tokens.css'), 'utf8')

  const darkBlocks: string[] = []
  for (const match of css.matchAll(/(?:html|body)\[data-theme="dark"\][^{]*\{([^}]*)\}/g)) {
    darkBlocks.push(match[1]!)
  }
  const darkCss = darkBlocks.join('\n')

  const parseDecls = (source: string): Map<string, string> => {
    const map = new Map<string, string>()
    for (const declaration of source.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      const name = declaration[1]!
      if (!map.has(name)) map.set(name, declaration[2]!.trim())
    }
    return map
  }

  const lightMap = parseDecls(css.replace(/(?:html|body)\[data-theme="dark"\][^{]*\{[^}]*\}/g, ''))
  const darkMap = parseDecls(darkCss)

  const resolve = (theme: Theme, name: string, depth = 0): string | undefined => {
    if (depth > 4) throw new Error(`token alias too deep: --${name}`)
    const value = theme === 'dark' ? (darkMap.get(name) ?? lightMap.get(name)) : lightMap.get(name)
    if (value === undefined) return undefined
    const alias = /^var\(\s*--([\w-]+)\s*\)$/.exec(value)
    if (alias) return resolve(theme, alias[1]!, depth + 1)
    if (!/^#[0-9a-fA-F]{6}$/.test(value)) {
      throw new Error(`token --${name} is not a 6-digit hex: ${value}`)
    }
    return value
  }
  return (theme, name) => resolve(theme, name)
}

/** CSS 모듈에서 `.selector` 블록(주석 제거)을 추출한다. */
function blockOf(css: string, selector: string): string {
  const block = new RegExp(`\\.${selector}\\s*\\{([\\s\\S]*?)\\}`).exec(css)?.[1]
  if (!block) throw new Error(`.${selector} 블록을 찾을 수 없습니다`)
  return block.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** `prop: var(--token[, fallback])` 에서 토큰명을 추출한다. */
function tokenOf(block: string, prop: string): string {
  const match = new RegExp(`(?<![\\w-])${prop}\\s*:\\s*var\\(\\s*--([\\w-]+)\\s*(?:,[^)]*)?\\)`).exec(block)
  if (!match) throw new Error(`${prop} 이 var(--token) 형식이 아닙니다`)
  return match[1]!
}

const tagChipCss = readFileSync(
  join(process.cwd(), 'src/components/TagChip/TagChip.module.css'),
  'utf8',
)
const token = loadThemeResolver()

const chipBgToken = tokenOf(blockOf(tagChipCss, 'chip'), 'background-color')
const labelToken = tokenOf(blockOf(tagChipCss, 'label'), 'color')
const valueToken = tokenOf(blockOf(tagChipCss, 'value'), 'color')
const removeToken = tokenOf(blockOf(tagChipCss, 'remove'), 'color')

describe('MultiSelectAutocomplete 대비 계약', () => {
  it('칩 목록이 design-system 토큰과 spacing 을 사용한다', () => {
    const css = readFileSync(
      join(process.cwd(), 'src/components/MultiSelectAutocomplete/MultiSelectAutocomplete.module.css'),
      'utf8',
    )
    expect(css).toContain('var(--space-1)')
    expect(css).toContain('var(--space-2)')
    expect(css).not.toMatch(/#[0-9a-f]{6}/i)
  })

  it('TagChip 색이 raw hex 가 아닌 토큰을 인용한다 (회귀 차단)', () => {
    expect(tagChipCss).not.toMatch(/#[0-9a-f]{6}/i)
    expect(chipBgToken).toBe('color-bg-subtle')
    expect(labelToken).toBe('color-brand-700')
    expect(valueToken).toBe('color-text')
    expect(removeToken).toBe('color-text-muted')
  })

  it.each(['light', 'dark'] as const)(
    '%s 테마에서 `label : value` 칩 전경/배경 대비가 WCAG 기준을 충족한다',
    (theme) => {
      const bg = token(theme, chipBgToken)
      const label = token(theme, labelToken)
      const value = token(theme, valueToken)
      const remove = token(theme, removeToken)
      if (!bg || !label || !value || !remove) throw new Error(`${theme} 테마 토큰 미해석`)

      // label·value = 칩 텍스트(13px) → small text 4.5:1
      expect(contrast(label, bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(value, bg)).toBeGreaterThanOrEqual(4.5)
      // remove = X 버튼 아이콘(그래픽 컨트롤) → 3:1
      expect(contrast(remove, bg)).toBeGreaterThanOrEqual(3)
    },
  )
})
