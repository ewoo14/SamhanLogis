import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Modal } from '@samhan/design-system'
import { getAppVersion } from '../../api/appVersion'
import type { AppClientType, AppVersionInfo } from '../../api/appVersion'
import { isCapacitorPlatform, isElectronPlatform } from '../../auth/authProvider'
import {
  resolveAppClientType,
  resolveBuildAppVersion,
  resolveVersionPromptState,
  type VersionPromptState,
} from '../../version/versionCheck'
import {
  DESKTOP_UPDATE_CHECK_TIMEOUT_MS,
  DESKTOP_UPDATE_DOWNLOAD_TIMEOUT_MS,
  desktopUpdateErrorMessage,
  type DesktopUpdateStatus,
} from '../../version/desktopUpdatePolicy'
import { formatKstDate } from '../../utils/formatDate'
import type { DesktopUpdateStatus as ElectronDesktopUpdateStatus } from '../../types/electron'

const CURRENT_VERSION = resolveBuildAppVersion(
  import.meta.env.VITE_APP_VERSION ?? (import.meta.env.MODE === 'test' ? '0.1.0' : undefined),
)
// Playwright mock 인증 스텁은 Electron 인증 API를 흉내 내지만 updater IPC는 없다.
// mock 회귀는 updater 실경로 검증 대상이 아니므로 안전 오류 알림을 만들지 않는다.
// 실제 Electron과 B8 라이브 하네스에서는 이 값이 false라 updater effect가 그대로 돈다.
const IS_MOCK_MODE = import.meta.env.VITE_MOCK_MODE === '1'
type SafeVersionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const DISPLAY_VERSION_PATTERN = /^\d{4}\/\d{2}\/\d{2}-[1-9][0-9]*$/

function releaseNotesText(versionInfo: AppVersionInfo): string {
  const notes = versionInfo.releaseNotes.trim()
  return notes || '등록된 릴리스 노트가 없습니다.'
}

function forceLevelLabel(forceLevel: AppVersionInfo['forceLevel']): string {
  switch (forceLevel) {
    case 'CRITICAL':
      return '긴급 업데이트'
    case 'MAJOR':
      return '필수 업데이트'
    case 'MINOR':
      return '권장 업데이트'
    case 'NONE':
      return '최신 버전'
  }
}

function fallbackVersionStorage(storage: Map<string, string>): SafeVersionStorage {
  return {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => {
      storage.set(key, value)
    },
    removeItem: (key) => {
      storage.delete(key)
    },
  }
}

function safeLocalStorage(fallbackStorage: Map<string, string>): SafeVersionStorage {
  const fallback = fallbackVersionStorage(fallbackStorage)
  if (typeof window === 'undefined') return fallback
  try {
    const storage = window.localStorage
    const probeKey = '__samhan_version_probe__'
    storage.setItem(probeKey, '1')
    storage.removeItem(probeKey)
    return {
      getItem: (key) => {
        try {
          return storage.getItem(key)
        } catch {
          return fallback.getItem(key)
        }
      },
      setItem: (key, value) => {
        try {
          storage.setItem(key, value)
        } catch {
          fallback.setItem(key, value)
        }
      },
      removeItem: (key) => {
        try {
          storage.removeItem(key)
        } catch {
          fallback.removeItem(key)
        }
      },
    }
  } catch {
    return fallback
  }
}

function safeSessionStorage(fallbackStorage: Map<string, string>): SafeVersionStorage {
  const fallback = fallbackVersionStorage(fallbackStorage)
  if (typeof window === 'undefined') return fallback
  try {
    const storage = window.sessionStorage
    const probeKey = '__samhan_version_session_probe__'
    storage.setItem(probeKey, '1')
    storage.removeItem(probeKey)
    return {
      getItem: (key) => {
        try {
          return storage.getItem(key)
        } catch {
          return fallback.getItem(key)
        }
      },
      setItem: (key, value) => {
        try {
          storage.setItem(key, value)
        } catch {
          fallback.setItem(key, value)
        }
      },
      removeItem: (key) => {
        try {
          storage.removeItem(key)
        } catch {
          fallback.removeItem(key)
        }
      },
    }
  } catch {
    return fallback
  }
}

