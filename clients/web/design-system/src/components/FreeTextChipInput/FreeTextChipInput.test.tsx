import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { FreeTextChipInput } from './FreeTextChipInput'

function Harness({ initial = [] as string[], maxLength }: { initial?: string[]; maxLength?: number }) {
  const [value, setValue] = useState(initial)
  return (
    <FreeTextChipInput
      value={value}
      onChange={setValue}
      ariaLabel="선택 옵션"
      inputTestId="free-text-input"
      maxLength={maxLength}
    />
  )
}

describe('FreeTextChipInput', () => {
  it('Enter와 쉼표 paste를 trim·분해하고 대소문자 무시 dedup을 첫 순서로 보존한다', () => {
    render(<Harness initial={['Alpha']} />)
    const input = screen.getByTestId('free-text-input')

    fireEvent.change(input, { target: { value: ' alpha, Beta, BETA,  ' } })

    expect(screen.getByText('Alpha')).toBeTruthy()
    expect(screen.getByText('Beta')).toBeTruthy()
    expect(screen.getAllByText('Alpha')).toHaveLength(1)
    expect(screen.getAllByText('Beta')).toHaveLength(1)

    fireEvent.change(input, { target: { value: 'Gamma' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: false })
    expect(screen.getByText('Gamma')).toBeTruthy()
  })

  it('IME 조합 중 Enter는 확정하지 않고 조합 종료 후 Enter에서만 칩을 만든다', () => {
    render(<Harness />)
    const input = screen.getByTestId('free-text-input')

    fireEvent.change(input, { target: { value: '한글' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(screen.queryByText('한글')).toBeNull()

    fireEvent.keyDown(input, { key: 'Enter', isComposing: false })
    expect(screen.getByText('한글')).toBeTruthy()
  })

  it('공백 입력은 확정하지 않고 기존 칩은 제거할 수 있다', () => {
    render(<Harness initial={['기존값']} />)
    const input = screen.getByTestId('free-text-input')

    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: false })
    expect(screen.getByText('기존값')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '기존값 제거' }))
    expect(screen.queryByText('기존값')).toBeNull()
  })

  it('빈값 확정은 onChange를 호출하지 않는다', () => {
    const onChange = vi.fn()
    render(
      <FreeTextChipInput
        value={[]}
        onChange={onChange}
        ariaLabel="선택 옵션"
        inputTestId="free-text-input"
      />,
    )
    const input = screen.getByTestId('free-text-input')
    fireEvent.keyDown(input, { key: 'Enter', isComposing: false })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('쉼표 clipboard paste의 모든 토큰을 확정하고 maxLength를 각 칩에 적용한다', () => {
    render(<Harness maxLength={4} />)
    const input = screen.getByTestId('free-text-input')

    fireEvent.paste(input, {
      clipboardData: { getData: () => '첫번째옵션, 둘째, 둘째' },
    })

    expect(screen.getByText('첫번째옵')).toBeTruthy()
    expect(screen.getByText('둘째')).toBeTruthy()
    expect(screen.getAllByText('둘째')).toHaveLength(1)
    expect((input as HTMLInputElement).maxLength).toBe(4)
  })

  it('disabled 시 free-text 확정과 칩 제거를 차단한다', () => {
    const onChange = () => undefined
    render(
      <FreeTextChipInput
        value={['기존값']}
        onChange={onChange}
        disabled
        ariaLabel="선택 옵션"
        inputTestId="free-text-input"
      />,
    )
    const input = screen.getByTestId('free-text-input')
    fireEvent.change(input, { target: { value: '새값' } })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: false })
    expect(screen.queryByText('새값')).toBeNull()
    expect(screen.queryByRole('button', { name: '기존값 제거' })).toBeNull()
  })
})
