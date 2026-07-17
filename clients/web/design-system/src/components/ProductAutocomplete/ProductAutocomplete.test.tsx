import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProductAutocomplete, type ProductOption } from './ProductAutocomplete'

describe('ProductAutocomplete', () => {
  it('기존 1-인자 renderer 계약으로 품목 후보를 정상 표시한다', async () => {
    const product: ProductOption = {
      id: 'product-internal-id',
      modelName: 'AJ040RXH4BC1',
      productName: '시스템에어컨 4Way 4HP',
    }
    const searchProducts = vi.fn<(query: string) => Promise<ProductOption[]>>()
      .mockResolvedValue([product])

    render(
      <ProductAutocomplete
        value={null}
        onChange={vi.fn()}
        searchProducts={searchProducts}
        ariaLabel="품목"
        debounceMs={0}
      />,
    )

    const input = screen.getByRole('combobox', { name: '품목' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'AJ040' } })

    expect(await screen.findByRole('option', {
      name: 'AJ040RXH4BC1 · 시스템에어컨 4Way 4HP',
    })).toBeTruthy()
  })
})
