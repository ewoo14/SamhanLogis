import type React from 'react'
import { type ReactNode } from 'react'
import styles from './FormGrid.module.css'

export interface FormGridProps {
  /** 데스크탑 열 수(기본 2, CSS default). 768px 이하는 항상 1열. */
  columns?: number
  /** gap override. 미지정 시 design token 기본값을 사용한다. */
  gap?: string
  children: ReactNode
  className?: string
}

export interface FormGridFullProps {
  children: ReactNode
  className?: string
}

function Full({ children, className }: FormGridFullProps) {
  const cls = [styles.full, className].filter(Boolean).join(' ')
  return <div className={cls}>{children}</div>
}

export const FormGrid = Object.assign(
  function FormGrid({ columns, gap, children, className }: FormGridProps) {
    const style: React.CSSProperties = {
      ...(columns != null ? ({ '--fg-cols': String(columns) } as React.CSSProperties) : {}),
      ...(gap != null ? { gap } : {}),
    }

    const cls = [styles.grid, className].filter(Boolean).join(' ')

    return (
      <div className={cls} style={style}>
        {children}
      </div>
    )
  },
  { Full },
)

export default FormGrid
