import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import Store from 'electron-store'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { decideTrustRootPrompt, reconcileTrustRootState, type TrustRootState } from './certificate-trust-policy.js'
export { decideTrustRootPrompt } from './certificate-trust-policy.js'
import { checkForUpdates, setAutoUpdateEnabled } from './auto-update.js'

const TRUST_ROOT_CERT_NAME = 'arologis-internal-release.cer'
const TRUST_ROOT_STATUS_CHANNEL = 'trust-root:status'
const TRUST_ROOT_STATUS_IPC = 'trust-root:status'
const TRUST_ROOT_INSTALL_IPC = 'trust-root:install'
const store = new Store<TrustRootState>({ name: 'arologis-update-trust' })

function storedState(): TrustRootState {
  return { installed: store.get('installed', false), declined: store.get('declined', false) }
}

function certificatePath(): string {
  return process.env.AROLOGIS_TRUST_ROOT_CERT || join(process.resourcesPath, TRUST_ROOT_CERT_NAME)
}

function rootCertificateExists(): boolean {
  if (process.platform !== 'win32') return true
  const path = certificatePath()
  if (!existsSync(path)) return false
  const escapedPath = path.replace(/'/g, "''")
  try {
    return execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      `$expected = (Get-PfxCertificate -FilePath '${escapedPath}').Thumbprint; (Get-ChildItem 'Cert:\\CurrentUser\\Root' | Where-Object Thumbprint -eq $expected).Count -gt 0`,
    ], { encoding: 'utf8' }).trim().toLowerCase() === 'true'
  } catch {
    return false
  }
}

function installCertificate(): void {
  const path = certificatePath()
  if (!existsSync(path)) throw new Error('신뢰 루트 인증서 파일을 찾을 수 없습니다.')
  if (process.platform !== 'win32') return
  execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    `$certificate = [System.Security.Cryptography.X509Certificates.X509Certificate2]::new('${path.replace(/'/g, "''")}'); $store = [System.Security.Cryptography.X509Certificates.X509Store]::new('Root', 'CurrentUser'); try { $store.Open('ReadWrite'); $store.Add($certificate) } finally { $store.Close() }`,
  ], { stdio: 'pipe' })
  if (!rootCertificateExists()) throw new Error('신뢰 루트 인증서 설치 결과를 확인할 수 없습니다.')
}

function currentState(): TrustRootState {
  const stored = storedState()
  const state = reconcileTrustRootState(stored, rootCertificateExists())
  if (state.installed !== stored.installed || state.declined !== stored.declined) store.set(state)
  return state
}

function sendStatus(window: BrowserWindow | null): void {
  const state = decideTrustRootPrompt(currentState(), 'startup')
  window?.webContents.send(TRUST_ROOT_STATUS_CHANNEL, state)
}

export function registerTrustRootIpcHandlers(): void {
  ipcMain.handle(TRUST_ROOT_STATUS_IPC, () => decideTrustRootPrompt(currentState(), 'startup'))
  ipcMain.handle(TRUST_ROOT_INSTALL_IPC, async () => {
    installCertificate()
    store.set({ installed: true, declined: false })
    setAutoUpdateEnabled(true)
    void checkForUpdates()
    return decideTrustRootPrompt(currentState(), 'approve')
  })
}

export async function promptForTrustRoot(window: BrowserWindow | null): Promise<void> {
  const state = currentState()
  if (state.installed) {
    store.set({ installed: true, declined: false })
    setAutoUpdateEnabled(true)
    void checkForUpdates()
    sendStatus(window)
    return
  }

  // 승인 전에는 updater가 feed를 조회하거나 installer를 받지 않도록 잠근다.
  setAutoUpdateEnabled(false)

  const options = {
    type: 'info' as const,
    title: '아로로지스 자동 업데이트 안내',
    message: '삼한 사내 앱의 자동 업데이트를 위해 신뢰 루트를 설치하려고 합니다.',
    detail: '승인하면 이 인증서로 서명된 삼한 사내 앱의 업데이트 파일을 신뢰합니다. 설치는 현재 Windows 사용자 계정에만 적용되며 관리자 권한은 필요하지 않습니다. 승인하지 않아도 앱은 계속 사용할 수 있지만 자동 업데이트는 꺼져 있으며 다음 실행 때 다시 안내합니다.',
    buttons: ['승인하고 자동 업데이트 켜기', '이번에는 설치하지 않기'],
    defaultId: 0,
    cancelId: 1,
  }
  const result = window ? await dialog.showMessageBox(window, options) : await dialog.showMessageBox(options)

  if (result.response === 0) {
    try {
      installCertificate()
      store.set({ installed: true, declined: false })
      setAutoUpdateEnabled(true)
      void checkForUpdates()
    } catch (error) {
      console.error('[arologis-trust-root] 설치 상세 오류(사용자 화면 비공개)', error)
      store.set({ installed: false, declined: true })
      setAutoUpdateEnabled(false)
    }
  } else {
    store.set({ installed: false, declined: true })
    setAutoUpdateEnabled(false)
  }
  sendStatus(window)
}
