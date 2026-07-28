import { app, BrowserWindow, ipcMain } from 'electron'
// electron-updater는 CJS 패키지이므로 ESM main에서 named import를 사용하지 않는다.
// default import 후 autoUpdater를 읽어야 packaged 런타임의 CJS interop가 안전하다.
import electronUpdater, { type ProgressInfo, type UpdateInfo } from 'electron-updater'

const { autoUpdater } = electronUpdater

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
  console.error('[arologis-auto-update] 상세 오류(사용자 화면 비공개)', error)
  return '업데이트에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 실행해 주세요.'
}

function configureAutoUpdater(): void {
  if (updaterConfigured) return
  updaterConfigured = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
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

/** updater IPC는 한 번만 등록하며 개발 모드에서도 renderer가 안전하게 확인할 수 있게 한다. */
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
    try {
      autoUpdater.quitAndInstall(true, true)
    } catch (error: unknown) {
      broadcast({ kind: 'error', message: messageFromError(error) })
    }
  })
}
