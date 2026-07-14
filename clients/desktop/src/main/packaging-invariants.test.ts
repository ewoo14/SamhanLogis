import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * 데스크톱 패키지(build:win) white-screen / asar-crash 회귀 가드 (#804/#817).
 *
 * CI(`frontend-desktop`)는 electron-builder(`build:win`)를 실행하지 않아
 * packaged(file:///asar) 경로가 자동 검증되지 않는다. 아래 불변식이 깨지면
 * packaged 앱이 흰 화면이 되거나(preload 미로드) asar 패킹이 실패하므로
 * 소스 레벨에서 최소 가드한다. (DevOps/QA 리뷰 GAP3, 2026-07-14)
 *
 * - preload 는 CommonJS(.cjs)로 빌드 + `sandbox:true` 유지 — 샌드박스 preload 는
 *   ESM(.mjs)을 로드하지 못한다("Cannot use import statement outside a module").
 * - `@samhan/design-system`(file: 로컬 의존)은 devDependencies — dependencies 면
 *   electron-builder asar packer 가 앱 밖 파일 상대경로 계산 실패로 빌드 중단.
 */
const here = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(here, '../..')
const read = (rel: string): string => readFileSync(resolve(desktopRoot, rel), 'utf8')

describe('데스크톱 패키징 불변식 (white-screen 회귀 가드)', () => {
  it('메인 윈도우는 sandbox:true 를 유지한다 (OS 렌더러 샌드박스)', () => {
    const main = read('src/main/index.ts')
    expect(main).toMatch(/sandbox:\s*true/)
    expect(main).not.toMatch(/sandbox:\s*false/)
  })

  it('preload 는 .cjs 경로로 로드한다 (ESM .mjs 금지)', () => {
    const main = read('src/main/index.ts')
    expect(main).toMatch(/preload\/index\.cjs/)
    expect(main).not.toMatch(/preload\/index\.mjs/)
  })

  it('preload 빌드 출력은 CommonJS(.cjs) 다', () => {
    const cfg = read('electron.vite.config.ts')
    expect(cfg).toMatch(/format:\s*'cjs'/)
    expect(cfg).toMatch(/\[name\]\.cjs/)
    expect(cfg).not.toMatch(/format:\s*'es'/)
  })

  it('@samhan/design-system 은 devDependencies (dependencies 금지 — asar 크래시 방지)', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    expect(pkg.devDependencies?.['@samhan/design-system']).toBeDefined()
    expect(pkg.dependencies?.['@samhan/design-system']).toBeUndefined()
  })
})
