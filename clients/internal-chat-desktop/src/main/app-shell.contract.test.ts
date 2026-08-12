import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const appRoot = resolve(__dirname, '../..')
const read = (relativePath: string): string =>
  readFileSync(resolve(appRoot, relativePath), 'utf8')

describe('internal chat desktop app shell contract', () => {
  it('ships as an independent Electron application', () => {
    const packageJson = JSON.parse(read('package.json')) as {
      name: string
      main: string
      scripts: { build: string; typecheck: string; lint: string; test: string }
    }

    expect(packageJson.name).toBe('@samhan/internal-chat-desktop')
    expect(packageJson.main).toBe('out/main/index.js')
    expect(packageJson.scripts.build).toContain('electron-vite build')
    expect(packageJson.scripts.typecheck).toContain('tsc')
    expect(packageJson.scripts.lint).toContain('eslint')
    expect(packageJson.scripts.test).toContain('vitest run')
  })

  it('uses the shared date-version release wrapper without enabling an update feed', () => {
    const wrapper = read('../../scripts/build-internal-chat-desktop-release.cjs')
    const builderConfig = read('electron-builder.yml')

    expect(wrapper).toContain('createNsisDisplayVersionInclude')
    expect(wrapper).toContain('--config.nsis.include=')
    expect(builderConfig).not.toContain('publish:')
    expect(builderConfig).not.toContain('channel:')
  })

  it('keeps the renderer isolated and the sandbox preload loadable', () => {
    const viteConfig = read('electron.vite.config.ts')
    const main = read('src/main/index.ts')

    expect(viteConfig).toContain("format: 'cjs'")
    expect(main).toContain('contextIsolation: true')
    expect(main).toContain('nodeIntegration: false')
    expect(main).toContain('sandbox: true')
  })

  it('declares a packaged mascot resource for the tray', () => {
    const builderConfig = read('electron-builder.yml')

    expect(builderConfig).toContain('samhani-tray.png')
  })

  it('keeps the process alive when the window closes and exposes explicit quit', () => {
    const main = read('src/main/index.ts')

    expect(main).toContain("event.preventDefault()")
    expect(main).toContain("mainWindow?.hide()")
    expect(main).toContain("{ label: '종료'")
    expect(main).toContain('isQuitting = true')
    expect(main).toContain("app.on('window-all-closed', () => {})")
  })
})
