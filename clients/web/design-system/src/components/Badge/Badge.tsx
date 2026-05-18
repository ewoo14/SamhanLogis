import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import styles from './Badge.module.css'

export type BadgeVariant = 'brand' | 'neutral' | 'success' | 'warning' | 'danger' | 'nts'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** 시각적 톤. 기본 'neutral'. */
  variant?: BadgeVariant
  /** 라벨 좌측 아이콘. (선택) */
  icon?: ReactNode
  children: ReactNode
}

const variantClass: Record<BadgeVariant, string> = {
  brand:   styles['variant-brand']!,
  neutral: styles['variant-neutral']!,
  success: styles['variant-success']!,
  warning: styles['variant-warning']!,
  danger:  styles['variant-danger']!,
  nts:     styles['variant-nts']!,
}

/**
 * Badge — 상태/카테고리 표시용 작은 pill 컴포넌트.
 *
 * 용도 예시: ProductStatus 표시 (ACTIVE → success, DISCONTINUED → neutral/danger).
 */
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { variant = 'neutral', icon, className, children, ...rest },
  ref,
) {
  const classes = [styles['badge'], variantClass[variant], className]
    .filter(Boolean)
    .join(' ')

  return (
    <span ref={ref} className={classes} {...rest}>
      {icon ? (
        <span className={styles['icon']} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className={styles['label']}>{children}</span>
    </span>
  )
})

export default Badge
