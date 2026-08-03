// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PartnerAutocomplete, type PartnerOption } from './PartnerAutocomplete'

describe('R6 거래처 5,587건 비용 실측', () => {
  it('실 응답 JSON 바이트와 공용 모달 DOM 렌더 시간을 기록한다', async () => {
    const items: PartnerOption[] = Array.from({ length: 5_587 }, (_, index) => ({
      id: `00000000-0000-0000-0000-${String(index + 1).padStart(12, '0')}`,
      partnerCode: `P-${String(index + 1).padStart(6, '0')}`,
      name: `거래처 ${index + 1}`,
      bizNo: `010${String(index + 1).padStart(8, '0')}`,
      phone: `010-${String(index % 10_000).padStart(4, '0')}-${String((index * 7) % 10_000).padStart(4, '0')}`,
    }))
    const responseBody = {
      success: true,
      data: { items, total: items.length, page: 0, size: 10_000 },
    }
    const responseBytes = new TextEncoder().encode(JSON.stringify(responseBody)).byteLength
    const renderStartedAt = performance.now()

    render(
      <PartnerAutocomplete
        value={null}
        onChange={() => undefined}
        searchPartners={async () => items}
        ariaLabel="거래처 검색"
        resultSelectionMode="single"
        resultSelectionTitle="거래처 검색 결과"
        debounceMs={0}
      />,
    )

    const input = screen.getByRole('combobox', { name: '거래처' })
    fireEvent.change(input, { target: { value: '010' } })
    const dialog = await screen.findByRole('dialog', { name: '거래처 검색 결과' })
    const renderElapsedMs = performance.now() - renderStartedAt

    console.info(`[R6 COST] partner response bytes=${responseBytes} renderMs=${renderElapsedMs.toFixed(2)} rows=${items.length}`)
    expect(dialog).toBeTruthy()
    expect(dialog.querySelectorAll('input[type="radio"]').length).toBe(items.length)
  })
})
