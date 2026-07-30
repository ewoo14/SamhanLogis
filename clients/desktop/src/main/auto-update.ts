import { app, BrowserWindow, ipcMain } from 'electron'
// electron-updater 는 CJS 전용 패키지다. `autoUpdater` 는 Object.defineProperty 동적
// getter(`_autoUpdater || doLoadAutoUpdater()`)로 노출되는데, 이 getter 본문이 `NsisUpdater`
// 등 다른 named export(단순 `return X.Y`)와 달리 복잡해 Node 의 cjs-module-lexer 정적 분석이
// named export 로 인식하지 못한다. 이 프로젝트(package.json "type":"module")에서 main 프로세스는
// electron-vite 기본값으로 ESM 산출되므로, named import(`import { autoUpdater } from ...`)는
// 런타임에 "SyntaxError: Named export 'autoUpdater' not found" 로 반드시 깨진다(#909 회귀).
// default import(= 전체 module.exports 객체)로 받아 구조분해하면 getter 가 property-access
// 시점에 정상 동작한다 — 이 파일의 나머지 코드는 변경 없음.
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
  console.error('[auto-update] electron-updater 상세 오류(사용자 화면 비공개)', error)
  return '업데이트에 실패했습니다. 인터넷 연결을 확인한 뒤 다시 실행해 주세요.'
}

function configureAutoUpdater(): void {
  if (updaterConfigured) return
  updaterConfigured = true

  // 업데이트 여부는 앱 정책(/app/version)과 함께 렌더러가 표시한다.
  // 다운로드는 available 이벤트를 받은 뒤 자동 시작한다. 설치/재시작도 기동 렌더러가 위임한다.
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
    if (!app.isPackaged) {
      broadcast({ kind: 'not-available' })
      return
    }
    try {
      await autoUpdater.checkForUpdates()
    } catch (error: unknown) {
      broadcast({ kind: 'error', message: messageFromError(error) })
    }
  })

  ipcMain.handle(INSTALL_CHANNEL, () => {
    if (!app.isPackaged) {
      broadcast({ kind: 'not-available' })
      return
    }
    try {
      autoUpdater.quitAndInstall(true, true)
    } catch (error: unknown) {
      broadcast({ kind: 'error', message: messageFromError(error) })
    }
  })
}
