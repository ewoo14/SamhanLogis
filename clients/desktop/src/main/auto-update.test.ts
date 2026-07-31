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

// 소스가 default import(`import electronUpdater from 'electron-updater'`)로 받아
// 구조분해하므로(#909 ESM/CJS 상호운용 회귀 수정), mock 도 default export 형태로 맞춘다.
vi.mock('electron-updater', () => ({ default: { autoUpdater: mocks.autoUpdater } }))

import { registerAutoUpdateIpcHandlers } from './auto-update'

describe('Electron 자동 업데이트 IPC', () => {
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

  it('packaged 앱의 check IPC가 실제 electron-updater checkForUpdates를 호출한다', async () => {
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

  it('update-available 이벤트는 다운로드를 시작하고 renderer에 상태를 보낸다', async () => {
    await mocks.events.get('update-available')?.({ version: '1.20260730.3' })
    expect(mocks.autoUpdater.downloadUpdate).toHaveBeenCalledOnce()
    expect(mocks.window.webContents.send).toHaveBeenCalledWith('updater:status', {
      kind: 'available',
      version: '2026/07/30-3',
    })
  })

  it('update-downloaded 이벤트는 설치 완료를 알리고 install IPC가 재시작을 위임한다', async () => {
    await mocks.events.get('update-downloaded')?.({ version: '1.20260730.3' })
    expect(mocks.window.webContents.send).toHaveBeenCalledWith('updater:status', {
      kind: 'downloaded',
      version: '2026/07/30-3',
    })

    await mocks.handlers.get('updater:install')?.()
    expect(mocks.autoUpdater.quitAndInstall).toHaveBeenCalledWith(true, true)
  })

  it('알 수 없는 updater 버전은 내부 semver를 renderer에 그대로 전달하지 않는다', async () => {
    await mocks.events.get('update-available')?.({ version: '1.0.0' })

    const lastStatus = mocks.window.webContents.send.mock.calls.at(-1)?.[1]
    expect(lastStatus).toEqual({ kind: 'available', version: '새 버전' })
  })

  it('비패키징 앱의 install IPC도 조용히 끝내지 않고 종료 상태를 renderer에 알린다', async () => {
    mocks.runtime.isPackaged = false

    await mocks.handlers.get('updater:install')?.()

    expect(mocks.autoUpdater.quitAndInstall).not.toHaveBeenCalled()
    expect(mocks.window.webContents.send).toHaveBeenCalledWith('updater:status', {
      kind: 'not-available',
    })
  })

  it('electron-updater 오류 원문은 renderer 상태에 전달하지 않는다', () => {
    const raw = 'Cannot find channel latest at https://intranet.example/latest.yml x-secret-header'

    mocks.events.get('error')?.(new Error(raw))

    const lastStatus = mocks.window.webContents.send.mock.calls.at(-1)?.[1]
    expect(lastStatus).toEqual({
      kind: 'error',
      message: expect.not.stringContaining(raw),
    })
    expect(lastStatus).toEqual({
      kind: 'error',
      message: expect.stringContaining('업데이트'),
    })
  })
})
