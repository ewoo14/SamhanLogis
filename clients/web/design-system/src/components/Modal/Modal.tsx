import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import styles from './Modal.module.css'

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

export interface ModalProps {
  open: boolean
  onClose: () => void
  /** Visible heading. Wired to aria-labelledby. */
  title?: ReactNode
  /** Optional descriptive text under the title (aria-describedby). */
  description?: ReactNode
  size?: ModalSize
  /** Close on backdrop click. Default true. */
  closeOnBackdropClick?: boolean
  /** Close on Escape key. Default true. */
  closeOnEsc?: boolean
  /** Footer node — typically action buttons. */
  footer?: ReactNode
  /** Hide the close (X) button in the header. */
  hideCloseButton?: boolean
  /** Body content. */
  children?: ReactNode
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function getFocusable(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('disabled') && el.offsetParent !== null,
  )
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  closeOnBackdropClick = true,
  closeOnEsc = true,
  footer,
  hideCloseButton = false,
  children,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const reactId = useId()
  const titleId = title ? `ds-modal-title-${reactId}` : undefined
  const descId = description ? `ds-modal-desc-${reactId}` : undefined

  // Move focus into modal on open; restore on close.
  useEffect(() => {
    if (!open) return
    previouslyFocusedRef.current = (document.activeElement as HTMLElement) ?? null

    const node = dialogRef.current
    if (node) {
      const focusables = getFocusable(node)
      const target = focusables[0] ?? node
      // Defer to ensure portal mounted children are measurable.
      window.requestAnimationFrame(() => target.focus())
    }

    return () => {
      const prev = previouslyFocusedRef.current
      if (prev && typeof prev.focus === 'function') {
        prev.focus()
      }
    }
  }, [open])

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = original
    }
  }, [open])

  // ESC handler at document level (so it works regardless of focus).
  useEffect(() => {
    if (!open || !closeOnEsc) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, closeOnEsc, onClose])

  const handleBackdropClick = useCallback(
    (e: ReactMouseEvent<HTMLDivElement>) => {
      if (!closeOnBackdropClick) return
      // Only close if click is on the backdrop itself, not children.
      if (e.target === e.currentTarget) onClose()
    },
    [closeOnBackdropClick, onClose],
  )

  // Focus trap via Tab key cycling.
  const handleKeyDown = useCallback((e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    const node = dialogRef.current
    if (!node) return
    const focusables = getFocusable(node)
    if (focusables.length === 0) {
      e.preventDefault()
      node.focus()
      return
    }
    const first = focusables[0]!
    const last = focusables[focusables.length - 1]!
    const active = document.activeElement as HTMLElement | null

    if (e.shiftKey) {
      if (active === first || !node.contains(active)) {
        e.preventDefault()
        last.focus()
      }
    } else {
      if (active === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }, [])

  if (!open || typeof document === 'undefined') return null

  const sizeClass =
    size === 'sm'
      ? styles['size-sm']
      : size === 'lg'
        ? styles['size-lg']
        : size === 'xl'
          ? styles['size-xl']
          : styles['size-md']

  return createPortal(
    <div
      className={styles['backdrop']}
      onMouseDown={handleBackdropClick}
      data-testid="ds-modal-backdrop"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        className={[styles['dialog'], sizeClass].filter(Boolean).join(' ')}
        onKeyDown={handleKeyDown}
      >
        {(title || !hideCloseButton) && (
          <header className={styles['header']}>
            {title ? (
              <h2 id={titleId} className={styles['title']}>
                {title}
              </h2>
            ) : (
              <span aria-hidden="true" />
            )}
            {!hideCloseButton ? (
              <button
                type="button"
                className={styles['closeBtn']}
                aria-label="닫기"
                onClick={onClose}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M3 3l10 10M13 3L3 13"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            ) : null}
          </header>
        )}
        {description ? (
          <p id={descId} className={styles['description']}>
            {description}
          </p>
        ) : null}
        <div className={styles['body']}>{children}</div>
        {footer ? <footer className={styles['footer']}>{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}

export default Modal
