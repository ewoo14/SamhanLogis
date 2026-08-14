import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appRoot = resolve(__dirname, '../..')

describe('실제 Electron 메신저 진입점', () => {
  it('Electron renderer는 v2 ChatApp을 Router로 구 화면에 우회시키지 않는다', () => {
    const entry = readFileSync(resolve(appRoot, 'src/renderer/main.ts'), 'utf8')
    expect(entry).toContain('createElement(ChatApp)')
    expect(entry).not.toContain('MemoryRouter')
    expect(entry).not.toContain("basename: '/chat'")
  })

  it('Electron이 로드하는 번들에 실제 v2 진입 표면이 포함된다', () => {
    const assets = readdirSync(resolve(appRoot, 'out/renderer/assets'))
      .filter((name) => name.endsWith('.js'))
      .map((name) => readFileSync(resolve(appRoot, 'out/renderer/assets', name), 'utf8'))
      .join('\n')

    expect(assets).toContain('클로드')
    expect(assets).toContain('page-chips')
  })
})
