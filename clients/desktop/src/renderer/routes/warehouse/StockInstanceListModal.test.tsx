// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { StockInstanceListModal } from './StockInstanceListModal'

describe('품목리스트 모달', () => {
  it('시리얼키와 바코드를 함께 렌더하고 shipped 품질 입력을 잠근다', () => {
    render(
      <StockInstanceListModal
        open
        productCode="MODEL-A"
        rows={[
          {
            serialKey: 'SI-ABC234',
            barcode: 'SI-ABC234',
            warehouseCode: 'WH-001',
            warehouseName: '본사창고',
            status: 'SHIPPED',
            quality: 'NORMAL',
          },
        ]}
        onClose={() => {}}
        onQualityChange={() => {}}
      />,
    )

    expect(screen.getByText('SI-ABC234')).toBeTruthy()
    expect(screen.getByTestId('serial-barcode-SI-ABC234')).toBeTruthy()
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true)
  })
})
