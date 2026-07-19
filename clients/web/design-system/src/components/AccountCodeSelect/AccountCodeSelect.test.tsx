import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AccountCodeSelect, type Account } from './AccountCodeSelect'

const accounts: Account[] = [
  { code: '1010', name: '보통예금', category: '100' },
  { code: '1020', name: '당좌예금', category: '100' },
]

describe('AccountCodeSelect IME keyboard contract', () => {
  it('IME 조합 중 Enter는 선택하지 않고 조합 종료 후 Enter는 첫 후보를 선택한다', () => {
    const onChange = vi.fn()
    render(
      <AccountCodeSelect
        accounts={accounts}
        value=""
        onChange={onChange}
      />,
    )
    const input = screen.getByRole('combobox', { name: '계정과목' })
    fireEvent.focus(input)

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Enter', isComposing: false })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(accounts[0]!.code)
  })
})
