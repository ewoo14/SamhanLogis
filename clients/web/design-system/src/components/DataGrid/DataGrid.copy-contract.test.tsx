import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DataGrid, type DataGridColumn } from './DataGrid'

interface StockRow {
  warehouseType: 'VIRTUAL' | 'HEADQUARTERS'
  availableQty: number
}

const rows: StockRow[] = [
  { warehouseType: 'VIRTUAL', availableQty: 0 },
  { warehouseType: 'HEADQUARTERS', availableQty: 1234 },
]

function copyGrid(columns: DataGridColumn<StockRow>[], rowIndex = 0) {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  const view = render(
    <DataGrid
      columns={columns}
      rows={rows}
      rowKey={(row) => row.warehouseType}
    />,
  )
  const cell = view.getByTestId('data-grid').querySelector(`[data-row="${rowIndex}"][data-col="0"]`)
  if (!cell) throw new Error('선택할 DataGrid 셀을 찾지 못했습니다.')
  fireEvent.click(cell)
  fireEvent.keyDown(document, { key: 'c', ctrlKey: true })
  return { writeText }
}

describe('DataGrid copy display contract', () => {
  it('RED-A: VIRTUAL 행 복사는 화면 표시값 — 를 사용한다', async () => {
    const columns: DataGridColumn<StockRow>[] = [
      {
        key: 'availableQty',
        label: '가용재고',
        render: (row: StockRow) => row.warehouseType === 'VIRTUAL' ? '—' : '1,234',
        copyValue: (row: StockRow) => row.warehouseType === 'VIRTUAL' ? '—' : '1,234',
      },
    ]

    const { writeText } = copyGrid(columns)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('—'))
  })

  it('RED-B: VIRTUAL 이 아닌 행의 복사 결과는 기존 원시 숫자값을 유지한다', async () => {
    const columns: DataGridColumn<StockRow>[] = [
      {
        key: 'availableQty',
        label: '가용재고',
        copyValue: (row: StockRow) => String(row.availableQty),
      },
    ]

    const { writeText } = copyGrid(columns, 1)
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('1234'))
  })
})
