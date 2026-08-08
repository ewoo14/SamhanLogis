import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { WarehouseAutocomplete, type Warehouse } from './WarehouseAutocomplete'

const warehouses: Warehouse[] = [
  {
    id: 'warehouse-uuid-1',
    name: '본사 창고',
    code: 'HQ-001',
    type: 'HEADQUARTERS',
    active: true,
  },
  {
    id: 'warehouse-uuid-2',
    name: '차량 창고',
    code: 'VH-001',
    type: 'VEHICLE',
    active: true,
  },
]

function renderWarehouse(onChange = vi.fn()) {
  render(
    <WarehouseAutocomplete
      warehouses={warehouses}
      value={null}
      onChange={onChange}
      label="출고 창고"
    />,
  )
  const input = screen.getByRole('combobox', { name: '출고 창고' })
  fireEvent.focus(input)
  return { input, onChange }
}

describe('WarehouseAutocomplete opaque option DOM contract', () => {
  it('opt-in contract: two candidates open the shared modal and cancel leaves selection unchanged', () => {
    const onChange = vi.fn()
    render(
      <WarehouseAutocomplete
        warehouses={warehouses}
        value={null}
        onChange={onChange}
        label="출고 창고"
        resultSelectionMode="single"
        autoSelectSingleResult
      />,
    )
    const input = screen.getByRole('combobox', { name: '출고 창고' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '창고' } })

    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('검색 모달 취소 뒤 원래 입력 draft를 보존해 이어서 좁힐 수 있다', () => {
    render(
      <WarehouseAutocomplete
        warehouses={warehouses}
        value={null}
        onChange={vi.fn()}
        label="출고 창고"
        resultSelectionMode="single"
        autoSelectSingleResult
      />,
    )
    const input = screen.getByRole('combobox', { name: '출고 창고' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '창고' } })
    fireEvent.click(screen.getByRole('button', { name: '취소' }))

    expect((input as HTMLInputElement).value).toBe('창고')
  })

  it('검색 모달에서 선택 확정하면 입력값을 선택값으로 교체한다', () => {
    const onChange = vi.fn()
    function ControlledWarehouse() {
      const [value, setValue] = useState<string | null>(null)
      return (
        <WarehouseAutocomplete
          warehouses={warehouses}
          value={value}
          onChange={(next, warehouse) => {
            setValue(next)
            onChange(next, warehouse)
          }}
          label="출고 창고"
          resultSelectionMode="single"
          autoSelectSingleResult
        />
      )
    }
    render(
      <ControlledWarehouse />,
    )
    const input = screen.getByRole('combobox', { name: '출고 창고' }) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '창고' } })
    fireEvent.click(screen.getByRole('radio', { name: 'HQ-001' }))
    fireEvent.click(screen.getByRole('button', { name: '선택 확정' }))

    expect(onChange).toHaveBeenCalledWith(warehouses[0]!.id, warehouses[0])
    expect(input.value).toBe('HQ-001 · 본사 창고')
  })

  it('검색 모달 바깥 클릭은 취소와 같이 draft를 보존한다', () => {
    render(
      <WarehouseAutocomplete
        warehouses={warehouses}
        value={null}
        onChange={vi.fn()}
        label="출고 창고"
        resultSelectionMode="single"
        autoSelectSingleResult
      />,
    )
    const input = screen.getByRole('combobox', { name: '출고 창고' }) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '창고' } })
    fireEvent.mouseDown(screen.getByTestId('ds-modal-backdrop'))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(input.value).toBe('창고')
  })

  it('option id와 combobox IDREF는 opaque index ID이고 도메인 id/code를 노출하지 않는다', () => {
    const { input } = renderWarehouse()
    const listbox = screen.getByRole('listbox', { name: '창고 목록' })
    const options = screen.getAllByRole('option')

    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(input.getAttribute('aria-controls')).toBe(listbox.id)
    expect(options.map((option) => option.id)).toEqual([
      `${listbox.id}-opt-0`,
      `${listbox.id}-opt-1`,
    ])
    for (const option of options) {
      expect(option.id).not.toContain('warehouse-uuid')
      expect(option.id).not.toContain('HQ-001')
      expect(option.id).not.toContain('VH-001')
    }
    expect(input.getAttribute('aria-activedescendant')).toBeNull()
  })

  it('ArrowDown은 실존 opaque option을 active descendant로 가리킨다', () => {
    const { input } = renderWarehouse()
    fireEvent.keyDown(input, { key: 'ArrowDown' })

    const activeId = input.getAttribute('aria-activedescendant')
    expect(activeId).toBeTruthy()
    expect(document.getElementById(activeId!)?.getAttribute('role')).toBe('option')
    expect(activeId).toMatch(/-opt-0$/)
  })

  it('IME 조합 중 Arrow/Enter는 후보 상태와 선택을 바꾸지 않고 조합 종료 후 Enter는 선택한다', () => {
    const onChange = vi.fn()
    const { input } = renderWarehouse(onChange)

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const activeBeforeComposition = input.getAttribute('aria-activedescendant')

    fireEvent.keyDown(input, { key: 'ArrowUp', isComposing: true })
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })

    expect(input.getAttribute('aria-activedescendant')).toBe(activeBeforeComposition)
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Enter', isComposing: false })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(warehouses[1]!.id, warehouses[1])
  })

  it('Enter와 mouse 선택은 domain id와 object를 그대로 onChange에 전달한다', () => {
    const onChange = vi.fn()
    const { input } = renderWarehouse(onChange)

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith(warehouses[0]!.id, warehouses[0])

    fireEvent.focus(input)
    const secondOption = screen.getAllByRole('option').find((option) => option.textContent?.includes('VH-001'))
    fireEvent.mouseDown(secondOption!)
    expect(onChange).toHaveBeenLastCalledWith(warehouses[1]!.id, warehouses[1])
  })

  it('후보 0건이면 expanded/controls/active/listbox 없이 status만 표시한다', () => {
    const { input } = renderWarehouse()
    fireEvent.change(input, { target: { value: '없는 창고' } })

    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.getAttribute('aria-controls')).toBeNull()
    expect(input.getAttribute('aria-activedescendant')).toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('일치하는 창고가 없습니다.')
  })

  it('후보 0건에서도 Escape는 검색 상태를 닫고 선택값 표시를 복원한다', () => {
    const { input } = renderWarehouse()
    fireEvent.change(input, { target: { value: '없는 창고' } })

    fireEvent.keyDown(input, { key: 'Escape' })

    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('status')).toBeNull()
  })
})
