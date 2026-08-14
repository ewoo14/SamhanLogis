import { app, BrowserWindow, ipcMain } from 'electron'
import electronUpdater, { type ProgressInfo, type UpdateInfo } from 'electron-updater'
// electron-vite가 이 CJS 공통 자산을 main bundle에 포함한다. 런타임 상대경로 require는
// out/main 위치가 바뀌면 repo 밖을 가리킬 수 있으므로 정적 import를 사용한다.
// @ts-ignore 공통 Node 계약은 CJS 릴리스 wrapper와 Electron main이 함께 소비한다.
import updateContract from '../../../scripts/electron-update-contract.cjs'

const { autoUpdater } = electronUpdater
const { classifyUpdaterError } = updateContract as unknown as {
  classifyUpdaterError: (error: unknown) => { kind: string; message: string }
}

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
const QUIT_CHANNEL = 'updater:quit'
const RELEASE_PACKAGE_VERSION_PATTERN = /^\s*v?1\.(\d{4})(\d{2})(\d{2})\.([1-9][0-9]*)\s*$/

let handlersRegistered = false
let updaterConfigured = false

function currentWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) ?? null
}

function broadcast(status: AutoUpdateStatus): void {
  currentWindow()?.webContents.send(STATUS_CHANNEL, status)
}

function displayVersionFromUpdateInfo(version: string): string {
  const match = RELEASE_PACKAGE_VERSION_PATTERN.exec(String(version ?? ''))
  if (!match) return ''
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`)
  if (
    Number.isNaN(date.getTime())
    || date.getUTCFullYear() !== year
    || date.getUTCMonth() + 1 !== month
    || date.getUTCDate() !== day
  ) return ''
  return `${match[1]}/${match[2]}/${match[3]}-${match[4]}`
}

function messageFromError(error: unknown): string {
  console.error('[internal-chat-auto-update] electron-updater 상세 오류(사용자 화면 비공개)', error)
  return classifyUpdaterError(error).message
}

function configureAutoUpdater(): void {
  if (updaterConfigured) return
  updaterConfigured = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  // 장애 릴리스 복구를 위해 낮은 semver도 설치 대상으로 허용한다.
  autoUpdater.allowDowngrade = true

  autoUpdater.on('checking-for-update', () => broadcast({ kind: 'checking' }))
  autoUpdater.on('update-available', (info: UpdateInfo) => {
    broadcast({ kind: 'available', version: displayVersionFromUpdateInfo(info.version) })
    void autoUpdater.downloadUpdate().catch((error: unknown) => {
      broadcast({ kind: 'error', message: messageFromError(error) })
    })
  })
  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    broadcast({ kind: 'downloading', percent: Math.max(0, Math.min(100, progress.percent)) })
  })
  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    broadcast({ kind: 'downloaded', version: displayVersionFromUpdateInfo(info.version) })
  })
  autoUpdater.on('update-not-available', () => broadcast({ kind: 'not-available' }))
  autoUpdater.on('error', (error: Error) => {
    broadcast({ kind: 'error', message: messageFromError(error) })
  })
}

export function registerAutoUpdateIpcHandlers(): void {
  if (handlersRegistered) return
  handlersRegistered = true
  configureAutoUpdater()

  ipcMain.handle(CHECK_CHANNEL, async () => {
    if (!app.isPackaged) {
      broadcast({ kind: 'not-available' })
      return
    }
    try {
      await autoUpdater.checkForUpdates()
    } catch (error: unknown) {
      broadcast({ kind: 'error', message: messageFromError(error) })
      throw error
    }
  })

  ipcMain.handle(INSTALL_CHANNEL, async () => {
    if (!app.isPackaged) {
      broadcast({ kind: 'not-available' })
      return
    }
    try {
      autoUpdater.quitAndInstall(true, true)
    } catch (error: unknown) {
      broadcast({ kind: 'error', message: messageFromError(error) })
      throw error
    }
  })

  ipcMain.handle(QUIT_CHANNEL, () => {
    app.quit()
  })
}