function toUpdateStatus(value: ElectronDesktopUpdateStatus): DesktopUpdateStatus | null {
  if (value.kind === 'checking') return { kind: 'checking' }
  if (value.kind === 'available') return { kind: 'available', version: value.version ?? '' }
  if (value.kind === 'downloading') return { kind: 'downloading', percent: value.percent ?? 0 }
  if (value.kind === 'downloaded') return { kind: 'downloaded', version: value.version ?? '' }
  if (value.kind === 'not-available') return { kind: 'not-available' }
  if (value.kind === 'error') return { kind: 'error', message: desktopUpdateErrorMessage('unknown') }
  return null
}

function updateVersionLabel(version: string): string {
  const normalized = String(version ?? '').trim()
  return DISPLAY_VERSION_PATTERN.test(normalized) ? `새 버전 ${normalized}` : '새 버전'
}

function updateStatusText(status: DesktopUpdateStatus, installing = false): string {
  switch (status.kind) {
    case 'checking':
      return '업데이트를 확인하는 중입니다.'
    case 'available':
      return `${updateVersionLabel(status.version)}을 다운로드하는 중입니다.`
    case 'downloading':
      return `새 버전을 다운로드하는 중입니다. ${Math.round(status.percent)}%`
    case 'downloaded':
      return installing
        ? `${updateVersionLabel(status.version)}을 설치하고 앱을 다시 시작하는 중입니다.`
        : `${updateVersionLabel(status.version)}이 다운로드되었습니다. 다음 기동 때 자동 설치합니다.`
    case 'error':
      return `업데이트 실패: ${status.message}`
    case 'not-available':
      return '현재 설치된 버전이 최신입니다.'
  }
}

