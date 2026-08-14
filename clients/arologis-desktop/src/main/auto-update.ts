import { app, BrowserWindow, ipcMain } from 'electron'
// electron-updater는 CJS 패키지이므로 ESM main에서 named import를 사용하지 않는다.
// default import 후 autoUpdater를 읽어야 packaged 런타임의 CJS interop가 안전하다.
import electronUpdater, { type ProgressInfo, type UpdateInfo } from 'electron-updater'
import { classifyArologisUpdaterError } from './update-error.js'

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
const RELEASE_PACKAGE_VERSION_PATTERN = /^\s*v?1\.(\d{4})(\d{2})(\d{2})\.([1-9][0-9]*)\s*$/

let handlersRegistered = false
let updaterConfigured = false
let autoUpdateEnabled = true

export function setAutoUpdateEnabled(enabled: boolean): void {
  autoUpdateEnabled = enabled
}

export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged || !autoUpdateEnabled) return
  try {
    await autoUpdater.checkForUpdates()
  } catch (error: unknown) {
    broadcast({ kind: 'error', message: messageFromError(error) })
  }
}

function currentWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()) ?? null
}

function broadcast(status: AutoUpdateStatus): void {
  currentWindow()?.webContents.send(STATUS_CHANNEL, status)
}

/** electron-updater의 내부 package semver를 사용자용 날짜 버전으로 되돌린다. */
function displayVersionFromUpdateInfo(version: string): string {
  const match = RELEASE_PACKAGE_VERSION_PATTERN.exec(String(version ?? ''))
  if (!match) return ''

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const calendarDate = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`)
  if (
    Number.isNaN(calendarDate.getTime()) ||
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() + 1 !== month ||
    calendarDate.getUTCDate() !== day
  ) return ''

  return `${match[1]}/${match[2]}/${match[3]}-${match[4]}`
}

function messageFromError(error: unknown): string {
  console.error('[arologis-auto-update] 상세 오류(사용자 화면 비공개)', error)
  return classifyArologisUpdaterError(error).message
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
    if (process.env.AROLOGIS_UPDATE_HARNESS_APPROVE === '1') {
      autoUpdater.quitAndInstall(true, true)
    }
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
    if (!app.isPackaged) {
      broadcast({ kind: 'not-available' })
      return
    }
    if (!autoUpdateEnabled) {
      broadcast({ kind: 'error', message: '자동 업데이트가 꺼져 있습니다. 신뢰 루트 설치를 승인하면 다시 사용할 수 있습니다.' })
      return
    }
    await checkForUpdates()
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
      // ipcRenderer.invoke()가 실패를 관찰해야 renderer가 설치 재시도 상태를 되돌린다.
      throw error
    }
  })
}
