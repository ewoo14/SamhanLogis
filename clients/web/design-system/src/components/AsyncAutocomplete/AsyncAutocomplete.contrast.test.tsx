import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * [#825 CM1] `.matchMark` WCAG AA 대비 가드 — light/dark 양 테마 실측.
 *
 * <p>결함 계보: R1 L4 가 `<mark>` 브라우저 기본 노랑을 토큰 미러로 교체하며
 * `color: inherit` 를 남겼고, dark theme 본문색(--color-neutral-900 → #F7F8FA)이
 * fallback 배경 #FEF3C7 위에서 1.05:1 로 AA 실패했다 (CODEX CM2/CM1).
 *
 * <p>[[feedback_css_var_token_not_fallback]] — `var(--token, #fallback)` 은 토큰이
 * 정의되면 토큰값이 렌더된다. 따라서 이 가드는 CSS 모듈의 fallback 리터럴이 아니라
 * tokens.css 의 <b>실효값</b>(light `:root` 선언 + dark 오버라이드 블록, 미정의 시
 * fallback)을 해석해 양 테마 대비를 재계산한다. 누군가 --color-warning-100 을 dark
 * 값으로 새로 정의하거나 --color-warning-800 dark 오버라이드로 쌍을 깨면 RED 가 된다.
 */

function channel(value: number): number {
  const normalized = value / 255
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4
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

/**
 * tokens.css 를 light(`:root` 첫 선언)와 dark(`html[data-theme="dark"]` 블록) 로
 * 나눠 해석한다. dark 는 오버라이드 우선 + light 상속. 미정의 토큰은 undefined.
 * var(--alias) 는 동일 테마 규칙으로 재귀 해석(깊이 상한 4).
 */
function loadThemeResolver(): (theme: Theme, name: string) => string | undefined {
  const css = readFileSync(join(process.cwd(), 'src/tokens/tokens.css'), 'utf8')

  const darkBlocks: string[] = []
  for (const match of css.matchAll(
    /(?:html|body)\[data-theme="dark"\][^{]*\{([^}]*)\}/g,
  )) {
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

  // light = 파일 전체에서 첫 선언 우선(:root 가 dark 블록보다 앞) — dark 블록 값 배제 위해
  // dark 블록을 제거한 소스로 파싱한다.
  const lightMap = parseDecls(
    css.replace(/(?:html|body)\[data-theme="dark"\][^{]*\{[^}]*\}/g, ''),
  )
  const darkMap = parseDecls(darkCss)

  const resolve = (theme: Theme, name: string, depth = 0): string | undefined => {
    if (depth > 4) throw new Error(`token alias too deep: --${name}`)
    const value =
      theme === 'dark'
        ? (darkMap.get(name) ?? lightMap.get(name))
        : lightMap.get(name)
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

/** `.matchMark` 선언 블록 — CSS 주석 제거본 (주석 속 `color: inherit` 언급 오탐 방지). */
function markBlockWithoutComments(css: string): string {
  const block = /\.matchMark\s*\{([\s\S]*?)\}/.exec(css)?.[1]
  if (!block) throw new Error('.matchMark 블록을 찾을 수 없습니다')
  return block.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** CSS 모듈에서 `.matchMark` 블록의 `prop: var(--token, #fallback)` 을 추출한다. */
function extractMarkPair(css: string): {
  bgToken: string
  bgFallback: string
  fgToken: string
  fgFallback: string
} {
  const block = markBlockWithoutComments(css)
  const bg = /background-color:\s*var\(\s*--([\w-]+)\s*,\s*(#[0-9a-fA-F]{6})\s*\)/.exec(block)
  const fg = /(?<![\w-])color:\s*var\(\s*--([\w-]+)\s*,\s*(#[0-9a-fA-F]{6})\s*\)/.exec(block)
  if (!bg) throw new Error('.matchMark background-color 가 var(--token, #hex) 형식이 아닙니다')
  if (!fg) throw new Error('.matchMark color 가 var(--token, #hex) 명시 색쌍이 아닙니다 (inherit 회귀?)')
  return { bgToken: bg[1]!, bgFallback: bg[2]!, fgToken: fg[1]!, fgFallback: fg[2]! }
}

describe('AsyncAutocomplete .matchMark 대비 (WCAG AA)', () => {
  const moduleCss = readFileSync(
    join(process.cwd(), 'src/components/AsyncAutocomplete/AsyncAutocomplete.module.css'),
    'utf8',
  )
  const token = loadThemeResolver()
  const pair = extractMarkPair(moduleCss)

  it('color: inherit 회귀를 차단한다 — 명시 색쌍 선언', () => {
    expect(markBlockWithoutComments(moduleCss)).not.toMatch(/color:\s*inherit/)
    expect(pair.fgToken).toBe('color-warning-800')
    expect(pair.bgToken).toBe('color-warning-100')
  })

  it.each(['light', 'dark'] as const)(
    '%s theme 실효값 쌍이 AA 4.5:1 이상이다 (mark 는 12~14px bold = small text)',
    (theme) => {
      const bg = token(theme, pair.bgToken) ?? pair.bgFallback
      const fg = token(theme, pair.fgToken) ?? pair.fgFallback
      const ratio = contrast(fg, bg)
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    },
  )

  it('토큰 실효값 == fallback (feedback_css_var_token_not_fallback — 값 불변 보장)', () => {
    // warning-100: 양 테마 미정의 → fallback #FEF3C7 렌더. 나중에 정의되면 위
    // it.each 가 재계산하지만, fallback 과 다른 값 정의는 미러(desktop) 드리프트
    // 위험이라 여기서 조기 감지한다.
    expect((token('light', pair.bgToken) ?? pair.bgFallback).toUpperCase()).toBe('#FEF3C7')
    expect((token('dark', pair.bgToken) ?? pair.bgFallback).toUpperCase()).toBe('#FEF3C7')
    // warning-800: 정의값 == fallback (#8C5C13) + dark 미오버라이드.
    expect((token('light', pair.fgToken) ?? pair.fgFallback).toUpperCase()).toBe('#8C5C13')
    expect((token('dark', pair.fgToken) ?? pair.fgFallback).toUpperCase()).toBe('#8C5C13')
  })
})
