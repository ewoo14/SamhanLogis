import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
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
  /** Close when the header X button is clicked. Default true. */
  closeOnHeaderX?: boolean
  /** Footer node — typically action buttons. */
  footer?: ReactNode
  /** Hide the close (X) button in the header. */
  hideCloseButton?: boolean
  /**
   * body 가 그 자체로 인쇄 대상 문서(예: 전표 미리보기)를 담고 있는 모달인지.
   *
   * true 면 `[role=dialog]` 에 `data-print-document` 속성이 붙고, `@media print` 에서
   * 크롬(제목·설명·닫기·푸터)이 인쇄에서 빠진다 — 화면(screen)에는 영향 없음.
   *
   * 기본값 false — 크롬(제목/설명/조작부)이 곧 모달의 유일한 의미인 일반 확인 모달
   * (예: 차량 추가)은 인쇄물에도 제목·설명·버튼이 그대로 유지된다. body 안에 자체
   * 인쇄 문서를 그리는 모달(예: `SlipDetailModal`)만 명시적으로 opt-in 할 것.
   * (PR #921 chore-B R4 — CODEX SOL 2차 적대검증 A-1: R-3 가 크롬 숨김을 전 모달에
   * 무차별 적용해 `AddVehicleModal` 등 일반 모달의 제목·설명·조작부가 인쇄물에서
   * 통째로 사라졌던 회귀의 fix.)
   */
  printableBody?: boolean
  /**
   * open 시 초기 포커스를 받을 요소 ref (예: 다이얼로그의 첫 입력란).
   *
   * 미지정 시 기존 동작(첫 focusable — 보통 닫기 버튼) 유지. 소비처 로컬 rAF 로
   * Modal 내부 포커스 rAF 와 경합하던 패턴([#825 CM3])을 대체하는 결정적 계약이다.
   * 대상이 다이얼로그 밖이거나 아직 없으면 기본 동작으로 폴백한다 (focus trap 무결성).
   * ⚠️ `useRef` 로 생성한 안정 ref 를 전달할 것 — 렌더마다 새 객체를 만들면
   * effect 가 재실행되어 포커스가 튄다.
   */
  initialFocusRef?: RefObject<HTMLElement>
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
  closeOnHeaderX = true,
  footer,
  hideCloseButton = false,
  printableBody = false,
  initialFocusRef,
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
      const fallback = focusables[0] ?? node
      // Defer to ensure portal mounted children are measurable.
      window.requestAnimationFrame(() => {
        // [#825 CM3] initialFocusRef 우선 — 다이얼로그 내부 요소일 때만 존중해
        // aria-modal focus trap 을 벗어나지 않는다. 아니면 기존 기본 동작.
        const preferred = initialFocusRef?.current
        if (preferred && node.contains(preferred) && typeof preferred.focus === 'function') {
          preferred.focus()
        } else {
          fallback.focus()
        }
      })
    }

    return () => {
      const prev = previouslyFocusedRef.current
      if (prev && typeof prev.focus === 'function') {
        prev.focus()
      }
    }
  }, [open, initialFocusRef])

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
        data-print-document={printableBody || undefined}
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
                disabled={!closeOnHeaderX}
                onClick={() => {
                  if (closeOnHeaderX) onClose()
                }}
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
