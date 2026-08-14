import { app, BrowserWindow, Menu, Tray, ipcMain, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { registerAutoUpdateIpcHandlers } from './auto-update.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let quitFlushStarted = false

function validateDeepLink(link: unknown): string | null {
  if (typeof link !== 'string') return null
  try {
    const url = new URL(link)
    if (url.protocol !== 'samhan:' || url.hostname !== 'arologis' || url.pathname !== '/dispatches/manual') return null
    if (url.search || url.hash || /[0-9a-f]{8}-[0-9a-f-]{27}/i.test(link)) return null
    return url.toString()
  } catch {
    return null
  }
}

function trayIconPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'samhani-tray.png')
    : join(__dirname, '../../build/samhani-tray.png')
}

function showMainWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

function createTray(): void {
  tray = new Tray(trayIconPath())
  tray.setToolTip('삼한 메신저')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '메신저 열기', click: showMainWindow },
    { type: 'separator' },
    { label: '종료', click: () => { isQuitting = true; app.quit() } },
  ]))
  tray.on('double-click', showMainWindow)
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 720,
    minWidth: 360,
    minHeight: 560,
    show: false,
    autoHideMenuBar: true,
  title: '삼한 메신저',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())
  mainWindow.on('close', (event) => {
    if (isQuitting) return
    event.preventDefault()
    mainWindow?.hide()
  })
  mainWindow.on('closed', () => { mainWindow = null })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) void mainWindow.loadURL(rendererUrl)
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  app.setName('삼한 메신저')
  ipcMain.handle('navigation:open-deep-link', async (_event, link: unknown) => {
    const validated = validateDeepLink(link)
    if (!validated) return { opened: false, message: '허용되지 않은 딥링크입니다.' }
    try {
      await shell.openExternal(validated)
      return { opened: true }
    } catch {
      return { opened: false, message: '대상 앱을 열 수 없습니다.' }
    }
  })
  app.on('second-instance', () => showMainWindow())
  app.whenReady().then(() => {
    registerAutoUpdateIpcHandlers()
    createMainWindow()
    createTray()
  })
  app.on('activate', () => showMainWindow())
  app.on('before-quit', (event) => {
    isQuitting = true
    if (quitFlushStarted) return
    quitFlushStarted = true
    event.preventDefault()
    mainWindow?.webContents.send('internal-chat:will-quit')
    setTimeout(() => app.exit(0), 500)
  })
  app.on('window-all-closed', () => {})
}
