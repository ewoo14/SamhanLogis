import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'

export type AutoUpdateStatus =
  | { kind: 'checking' }
  | { kind: 'available'; version: string }
  | { kind: 'downloading'; percent: number }
  | { kind: 'downloaded'; version: string }
  | { kind: 'not-available' }
  | { kind: 'error'; message: string }

const STATUS_CHANNEL = 'updater:status'
const CHECK_CHANNEL = 'updater:check'
const INSTALL_CHANNEL = 'updater:install'

let handlersRegistered = false
let updaterConfigured = false

function currentWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) ?? null
}

function broadcast(status: AutoUpdateStatus): void {
  currentWindow()?.webContents.send(STATUS_CHANNEL, status)
}

function messageFromError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  return '업데이트 서버에 연결할 수 없습니다.'
}

function configureAutoUpdater(): void {
  if (updaterConfigured) return
  updaterConfigured = true

  // 업데이트 여부는 앱 정책(/app/version)과 함께 렌더러가 표시한다.
  // 다운로드는 available 이벤트를 받은 뒤 자동 시작하되, 설치/재시작은 사용자가 누른다.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  // 잘못된 릴리스의 semver 다운그레이드는 자동 롤백으로 허용하지 않는다.
  autoUpdater.allowDowngrade = false

  autoUpdater.on('checking-for-update', () => broadcast({ kind: 'checking' }))
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    broadcast({ kind: 'available', version: info.version })
    void autoUpdater.downloadUpdate().catch((error: unknown) => {
      broadcast({ kind: 'error', message: messageFromError(error) })
    })
  })
  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    broadcast({ kind: 'downloading', percent: Math.max(0, Math.min(100, progress.percent)) })
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    broadcast({ kind: 'downloaded', version: info.version })
  })
  autoUpdater.on('update-not-available', () => broadcast({ kind: 'not-available' }))
  autoUpdater.on('error', (error: Error) => {
    broadcast({ kind: 'error', message: messageFromError(error) })
  })
}

/**
 * 업데이트 IPC를 한 번만 등록한다. 개발 모드에서도 check IPC는 등록하되,
 * packaged 앱이 아닐 때는 electron-updater를 호출하지 않아 로컬 개발을 막지 않는다.
 */
export function registerAutoUpdateIpcHandlers(): void {
  if (handlersRegistered) return
  handlersRegistered = true
  configureAutoUpdater()

  ipcMain.handle(CHECK_CHANNEL, async () => {
    if (!app.isPackaged) return
    try {
      await autoUpdater.checkForUpdates()
    } catch (error: unknown) {
      broadcast({ kind: 'error', message: messageFromError(error) })
    }
  })

  ipcMain.handle(INSTALL_CHANNEL, () => {
    if (!app.isPackaged) return
    autoUpdater.quitAndInstall(false, true)
  })
}
