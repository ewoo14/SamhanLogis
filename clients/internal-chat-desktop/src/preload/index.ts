import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('internalChatNavigation', {
  openDeepLink: (link: string): Promise<{ opened: boolean; message?: string }> =>
    ipcRenderer.invoke('navigation:open-deep-link', link),
})

contextBridge.exposeInMainWorld('internalChatShell', {
  appName: '삼한 메신저',
  onWillQuit: (listener: () => void): (() => void) => {
    const handler = () => listener()
    ipcRenderer.on('internal-chat:will-quit', handler)
    return () => ipcRenderer.removeListener('internal-chat:will-quit', handler)
  },
})

contextBridge.exposeInMainWorld('internalChatUpdater', {
  check: (): Promise<void> => ipcRenderer.invoke('updater:check'),
  install: (): Promise<void> => ipcRenderer.invoke('updater:install'),
  quit: (): Promise<void> => ipcRenderer.invoke('updater:quit'),
  onStatus: (listener: (status: unknown) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: unknown) => listener(status)
    ipcRenderer.on('updater:status', handler)
    return () => ipcRenderer.removeListener('updater:status', handler)
  },
})
