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

  it('신뢰 루트가 없는 자체서명 installer는 설치를 차단하고 인증서 배포 안내를 표시한다', () => {
    mocks.events.get('error')?.(new Error('ERR_UPDATER_INVALID_SIGNATURE: UnknownError'))

    const lastStatus = mocks.window.webContents.send.mock.calls.at(-1)?.[1]
    expect(lastStatus).toEqual({
      kind: 'error',
      message: '업데이트 파일의 인증서를 신뢰할 수 없습니다. 사내 IT 지원팀에 인증서 배포를 요청한 뒤 다시 확인해 주세요.',
    })
    expect(JSON.stringify(lastStatus)).not.toContain('UnknownError')
  })

  it('손상된 installer는 네트워크 장애와 구분되는 안내를 표시한다', () => {
    mocks.events.get('error')?.(new Error('ERR_UPDATER_CHECKSUM_MISMATCH'))

    const lastStatus = mocks.window.webContents.send.mock.calls.at(-1)?.[1]
    expect(lastStatus).toEqual({
      kind: 'error',
      message: '업데이트 파일이 손상되었거나 검증에 실패했습니다. 다시 확인해 주세요.',
    })
  })

  it('네트워크 오류는 파일 검증 오류와 구분되는 안내를 표시한다', () => {
    mocks.events.get('error')?.(new Error('net::ERR_CONNECTION_TIMED_OUT'))

    const lastStatus = mocks.window.webContents.send.mock.calls.at(-1)?.[1]
    expect(lastStatus).toEqual({
      kind: 'error',
      message: '업데이트 서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 확인해 주세요.',
    })
  })
})
