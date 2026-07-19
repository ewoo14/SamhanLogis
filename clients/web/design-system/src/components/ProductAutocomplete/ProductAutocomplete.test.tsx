import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

    await waitFor(() => expect(document.querySelectorAll('li[id*="-opt-"]').length).toBe(1))
    const optionText = document.querySelector('li[id*="-opt-"]')?.textContent
    expect(optionText).toContain('AJ040RXH4BC1')
    expect(optionText).toContain('시스템에어컨 4Way 4HP')
  })

  it('검색어가 모델명에 매치되면 모델명만 강조하고 모델명 배지를 표시한다', async () => {
    const product: ProductOption = {
      id: 'product-internal-id',
      modelName: 'AJ040RXH4BC1',
      productName: '시스템에어컨 4Way 4HP',
      modelCode: 'MODEL-CODE-ONLY',
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

    await waitFor(() => expect(document.querySelectorAll('li[id*="-opt-"]').length).toBe(1))
    const option = document.querySelector('li[id*="-opt-"]')!
    expect(option.querySelectorAll('mark').length).toBe(1)
    expect(option.querySelector('mark')?.textContent).toBe('AJ040')
    expect(option.textContent).toContain('모델명')
    expect(option.textContent).not.toContain('MODEL-CODE-ONLY')
    const badge = option.querySelector('[class*="matchBadge"]')
    expect(badge?.parentElement?.className).toContain('highlightedField')
    expect(badge?.previousElementSibling?.className).toContain('highlightedText')
    expect(badge?.parentElement?.children).toHaveLength(2)
  })

  it('검색어가 품목명에 매치되면 품목명만 강조하고 모델코드는 강조하지 않는다', async () => {
    const product: ProductOption = {
      id: 'product-internal-id',
      modelName: 'AJ040RXH4BC1',
      productName: '시스템에어컨 4Way 4HP',
      modelCode: 'MODEL-CODE-ONLY',
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
    fireEvent.change(input, { target: { value: '에어컨' } })

    await waitFor(() => expect(document.querySelectorAll('li[id*="-opt-"]').length).toBe(1))
    const option = document.querySelector('li[id*="-opt-"]')!
    expect(option.querySelectorAll('mark').length).toBe(1)
    expect(option.querySelector('mark')?.textContent).toBe('에어컨')
    expect(option.textContent).toContain('품목명')
    expect(option.querySelector('mark')?.textContent).not.toBe('MODEL-CODE-ONLY')
  })
})
