import { app, BrowserWindow, Menu, Tray, ipcMain, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { registerAutoUpdateIpcHandlers } from './auto-update.js'
import Store from 'electron-store'
import { getConversationBounds, saveConversationBounds, type WindowBounds, type WindowStateMap } from './conversation-window-state.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let quitFlushStarted = false
let mainWindowClosed = false
const conversationWindows = new Map<string, BrowserWindow>()
const windowStateStore = new Store<{ conversationWindows: WindowStateMap }>({ name: 'window-state' })

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
  mainWindowClosed = false
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
    mainWindowClosed = true
    mainWindow?.hide()
    if (conversationWindows.size === 0) {
      isQuitting = true
      app.quit()
    }
  })
  mainWindow.on('closed', () => { mainWindow = null })

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) void mainWindow.loadURL(rendererUrl)
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

function conversationKey(request: { roomCode?: string; sessionCode?: string }): string | null {
  if (typeof request.roomCode === 'string' && request.roomCode) return `room:${request.roomCode}`
  if (typeof request.sessionCode === 'string' && request.sessionCode) return `claude:${request.sessionCode}`
  return null
}

function openConversationWindow(request: { roomCode?: string; sessionCode?: string; title?: string }): { opened: boolean } {
  const key = conversationKey(request)
  if (!key) return { opened: false }
  const existing = conversationWindows.get(key)
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore()
    existing.show()
    existing.focus()
    return { opened: true }
  }
  const defaults: WindowBounds = { width: 560, height: 760 }
  const bounds = getConversationBounds(windowStateStore.get('conversationWindows', {}), key, defaults)
  const child = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    ...(typeof bounds.x === 'number' ? { x: bounds.x } : {}),
    ...(typeof bounds.y === 'number' ? { y: bounds.y } : {}),
    minWidth: 360,
    minHeight: 520,
    title: request.title || '삼한 메신저',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  conversationWindows.set(key, child)
  const persistBounds = () => {
    if (child.isDestroyed()) return
    const next = saveConversationBounds(windowStateStore.get('conversationWindows', {}), key, child.getBounds())
    windowStateStore.set('conversationWindows', next)
  }
  child.on('move', persistBounds)
  child.on('resize', persistBounds)
  child.on('close', persistBounds)
  child.on('closed', () => {
    if (conversationWindows.get(key) === child) conversationWindows.delete(key)
    if (mainWindowClosed && conversationWindows.size === 0) {
      isQuitting = true
      app.quit()
    }
  })
  const titleQuery = request.title ? `?title=${encodeURIComponent(request.title)}` : ''
  const route = request.roomCode
    ? `#/conversation/room/${encodeURIComponent(request.roomCode)}${titleQuery}`
    : `#/conversation/claude/${encodeURIComponent(request.sessionCode!)}${titleQuery}`
  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) void child.loadURL(`${rendererUrl}${route}`)
  else void child.loadFile(join(__dirname, '../renderer/index.html'), { hash: route.slice(1) })
  return { opened: true }
}

const hasLock = app.requestSingleInstanceLock()
if (!hasLock) {
  app.quit()
} else {
  app.setName('삼한 메신저')
  ipcMain.handle('conversation:open', (_event, request: unknown) => {
    if (!request || typeof request !== 'object') return { opened: false }
    return openConversationWindow(request as { roomCode?: string; sessionCode?: string; title?: string })
  })
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
    let completed = false
    const finish = () => {
      if (completed) return
      completed = true
      clearTimeout(timeout)
      ipcMain.removeListener('internal-chat:quit-ack', finish)
      app.exit(0)
    }
    ipcMain.once('internal-chat:quit-ack', finish)
    const timeout = setTimeout(finish, 2_000)
  })
  app.on('window-all-closed', () => {})
}
