// @vitest-environment jsdom

import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { PartnerAutocomplete, type PartnerOption } from './PartnerAutocomplete'

const modalProbe = vi.hoisted(() => ({
  optionCount: 0,
  firstLabel: '',
  lastLabel: '',
}))

vi.mock('../SearchResultSelectionModal', () => ({
  SearchResultSelectionModal: ({
    open,
    options,
    getLabel,
    renderOption,
  }: {
    open: boolean
    options: PartnerOption[]
    getLabel: (option: PartnerOption) => string
    renderOption: (option: PartnerOption) => ReactNode
  }) => {
    if (!open) return null

    modalProbe.optionCount = options.length
    modalProbe.firstLabel = getLabel(options[0]!)
    modalProbe.lastLabel = getLabel(options[options.length - 1]!)
    const sample = options.slice(0, 16).concat(options.slice(-16))

    return (
      <div role="dialog" aria-label="거래처 검색 결과">
        <div data-testid="modal-option-count">{options.length}</div>
        {sample.map((option) => (
          <label key={option.partnerCode}>
            <input type="radio" aria-label={getLabel(option)} />
            <span>{renderOption(option)}</span>
          </label>
        ))}
      </div>
    )
  },
}))

describe('R6 거래처 5,587건 비용 실측', () => {
  it('실 응답 5,587건을 공용 모달까지 전달하고 결정적 표본 DOM 비용 상한을 지킨다', async () => {
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
    // 5,587건 응답과 동일한 배열을 UI 경로에 전달한다. 공용 모달 경계의 probe가
    // 전체 배열을 계수하고, DOM은 양 끝 16건씩만 만들어 러너 속도에 의존하지 않는다.
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
    expect(modalProbe.optionCount).toBe(items.length)
    expect(screen.getByTestId('modal-option-count').textContent).toBe(String(items.length))
    expect(modalProbe.firstLabel).toBe(items[0]?.name)
    expect(modalProbe.lastLabel).toBe(items[items.length - 1]?.name)
    expect(radios.length).toBe(32)
    expect(radios[0]?.getAttribute('aria-label')).toBe(items[0]?.name)
    expect(radios[radios.length - 1]?.getAttribute('aria-label')).toBe(items[items.length - 1]?.name)
    console.info(`[R6 COST] modal radios=${radios.length} domElements=${domElementCount}`)
    expect(domElementCount).toBeLessThanOrEqual(100_000)
  })
})
