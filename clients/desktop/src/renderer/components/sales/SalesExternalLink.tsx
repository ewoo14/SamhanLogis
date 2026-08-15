import { useState } from 'react'

const MISSING_URL_MESSAGE = '외부 웹앱 주소가 운영 빌드에 설정되지 않았습니다'

export function getExternalSalesUrl(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

export function SalesExternalLink({
  show,
  envKey,
  label,
  url,
}: {
  show: boolean
  envKey: 'VITE_WEB_ESTIMATE_URL' | 'VITE_WEB_ORDER_URL'
  label: string
  url?: string
}) {
  const [notice, setNotice] = useState(false)
  if (!show) return null

  const configuredUrl = getExternalSalesUrl(
    url ?? (envKey === 'VITE_WEB_ESTIMATE_URL' ? import.meta.env.VITE_WEB_ESTIMATE_URL : import.meta.env.VITE_WEB_ORDER_URL),
  )

  const openExternal = () => {
    if (!configuredUrl) {
      setNotice(true)
      return
    }

    const bridge = window.samhanLegacy
    if (!bridge) {
      window.open(configuredUrl, '_blank', 'noopener,noreferrer')
      return
    }
    bridge.openExternal(configuredUrl).catch((err) => {
      console.warn('[SalesExternalLink] 외부 link 열기 실패', err)
    })
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button
        type="button"
        onClick={openExternal}
        title={`${label} — 거래처가 직접 사용하는 외부 웹앱 (새 브라우저 창)`}
        data-testid={`sidebar-sales-external-${envKey === 'VITE_WEB_ESTIMATE_URL' ? 'estimate' : 'order'}`}
        className="app-sidebar-link"
      >
        {label} ↗
      </button>
      {notice ? <span role="alert">{MISSING_URL_MESSAGE}</span> : null}
    </span>
  )
}
