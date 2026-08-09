import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { MultiSelectAutocomplete } from './MultiSelectAutocomplete'

interface Option {
  id: string
  label: string
}

describe('MultiSelectAutocomplete', () => {
  it('inputTestId가 있으면 칩 카운트도 인스턴스별 testid를 사용한다', () => {
    render(
      <MultiSelectAutocomplete<Option, Option>
        selected={[{ id: 'selected', label: '선택 품목' }]}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        search={vi.fn().mockResolvedValue([])}
        getOptionKey={(option) => option.id}
        getSelectedKey={(option) => option.id}
        getInputLabel={(option) => option.label}
        renderOption={(option) => <span>{option.label}</span>}
        listboxLabel="품목 목록"
        ariaLabel="품목"
        inputTestId="row-quantity-sync-input"
      />,
    )

    expect(screen.getByTestId('row-quantity-sync-input-chip-count').textContent).toBe('1개 선택됨')
  })

  it('opt-in contract: one candidate becomes a chip without opening a modal', async () => {
    const onAdd = vi.fn()
    const option: Option = { id: 'U-001', label: '김하나' }

    render(
      <MultiSelectAutocomplete<Option, Option>
        selected={[]}
        onAdd={onAdd}
        onRemove={vi.fn()}
        search={vi.fn().mockResolvedValue([option])}
        getOptionKey={(item) => item.id}
        getSelectedKey={(item) => item.id}
        getInputLabel={(item) => item.label}
        renderOption={(item) => <span>{item.label}</span>}
        listboxLabel="담당자 목록"
        ariaLabel="담당자"
        resultSelectionMode="multiple"
        autoSelectSingleResult
        getChipProps={(item) => ({ label: '사원', value: item.label })}
        debounceMs={0}
      />,
    )

    fireEvent.change(screen.getByRole('combobox', { name: '담당자' }), { target: { value: '김' } })
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(option))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
  it('이미 선택한 key를 검색 결과에서 제외하고 후보 선택을 add delta로 전달한다', async () => {
    const selected: Option = { id: 'u-1', label: '김민수' }
    const next: Option = { id: 'u-2', label: '이서윤' }
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
        getInputLabel={(option) => option.label}
        renderOption={(option) => <span>{option.label}</span>}
        listboxLabel="사원 검색 결과"
        ariaLabel="사원 검색"
        debounceMs={0}
        getChipProps={(item) => ({ label: '사원', value: item.label })}
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
      { id: 'u-1', label: '김민수' },
      { id: 'u-2', label: '이서윤' },
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
          getInputLabel={(option) => option.label}
          renderOption={(option) => <span>{option.label}</span>}
          listboxLabel="사원 검색 결과"
          ariaLabel="사원 검색"
          debounceMs={0}
          getChipProps={(item) => ({ label: '사원', value: item.label })}
        />
      )
    }

    render(<Harness />)
    const input = screen.getByRole('combobox', { name: '사원 검색' })
    // 실제 포커스를 입력에 둔 상태에서 add 가 일어난다(M3 가드: 내부 포커스 시에만 refocus).
    input.focus()

    for (const option of options) {
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: option.label.slice(0, 1) } })
      await screen.findByRole('option', { name: option.label })
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'Enter' })
      await waitFor(() => expect(document.activeElement).toBe(input))
    }

    expect(screen.getAllByText('사원')).toHaveLength(2)
    expect(screen.getByText('김민수')).toBeTruthy()
    expect(screen.getByText('이서윤')).toBeTruthy()
  })

  it('max 도달 시 새 검색은 호출하지 않고 기존 칩 제거는 허용한다', async () => {
    const selected: Option = { id: 'u-1', label: '김민수' }
    const onRemove = vi.fn()
    const search = vi.fn<(query: string) => Promise<Option[]>>().mockResolvedValue([
      { id: 'u-2', label: '이서윤' },
    ])

    render(
      <MultiSelectAutocomplete<Option, Option>
        selected={[selected]}
        onAdd={vi.fn()}
        onRemove={onRemove}
        search={search}
        getOptionKey={(option) => option.id}
        getSelectedKey={(item) => item.id}
        getInputLabel={(option) => option.label}
        renderOption={(option) => <span>{option.label}</span>}
        listboxLabel="사원 검색 결과"
        ariaLabel="사원 검색"
        debounceMs={0}
        max={1}
        getChipProps={(item) => ({ label: '사원', value: item.label, removeLabel: item.label })}
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
    const selected: Option = { id: 'u-1', label: '김민수' }
    const onRemove = vi.fn()

    render(
      <MultiSelectAutocomplete<Option, Option>
        selected={[selected]}
        onAdd={vi.fn()}
        onRemove={onRemove}
        search={async () => []}
        getOptionKey={(option) => option.id}
        getSelectedKey={(item) => item.id}
        getInputLabel={(option) => option.label}
        renderOption={(option) => <span>{option.label}</span>}
        listboxLabel="사원 검색 결과"
        ariaLabel="사원 검색"
        disabled
        getChipProps={(item) => ({ label: '사원', value: item.label, removeLabel: item.label })}
      />,
    )

    const input = screen.getByRole('combobox', { name: '사원 검색' })
    expect((input as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: '김민수 제거' })).toBeNull()
  })

  it('blur 자동선택 add 가 컴포넌트 밖 포커스 상태서 일어나면 입력 포커스를 훔치지 않는다 (M3)', async () => {
    const options: Option[] = [{ id: 'u-1', label: '김민수' }]

    function Harness() {
      const [selected, setSelected] = useState<Option[]>([])
      return (
        <div>
          <MultiSelectAutocomplete<Option, Option>
            selected={selected}
            onAdd={(option) => setSelected((current) => [...current, option])}
            onRemove={(item) => setSelected((current) => current.filter((value) => value.id !== item.id))}
            search={async () => options}
            getOptionKey={(option) => option.id}
            getSelectedKey={(item) => item.id}
            getInputLabel={(option) => option.label}
            renderOption={(option) => <span>{option.label}</span>}
            listboxLabel="사원 검색 결과"
            ariaLabel="사원 검색"
            debounceMs={0}
            getChipProps={(item) => ({ label: '사원', value: item.label })}
          />
          <input data-testid="other-field" aria-label="다른 필드" />
        </div>
      )
    }

    render(<Harness />)
    const input = screen.getByRole('combobox', { name: '사원 검색' })
    const other = screen.getByTestId('other-field')

    input.focus()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '김민수' } })
    await screen.findByRole('option', { name: '김민수' })

    // 사용자가 정확명을 남긴 채 다른 필드로 이동 → AsyncAutocomplete blur 자동선택(120ms) 발동.
    other.focus()
    fireEvent.blur(input)

    // blur 자동선택이 add 를 태우지만, 포커스가 밖(other)이라 refocus 를 건너뛰어야 한다.
    await waitFor(() => expect(screen.getByText('김민수')).toBeTruthy())
    expect(document.activeElement).toBe(other)
  })

  it('선택 개수를 단일 aria-live region 으로 고지한다 (C1)', () => {
    const selected: Option[] = [
      { id: 'u-1', label: '김민수' },
      { id: 'u-2', label: '이서윤' },
    ]

    render(
      <MultiSelectAutocomplete<Option, Option>
        selected={selected}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
        search={async () => []}
        getOptionKey={(option) => option.id}
        getSelectedKey={(item) => item.id}
        getInputLabel={(option) => option.label}
        renderOption={(option) => <span>{option.label}</span>}
        listboxLabel="사원 검색 결과"
        ariaLabel="사원 검색"
        getChipProps={(item) => ({ label: '사원', value: item.label })}
      />,
    )

    const region = screen.getByTestId('multiselect-chip-count')
    expect(region.getAttribute('aria-live')).toBe('polite')
    expect(region.textContent).toContain('2개 선택됨')
  })
})