export function AppVersionGate({ bootstrapped, children }: { bootstrapped: boolean; children?: ReactNode }) {
  const [promptState, setPromptState] = useState<VersionPromptState>({ kind: 'none' })
  const [updateStatus, setUpdateStatus] = useState<DesktopUpdateStatus | null>(null)
  const [startupUpdateReady, setStartupUpdateReady] = useState(!isElectronPlatform || IS_MOCK_MODE)
  const [versionCheckReady, setVersionCheckReady] = useState(!isElectronPlatform || IS_MOCK_MODE)
  const [installing, setInstalling] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [noticeDismissed, setNoticeDismissed] = useState(false)
  const checkedRef = useRef(false)
  const startupInstallAllowedRef = useRef(true)
  const blockingRef = useRef(false)
  const fallbackStorageRef = useRef(new Map<string, string>())
  const fallbackSessionStorageRef = useRef(new Map<string, string>())
  const clientTypeRef = useRef<AppClientType>(
    resolveAppClientType({
      electron: isElectronPlatform,
      capacitor: isCapacitorPlatform,
    }),
  )

  blockingRef.current = promptState.kind === 'blocking'

  useEffect(() => {
    if (startupUpdateReady && versionCheckReady && !blockingRef.current) {
      startupInstallAllowedRef.current = false
    }
  }, [startupUpdateReady, versionCheckReady, promptState.kind])

  useEffect(() => {
    if (updateStatus) setNoticeDismissed(false)
  }, [updateStatus?.kind])

  useEffect(() => {
    if (!bootstrapped) return
    if (!isElectronPlatform || IS_MOCK_MODE) {
      setStartupUpdateReady(true)
      return
    }

    const updater = window.samhanUpdater
    if (!updater) {
      setUpdateStatus({ kind: 'error', message: desktopUpdateErrorMessage('unknown') })
      setStartupUpdateReady(true)
      return
    }

    let active = true
    let checkTimeout: ReturnType<typeof setTimeout> | undefined
    let downloadTimeout: ReturnType<typeof setTimeout> | undefined
    const clearTimeouts = () => {
      if (checkTimeout) clearTimeout(checkTimeout)
      if (downloadTimeout) clearTimeout(downloadTimeout)
    }
    const settleStartup = () => {
      clearTimeouts()
      if (active) setStartupUpdateReady(true)
    }
    const setUpdaterError = (stage: 'check' | 'download' | 'install' | 'check-timeout' | 'download-timeout', error?: unknown) => {
      if (error) console.error('[app-version] updater 상세 오류(사용자 화면 비공개)', error)
      setUpdateStatus({ kind: 'error', message: desktopUpdateErrorMessage(stage) })
      settleStartup()
    }
    const armDownloadTimeout = () => {
      if (downloadTimeout) clearTimeout(downloadTimeout)
      if (checkTimeout) clearTimeout(checkTimeout)
      downloadTimeout = setTimeout(() => setUpdaterError('download-timeout'), DESKTOP_UPDATE_DOWNLOAD_TIMEOUT_MS)
    }

    setUpdateStatus({ kind: 'checking' })
    checkTimeout = setTimeout(() => setUpdaterError('check-timeout'), DESKTOP_UPDATE_CHECK_TIMEOUT_MS)
    const unsubscribe = updater.onStatus((status) => {
      const next = toUpdateStatus(status)
      if (!next || !active) return
      setUpdateStatus(next)
      if (next.kind === 'available') {
        armDownloadTimeout()
      } else if (next.kind === 'not-available' || next.kind === 'error') {
        settleStartup()
      } else if (next.kind === 'downloaded') {
        clearTimeouts()
        if (!startupInstallAllowedRef.current) {
          settleStartup()
          return
        }
        setInstalling(true)
        void updater.install().catch((error: unknown) => {
          console.error('[app-version] updater 설치 상세 오류(사용자 화면 비공개)', error)
          setInstalling(false)
          setUpdaterError('install', error)
        })
      }
    })

    void updater.check().catch((error: unknown) => setUpdaterError('check', error))

    return () => {
      active = false
      clearTimeouts()
      unsubscribe()
    }
  }, [bootstrapped])

  useEffect(() => {
    if (!bootstrapped || checkedRef.current) return
    checkedRef.current = true

    const storage = safeLocalStorage(fallbackStorageRef.current)
    const sessionStorage = safeSessionStorage(fallbackSessionStorageRef.current)

    getAppVersion({
      clientType: clientTypeRef.current,
      currentVersion: CURRENT_VERSION,
    })
      .then((versionInfo) => {
        setPromptState(resolveVersionPromptState({
          versionInfo,
          clientType: clientTypeRef.current,
          storage,
          sessionStorage,
        }))
      })
      .catch((err: unknown) => {
        console.warn('[app-version] 버전체크 실패 — 앱 부팅은 계속 진행합니다.', err)
      })
      .finally(() => setVersionCheckReady(true))
  }, [bootstrapped])

  const checkForUpdate = () => {
    if (!isElectronPlatform) {
      // Web·Capacitor에는 Electron IPC가 없으므로 실제 산출물을 다시 읽도록 현재 문서를 갱신한다.
      window.location.reload()
      return
    }
    if (!window.samhanUpdater) return
    setUpdateStatus({ kind: 'checking' })
    void window.samhanUpdater.check().catch((error: unknown) => {
      console.error('[app-version] 수동 updater 확인 상세 오류(사용자 화면 비공개)', error)
      setUpdateStatus({
        kind: 'error',
        message: desktopUpdateErrorMessage('check'),
      })
    })
  }

  const quitApp = () => {
    if (window.samhanUpdater?.quit) {
      void window.samhanUpdater.quit().catch((error: unknown) => {
        console.error('[app-version] 앱 종료 상세 오류(사용자 화면 비공개)', error)
      })
      return
    }
    window.close()
  }

  const blockingReloadLabel = isCapacitorPlatform ? '앱 다시 불러오기' : '페이지 새로고침'

  const statusNotice = updateStatus && updateStatus.kind !== 'not-available' && !noticeDismissed ? (
    <div
      role="status"
      data-testid="app-auto-update-status"
      // U-1/U-2(#909 SONNET5 라운드2): 화면 전용 알림 — AppLayout 사이드바/헤더와 동일하게
      // 인쇄 시 완전히 제거한다(global.css `@media print { .no-print { display:none !important } }`,
      // 기존 관례 재사용). display:none 은 박스 자체를 없애 높이도 0 이 되므로, 이 알림이
      // in-flow(static)로 렌더될 때도 아래 인쇄물을 아래로 밀어내지 못한다 — "화면에서 안 보이게"가
      // 아니라 "인쇄 레이아웃에서 존재 자체를 지운다"가 핵심(마진/포지션과 무관하게 성립).
      className="no-print"
      style={{
        position: promptState.kind === 'blocking' ? 'fixed' : 'static',
        ...(promptState.kind === 'blocking'
          ? {
              insetInlineEnd: 16,
              insetBlockEnd: 16,
              zIndex: 10000,
              maxWidth: 'min(520px, calc(100vw - 32px))',
            }
          : {
              width: 'calc(100% - 32px)',
              maxWidth: 'calc(100% - 32px)',
              boxSizing: 'border-box',
              marginInline: 16,
              marginBlockEnd: 12,
            }),
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        padding: '10px 14px',
        border: `1px solid ${updateStatus.kind === 'error' ? 'var(--color-danger-300)' : 'var(--color-brand-200)'}`,
        borderRadius: 8,
        background: 'var(--color-neutral-0)',
        boxShadow: '0 8px 24px rgba(15, 23, 42, 0.16)',
        fontSize: 13,
      }}
    >
      <span>{updateStatusText(updateStatus, installing)}</span>
      <Button type="button" size="sm" variant="secondary" onClick={checkForUpdate} style={{ marginInlineStart: 12 }}>
        다시 확인
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => setNoticeDismissed(true)}
        data-testid="app-auto-update-dismiss"
        style={{ marginInlineStart: 8 }}
      >
        닫기
      </Button>
    </div>
  ) : null

  const startupPending = isElectronPlatform && !IS_MOCK_MODE && (!startupUpdateReady || !versionCheckReady)
  const startupSplash = (
    <div
      data-testid="app-update-startup-splash"
      role="status"
      style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}
    >
      <div style={{ textAlign: 'center' }}>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 18 }}>
          {updateStatus ? updateStatusText(updateStatus, installing) : '업데이트를 확인하는 중입니다.'}
        </p>
        <p style={{ margin: '10px 0 0', color: 'var(--color-neutral-600)', fontSize: 13 }}>
          확인이 끝나면 로그인 화면으로 이동합니다.
        </p>
      </div>
    </div>
  )

  if (promptState.kind === 'blocking') {
    const { versionInfo } = promptState
    return (
      <>
        {statusNotice}
        <Modal
        open
        onClose={() => {}}
        title={forceLevelLabel(versionInfo.forceLevel)}
        description={`현재 버전 ${CURRENT_VERSION}은 더 이상 사용할 수 없습니다.`}
        size="md"
        closeOnBackdropClick={false}
        closeOnEsc={false}
        closeOnHeaderX={false}
        hideCloseButton
        footer={(
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button
              type="button"
              variant="secondary"
              onClick={checkForUpdate}
              data-testid="app-version-blocking-reload"
            >
              {isElectronPlatform ? '업데이트 다시 확인' : blockingReloadLabel}
            </Button>
            {isElectronPlatform && (
              <Button type="button" variant="ghost" onClick={quitApp} data-testid="app-version-blocking-quit">
                앱 종료
              </Button>
            )}
          </div>
        )}
      >
        <div data-testid="app-version-blocking-modal">
          <dl style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 12px', margin: 0 }}>
            <dt style={{ color: 'var(--color-neutral-500)' }}>업데이트 수준</dt>
            <dd style={{ margin: 0, fontWeight: 700 }}>{forceLevelLabel(versionInfo.forceLevel)}</dd>
            <dt style={{ color: 'var(--color-neutral-500)' }}>최신 버전</dt>
            <dd style={{ margin: 0, fontWeight: 700 }}>{versionInfo.latestVersion}</dd>
            <dt style={{ color: 'var(--color-neutral-500)' }}>최소 지원</dt>
            <dd style={{ margin: 0 }}>{versionInfo.minSupportedVersion}</dd>
            <dt style={{ color: 'var(--color-neutral-500)' }}>배포 일시</dt>
            <dd style={{ margin: 0 }}>{formatKstDate(versionInfo.releasedAt)}</dd>
          </dl>
          <div
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 6,
              border: '1px solid var(--color-neutral-200)',
              background: 'var(--color-neutral-50)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
            }}
          >
            {releaseNotesText(versionInfo)}
          </div>
          <p style={{ margin: '14px 0 0', color: 'var(--color-neutral-700)', fontSize: 13 }}>
            {updateStatus?.kind === 'error'
              ? `${updateStatus.message} 다시 확인하거나 앱을 종료한 뒤 네트워크를 확인해 주세요. 계속되면 관리자에게 문의해 주세요.`
              : installing
                ? '업데이트를 설치하고 앱을 다시 시작하는 중입니다.'
              : isElectronPlatform
                ? '새 버전이 설치될 때까지 앱 사용은 차단됩니다. 잠시만 기다려 주세요.'
                : isCapacitorPlatform
                  ? '앱을 다시 불러오면 최신 Capacitor 산출물을 확인합니다.'
                  : '페이지를 새로고침하면 최신 웹 산출물을 확인합니다.'}
          </p>
        </div>
      </Modal>
      {startupPending && startupSplash}
      </>
    )
  }

  if (startupPending) return startupSplash

  if (promptState.kind === 'recommend') {
    const { versionInfo, dismissKey } = promptState
    const dismiss = () => {
      safeSessionStorage(fallbackSessionStorageRef.current).setItem(dismissKey, 'true')
      setPromptState({ kind: 'none' })
    }

    return (
      <>
        {statusNotice}
        {children}
        <Modal
        open
        onClose={dismiss}
        title={forceLevelLabel(versionInfo.forceLevel)}
        description={`현재 ${CURRENT_VERSION} · 최신 ${versionInfo.latestVersion}`}
        size="md"
        footer={(
          <Button
            type="button"
            variant="secondary"
            onClick={dismiss}
            data-testid="app-version-recommend-later"
          >
            나중에
          </Button>
        )}
      >
        <div data-testid="app-version-recommend-modal">
          <dl style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '8px 12px', margin: 0 }}>
            <dt style={{ color: 'var(--color-neutral-500)' }}>업데이트 수준</dt>
            <dd style={{ margin: 0, fontWeight: 700 }}>{forceLevelLabel(versionInfo.forceLevel)}</dd>
            <dt style={{ color: 'var(--color-neutral-500)' }}>최신 버전</dt>
            <dd style={{ margin: 0, fontWeight: 700 }}>{versionInfo.latestVersion}</dd>
            <dt style={{ color: 'var(--color-neutral-500)' }}>최소 지원</dt>
            <dd style={{ margin: 0 }}>{versionInfo.minSupportedVersion}</dd>
            <dt style={{ color: 'var(--color-neutral-500)' }}>배포 일시</dt>
            <dd style={{ margin: 0 }}>{formatKstDate(versionInfo.releasedAt)}</dd>
          </dl>
          <div
            style={{
              marginTop: 16,
              padding: 12,
              borderRadius: 6,
              border: '1px solid var(--color-brand-200)',
              background: 'var(--color-brand-50)',
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
            }}
          >
            {releaseNotesText(versionInfo)}
          </div>
          <p style={{ margin: '14px 0 0', color: 'var(--color-neutral-700)', fontSize: 13 }}>
            앱은 계속 사용할 수 있지만, 이번 세션에서만 안내를 닫을 수 있습니다.
          </p>
          {updateStatus && updateStatus.kind !== 'not-available' && (
            <p data-testid="app-auto-update-progress" style={{ margin: '10px 0 0', color: 'var(--color-neutral-700)', fontSize: 13 }}>
              {updateStatusText(updateStatus)}
            </p>
          )}
        </div>
      </Modal>
      </>
    )
  }

  if (promptState.kind === 'minor') {
    const { versionInfo, dismissKey } = promptState
    const dismiss = () => {
      safeLocalStorage(fallbackStorageRef.current).setItem(dismissKey, 'true')
      setPromptState({ kind: 'none' })
      setDetailOpen(false)
    }

    return (
      <>
        {statusNotice}
        {children}
        <div
          role="status"
          data-testid="app-version-minor-banner"
          // U-1/U-2(#909 SONNET5 라운드2 계열 sweep): statusNotice 와 동일 결함 계열 —
          // position:fixed 라 화면 레이아웃은 안 밀지만, useFitOneA4 가 A4 한 장에 꽉 채워
          // 두는 이 앱 특성상 인쇄 캔버스에 픽셀이 더해지면 그 자체로 페이지가 늘어난다
          // (sweep 실측: no-print 없이는 1p→2p). display:none 만이 U-1·U-2 를 동시에 만족한다.
          className="no-print"
          style={{
            position: 'fixed',
            insetInlineEnd: 'max(16px, env(safe-area-inset-right))',
            insetInlineStart: 'max(16px, env(safe-area-inset-left))',
            insetBlockEnd: 'calc(84px + env(safe-area-inset-bottom))',
            zIndex: 9998,
            display: 'grid',
            gridTemplateColumns: '1fr auto auto',
            gap: 8,
            alignItems: 'center',
            width: 'min(520px, calc(100vw - 32px))',
            maxWidth: 'calc(100vw - 32px)',
            padding: '12px 14px',
            border: '1px solid var(--color-brand-200)',
            borderRadius: 8,
            background: 'var(--color-neutral-0)',
            boxShadow: '0 8px 24px rgba(15, 23, 42, 0.16)',
          }}
        >
          <span style={{ fontSize: 13 }}>
            새 버전 {versionInfo.latestVersion}이 있습니다.
          </span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => setDetailOpen(true)}
            data-testid="app-version-minor-view"
          >
            지금 보기
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={dismiss}
            data-testid="app-version-minor-dismiss"
          >
            다시 보지 않기
          </Button>
        </div>
        <Modal
          open={detailOpen}
          onClose={() => setDetailOpen(false)}
          title="업데이트 안내"
          description={`현재 ${CURRENT_VERSION} · 최신 ${versionInfo.latestVersion}`}
          footer={(
            <Button type="button" variant="secondary" onClick={() => setDetailOpen(false)}>
              닫기
            </Button>
          )}
        >
          {/* U-3(#909 SONNET5 라운드2): 이 testid 는 global.css 의 :has() 인쇄 규칙이 "업데이트 안내"
              모달만 골라 인쇄에서 뺄 수 있게 하는 표적이다 — Modal backdrop 을 통째로 숨기면
              SlipDetailModal 처럼 Modal 안에 실제 인쇄 문서(DispatchDocument 등)가 있는 다른
              소비처까지 인쇄에서 지워진다(PM 반증 확인). */}
          <div data-testid="app-version-minor-detail-modal">
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {releaseNotesText(versionInfo)}
            </div>
            {updateStatus && updateStatus.kind !== 'not-available' && (
              <p data-testid="app-auto-update-progress" style={{ margin: '10px 0 0', color: 'var(--color-neutral-700)', fontSize: 13 }}>
                {updateStatusText(updateStatus)}
              </p>
            )}
          </div>
        </Modal>
      </>
    )
  }

  return (
    <>
      {statusNotice}
      {children}
    </>
  )
}
