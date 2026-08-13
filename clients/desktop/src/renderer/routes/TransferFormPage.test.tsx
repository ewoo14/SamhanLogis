// @vitest-environment jsdom
import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createTransfer: vi.fn(),
  listWarehouses: vi.fn(),
  lookupProductByModelName: vi.fn(),
}))

vi.mock('@samhan/design-system', () => ({
  Button: ({ children, loading: _loading, variant: _variant, ...props }: any) => (
    <button type="button" {...props}>{children}</button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  FormField: ({ label, render, error }: any) => (
    <div>
      <label>{label}</label>
      {render({ id: `field-${String(label)}` })}
      {error ? <span role="alert">{error}</span> : null}
    </div>
  ),
  WarehouseAutocomplete: ({ label, warehouses, value, onChange }: any) => (
    <label>
      {label}
      <select aria-label={label} value={value ?? ''} onChange={(event) => onChange(event.target.value)}>
        <option value="" />
        {warehouses.map((warehouse: any) => (
          <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
        ))}
      </select>
    </label>
  ),
}))

vi.mock('../api/inventory', () => ({
  createTransfer: mocks.createTransfer,
  listWarehouses: mocks.listWarehouses,
  TRANSFER_REASON_LABEL: {
    REBALANCE: '재배치',
    URGENT: '긴급',
    CONSOLIDATE: '통합',
    MAINTENANCE: '정비',
    SAMSUNG_DIRECT: '직송',
    OTHER: '기타',
  },
}))

vi.mock('../api/slip', () => ({
  lookupProductByModelName: mocks.lookupProductByModelName,
}))

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}))

import { TransferFormPage } from './TransferFormPage'

describe('TransferFormPage', () => {
  beforeEach(() => {
    mocks.createTransfer.mockReset()
    mocks.listWarehouses.mockResolvedValue([
      { id: 'warehouse-1', code: 'WH-1', name: '출발 창고' },
      { id: 'warehouse-2', code: 'WH-2', name: '도착 창고' },
    ])
    mocks.lookupProductByModelName.mockResolvedValue({
      productId: 'product-1',
      productName: '품목 1',
    })
    mocks.createTransfer.mockResolvedValue({ id: 'transfer-1' })
  })

  it('invalidates the transfer query family after a successful save', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    queryClient.setQueryData(['transfers', 'list'], { content: [] })
    const invalidateQueries = vi.spyOn(queryClient, 'invalidateQueries')

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <TransferFormPage />
        </MemoryRouter>
      </QueryClientProvider>,
    )

    await waitFor(() => expect(screen.getAllByRole('option', { name: '출발 창고' })).toHaveLength(2))
    const sourceWarehouse = screen.getByRole('combobox', { name: '출발 창고' }) as HTMLSelectElement
    const destinationWarehouse = screen.getByRole('combobox', { name: '도착 창고' }) as HTMLSelectElement
    fireEvent.change(sourceWarehouse, { target: { value: 'warehouse-1' } })
    await waitFor(() => expect((screen.getByRole('combobox', { name: '출발 창고' }) as HTMLSelectElement).value).toBe('warehouse-1'))
    fireEvent.change(destinationWarehouse, { target: { value: 'warehouse-2' } })
    await waitFor(() => expect((screen.getByRole('combobox', { name: '도착 창고' }) as HTMLSelectElement).value).toBe('warehouse-2'))

    const modelInput = screen.getByPlaceholderText('예: AJ040RXH4BC1')
    fireEvent.change(modelInput, { target: { value: 'MODEL-1' } })
    fireEvent.blur(modelInput)
    await waitFor(() => expect(mocks.lookupProductByModelName).toHaveBeenCalledWith('MODEL-1'))

    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(mocks.createTransfer).toHaveBeenCalledTimes(1))

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['transfers'] })
  })
})
