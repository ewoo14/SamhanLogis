import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

type MobileActionSheetProps = {
  open: boolean
  onClose: () => void
  children: ReactNode
  label?: string
}

export function MobileActionSheet({
  open,
  onClose,
  children,
  label = '추가 액션',
}: MobileActionSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    sheetRef.current?.focus()
  }, [open])

  if (!open) return null

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      onClose()
    }
  }

  return (
    <>
      <div className="mobile-more-overlay" role="presentation" onClick={onClose} />
      <div
        ref={sheetRef}
        className="mobile-more-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <div className="mobile-more-sheet-handle" />
        {children}
      </div>
    </>
  )
}
