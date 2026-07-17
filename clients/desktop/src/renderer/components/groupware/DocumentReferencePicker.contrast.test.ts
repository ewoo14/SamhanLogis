import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * [#825 CM1] DocumentReferencePicker `.matchMark` — design-system 미러 색쌍 가드.
 *
 * <p>이 모듈 CSS 는 design-system AsyncAutocomplete `.matchMark` 의 토큰 미러다
 * (R1 L4). R1 미러가 `color: inherit` 를 남겨 dark theme 에서 대비 1.05:1 AA 실패가
 * 재현됐다 (CODEX CM1). 여기서는 (1) inherit 회귀 차단, (2) design-system 원본과
 * 배경/글자 토큰·fallback 쌍 일치(미러 드리프트 감지), (3) fallback 리터럴 쌍의
 * AA 대비를 가드한다. 토큰 실효값(테마별) 대비 재계산은 design-system 의
 * AsyncAutocomplete.contrast.test.ts 가 담당한다 — 쌍 일치가 두 가드를 등가로 묶는다.
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

interface MarkPair {
  bgToken: string
  bgFallback: string
  fgToken: string
  fgFallback: string
}

/** `.matchMark` 선언 블록 — CSS 주석 제거본 (주석 속 `color: inherit` 언급 오탐 방지). */
function markBlockWithoutComments(css: string, sourceLabel: string): string {
  const block = /\.matchMark\s*\{([\s\S]*?)\}/.exec(css)?.[1]
  if (!block) throw new Error(`${sourceLabel}: .matchMark 블록을 찾을 수 없습니다`)
  return block.replace(/\/\*[\s\S]*?\*\//g, '')
}

function extractMarkPair(css: string, sourceLabel: string): MarkPair {
  const block = markBlockWithoutComments(css, sourceLabel)
  const bg = /background-color:\s*var\(\s*--([\w-]+)\s*,\s*(#[0-9a-fA-F]{6})\s*\)/.exec(block)
  const fg = /(?<![\w-])color:\s*var\(\s*--([\w-]+)\s*,\s*(#[0-9a-fA-F]{6})\s*\)/.exec(block)
  if (!bg) throw new Error(`${sourceLabel}: background-color 가 var(--token, #hex) 형식이 아닙니다`)
  if (!fg) {
    throw new Error(`${sourceLabel}: color 가 var(--token, #hex) 명시 색쌍이 아닙니다 (inherit 회귀?)`)
  }
  return { bgToken: bg[1]!, bgFallback: bg[2]!, fgToken: fg[1]!, fgFallback: fg[2]! }
}

describe('DocumentReferencePicker .matchMark 대비 미러 (WCAG AA)', () => {
  // vitest root = clients/desktop (vitest.config.ts 위치) — design-system 은 형제 경로.
  const desktopCss = readFileSync(
    join(
      process.cwd(),
      'src/renderer/components/groupware/DocumentReferencePicker.module.css',
    ),
    'utf8',
  )
  const designSystemCss = readFileSync(
    join(
      process.cwd(),
      '../web/design-system/src/components/AsyncAutocomplete/AsyncAutocomplete.module.css',
    ),
    'utf8',
  )
  const desktopPair = extractMarkPair(desktopCss, 'DocumentReferencePicker.module.css')
  const dsPair = extractMarkPair(designSystemCss, 'AsyncAutocomplete.module.css')

  it('color: inherit 회귀를 차단한다', () => {
    expect(
      markBlockWithoutComments(desktopCss, 'DocumentReferencePicker.module.css'),
    ).not.toMatch(/color:\s*inherit/)
  })

  it('design-system 원본과 토큰·fallback 쌍이 일치한다 (미러 드리프트 감지)', () => {
    expect(desktopPair.bgToken).toBe(dsPair.bgToken)
    expect(desktopPair.bgFallback.toUpperCase()).toBe(dsPair.bgFallback.toUpperCase())
    expect(desktopPair.fgToken).toBe(dsPair.fgToken)
    expect(desktopPair.fgFallback.toUpperCase()).toBe(dsPair.fgFallback.toUpperCase())
  })

  it('fallback 리터럴 쌍이 AA 4.5:1 이상이다 (mark 는 소형 bold 텍스트)', () => {
    expect(contrast(desktopPair.fgFallback, desktopPair.bgFallback)).toBeGreaterThanOrEqual(4.5)
  })
})
