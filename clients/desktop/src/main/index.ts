/**
 * Electron 메인 프로세스 진입점.
 *
 * 책임:
 * - 단일 BrowserWindow 생성 (1280x800, contextIsolation 활성)
 * - 개발 모드에서는 Vite dev server URL 로딩, DevTools 자동 오픈
 * - 프로덕션 모드에서는 번들된 `out/renderer/index.html` 파일 로딩
 * - IPC 채널 등록 (`auth:*`) — preload 가 contextBridge 로 노출
 *
 * 보안 정책:
 * - `contextIsolation: true` — 렌더러는 Node 직접 접근 불가
 * - `nodeIntegration: false` — 렌더러 프로세스에서 require/process 차단
 * - preload 스크립트만 IPC 게이트웨이 역할 수행
 */
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { registerAuthIpcHandlers } from './ipc/auth-token.js'
import { getLegacyEstimateUrl } from './legacy-asset.js'
import { isAllowedExternalUrl } from './external-url.js'
import { registerAutoUpdateIpcHandlers } from './auto-update.js'
import { DetailWindowRegistry, type DetailWindowRequest } from './detail-window-registry.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * 메인 윈도우 인스턴스 — 다중 윈도우는 본 슬라이스 범위 외.
 */
let mainWindow: BrowserWindow | null = null
const detailWindowDirty = new WeakMap<BrowserWindow, boolean>()
let detailWindowRegistry: DetailWindowRegistry<BrowserWindow>

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
 * 프로덕션에서는 번들된 정적 HTML 파일을 file:// 로 로드한다.
 */
function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    title: 'Samhan Public',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // preload 를 CommonJS(.cjs) 로 빌드하여 sandbox 를 유지한다(#804/#817). 샌드박스
      // preload 는 CommonJS 만 허용하므로 ESM(.mjs) preload 는 packaged(file://) 에서
      // "Cannot use import statement outside a module" 로 미로드→white screen 이 됐다.
      // 본 preload 는 contextBridge/ipcRenderer 만 사용해 샌드박스에서 정상 동작하며,
      // sandbox:true 로 OS 렌더러 샌드박스(방어심층)도 유지한다.
      sandbox: true,
      // [Phase 6 v4] legacy estimate webview 는 폐기(EstimateLegacyWebviewPage 제거)되어
      // webviewTag 는 비활성화한다. 재도입 시 will-attach-webview 가드와 부모 sandbox /
      // webview webPreferences 정합을 먼저 검증해야 한다.
      webviewTag: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url, app.isPackaged)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAllowedAppNavigation(url)) return
    event.preventDefault()
    if (isAllowedExternalUrl(url, app.isPackaged)) {
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

function detailWindowUrl(route: string): string {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  const hash = `${route}?detailWindow=1`
  if (devUrl) return `${devUrl.replace(/\/$/, '')}#${hash}`
  return hash
}

function createDetailWindow(request: DetailWindowRequest): BrowserWindow {
  const detailWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    autoHideMenuBar: true,
    title: `${request.documentType} ${request.documentId}`,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  detailWindowDirty.set(detailWindow, false)
  detailWindow.on('close', (event) => {
    if (!detailWindowDirty.get(detailWindow)) return
    const result = dialog.showMessageBoxSync(detailWindow, {
      type: 'warning',
      buttons: ['계속 편집', '저장하지 않고 닫기'],
      defaultId: 0,
      cancelId: 0,
      title: '저장되지 않은 편집',
      message: '저장되지 않은 편집 내용이 있습니다. 닫으면 사라집니다.',
    })
    if (result === 0) event.preventDefault()
  })
  detailWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedAppNavigation(url)) event.preventDefault()
  })
  detailWindow.on('maximize', () => detailWindow.webContents.send('detail-window:maximized-change', true))
  detailWindow.on('unmaximize', () => detailWindow.webContents.send('detail-window:maximized-change', false))
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) void detailWindow.loadURL(detailWindowUrl(request.route))
  else void detailWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: `${request.route}?detailWindow=1` })
  return detailWindow
}

app.whenReady().then(() => {
  detailWindowRegistry = new DetailWindowRegistry(createDetailWindow)
  registerAuthIpcHandlers()
  registerAutoUpdateIpcHandlers()
  // [Phase 6 v4] legacy estimate webview asset URL 조회 IPC.
  // renderer 의 EstimateLegacyWebviewPage 가 src 속성에 사용한다.
  ipcMain.handle('legacy:get-estimate-url', () => getLegacyEstimateUrl())
  // [Phase 6 v4 정정 #22] 종합견적서 외부 web app (clients/web/estimate-app) 진입.
  // production(packaged) 은 https:// 만 허용, dev(비-packaged) 는 localhost http 도 허용.
  // (회귀: 버튼이 https prod 도메인 → http://localhost env 기본값으로 바뀌었는데 가드는 그대로여서
  //  dev 에서 매 클릭 throw → 렌더러가 삼켜 "눌러도 무반응" 이 됐던 버그 수정.)
  ipcMain.handle('legacy:open-external', async (_event, url: string) => {
    if (!isAllowedExternalUrl(url, app.isPackaged)) {
      throw new Error('Invalid URL — https:// (dev 는 http://localhost 도) 만 허용')
    }
    await shell.openExternal(url)
  })
  ipcMain.handle('updater:quit', () => {
    app.quit()
  })
  ipcMain.handle('detail-window:open', (_event, payload: DetailWindowRequest) => {
    if (!payload?.documentId || !payload.route || !/^\/(sales|purchases|accounting\/tax-invoices|transfers|warehouse\/audit)\/[A-Za-z0-9-]+$/.test(payload.route)) {
      throw new Error('Invalid detail window route')
    }
    detailWindowRegistry.open(payload)
  })
  ipcMain.handle('detail-window:close', (event) => {
    const detailWindow = BrowserWindow.fromWebContents(event.sender)
    detailWindow?.close()
  })
  ipcMain.handle('detail-window:toggle-maximize', (event) => {
    const detailWindow = BrowserWindow.fromWebContents(event.sender)
    if (!detailWindow) return false
    if (detailWindow.isMaximized()) detailWindow.unmaximize()
    else detailWindow.maximize()
    return detailWindow.isMaximized()
  })
  ipcMain.handle('detail-window:set-dirty', (event, dirty: boolean) => {
    const detailWindow = BrowserWindow.fromWebContents(event.sender)
    if (detailWindow) detailWindowDirty.set(detailWindow, dirty === true)
  })
  createMainWindow()

  // dev-only — CAPTURE_MODE=1 일 때 5 화면 자동 navigate + capturePage 후 종료.
  // 동적 import 로 production 부팅 시 capture 모듈 로드 회피.
  if (process.env['CAPTURE_MODE'] === '1' && mainWindow) {
    import('./capture.js')
      .then((mod) => mod.captureAllScreens(mainWindow!))
      .catch((err) => console.error('[capture] 실행 실패', err))
  }

  app.on('activate', () => {
    // macOS 호환성 코드 — 본 앱은 Windows 전용이지만 표준 패턴 유지.
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
