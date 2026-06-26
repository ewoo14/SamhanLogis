/**
 * PWA service worker 등록 + 업데이트 prompt 토스트.
 * 새 버전 감지 시 자동 reload 금지. 사용자가 안전한 시점에 새로고침한다.
 * Electron 빌드에서는 VitePWA disable 설정으로 registerSW가 no-op 처리된다.
 */
import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

export function PwaUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  const [updateSW, setUpdateSW] = useState<((reload?: boolean) => Promise<void>) | null>(null)

  useEffect(() => {
    const update = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true)
      },
      onOfflineReady() {
        setOfflineReady(true)
      },
    })
    setUpdateSW(() => update)
  }, [])

  if (!needRefresh && !offlineReady) return null

  return (
    <div
      role="status"
      data-testid="pwa-update-toast"
      className="pwa-toast"
      style={{
        position: 'fixed',
        insetInlineEnd: 16,
        insetBlockEnd: 16,
        zIndex: 9999,
        background: 'var(--surface-card,#fff)',
        border: '1px solid var(--color-border,#D6DCE3)',
        borderRadius: 8,
        padding: '12px 16px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        maxWidth: 360,
      }}
    >
      <span style={{ fontSize: 13 }}>
        {needRefresh ? '새 버전이 있습니다.' : '오프라인에서 사용할 수 있습니다.'}
      </span>
      {needRefresh ? (
        <button
          type="button"
          data-testid="pwa-refresh-button"
          onClick={() => updateSW?.(true)}
          style={{ fontWeight: 700, color: 'var(--color-brand-500,#2D77A8)' }}
        >
          새로고침
        </button>
      ) : null}
      <button
        type="button"
        aria-label="닫기"
        onClick={() => {
          setNeedRefresh(false)
          setOfflineReady(false)
        }}
      >
        ✕
      </button>
    </div>
  )
}
