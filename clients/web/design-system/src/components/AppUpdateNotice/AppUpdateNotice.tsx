import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { Card } from '../Card'
import styles from './AppUpdateNotice.module.css'

export type AppUpdateNoticeSeverity = 'network' | 'integrity' | 'trust' | 'disabled'

export const APP_UPDATE_SEVERITY_LABEL: Record<AppUpdateNoticeSeverity, string> = {
  network: 'NETWORK',
  integrity: 'INTEGRITY',
  trust: 'TRUST',
  disabled: '자동 업데이트 꺼짐',
}

export interface AppUpdateNoticeProps {
  severity: AppUpdateNoticeSeverity
  title: string
  description: string
  actions?: ReactNode
  onRetry?: () => void
  onDismiss?: () => void
  testId?: string
}

export interface AppUpdateNoticeStackProps {
  children: ReactNode
}

const badgeVariant = {
  network: 'brand',
  integrity: 'danger',
  trust: 'warning',
  disabled: 'neutral',
} as const

/**
 * 데스크톱 업데이트 상태의 공통 사용자 표현.
 * 아로로지스·삼한 데스크톱은 이 컴포넌트의 문구 계층과 심각도 표현을 공유한다.
 * 사내 메신저는 이번 범위에서 게이트를 추가하지 않으며, 향후 게이트가 생길 때 이 계약을 기준으로 관측한다.
 */
export function AppUpdateNotice({
  severity,
  title,
  description,
  actions,
  onRetry,
  onDismiss,
  testId,
}: AppUpdateNoticeProps): JSX.Element {
  const renderedActions = actions ?? (
    <>
      {onRetry ? <Button type="button" variant={severity === 'trust' ? 'warning' : 'secondary'} size="sm" onClick={onRetry}>다시 확인</Button> : null}
      {onDismiss ? <Button type="button" variant="ghost" size="sm" onClick={onDismiss} data-testid="app-auto-update-dismiss">닫기</Button> : null}
    </>
  )

  return (
    <Card
      as="aside"
      role="status"
      aria-live="polite"
      data-severity={severity}
      data-layout="overlay"
      data-print-exclude="app-update-notice"
      data-testid={testId ?? 'app-update-notice'}
      className={`${styles.notice} ${styles[`severity-${severity}`]} no-print`}
      padding={4}
      shadow="sm"
      variant="outlined"
    >
      <div className={styles.header}>
        <Badge variant={badgeVariant[severity]}>{APP_UPDATE_SEVERITY_LABEL[severity]}</Badge>
        <h2>{title}</h2>
      </div>
      <p>{description}</p>
      {renderedActions ? <div className={styles.actions}>{renderedActions}</div> : null}
    </Card>
  )
}

/** 여러 업데이트 알림을 한 묶음으로 고정해도 알림 사이 간격과 본문 좌표를 보존한다. */
export function AppUpdateNoticeStack({ children }: AppUpdateNoticeStackProps): JSX.Element {
  const stackRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const stack = stackRef.current
    if (!stack) return

    const updatePosition = () => {
      const spacing = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--space-4')) || 16
      const interactive = Array.from(document.querySelectorAll<HTMLElement>('a, button, input'))
        .filter((element) => !element.closest('[data-app-update-notice-stack]'))
        .map((element) => ({ element, rect: element.getBoundingClientRect() }))
        .filter(({ rect }) => rect.width > 0 && rect.height > 0)
      const headerControls = interactive
        .filter(({ element }) => !element.closest('tbody tr'))
        .map(({ rect }) => rect)
      const top = Math.max(spacing, ...headerControls.map((rect) => rect.bottom + spacing))
      stack.style.setProperty('--app-update-notice-top', `${top}px`)
    }

    let frame = 0
    const schedulePosition = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => requestAnimationFrame(updatePosition))
    }
    updatePosition()
    const observer = new MutationObserver(schedulePosition)
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', schedulePosition)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', schedulePosition)
    }
  }, [])

  return <div ref={stackRef} className={styles.stack} data-app-update-notice-stack data-print-exclude="app-update-notice-stack">{children}</div>
}

export default AppUpdateNotice
