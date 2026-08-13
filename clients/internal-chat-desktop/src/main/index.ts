import { app, BrowserWindow, Menu, Tray } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { registerAutoUpdateIpcHandlers } from './auto-update.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

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
  tray.setToolTip('삼한이 메신저')
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
    title: '삼한이 메신저',
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
  app.on('second-instance', () => showMainWindow())
  app.whenReady().then(() => {
    registerAutoUpdateIpcHandlers()
    createMainWindow()
    createTray()
  })
  app.on('activate', () => showMainWindow())
  app.on('before-quit', () => { isQuitting = true })
  app.on('window-all-closed', () => {})
}
