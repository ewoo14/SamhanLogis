import { app, BrowserWindow, ipcMain } from 'electron'
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

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    return [record.code, record.message, record.cause]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
  }
  return ''
}

function messageFromError(error: unknown): string {
  console.error('[internal-chat-auto-update] electron-updater 상세 오류(사용자 화면 비공개)', error)
  const text = errorText(error)
  if (/invalid[_ ]signature|unknownerror|certificate chain|not trusted by the trust provider/i.test(text)) {
    return '업데이트 파일의 인증서를 신뢰할 수 없습니다. 사내 IT 지원팀에 인증서 배포를 요청한 뒤 다시 확인해 주세요.'
  }
  if (/checksum|hash mismatch|integrity|corrupt|damaged|blockmap/i.test(text)) {
    return '업데이트 파일이 손상되었거나 검증에 실패했습니다. 다시 확인해 주세요.'
  }
  if (/net::|econn|enotfound|etimedout|timed out|network|socket|dns|http (?:4|5)\d\d/i.test(text)) {
    return '업데이트 서버에 연결하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 확인해 주세요.'
  }
  return '업데이트에 실패했습니다. 잠시 후 다시 확인해 주세요.'
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
