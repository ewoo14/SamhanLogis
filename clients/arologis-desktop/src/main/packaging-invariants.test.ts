import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * 아로로지스 데스크톱 패키지(build:win) white-screen / asar-crash 회귀 가드.
 *
 * - preload 는 CommonJS(.cjs)로 빌드 + `sandbox:true` 유지.
 * - 렌더러 인증 브릿지는 `window.arologisAuth` namespace 로만 노출.
 * - `@samhan/design-system`(file: 로컬 의존)은 devDependencies.
 */
const here = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(here, '../..')
const read = (rel: string): string => readFileSync(resolve(desktopRoot, rel), 'utf8')
const readIfExists = (rel: string): string | null => {
  const path = resolve(desktopRoot, rel)
  return existsSync(path) ? readFileSync(path, 'utf8') : null
}

function stripComments(source: string): string {
  let output = ''
  let quote: '"' | "'" | '`' | null = null

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i]
    const next = source[i + 1]

    if (quote) {
      output += char
      if (char === '\\') {
        output += next ?? ''
        i += 1
        continue
      }
      if (char === quote) quote = null
      continue
    }

    if (char === '"' || char === "'" || char === '`') {
      quote = char
      output += char
      continue
    }

    if (char === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') i += 1
      output += '\n'
      continue
    }

    if (char === '/' && next === '*') {
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1
      i += 1
      continue
    }

    output += char
  }

  return output
}

describe('아로로지스 데스크톱 패키징 불변식 (white-screen 회귀 가드)', () => {
  it('메인 윈도우는 sandbox:true 를 유지한다', () => {
    const main = stripComments(read('src/main/index.ts'))
    expect(main).toMatch(/sandbox:\s*true/)
    expect(main).not.toMatch(/sandbox:\s*false/)
  })

  it('preload 는 .cjs 경로로 로드한다 (ESM .mjs 금지)', () => {
    const main = stripComments(read('src/main/index.ts'))
    expect(main).toMatch(/preload\/index\.cjs/)
    expect(main).not.toMatch(/preload\/index\.mjs/)
  })

  it('preload 빌드 출력은 CommonJS(.cjs) 다', () => {
    const cfg = stripComments(read('electron.vite.config.ts'))
    expect(cfg).toMatch(/format:\s*'cjs'/)
    expect(cfg).toMatch(/\[name\]\.cjs/)
    expect(cfg).not.toMatch(/format:\s*'es'/)
  })

  it('인증 브릿지는 window.arologisAuth 로 노출한다', () => {
    const preload = stripComments(read('src/preload/index.ts'))
    expect(preload).toContain("contextBridge.exposeInMainWorld('arologisAuth', arologisAuth)")
    expect(preload).not.toContain('samhanAuth')
  })

  it('@samhan/design-system 은 devDependencies (dependencies 금지)', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    expect(pkg.devDependencies?.['@samhan/design-system']).toBeDefined()
    expect(pkg.dependencies?.['@samhan/design-system']).toBeUndefined()
  })

  it('빌드 산출물이 있으면 main/preload 도 CJS preload 불변식을 만족한다', () => {
    const mainOut = readIfExists('out/main/index.js')
    const preloadOut = readIfExists('out/preload/index.cjs')

    if (mainOut) {
      expect(mainOut).toMatch(/sandbox:\s*true/)
      expect(mainOut.replace(/\\/g, '/')).toContain('preload/index.cjs')
    }

    if (preloadOut) {
      expect(preloadOut).toContain('require(')
    }
  })
})
