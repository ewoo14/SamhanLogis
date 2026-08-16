import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AppUpdateNotice, AppUpdateNoticeStack, Button } from '@samhan/design-system'
import {
  fetchDesktopVersionStatus,
  resolveBuildAppVersion,
  resolveVersionPromptState,
  VERSION_POLICY_FAILURE_MESSAGE,
  type VersionPromptState,
} from '../../version/versionCheck'
import type { DesktopUpdateStatus, TrustRootStatus } from '../../types/electron'

const CURRENT_VERSION = resolveBuildAppVersion(import.meta.env.VITE_APP_VERSION)
const VERSION_API_BASE_URL = import.meta.env.VITE_VERSION_API_BASE_URL || 'http://localhost:8080'
const DISPLAY_VERSION_PATTERN = /^\d{4}\/\d{2}\/\d{2}-[1-9][0-9]*$/

function isValidDisplayVersion(version: string): boolean {
  const match = DISPLAY_VERSION_PATTERN.exec(version)
  if (!match) return false

  const year = Number(match[0].slice(0, 4))
  const month = Number(match[0].slice(5, 7))
  const day = Number(match[0].slice(8, 10))
  const calendarDate = new Date(`${match[0].slice(0, 4)}-${match[0].slice(5, 7)}-${match[0].slice(8, 10)}T00:00:00.000Z`)
  return (
    !Number.isNaN(calendarDate.getTime()) &&
    calendarDate.getUTCFullYear() === year &&
    calendarDate.getUTCMonth() + 1 === month &&
    calendarDate.getUTCDate() === day
  )
}

function safeStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  try {
    const storage = window.localStorage
    storage.setItem('__arologis_version_probe__', '1')
    storage.removeItem('__arologis_version_probe__')
    return storage
  } catch {
    const values = new Map<string, string>()
    return {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value) },
    }
  }
}

function normalizeUpdateStatus(value: unknown): DesktopUpdateStatus | null {
  if (typeof value !== 'object' || value === null || !('kind' in value)) return null
  const status = value as Partial<DesktopUpdateStatus>
  if (status.kind === 'checking' || status.kind === 'not-available') return { kind: status.kind }
  if (status.kind === 'available') return { kind: 'available', version: status.version ?? '' }
  if (status.kind === 'downloading') return { kind: 'downloading', percent: status.percent ?? 0 }
  if (status.kind === 'downloaded') return { kind: 'downloaded', version: status.version ?? '' }
  if (status.kind === 'error') return { kind: 'error', message: status.message ?? '업데이트에 실패했습니다. 잠시 후 다시 확인해 주세요.' }
  return null
}

function updateVersionLabel(version: string | undefined): string {
  const normalized = String(version ?? '').trim()
  return isValidDisplayVersion(normalized) ? `새 버전 ${normalized}` : '새 버전'
}

function updateStatusText(status: DesktopUpdateStatus): string {
  switch (status.kind) {
    case 'checking': return '업데이트를 확인하는 중입니다.'
    case 'available': return `${updateVersionLabel(status.version)}을 다운로드하는 중입니다.`
    case 'downloading': return `새 버전을 다운로드하는 중입니다. ${Math.round(status.percent ?? 0)}%`
    case 'downloaded': return `${updateVersionLabel(status.version)}을 설치하고 앱을 다시 시작하는 중입니다.`
    case 'error': return status.message ?? '업데이트에 실패했습니다.'
    case 'not-available': return '현재 설치된 버전이 최신입니다.'
  }
}

function updateErrorSeverity(message: string): 'network' | 'integrity' | 'trust' {
  if (/인증서|신뢰|certificate|signature/i.test(message)) return 'trust'
  if (/손상|검증|integrity|checksum|hash/i.test(message)) return 'integrity'
  return 'network'
}

function updateStatusTitle(status: DesktopUpdateStatus): string {
  if (status.kind === 'error') {
    const severity = updateErrorSeverity(status.message ?? '')
    if (severity === 'trust') return '업데이트 파일의 인증서를 신뢰할 수 없습니다'
    if (severity === 'integrity') return '업데이트 파일을 확인하지 못했습니다'
    return '업데이트 서버에 연결하지 못했습니다'
  }
  if (status.kind === 'checking') return '업데이트를 확인하는 중입니다'
  if (status.kind === 'available') return '새 업데이트를 준비하고 있습니다'
  if (status.kind === 'downloading') return '새 업데이트를 다운로드하는 중입니다'
  if (status.kind === 'downloaded') return '새 업데이트를 설치할 준비가 되었습니다'
  return '업데이트 상태'
}

