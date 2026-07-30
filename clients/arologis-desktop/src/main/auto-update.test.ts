import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const runtime = { isPackaged: true }
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
  return { handlers, events, window, autoUpdater, runtime }
})

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mocks.runtime.isPackaged
    },
  },
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

  beforeEach(() => {
    mocks.runtime.isPackaged = true
    mocks.autoUpdater.checkForUpdates.mockClear()
    mocks.autoUpdater.downloadUpdate.mockClear()
    mocks.autoUpdater.quitAndInstall.mockClear()
    mocks.window.webContents.send.mockClear()
  })

  it('packaged 앱의 확인 IPC가 electron-updater를 호출한다', async () => {
    expect(mocks.autoUpdater.allowDowngrade).toBe(false)
    await mocks.handlers.get('updater:check')?.()
    expect(mocks.autoUpdater.checkForUpdates).toHaveBeenCalledOnce()
  })

  it('비패키징 앱의 check IPC는 updater를 호출하지 않고 종료 상태를 renderer에 알린다', async () => {
    mocks.runtime.isPackaged = false

    await mocks.handlers.get('updater:check')?.()

    expect(mocks.autoUpdater.checkForUpdates).not.toHaveBeenCalled()
    expect(mocks.window.webContents.send).toHaveBeenCalledWith('updater:status', {
      kind: 'not-available',
    })
  })

  it('새 버전 발견 시 다운로드하고 renderer에 상태를 보낸다', async () => {
    await mocks.events.get('update-available')?.({ version: '20260730.3.0' })
    expect(mocks.autoUpdater.downloadUpdate).toHaveBeenCalledOnce()
    expect(mocks.window.webContents.send).toHaveBeenCalledWith('updater:status', {
      kind: 'available',
      version: '2026/07/30-3',
    })
  })

  it('다운로드 완료 후 설치 IPC가 종료·재시작을 위임한다', async () => {
    await mocks.events.get('update-downloaded')?.({ version: '20260730.3.0' })
    await mocks.handlers.get('updater:install')?.()
    expect(mocks.autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true)
  })

  it('비패키징 앱의 install IPC도 조용히 끝내지 않고 종료 상태를 renderer에 알린다', async () => {
    mocks.runtime.isPackaged = false

    await mocks.handlers.get('updater:install')?.()

    expect(mocks.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
    expect(mocks.window.webContents.send).toHaveBeenCalledWith('updater:status', {
      kind: 'not-available',
    })
  })
})
