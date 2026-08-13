import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('internalChatShell', {
  appName: '삼한이 메신저',
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
