import { beforeAll, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, () => Promise<void> | void>()
  const events = new Map<string, (...args: unknown[]) => void>()
  const window = {
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
  }
  const autoUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowDowngrade: true,
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => {
      events.set(event, listener)
    }),
    checkForUpdates: vi.fn(async () => undefined),
    downloadUpdate: vi.fn(async () => undefined),
    quitAndInstall: vi.fn(),
  }
  return { handlers, events, window, autoUpdater }
})

vi.mock('electron', () => ({
  app: { isPackaged: true },
  BrowserWindow: { getAllWindows: () => [mocks.window] },
  ipcMain: {
    handle: vi.fn((channel: string, handler: () => Promise<void> | void) => {
      mocks.handlers.set(channel, handler)
    }),
  },
}))

vi.mock('electron-updater', () => ({ default: { autoUpdater: mocks.autoUpdater } }))

import { registerAutoUpdateIpcHandlers } from './auto-update'

describe('아로로지스 데스크톱 자동 업데이트 IPC', () => {
  beforeAll(() => {
    registerAutoUpdateIpcHandlers()
  })

  it('packaged 앱의 확인 IPC가 electron-updater를 호출한다', async () => {
    await mocks.handlers.get('updater:check')?.()
    expect(mocks.autoUpdater.checkForUpdates).toHaveBeenCalledOnce()
  })

  it('새 버전 발견 시 다운로드하고 renderer에 상태를 보낸다', async () => {
    await mocks.events.get('update-available')?.({ version: '1.0.1' })
    expect(mocks.autoUpdater.downloadUpdate).toHaveBeenCalledOnce()
    expect(mocks.window.webContents.send).toHaveBeenCalledWith('updater:status', {
      kind: 'available',
      version: '1.0.1',
    })
  })

  it('다운로드 완료 후 설치 IPC가 종료·재시작을 위임한다', async () => {
    await mocks.events.get('update-downloaded')?.({ version: '1.0.1' })
    await mocks.handlers.get('updater:install')?.()
    expect(mocks.autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true)
  })
})
