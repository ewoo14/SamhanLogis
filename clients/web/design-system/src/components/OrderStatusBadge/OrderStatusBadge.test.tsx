import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OrderStatusBadge, type OrderStatus } from './OrderStatusBadge'

const cases: Array<[OrderStatus, string]> = [
  ['DRAFT', '진행중'],
  ['ON_HOLD', '보류'],
  ['CONFIRMING', '확인중'],
  ['CONFIRMED', '완료'],
  ['CANCELED', '취소'],
  ['CONVERTED', '전환완료'],
]

describe('OrderStatusBadge', () => {
  it.each(cases)('%s 상태를 기존 라벨 그대로 표시한다', (status, label) => {
    render(<OrderStatusBadge status={status} />)

    const badge = screen.getByText(label).closest('span')
    expect(badge?.getAttribute('data-status')).toBe(status)
    expect(badge?.textContent).toBe(label)
  })

  it('보류와 전환완료를 서로 다른 상태 그룹으로 표시한다', () => {
    const { container } = render(
      <>
        <OrderStatusBadge status="ON_HOLD" />
        <OrderStatusBadge status="CONVERTED" />
      </>,
    )

    const badges = Array.from(container.querySelectorAll('[data-status]'))
    expect(badges[0]?.getAttribute('data-color-group')).not.toBe(
      badges[1]?.getAttribute('data-color-group'),
    )
  })
})
