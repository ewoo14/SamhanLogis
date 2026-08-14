import { Link } from 'react-router-dom'

type DocumentNumberLinkProps = {
  number: string | null | undefined
  to: string | null | undefined
  ariaLabel?: string
}

/** 문서번호를 기존 상세 route로 연결한다. 빈 번호/경로에는 깨진 링크를 만들지 않는다. */
export function DocumentNumberLink({ number, to, ariaLabel }: DocumentNumberLinkProps) {
  const label = number?.trim() ?? ''
  if (!label || !to?.trim()) return <span>{label || '—'}</span>

  return (
    <Link
      to={to}
      aria-label={ariaLabel ?? `${label} 상세 보기`}
      onClick={(event) => event.stopPropagation()}
    >
      {label}
    </Link>
  )
}
