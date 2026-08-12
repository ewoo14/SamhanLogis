import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('internalChatShell', {
  appName: '삼한이 메신저',
})
