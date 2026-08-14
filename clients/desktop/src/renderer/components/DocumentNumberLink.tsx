import { Link } from 'react-router-dom'

type DocumentNumberLinkProps = {
  number: string | null | undefined
  to: string | null | undefined
  ariaLabel?: string
  detailWindow?: {
    documentType: 'OUTBOUND_SLIP' | 'INBOUND_SLIP' | 'TAX_INVOICE'
    documentId: string | null | undefined
  }
}

export function DocumentNumberLink({ number, to, ariaLabel, detailWindow }: DocumentNumberLinkProps) {
  const label = number?.trim() ?? ''
  if (!label || !to?.trim()) return <span>{label || '—'}</span>

  return (
    <Link
      to={to}
      aria-label={ariaLabel ?? `${label} 상세 보기`}
      onClick={(event) => {
        event.stopPropagation()
        if (detailWindow && detailWindow.documentId?.trim() && window.samhanDetailWindow) {
          event.preventDefault()
          void window.samhanDetailWindow.open({
            documentType: detailWindow.documentType,
            documentId: detailWindow.documentId,
            route: to,
          })
        }
      }}
    >
      {label}
    </Link>
  )
}
