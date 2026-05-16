import { forwardRef, useId, type SelectHTMLAttributes } from 'react'
import styles from './Select.module.css'
import { Label } from '../Label/Label'

export type SelectSize = 'sm' | 'md' | 'lg'

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  error?: string
  required?: boolean
  selectSize?: SelectSize
  fullWidth?: boolean
}

const sizeClass: Record<SelectSize, string> = {
  sm: styles['size-sm']!,
  md: styles['size-md']!,
  lg: styles['size-lg']!,
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    id,
    label,
    hint,
    error,
    required,
    selectSize = 'md',
    fullWidth = true,
    className,
    'aria-describedby': ariaDescribedBy,
    children,
    ...rest
  },
  ref,
) {
  const reactId = useId()
  const fieldId = id ?? `ds-select-${reactId}`
  const hintId = hint ? `${fieldId}-hint` : undefined
  const errorId = error ? `${fieldId}-error` : undefined
  const describedBy = [ariaDescribedBy, hintId, errorId].filter(Boolean).join(' ') || undefined

  const wrapperClasses = [
    styles['wrapper'],
    fullWidth ? styles['fullWidth'] : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const selectClasses = [
    styles['select'],
    sizeClass[selectSize],
    error ? styles['hasError'] : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={wrapperClasses}>
      {label ? (
        <Label htmlFor={fieldId} required={required}>
          {label}
        </Label>
      ) : null}
      <select
        ref={ref}
        id={fieldId}
        className={selectClasses}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        required={required}
        {...rest}
      >
        {children}
      </select>
      {hint && !error ? (
        <span id={hintId} className={styles['hint']}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className={styles['error']} role="alert">
          {error}
        </span>
      ) : null}
    </div>
  )
})

export default Select
