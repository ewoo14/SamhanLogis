// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'
import { StockInstanceListModal } from './StockInstanceListModal'

describe('품목리스트 모달', () => {
  it('시리얼키를 담은 사각형 QR을 렌더하고 shipped 품질 입력을 잠근다', () => {
    render(
      <StockInstanceListModal
        open
        productCode="MODEL-A"
        rows={[
          {
            serialKey: 'SI-ABC234',
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
    expect(screen.getByTestId('serial-qr-SI-ABC234')).toBeTruthy()
    expect(screen.getByLabelText('SI-ABC234 QR 코드')).toBeTruthy()
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true)
  })
})
