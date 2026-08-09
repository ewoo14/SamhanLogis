import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from '../Modal/Modal'
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
  it('allows intentional keyboard input after auto-confirmation has settled', async () => {
    function ControlledWarehouse() {
      const [value, setValue] = useState<string | null>(null)
      return (
        <WarehouseAutocomplete
          warehouses={warehouses}
          value={value}
          onChange={(next) => setValue(next)}
          label="출고 창고"
          resultSelectionMode="single"
          autoSelectSingleResult
        />
      )
    }

    render(<ControlledWarehouse />)
    const input = screen.getByRole('combobox', { name: '출고 창고' }) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'H' } })
    await waitFor(() => expect(input.value).toContain('HQ-001'))
    await new Promise((resolve) => window.setTimeout(resolve, 120))
    fireEvent.change(input, { target: { value: `${input.value}Q` } })

    expect(input.value).toContain('Q')
  })

  it('allows paste replacement immediately after auto-confirmation', async () => {
    function ControlledWarehouse() {
      const [value, setValue] = useState<string | null>(null)
      return (
        <WarehouseAutocomplete
          warehouses={warehouses}
          value={value}
          onChange={(next) => setValue(next)}
          label="출고 창고"
          resultSelectionMode="single"
          autoSelectSingleResult
        />
      )
    }

    render(<ControlledWarehouse />)
    const input = screen.getByRole('combobox', { name: '출고 창고' }) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'H' } })
    await waitFor(() => expect(input.value).toContain('HQ-001'))
    fireEvent.change(input, { target: { value: 'HQ-001 · 본사 창고VH' } })

    expect(input.value).toContain('VH')
  })

  it('allows IME composition input immediately after auto-confirmation', async () => {
    function ControlledWarehouse() {
      const [value, setValue] = useState<string | null>(null)
      return (
        <WarehouseAutocomplete
          warehouses={warehouses}
          value={value}
          onChange={(next) => setValue(next)}
          label="출고 창고"
          resultSelectionMode="single"
          autoSelectSingleResult
        />
      )
    }

    render(<ControlledWarehouse />)
    const input = screen.getByRole('combobox', { name: '출고 창고' }) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.compositionStart(input)
    fireEvent.input(input, {
      target: { value: 'H' },
      data: 'H',
      inputType: 'insertCompositionText',
      isComposing: true,
    })
    fireEvent.compositionUpdate(input, { data: 'H' })
    await waitFor(() => expect(input.value).toBe('H'))
    // IME 조합 중에는 자동확정이 selection을 건드리지 않아야 한다.
    expect(input.value).not.toContain('HQ-001')
    fireEvent.compositionEnd(input)
    fireEvent.input(input, {
      target: { value: 'HQ' },
      data: 'Q',
      inputType: 'insertText',
      isComposing: false,
    })

    await waitFor(() => expect(input.value).toContain('HQ-001'))
  })

  it('allows autocomplete replacement immediately after auto-confirmation', async () => {
    function ControlledWarehouse() {
      const [value, setValue] = useState<string | null>(null)
      return (
        <WarehouseAutocomplete
          warehouses={warehouses}
          value={value}
          onChange={(next) => setValue(next)}
          label="출고 창고"
          resultSelectionMode="single"
          autoSelectSingleResult
        />
      )
    }

    render(<ControlledWarehouse />)
    const input = screen.getByRole('combobox', { name: '출고 창고' }) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'H' } })
    await waitFor(() => expect(input.value).toContain('HQ-001'))
    fireEvent.change(input, { target: { value: 'HQ-001 · 본사 창고VH' } })

    expect(input.value).toContain('VH')
  })

  it('preserves backdrop-cancelled draft after the blur timer settles', async () => {
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
    fireEvent.change(input, { target: { value: '창' } })
    fireEvent.mouseDown(screen.getByTestId('ds-modal-backdrop'))
    fireEvent.focus(input)
    input.blur()
    await new Promise((resolve) => window.setTimeout(resolve, 300))

    expect(input.value).toBe('창')
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })

  it('backdrop 취소 뒤 후속 blur가 보존된 draft를 덮어쓰지 않는다', async () => {
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
    fireEvent.focus(input)
    input.blur()
    await new Promise((resolve) => window.setTimeout(resolve, 150))

    expect(input.value).toBe('창고')
  })

  it('backdrop 취소가 예약한 blur에서도 미확정 draft를 보존한다', async () => {
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
    fireEvent.change(input, { target: { value: '창' } })
    fireEvent.mouseDown(screen.getByTestId('ds-modal-backdrop'))
    fireEvent.blur(input)
    await new Promise((resolve) => window.setTimeout(resolve, 150))

    expect(input.value).toBe('창')
  })

  it.each([33, 140])(
    'A2 자동확정 후 %dms 뒤 입력은 suffix를 덮어쓰고 정상 입력을 보존한다 (RED-A/RED-B)',
    async (delay) => {
      const onChange = vi.fn()
      function ControlledWarehouse() {
        const [value, setValue] = useState<string | null>(null)
        return (
          <WarehouseAutocomplete
            warehouses={warehouses}
            value={value}
            onChange={(next, warehouse) => {
              onChange(next, warehouse)
              setValue(next)
            }}
            label="출고 창고"
            resultSelectionMode="single"
            autoSelectSingleResult
          />
        )
      }

      render(<ControlledWarehouse />)
      const input = screen.getByRole('combobox', { name: '출고 창고' }) as HTMLInputElement
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'H' } })
      await waitFor(() => expect(input.value).toBe('HQ-001 · 본사 창고'))
      expect(input.selectionStart).toBe(1)
      expect(input.selectionEnd).toBe(input.value.length)

      await new Promise((resolve) => window.setTimeout(resolve, delay))
      // 실제 브라우저에서는 현재 selection이 이 범위를 덮어쓰며 value가 HQ가 된다.
      fireEvent.change(input, { target: { value: 'HQ' } })

      await waitFor(() => expect(input.value).toBe('HQ-001 · 본사 창고'))
      expect(onChange).toHaveBeenCalledTimes(2)
      expect(input.selectionStart).toBe(2)
      expect(input.selectionEnd).toBe(input.value.length)
    },
  )

  it('dropdown Escape가 상위 keydown 핸들러로 전파되지 않는다', () => {
    function OuterModal() {
      const [open, setOpen] = useState(true)
      return (
        <Modal open={open} onClose={() => setOpen(false)} title="병합전환">
          <WarehouseAutocomplete
            warehouses={warehouses}
            value={null}
            onChange={vi.fn()}
            label="출고 창고"
          />
        </Modal>
      )
    }
    render(
      <OuterModal />,
    )
    const input = screen.getByRole('combobox', { name: '출고 창고' })
    fireEvent.focus(input)
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(screen.getByRole('dialog', { name: '병합전환' })).toBeTruthy()
  })

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

  it('모달 확정 후 포커스가 복원되어도 확정 창고 표시값과 dropdown 상태를 유지한다', async () => {
    function ControlledWarehouse() {
      const [value, setValue] = useState<string | null>(null)
      return (
        <WarehouseAutocomplete
          warehouses={warehouses}
          value={value}
          onChange={(next) => setValue(next)}
          label="출고 창고"
          resultSelectionMode="single"
          autoSelectSingleResult
        />
      )
    }

    render(<ControlledWarehouse />)
    const input = screen.getByRole('combobox', { name: '출고 창고' }) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '창고' } })
    fireEvent.click(screen.getByRole('radio', { name: 'HQ-001' }))
    const confirm = screen.getByRole('button', { name: '선택 확정' })
    confirm.focus()
    fireEvent.keyDown(confirm, { key: 'Enter' })
    fireEvent.click(confirm)

    await waitFor(() => expect(input.value).toBe('HQ-001 · 본사 창고'))
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })

  it('브라우저가 모달 확정 후 input에 포커스를 복원해도 확정 표시값을 덮어쓰지 않는다', async () => {
    function ControlledWarehouse() {
      const [value, setValue] = useState<string | null>(null)
      return (
        <WarehouseAutocomplete
          warehouses={warehouses}
          value={value}
          onChange={(next) => setValue(next)}
          label="출고 창고"
          resultSelectionMode="single"
          autoSelectSingleResult
        />
      )
    }

    render(<ControlledWarehouse />)
    const input = screen.getByRole('combobox', { name: '출고 창고' }) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '창고' } })
    fireEvent.click(screen.getByRole('radio', { name: 'HQ-001' }))
    fireEvent.click(screen.getByRole('button', { name: '선택 확정' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.focus(input)

    await waitFor(() => {
      expect(input.value).toBe('HQ-001 · 본사 창고')
      expect(input.getAttribute('aria-expanded')).toBe('false')
    })
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
