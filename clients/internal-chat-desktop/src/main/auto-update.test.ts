import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const runtime = { isPackaged: true }
  const handlers = new Map<string, () => Promise<void> | void>()
  const events = new Map<string, (...args: unknown[]) => void>()
  const window = { isDestroyed: () => false, webContents: { send: vi.fn() } }
  const autoUpdater = {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowDowngrade: false,
    on: vi.fn((event: string, listener: (...args: unknown[]) => void) => events.set(event, listener)),
    checkForUpdates: vi.fn(async () => undefined),
    downloadUpdate: vi.fn(async () => undefined),
    quitAndInstall: vi.fn(),
  }
  return { runtime, handlers, events, window, autoUpdater }
})

vi.mock('electron', () => ({
  app: {
    get isPackaged() { return mocks.runtime.isPackaged },
    quit: vi.fn(),
  },
  BrowserWindow: { getAllWindows: () => [mocks.window] },
  ipcMain: {
    handle: vi.fn((channel: string, handler: () => Promise<void> | void) => mocks.handlers.set(channel, handler)),
  },
}))

vi.mock('electron-updater', () => ({ default: { autoUpdater: mocks.autoUpdater } }))

import { registerAutoUpdateIpcHandlers } from './auto-update'

describe('사내 메신저 자동 업데이트 IPC', () => {
  beforeAll(() => registerAutoUpdateIpcHandlers())

  beforeEach(() => {
    mocks.runtime.isPackaged = true
    mocks.autoUpdater.checkForUpdates.mockClear()
    mocks.autoUpdater.downloadUpdate.mockClear()
    mocks.autoUpdater.quitAndInstall.mockReset()
    mocks.window.webContents.send.mockClear()
  })

  it('allowDowngrade와 기존 확인·다운로드 경로를 사용한다', async () => {
    expect(mocks.autoUpdater.allowDowngrade).toBe(true)
    await mocks.handlers.get('updater:check')?.()
    await mocks.events.get('update-available')?.({ version: '1.20260813.1' })

    expect(mocks.autoUpdater.checkForUpdates).toHaveBeenCalledOnce()
    expect(mocks.autoUpdater.downloadUpdate).toHaveBeenCalledOnce()
    expect(mocks.window.webContents.send).toHaveBeenCalledWith('updater:status', {
      kind: 'available',
      version: '2026/08/13-1',
    })
  })

  it('설치 실패는 renderer invoke에 reject된다', async () => {
    const error = new Error('installer failed')
    mocks.autoUpdater.quitAndInstall.mockImplementationOnce(() => { throw error })

    await expect(mocks.handlers.get('updater:install')?.()).rejects.toThrow('installer failed')
    expect(mocks.window.webContents.send).toHaveBeenCalledWith('updater:status', expect.objectContaining({ kind: 'error' }))
  })
})
