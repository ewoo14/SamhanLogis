import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AsyncAutocomplete } from './AsyncAutocomplete'

interface Option {
  id: string
  label: string
}

describe('AsyncAutocomplete', () => {
  it('dropdown listbox 를 body portal 로 렌더해 overflow 컨테이너 클리핑을 피한다', async () => {
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([
      { id: 'p-1', label: '삼한테스트상사' },
    ])

    const view = render(
      <div style={{ height: 48, overflow: 'auto' }}>
        <AsyncAutocomplete<Option>
          value={null}
          onChange={vi.fn()}
          search={search}
          getKey={(item) => item.id}
          getInputLabel={(item) => item.label}
          renderOption={(item) => <span>{item.label}</span>}
          listboxLabel="거래처 목록"
          ariaLabel="거래처"
          debounceMs={0}
        />
      </div>,
    )

    fireEvent.focus(screen.getByRole('combobox', { name: '거래처' }))
    fireEvent.change(screen.getByRole('combobox', { name: '거래처' }), {
      target: { value: '삼한' },
    })

    await screen.findByRole('listbox', { name: '거래처 목록' })

    await waitFor(() => expect(search).toHaveBeenCalledWith('삼한'))
    expect(Array.from(document.body.children).some((child) => (
      child.getAttribute('role') === 'listbox'
      && child.getAttribute('aria-label') === '거래처 목록'
    ))).toBe(true)
    expect(view.container.querySelector('[role="listbox"]')).toBeNull()
  })
})
