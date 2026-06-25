import { type CSSProperties, type ReactNode } from 'react'
import styles from './FormGrid.module.css'

export interface FormGridProps {
  /** 데스크탑 열 수(기본 2, CSS default). 768px 이하는 항상 1열. */
  columns?: number
  /** gap override. 미지정 시 design token 기본값을 사용한다. */
  gap?: string
  children: ReactNode
  className?: string
}

interface FormGridFullProps {
  children: ReactNode
  className?: string
}

type FormGridComponent = ((props: FormGridProps) => JSX.Element) & {
  Full: (props: FormGridFullProps) => JSX.Element
}

function Full({ children, className }: FormGridFullProps) {
  const cls = [styles['full'], className].filter(Boolean).join(' ')
  return <div className={cls}>{children}</div>
}

export const FormGrid = function FormGrid({
  columns,
  gap,
  children,
  className,
}: FormGridProps) {
  const style: CSSProperties = {}

  if (columns != null) {
    ;(style as CSSProperties & Record<'--fg-cols', string>)['--fg-cols'] = String(columns)
  }
  if (gap) {
    style.gap = gap
  }

  const cls = [styles['grid'], className].filter(Boolean).join(' ')

  return (
    <div className={cls} style={style}>
      {children}
    </div>
  )
} as FormGridComponent

FormGrid.Full = Full

export default FormGrid
