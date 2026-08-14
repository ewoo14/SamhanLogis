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
      dependencies: Record<string, string>
      scripts: { build: string; typecheck: string; lint: string; test: string }
    }

    expect(packageJson.name).toBe('@samhan/internal-chat-desktop')
    expect(packageJson.main).toBe('out/main/index.js')
    expect(packageJson.scripts.build).toContain('electron-vite build')
    expect(packageJson.scripts.typecheck).toContain('tsc')
    expect(packageJson.scripts.lint).toContain('eslint')
    expect(packageJson.scripts.test).toContain('vitest run')
    expect(packageJson.dependencies['electron-updater']).toBe('^6.8.9')
  })

  it('uses the shared date-version release wrapper with the existing generic update feed shape', () => {
    const wrapper = read('../../scripts/build-internal-chat-desktop-release.cjs')
    const builderConfig = read('electron-builder.yml')

    expect(wrapper).toContain('createNsisDisplayVersionInclude')
    expect(wrapper).toContain('--config.nsis.include=')
    expect(builderConfig).toContain('publish:')
    expect(builderConfig).toContain('provider: generic')
    expect(builderConfig).toContain('url: ${env.INTERNAL_CHAT_UPDATE_URL}')
    expect(builderConfig).toContain('channel: latest')
  })

  it('keeps the renderer isolated and the sandbox preload loadable', () => {
    const viteConfig = read('electron.vite.config.ts')
    const main = read('src/main/index.ts')

    expect(main).toContain("app.setName('삼한 메신저')")
    expect(main).toContain("mainWindow?.webContents.send('internal-chat:will-quit')")
    expect(viteConfig).toContain("format: 'cjs'")
    expect(main).toContain('contextIsolation: true')
    expect(main).toContain('nodeIntegration: false')
    expect(main).toContain('sandbox: true')
  })

  it('declares a packaged mascot resource for the tray', () => {
    const builderConfig = read('electron-builder.yml')

    expect(builderConfig).toContain('productName: 삼한 메신저')
    expect(builderConfig).toContain('shortcutName: 삼한 메신저')
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

  it('opens one shared conversation renderer per room and keeps presence in the main window', () => {
    const main = read('src/main/index.ts')
    const preload = read('src/preload/index.ts')
    const renderer = read('src/renderer/ChatApp.tsx')
    expect(main).toContain("ipcMain.handle('conversation:open'")
    expect(main).toContain('conversationWindows')
    expect(main).toContain('existing.focus()')
    expect(preload).toContain("ipcRenderer.invoke('conversation:open', request)")
    expect(renderer).toContain('function ConversationRoom')
    expect(renderer).toContain('conversation\\/room')
    expect(renderer).toContain('conversation\\/claude')
    expect(renderer).toContain('joinPresence(presenceSession)')
    expect(renderer).not.toContain('ConversationRoom />')
  })

  it('wires the same version endpoint and updater IPC contract as the other desktops', () => {
    const updater = read('src/main/auto-update.ts')
    const preload = read('src/preload/index.ts')
    const renderer = read('src/renderer/main.ts')

    expect(updater).toContain("autoUpdater.allowDowngrade = true")
    expect(updater).toContain("ipcMain.handle(CHECK_CHANNEL")
    expect(updater).toContain("ipcMain.handle(INSTALL_CHANNEL")
    expect(preload).toContain("contextBridge.exposeInMainWorld('internalChatUpdater'")
    expect(renderer).toContain("clientType: 'INTERNAL_CHAT_DESKTOP'")
    expect(renderer).toContain('/app/version?')
    expect(renderer).toContain('internal-chat-version-policy-error')
  })
})
