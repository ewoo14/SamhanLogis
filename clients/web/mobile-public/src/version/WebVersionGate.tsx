import { useEffect, useState, type ReactNode } from 'react'
import {
  fetchWebVersionStatus,
  resolveVersionPromptState,
  type VersionPromptState,
} from './versionCheck'

interface WebVersionGateProps {
  children: ReactNode
  currentVersion: string
  apiBaseUrl?: string
  isDirty?: () => boolean
}

/** 모바일 퍼블릭 웹의 버전 안내. 조회 실패와 사용자의 보류는 콘텐츠를 막지 않는다. */
export function WebVersionGate({
  children,
  currentVersion,
  apiBaseUrl = import.meta.env.VITE_VERSION_API_BASE_URL || 'http://localhost:8080',
  isDirty = () => false,
}: WebVersionGateProps) {
  const [promptState, setPromptState] = useState<VersionPromptState>({ kind: 'none' })
  const [confirmingReload, setConfirmingReload] = useState(false)

  useEffect(() => {
    let active = true
    void fetchWebVersionStatus({ apiBaseUrl, currentVersion }).then((versionInfo) => {
      if (!active || !versionInfo) return
      setPromptState(resolveVersionPromptState(versionInfo, safeLocalStorage()))
    })
    return () => { active = false }
  }, [apiBaseUrl, currentVersion])

  const reload = () => {
    if (isDirty()) {
      setConfirmingReload(true)
      return
    }
    window.location.reload()
  }

  const confirmReload = () => {
    setConfirmingReload(false)
    window.location.reload()
  }

  const dismiss = () => {
    if (promptState.kind !== 'minor' && promptState.kind !== 'recommend') return
    try { window.localStorage.setItem(promptState.dismissKey, 'true') } catch { /* 저장소 차단은 무시 */ }
    setPromptState({ kind: 'none' })
  }

  return (
    <>
      {promptState.kind !== 'none' ? (
        <aside
          role={promptState.kind === 'blocking' ? 'alertdialog' : 'status'}
          aria-live="polite"
          data-testid="web-version-notice"
          style={{
            position: 'fixed', insetInline: 12, insetBlockEnd: 12, zIndex: 1000,
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
            border: '1px solid #2563eb', borderRadius: 8, background: '#fff', color: '#111827',
            boxShadow: '0 8px 24px rgba(15, 23, 42, .18)',
          }}
        >
          <span style={{ flex: 1 }}>
            {promptState.kind === 'blocking'
              ? `현재 버전은 지원이 종료되었습니다. 최신 버전 ${promptState.latestVersion}으로 다시 불러와 주세요.`
              : `새 버전 ${promptState.latestVersion}을 사용할 수 있습니다. 작성 중인 내용이 있으면 먼저 저장해 주세요.`}
          </span>
          <button type="button" data-testid="web-version-reload" onClick={reload}>페이지 새로고침</button>
          {promptState.kind !== 'blocking' ? <button type="button" data-testid="web-version-dismiss" onClick={dismiss}>나중에</button> : null}
        </aside>
      ) : null}
      {confirmingReload ? (
        <div
          role="alertdialog"
          aria-modal="true"
          data-testid="web-version-unsaved-confirm"
          style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'grid', placeItems: 'center', background: 'rgba(15, 23, 42, .45)' }}
        >
          <div style={{ maxWidth: 420, margin: 16, padding: 20, borderRadius: 8, background: '#fff', color: '#111827' }}>
            <h2 style={{ marginTop: 0 }}>작성 중인 내용이 있습니다</h2>
            <p>저장하지 않은 입력은 새로고침하면 사라질 수 있습니다. 그래도 페이지를 새로고침할까요?</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" onClick={() => setConfirmingReload(false)}>취소</button>
              <button type="button" data-testid="web-version-confirm-reload" onClick={confirmReload}>그래도 새로고침</button>
            </div>
          </div>
        </div>
      ) : null}
      {children}
    </>
  )
}

function safeLocalStorage(): Storage {
  try { return window.localStorage } catch { return new MapStorage() }
}

class MapStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}
