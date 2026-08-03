import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProductAutocomplete, ProductMultiSelectAutocomplete, type ProductOption } from './ProductAutocomplete'

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

  it('복수 모드에서 결과 1건은 모달 없이 칩으로 바로 확정한다', async () => {
    const product: ProductOption = { id: 'uuid-a', modelCode: 'MODEL-A', modelName: 'MODEL-A', productName: '동명 품목' }
    const selected: ProductOption[] = []
    const onAdd = vi.fn((item: ProductOption) => selected.push(item))
    const searchProducts = vi.fn().mockResolvedValue([product])

    render(
      <ProductMultiSelectAutocomplete
        selected={selected}
        onAdd={onAdd}
        onRemove={vi.fn()}
        searchProducts={searchProducts}
        ariaLabel="품목"
        debounceMs={0}
      />,
    )

    const input = screen.getByRole('combobox', { name: '품목' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'MODEL-A' } })

    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(product))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('option', { name: /검색 중/ })).toBeNull()
  })

  it('복수 모드에서 결과 2건 이상은 UUID 없이 모달에서 복수 확정한다', async () => {
    const products: ProductOption[] = [
      { id: 'uuid-a', modelCode: 'MODEL-A', modelName: 'MODEL-A', productName: '동명 품목' },
      { id: 'uuid-b', modelCode: 'MODEL-B', modelName: 'MODEL-B', productName: '동명 품목' },
    ]
    const selected: ProductOption[] = []
    const onAdd = vi.fn((item: ProductOption) => selected.push(item))
    const searchProducts = vi.fn().mockResolvedValue(products)

    render(
      <ProductMultiSelectAutocomplete
        selected={selected}
        onAdd={onAdd}
        onRemove={vi.fn()}
        searchProducts={searchProducts}
        ariaLabel="품목"
        debounceMs={0}
      />,
    )

    const input = screen.getByRole('combobox', { name: '품목' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '동명' } })

    await waitFor(() => expect(screen.getByRole('dialog', { name: '품목 검색 결과' })).toBeTruthy())
    expect(document.body.textContent).not.toContain('uuid-a')
    expect(document.body.textContent).not.toContain('uuid-b')
    fireEvent.click(screen.getByRole('checkbox', { name: 'MODEL-A' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'MODEL-B' }))
    fireEvent.click(screen.getByRole('button', { name: '선택 확정' }))

    await waitFor(() => expect(onAdd).toHaveBeenCalledTimes(2))
  })
})
