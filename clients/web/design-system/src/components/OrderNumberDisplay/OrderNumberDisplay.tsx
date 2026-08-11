import { forwardRef, type HTMLAttributes } from 'react'
import styles from './OrderNumberDisplay.module.css'

export interface OrderNumberDisplayProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** 사용자에게 노출하는 주문번호. 내부 UUID는 받지 않는다. */
  orderNumber: string
  /** 목록/본문/상세 헤더 표시 크기. */
  size?: 'sm' | 'md' | 'lg'
}

/** 주문번호 표시 — 전달된 업무 식별자 문자열을 변경하지 않는다. */
export const OrderNumberDisplay = forwardRef<HTMLSpanElement, OrderNumberDisplayProps>(
  function OrderNumberDisplay({ orderNumber, size = 'md', className, ...rest }, ref) {
    const classes = [styles['number'], styles[`size-${size}`], className]
      .filter(Boolean)
      .join(' ')

    return (
      <span
        ref={ref}
        className={classes}
        data-order-number={orderNumber}
        {...rest}
      >
        {orderNumber}
      </span>
    )
  },
)

export default OrderNumberDisplay
