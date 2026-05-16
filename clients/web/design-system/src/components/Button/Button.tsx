import { forwardRef, type ButtonHTMLAttributes } from 'react'
import styles from './Button.module.css'
import { Spinner } from '../Spinner/Spinner'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
}

const variantClass: Record<ButtonVariant, string> = {
  primary:   styles['variant-primary']!,
  secondary: styles['variant-secondary']!,
  ghost:     styles['variant-ghost']!,
  danger:    styles['variant-danger']!,
  warning:   styles['variant-warning']!,
}

const sizeClass: Record<ButtonSize, string> = {
  sm: styles['size-sm']!,
  md: styles['size-md']!,
  lg: styles['size-lg']!,
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    fullWidth = false,
    disabled,
    className,
    children,
    type,
    ...rest
  },
  ref,
) {
  const classes = [
    styles['button'],
    variantClass[variant],
    sizeClass[size],
    fullWidth ? styles['fullWidth'] : null,
    loading ? styles['loading'] : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <span className={styles['spinner']} aria-hidden="true">
          <Spinner size="sm" tone="currentColor" />
        </span>
      ) : null}
      <span className={styles['label']}>{children}</span>
    </button>
  )
})

export default Button
