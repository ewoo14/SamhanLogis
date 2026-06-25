import { type ReactNode, useState } from 'react'
import { useIsMobile } from '../../hooks/useIsMobile'

export interface MobileCollapsibleProps {
  title: string
  defaultOpen?: boolean
  children: ReactNode
  className?: string
}

export function MobileCollapsible({
  title,
  defaultOpen = false,
  children,
  className,
}: MobileCollapsibleProps) {
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(defaultOpen)

  if (!isMobile) return <>{children}</>

  return (
    <div className={`mobile-section-accordion${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="mobile-section-summary"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {title}
      </button>
      {open ? <div className="mobile-section-body">{children}</div> : null}
    </div>
  )
}
