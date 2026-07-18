import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MultiSelectAutocomplete } from './MultiSelectAutocomplete'

interface Option {
  id: string
  name: string
}

describe('MultiSelectAutocomplete', () => {
  it('이미 선택한 key를 검색 결과에서 제외하고 후보 선택을 add delta로 전달한다', async () => {
    const selected: Option = { id: 'u-1', name: '김민수' }
    const next: Option = { id: 'u-2', name: '이서윤' }
    const onAdd = vi.fn()
    const search = vi.fn<(query: string) => Promise<Option[]>>().mockResolvedValue([selected, next])

    render(
      <MultiSelectAutocomplete<Option, Option>
        selected={[selected]}
        onAdd={onAdd}
        onRemove={vi.fn()}
        search={search}
        getOptionKey={(option) => option.id}
        getSelectedKey={(item) => item.id}
        getInputLabel={(option) => option.name}
        renderOption={(option) => <span>{option.name}</span>}
        listboxLabel="사원 검색 결과"
        ariaLabel="사원 검색"
        debounceMs={0}
        getChipProps={(item) => ({ label: '사원', value: item.name })}
      />,
    )

    const input = screen.getByRole('combobox', { name: '사원 검색' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '서' } })

    await waitFor(() => expect(search).toHaveBeenCalledWith('서'))
    expect(screen.queryByRole('option', { name: '김민수' })).toBeNull()
    expect(screen.getByRole('option', { name: '이서윤' })).toBeTruthy()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onAdd).toHaveBeenCalledWith(next)
  })

  it('두 후보를 연속으로 추가하고 각 선택 뒤 입력에 포커스를 돌려준다', async () => {
    const options: Option[] = [
      { id: 'u-1', name: '김민수' },
      { id: 'u-2', name: '이서윤' },
    ]
    function Harness() {
      const [selected, setSelected] = useState<Option[]>([])
      return (
        <MultiSelectAutocomplete<Option, Option>
          selected={selected}
          onAdd={(option) => setSelected((current) => [...current, option])}
          onRemove={(item) => setSelected((current) => current.filter((value) => value.id !== item.id))}
          search={async () => options}
          getOptionKey={(option) => option.id}
          getSelectedKey={(item) => item.id}
          getInputLabel={(option) => option.name}
          renderOption={(option) => <span>{option.name}</span>}
          listboxLabel="사원 검색 결과"
          ariaLabel="사원 검색"
          debounceMs={0}
          getChipProps={(item) => ({ label: '사원', value: item.name })}
        />
      )
    }

    render(<Harness />)
    const input = screen.getByRole('combobox', { name: '사원 검색' })

    for (const option of options) {
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: option.name.slice(0, 1) } })
      await screen.findByRole('option', { name: option.name })
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'Enter' })
      await waitFor(() => expect(document.activeElement).toBe(input))
    }

    expect(screen.getAllByText('사원')).toHaveLength(2)
    expect(screen.getByText('김민수')).toBeTruthy()
    expect(screen.getByText('이서윤')).toBeTruthy()
  })

  it('max 도달 시 새 검색은 호출하지 않고 기존 칩 제거는 허용한다', async () => {
    const selected: Option = { id: 'u-1', name: '김민수' }
    const onRemove = vi.fn()
    const search = vi.fn<(query: string) => Promise<Option[]>>().mockResolvedValue([
      { id: 'u-2', name: '이서윤' },
    ])

    render(
      <MultiSelectAutocomplete<Option, Option>
        selected={[selected]}
        onAdd={vi.fn()}
        onRemove={onRemove}
        search={search}
        getOptionKey={(option) => option.id}
        getSelectedKey={(item) => item.id}
        getInputLabel={(option) => option.name}
        renderOption={(option) => <span>{option.name}</span>}
        listboxLabel="사원 검색 결과"
        ariaLabel="사원 검색"
        debounceMs={0}
        max={1}
        getChipProps={(item) => ({ label: '사원', value: item.name, removeLabel: item.name })}
      />,
    )

    const input = screen.getByRole('combobox', { name: '사원 검색' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '이' } })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(search).not.toHaveBeenCalled()
    expect(screen.getByText('김민수')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '김민수 제거' }))
    expect(onRemove).toHaveBeenCalledWith(selected)
    expect(document.activeElement).toBe(input)
  })

  it('disabled 시 입력과 칩 제거를 함께 비활성화한다', () => {
    const selected: Option = { id: 'u-1', name: '김민수' }
    const onRemove = vi.fn()

    render(
      <MultiSelectAutocomplete<Option, Option>
        selected={[selected]}
        onAdd={vi.fn()}
        onRemove={onRemove}
        search={async () => []}
        getOptionKey={(option) => option.id}
        getSelectedKey={(item) => item.id}
        getInputLabel={(option) => option.name}
        renderOption={(option) => <span>{option.name}</span>}
        listboxLabel="사원 검색 결과"
        ariaLabel="사원 검색"
        disabled
        getChipProps={(item) => ({ label: '사원', value: item.name, removeLabel: item.name })}
      />,
    )

    const input = screen.getByRole('combobox', { name: '사원 검색' })
    expect((input as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: '김민수 제거' })).toBeNull()
  })
})
