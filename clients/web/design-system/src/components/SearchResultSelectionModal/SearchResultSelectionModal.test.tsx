import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SearchResultSelectionModal } from './SearchResultSelectionModal'

type Option = { id: string; modelCode: string; name: string }

const options: Option[] = [
  { id: 'uuid-a', modelCode: 'MODEL-A', name: '동명 품목' },
  { id: 'uuid-b', modelCode: 'MODEL-B', name: '동명 품목' },
]

describe('SearchResultSelectionModal', () => {
  it('단수 모드에서는 한 후보만 확정한다', () => {
    const onConfirm = vi.fn()
    render(
      <SearchResultSelectionModal
        open
        mode="single"
        title="품목 검색 결과"
        options={options}
        getKey={(item) => item.id}
        getLabel={(item) => item.modelCode}
        renderOption={(item) => <span>{item.modelCode}</span>}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('radio', { name: 'MODEL-B' }))
    fireEvent.click(screen.getByRole('button', { name: '선택 확정' }))
    expect(onConfirm).toHaveBeenCalledWith([options[1]])
  })

  it('복수 모드에서 키보드로 후보를 선택하고 확정한다', () => {
    const onConfirm = vi.fn()
    render(
      <SearchResultSelectionModal
        open
        mode="multiple"
        title="품목 검색 결과"
        options={options}
        getKey={(item) => item.id}
        getLabel={(item) => item.modelCode}
        renderOption={(item) => <span>{item.modelCode} · {item.name}</span>}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    const first = screen.getByRole('checkbox', { name: /MODEL-A/ })
    first.focus()
    fireEvent.click(first)
    const confirm = screen.getByRole('button', { name: '선택 확정' })
    confirm.focus()
    fireEvent.keyDown(confirm, { key: 'Enter' })
    fireEvent.click(confirm)

    expect(onConfirm).toHaveBeenCalledWith([options[0]])
    expect(screen.queryByText('uuid-a')).toBeNull()
  })
})
