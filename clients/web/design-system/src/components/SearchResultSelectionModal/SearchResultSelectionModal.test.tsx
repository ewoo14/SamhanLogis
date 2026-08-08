import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from '../Modal'
import { SearchResultSelectionModal } from './SearchResultSelectionModal'

type Option = { id: string; modelCode: string; name: string }

const options: Option[] = [
  { id: 'uuid-a', modelCode: 'MODEL-A', name: '동명 품목' },
  { id: 'uuid-b', modelCode: 'MODEL-B', name: '동명 품목' },
]

describe('SearchResultSelectionModal', () => {
  it('중첩 모달에서 Escape 한 번은 가장 안쪽 모달 하나만 닫는다', () => {
    function NestedModals() {
      const [outerOpen, setOuterOpen] = useState(true)
      const [innerOpen, setInnerOpen] = useState(true)
      return (
        <>
          <Modal open={outerOpen} onClose={() => setOuterOpen(false)} title="바깥 모달">
            <Modal open={innerOpen} onClose={() => setInnerOpen(false)} title="안쪽 모달">
              <button type="button">안쪽 내용</button>
            </Modal>
          </Modal>
          <output data-testid="outer-state">{String(outerOpen)}</output>
          <output data-testid="inner-state">{String(innerOpen)}</output>
        </>
      )
    }

    render(<NestedModals />)
    const innerContent = screen.getByRole('button', { name: '안쪽 내용' })
    innerContent.focus()
    fireEvent.keyDown(innerContent, { key: 'Escape' })

    expect(screen.getByTestId('inner-state').textContent).toBe('false')
    expect(screen.getByTestId('outer-state').textContent).toBe('true')

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByTestId('outer-state').textContent).toBe('false')
  })

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

  it('단수 모드에서 모달 검색어로 후보를 좁힌 뒤 선택하고 확정한다', () => {
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

    fireEvent.change(screen.getByRole('searchbox', { name: '검색 결과 필터' }), {
      target: { value: 'MODEL-B' },
    })

    expect(screen.getByRole('radio', { name: 'MODEL-B' })).not.toBeNull()
    expect(screen.queryByRole('radio', { name: 'MODEL-A' })).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: 'MODEL-B' }))
    fireEvent.click(screen.getByRole('button', { name: '선택 확정' }))

    expect(onConfirm).toHaveBeenCalledWith([options[1]])
  })

  it('복수 모드에서 모달 검색어로 후보를 좁힌 뒤 선택하고 확정한다', () => {
    const onConfirm = vi.fn()
    render(
      <SearchResultSelectionModal
        open
        mode="multiple"
        title="품목 검색 결과"
        options={options}
        getKey={(item) => item.id}
        getLabel={(item) => item.modelCode}
        renderOption={(item) => <span>{item.modelCode}</span>}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByRole('searchbox', { name: '검색 결과 필터' }), {
      target: { value: 'model-a' },
    })
    fireEvent.click(screen.getByRole('checkbox', { name: 'MODEL-A' }))
    fireEvent.click(screen.getByRole('button', { name: '선택 확정' }))

    expect(onConfirm).toHaveBeenCalledWith([options[0]])
  })

  it('복수 모드에서 검색 결과가 없으면 안내하고 확정할 수 없다', async () => {
    const onConfirm = vi.fn()
    render(
      <SearchResultSelectionModal
        open
        mode="multiple"
        title="품목 검색 결과"
        options={options}
        getKey={(item) => item.id}
        getLabel={(item) => item.modelCode}
        renderOption={(item) => <span>{item.modelCode}</span>}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    const searchbox = screen.getByRole('searchbox', { name: '검색 결과 필터' })
    await waitFor(() => expect(document.activeElement).toBe(searchbox))
    fireEvent.change(searchbox, { target: { value: '없는 품목' } })

    expect(screen.getByText('검색 결과가 없습니다.')).not.toBeNull()
    expect(screen.getByRole('button', { name: '선택 확정' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('검색은 renderOption 텍스트가 아닌 getLabel만 사용한다', () => {
    const labelOptions = [
      { id: 'uuid-a', modelCode: 'MODEL-A', name: '거래처 알파' },
      { id: 'uuid-b', modelCode: 'MODEL-B', name: '거래처 베타' },
    ]
    render(
      <SearchResultSelectionModal
        open
        mode="single"
        title="품목 검색 결과"
        options={labelOptions}
        getKey={(item) => item.id}
        getLabel={(item) => item.modelCode}
        renderOption={(item) => <span>{item.modelCode} · {item.name}</span>}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByRole('searchbox', { name: '검색 결과 필터' }), {
      target: { value: '알파' },
    })

    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.getByText('검색 결과가 없습니다.')).not.toBeNull()
  })

  it('표형 후보도 검색하고 0건 안내를 표시한다', () => {
    const onConfirm = vi.fn()
    render(
      <SearchResultSelectionModal
        open
        mode="single"
        title="창고 검색 결과"
        options={options}
        getKey={(item) => item.id}
        getLabel={(item) => item.modelCode}
        renderOption={(item) => <span>{item.modelCode}</span>}
        columns={[{ key: 'model', label: '모델', render: (item) => item.modelCode }]}
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    const searchbox = screen.getByRole('searchbox', { name: '검색 결과 필터' })
    fireEvent.change(searchbox, { target: { value: 'MODEL-B' } })
    expect(screen.getByRole('radio', { name: 'MODEL-B' })).not.toBeNull()
    expect(screen.queryByRole('radio', { name: 'MODEL-A' })).toBeNull()

    fireEvent.change(searchbox, { target: { value: '없는 창고' } })
    expect(screen.getByText('검색 결과가 없습니다.')).not.toBeNull()
    expect(screen.getByRole('button', { name: '선택 확정' }).hasAttribute('disabled')).toBe(true)
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('다시 열면 검색어를 비우고 검색 입력에 포커스한다', async () => {
    const { rerender } = render(
      <SearchResultSelectionModal
        open
        mode="single"
        title="품목 검색 결과"
        options={options}
        getKey={(item) => item.id}
        getLabel={(item) => item.modelCode}
        renderOption={(item) => <span>{item.modelCode}</span>}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    const searchbox = screen.getByRole('searchbox', { name: '검색 결과 필터' })
    fireEvent.change(searchbox, { target: { value: 'MODEL-B' } })
    rerender(
      <SearchResultSelectionModal
        open={false}
        mode="single"
        title="품목 검색 결과"
        options={options}
        getKey={(item) => item.id}
        getLabel={(item) => item.modelCode}
        renderOption={(item) => <span>{item.modelCode}</span>}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    rerender(
      <SearchResultSelectionModal
        open
        mode="single"
        title="품목 검색 결과"
        options={options}
        getKey={(item) => item.id}
        getLabel={(item) => item.modelCode}
        renderOption={(item) => <span>{item.modelCode}</span>}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const reopenedSearchbox = screen.getByRole('searchbox', { name: '검색 결과 필터' })
    expect((reopenedSearchbox as HTMLInputElement).value).toBe('')
    await waitFor(() => expect(document.activeElement).toBe(reopenedSearchbox))
  })
})
