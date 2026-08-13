import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { OrderNumberDisplay } from './OrderNumberDisplay'

describe('OrderNumberDisplay', () => {
  it.each(['sm', 'md', 'lg'] as const)('%s 크기에서도 주문번호 문자열을 그대로 표시한다', (size) => {
    render(<OrderNumberDisplay orderNumber="2026/08/12-17" size={size} />)

    const display = screen.getByText('2026/08/12-17')
    expect(display.textContent).toBe('2026/08/12-17')
    expect(display.getAttribute('data-order-number')).toBe('2026/08/12-17')
  })
})
