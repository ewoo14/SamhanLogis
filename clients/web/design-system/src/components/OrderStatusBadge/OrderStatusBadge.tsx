import { forwardRef, type HTMLAttributes } from 'react'
import styles from './OrderStatusBadge.module.css'

/** 주문서 상태 코드. partner-order-service의 업무 상태를 그대로 노출한다. */
export type OrderStatus =
  | 'DRAFT'
  | 'ON_HOLD'
  | 'CONFIRMING'
  | 'CONFIRMED'
  | 'CANCELED'
  | 'CONVERTED'

export interface OrderStatusBadgeProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** 주문서 상태 코드. */
  status: OrderStatus
}

const STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: '진행중',
  ON_HOLD: '보류',
  CONFIRMING: '확인중',
  CONFIRMED: '완료',
  CANCELED: '취소',
  CONVERTED: '전환완료',
}

type ColorGroup = 'draft' | 'hold' | 'confirming' | 'confirmed' | 'canceled' | 'converted'

const COLOR_GROUP: Record<OrderStatus, ColorGroup> = {
  DRAFT: 'draft',
  ON_HOLD: 'hold',
  CONFIRMING: 'confirming',
  CONFIRMED: 'confirmed',
  CANCELED: 'canceled',
  CONVERTED: 'converted',
}

/** 주문서 상태 배지 — 상태 코드와 한국어 업무 라벨을 한 곳에서 관리한다. */
export const OrderStatusBadge = forwardRef<HTMLSpanElement, OrderStatusBadgeProps>(
  function OrderStatusBadge({ status, className, ...rest }, ref) {
    const group = COLOR_GROUP[status]
    const classes = [styles['badge'], styles[`group-${group}`], className]
      .filter(Boolean)
      .join(' ')

    return (
      <span
        ref={ref}
        className={classes}
        data-status={status}
        data-color-group={group}
        {...rest}
      >
        {STATUS_LABEL[status]}
      </span>
    )
  },
)

export default OrderStatusBadge
