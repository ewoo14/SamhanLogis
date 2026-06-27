import { useEffect, useRef, useState } from 'react'
import { Button, Modal } from '@samhan/design-system'
import { getAppVersion } from '../../api/appVersion'
import type { AppClientType, AppVersionInfo } from '../../api/appVersion'
import { isCapacitorPlatform, isElectronPlatform } from '../../auth/authProvider'
import {
  resolveAppClientType,
  resolveVersionPromptState,
  type VersionPromptState,
} from '../../version/versionCheck'
import { formatKstDate } from '../../utils/formatDate'

const CURRENT_VERSION = import.meta.env.VITE_APP_VERSION ?? '0.0.0'
type SafeVersionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

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

export function AppVersionGate({ bootstrapped }: { bootstrapped: boolean }) {
  const [promptState, setPromptState] = useState<VersionPromptState>({ kind: 'none' })
  const [detailOpen, setDetailOpen] = useState(false)
  const checkedRef = useRef(false)
  const fallbackStorageRef = useRef(new Map<string, string>())
  const fallbackSessionStorageRef = useRef(new Map<string, string>())
  const clientTypeRef = useRef<AppClientType>(
    resolveAppClientType({
      electron: isElectronPlatform,
      capacitor: isCapacitorPlatform,
    }),
  )

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
  }, [bootstrapped])

  if (promptState.kind === 'blocking') {
    const { versionInfo } = promptState
    return (
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
          <Button
            type="button"
            variant="secondary"
            onClick={() => window.location.reload()}
            data-testid="app-version-blocking-reload"
          >
            다시 확인
          </Button>
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
            새 버전 설치 또는 웹 재접속 후 다시 확인해 주세요. 업데이트 전까지 앱 사용은 차단됩니다.
          </p>
        </div>
      </Modal>
    )
  }

  if (promptState.kind === 'recommend') {
    const { versionInfo, dismissKey } = promptState
    const dismiss = () => {
      safeSessionStorage(fallbackSessionStorageRef.current).setItem(dismissKey, 'true')
      setPromptState({ kind: 'none' })
    }

    return (
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
        </div>
      </Modal>
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
        <div
          role="status"
          data-testid="app-version-minor-banner"
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
          <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {releaseNotesText(versionInfo)}
          </div>
        </Modal>
      </>
    )
  }

  return null
}
