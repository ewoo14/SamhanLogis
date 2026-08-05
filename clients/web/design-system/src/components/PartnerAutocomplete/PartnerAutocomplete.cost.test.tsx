// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PartnerAutocomplete, type PartnerOption } from './PartnerAutocomplete'

describe('R6 거래처 5,587건 비용 실측', () => {
  it('실 응답 5,587건을 공용 모달까지 전달하고 결정적 DOM 비용 상한을 지킨다', async () => {
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
    // 5,587건 응답과 동일한 배열을 UI 경로에 전달한다. wall-clock 시간은 테스트의
    // 통과 여부에 관여시키지 않고, 아래에서 DOM element 수를 결정적으로 제한한다.
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

    console.info(`[R6 COST] partner response bytes=${responseBytes} rows=${items.length}`)
    expect(responseBytes).toBeGreaterThan(700_000)
    const radios = dialog.querySelectorAll('input[type="radio"]')
    const domElementCount = dialog.querySelectorAll('*').length
    expect(radios.length).toBe(items.length)
    expect(radios[0]?.getAttribute('aria-label')).toBe(items[0]?.name)
    expect(radios[radios.length - 1]?.getAttribute('aria-label')).toBe(items[items.length - 1]?.name)
    console.info(`[R6 COST] modal radios=${radios.length} domElements=${domElementCount}`)
    expect(domElementCount).toBeLessThanOrEqual(100_000)
  })
})
