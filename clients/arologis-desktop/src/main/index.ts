/**
 * arologis-desktop Electron 메인 프로세스 진입점.
 *
 * 책임:
 * - 단일 BrowserWindow 생성 (1280x800, contextIsolation 활성)
 * - 개발 모드: Vite dev server URL, DevTools 자동 오픈
 * - 프로덕션: 번들된 `out/renderer/index.html` 로드
 * - 인증 토큰 IPC 채널 (`auth:*`) 등록 — preload 가 contextBridge 로 노출
 *
 * 보안 정책 (Samhan Public desktop 패턴 일치):
 * - contextIsolation: true / nodeIntegration: false / sandbox: true
 * - preload 는 sandbox:true 에서 로드 가능한 CommonJS(.cjs)만 사용
 *
 * Samhan Public desktop 과 차이:
 * - legacy estimate webview / 종합견적서 link 제거 (배차 도메인 전용).
 * - 자체 auth/* IPC = arologis-service `/auth/admin/login` 응답 토큰 영속.
 */
import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { registerAuthIpcHandlers } from './ipc/auth-token.js'
import { registerAutoUpdateIpcHandlers } from './auto-update.js'
import { promptForTrustRoot, registerTrustRootIpcHandlers } from './certificate-trust.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** 메인 윈도우 인스턴스 — 다중 윈도우는 본 슬라이스 범위 외. */
let mainWindow: BrowserWindow | null = null

function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'https:') return true
    if (!app.isPackaged && parsed.protocol === 'http:') {
      return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
    }
  } catch {
    return false
  }
  return false
}

function isAllowedAppNavigation(url: string): boolean {
  if (url === 'about:blank') return true
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!devUrl) return url.startsWith('file://')
  try {
    return new URL(url).origin === new URL(devUrl).origin
  } catch {
    return false
  }
}

/**
 * 메인 BrowserWindow 를 생성하고 렌더러 컨텐츠를 로드한다.
 *
 * 개발 모드 (`process.env.ELECTRON_RENDERER_URL` 존재) 에서는
 * electron-vite dev server URL 을 로드하여 HMR 을 활용하고,
 * 프로덕션에서는 번들된 정적 HTML 을 file:// 로 로드한다.
 */
function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: '아로로지스',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedAppNavigation(url)) return
    event.preventDefault()
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url)
    }
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  registerAuthIpcHandlers()
  registerAutoUpdateIpcHandlers()
  registerTrustRootIpcHandlers()
  ipcMain.handle('updater:quit', () => {
    app.quit()
  })
  createMainWindow()
  void promptForTrustRoot(mainWindow)

  app.on('activate', () => {
    // macOS 호환 표준 패턴 (본 앱은 Windows 전용).
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