export function AppVersionGate({ bootstrapped, children }: { bootstrapped: boolean; children?: ReactNode }): JSX.Element {
  const [promptState, setPromptState] = useState<VersionPromptState>({ kind: 'none' })
  const [updateStatus, setUpdateStatus] = useState<DesktopUpdateStatus | null>(null)
  const [noticeDismissed, setNoticeDismissed] = useState(false)
  const [versionCheckFailure, setVersionCheckFailure] = useState<string | null>(null)
  const [trustRootStatus, setTrustRootStatus] = useState<TrustRootStatus | null>(null)
  const checkedRef = useRef(false)
  const installStartedRef = useRef(false)

  const checkForUpdate = () => {
    const updater = window.arologisUpdater
    if (!updater) return
    setUpdateStatus({ kind: 'checking' })
    void updater.check().catch((error: unknown) => {
      console.error('[arologis-version] updater 확인 상세 오류(사용자 화면 비공개)', error)
      setUpdateStatus({ kind: 'error', message: '업데이트 확인에 실패했습니다. 인터넷 연결을 확인해 주세요.' })
    })
  }

  useEffect(() => {
    if (!bootstrapped) return
    const updater = window.arologisUpdater
    if (!updater) return
    const unsubscribe = updater.onStatus((rawStatus) => {
      const status = normalizeUpdateStatus(rawStatus)
      if (!status) return
      setUpdateStatus(status)
    })
    checkForUpdate()
    void window.arologisTrustRoot?.status().then(setTrustRootStatus).catch(() => undefined)
    return unsubscribe
  }, [bootstrapped])

  useEffect(() => {
    if (updateStatus) setNoticeDismissed(false)
  }, [updateStatus?.kind])

  useEffect(() => {
    if (!bootstrapped || checkedRef.current) return
    checkedRef.current = true
    void fetchDesktopVersionStatus({
      apiBaseUrl: VERSION_API_BASE_URL,
      currentVersion: CURRENT_VERSION,
    }).then((versionInfo) => {
      setVersionCheckFailure(null)
      setPromptState(resolveVersionPromptState(versionInfo, safeStorage()))
    }).catch((error: unknown) => {
      console.warn('[arologis-version] 버전 정책 조회 실패', error)
      setVersionCheckFailure(VERSION_POLICY_FAILURE_MESSAGE)
    })
  }, [bootstrapped])

  const dismiss = () => {
    if (promptState.kind !== 'minor' && promptState.kind !== 'recommend') return
    safeStorage().setItem(promptState.dismissKey, 'true')
    setPromptState({ kind: 'none' })
  }

  const installDownloadedUpdate = () => {
    const updater = window.arologisUpdater
    if (!updater || installStartedRef.current) return
    installStartedRef.current = true
    void updater.install().catch((error: unknown) => {
      console.error('[arologis-version] updater 설치 상세 오류(사용자 화면 비공개)', error)
      installStartedRef.current = false
      setUpdateStatus({ kind: 'error', message: '업데이트 설치에 실패했습니다. 앱을 종료한 뒤 다시 실행해 주세요.' })
    })
  }

  const refreshTrustRootStatusAfterInstall = async () => {
    const trustRoot = window.arologisTrustRoot
    if (!trustRoot) return
    try {
      await trustRoot.install()
      const verifiedStatus = await trustRoot.status()
      setTrustRootStatus(verifiedStatus)
    } catch (error: unknown) {
      console.warn('[arologis-trust-root] 설치 후 실제 상태 확인 실패', error)
    }
  }

  const statusNotice = updateStatus && updateStatus.kind !== 'not-available' && !noticeDismissed ? (
    <AppUpdateNotice
      severity={updateStatus.kind === 'error' ? updateErrorSeverity(updateStatus.message ?? '') : 'network'}
      title={updateStatusTitle(updateStatus)}
      description={updateStatusText(updateStatus)}
      testId="app-auto-update-status"
      actions={(
        <>
          <Button type="button" variant="secondary" size="sm" onClick={checkForUpdate}>다시 확인</Button>
          {updateStatus.kind === 'downloaded' && <Button type="button" variant="primary" size="sm" onClick={installDownloadedUpdate}>앱을 다시 시작하여 설치</Button>}
          <Button type="button" variant="ghost" size="sm" onClick={() => setNoticeDismissed(true)} data-testid="app-auto-update-dismiss">닫기</Button>
        </>
      )}
    />
  ) : null

  const versionPolicyNotice = versionCheckFailure ? (
    <aside role="status" data-testid="app-version-policy-error" className="no-print">
      {versionCheckFailure}
    </aside>
  ) : null

  const trustRootNotice = trustRootStatus?.updateDisabled ? (
    <AppUpdateNotice
      severity="disabled"
      title="자동 업데이트가 꺼져 있습니다"
      description="사내 업데이트를 계속 받으려면 보안인증서 설치가 필요합니다. 설치가 끝날 때까지 앱은 그대로 사용할 수 있습니다."
      testId="app-trust-root-disabled"
      actions={<Button type="button" variant="secondary" size="sm" onClick={() => void refreshTrustRootStatusAfterInstall()}>보안인증서 설치</Button>}
    />
  ) : null

  const updateNoticeStack = (
    <AppUpdateNoticeStack>
      {versionPolicyNotice}
      {trustRootNotice}
      {statusNotice}
    </AppUpdateNoticeStack>
  )

  if (promptState.kind === 'blocking') {
    const { versionInfo } = promptState
    return (
      <>
        {updateNoticeStack}
        <section role="alertdialog" data-testid="app-version-blocking-modal" aria-modal="true">
          <h2>긴급 업데이트</h2>
          <p>현재 버전 {CURRENT_VERSION}은 더 이상 사용할 수 없습니다.</p>
          <p>최신 버전: {versionInfo.latestVersion}</p>
          <p>{versionInfo.releaseNotes || '최신 버전을 설치한 뒤 다시 실행해 주세요.'}</p>
          <button type="button" onClick={checkForUpdate}>업데이트 다시 확인</button>
          <button type="button" onClick={() => void window.arologisUpdater?.quit()}>앱 종료</button>
        </section>
      </>
    )
  }

  const notice = promptState.kind === 'minor' || promptState.kind === 'recommend' ? (
    <aside role="status" data-testid="app-version-minor-banner" className="no-print">
      <span>새 아로로지스 데스크톱 버전 {promptState.versionInfo.latestVersion}이 있습니다. 다운로드가 끝나면 자동으로 설치하고 앱을 다시 시작합니다.</span>
      <button type="button" onClick={dismiss}>안내 닫기</button>
    </aside>
  ) : null

  return (
    <>
      {updateNoticeStack}
      {notice}
      {children}
    </>
  )
}
