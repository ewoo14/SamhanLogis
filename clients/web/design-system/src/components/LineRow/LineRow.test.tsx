import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LineRow, type LineDraft } from './LineRow'
import { LineTableHeader } from './LineTableHeader'

function line(priceSource: LineDraft['priceSource']): LineDraft {
  return {
    id: 'line-1',
    productId: 'product-1',
    modelName: 'MODEL-1',
    productName: '품목 1',
    specification: '',
    quantity: '1',
    unitPrice: '123000',
    priceSource,
    catalogUnitPrice: '100000',
    priceMemoryUpdatedAt: priceSource === 'REMEMBERED' ? '2026-07-10T09:00:00' : null,
    lookupError: null,
    lookupLoading: false,
  }
}

function renderRow(
  priceSource: LineDraft['priceSource'],
  priceRefreshChanged = false,
  partnerSelected?: boolean,
  selected = false,
) {
  return render(
    <div role="table">
      <LineRow
        lineNumber={1}
        line={{ ...line(priceSource), priceRefreshChanged }}
        selected={selected}
        onSelect={vi.fn()}
        onModelNameChange={vi.fn()}
        onModelNameBlur={vi.fn()}
        onSpecificationChange={vi.fn()}
        onQuantityChange={vi.fn()}
        onUnitPriceChange={vi.fn()}
        onDelete={vi.fn()}
        dragHandleProps={{}}
        {...(partnerSelected === undefined ? {} : { partnerSelected })}
      />
    </div>,
  )
}

describe('LineRow price source marker', () => {
  it('REMEMBERED renders the real marker, saved-at meaning, and input description link', () => {
    const { container } = renderRow('REMEMBERED', true)

    const note = screen.getByRole('note', {
      name: '이 거래처에 마지막으로 저장된 단가 · 2026-07-10 저장',
    })
    expect(note.textContent).toBe('거래처 최근단가')
    expect(note.getAttribute('title')).toContain('2026-07-10 저장')
    expect(screen.getByLabelText('라인 1 단가').getAttribute('aria-describedby')).toBe(
      `${note.id} ${screen.getByText('단가 변경').id}`,
    )
    const row = container.querySelector('[data-line-number]') as HTMLElement
    expect(row.className).toContain('priceRefreshed')
    const changedStatus = screen.getByText('단가 변경')
    expect(changedStatus.querySelector('svg')).not.toBeNull()
    expect(changedStatus.hasAttribute('aria-live')).toBe(false)
    expect(row.hasAttribute('role')).toBe(false)
    expect(row.hasAttribute('aria-selected')).toBe(false)
    expect(row.hasAttribute('aria-describedby')).toBe(false)
    expect(screen.getByLabelText('라인 1 단가').getAttribute('aria-describedby')).toBe(
      `${note.id} ${changedStatus.id}`,
    )
  })

  it.each([
    ['가격출처만', 'CATALOG' as const, false, 1],
    ['변경상태만', 'USER' as const, true, 1],
    ['둘 다', 'REMEMBERED' as const, true, 2],
    ['없음', 'USER' as const, false, 0],
  ])('단가 input IDREF %s는 실존 대상만 가리킨다', (_name, source, changed, expectedCount) => {
    const { container } = renderRow(source, changed)
    const input = screen.getByLabelText('라인 1 단가')
    const ids = input.getAttribute('aria-describedby')?.split(' ') ?? []

    expect(ids).toHaveLength(expectedCount)
    expect(ids.every((id) => document.getElementById(id))).toBe(true)
    expect(container.querySelector('[data-line-number]')?.hasAttribute('aria-describedby')).toBe(false)
  })

  it.each([true, false])('selected=%s이면 checkbox checked와 selected class가 함께 반영된다', (selected) => {
    const { container } = renderRow('USER', false, undefined, selected)
    const checkbox = screen.getByRole('checkbox', { name: '라인 1 선택' }) as HTMLInputElement
    const row = checkbox.closest('[data-line-number]')

    expect(checkbox.checked).toBe(selected)
    expect(row?.className.includes('selected')).toBe(selected)
    expect(container.querySelector('[role="row"]')).toBeNull()
  })

  it('LineTableHeader는 시각적 grid header로만 렌더한다', () => {
    const { container } = render(
      <LineTableHeader allSelected={false} onToggleAll={vi.fn()} />,
    )

    expect(container.querySelector('[role="row"]')).toBeNull()
    expect(screen.getByRole('checkbox', { name: '모든 라인 선택' })).toBeTruthy()
  })

  it('VAT 포함 모드는 공급가액·부가세·합계 입력 열과 경고를 표시한다', () => {
    const onSupplyAmountChange = vi.fn()
    const onVatAmountChange = vi.fn()
    const onLineTotalChange = vi.fn()
    render(
      <div role="table">
        <LineTableHeader allSelected={false} onToggleAll={vi.fn()} vatInclusive />
        <LineRow
          lineNumber={1}
          line={{
            ...line('USER'),
            supplyAmount: '100005',
            vatAmount: '0',
            lineTotal: '100005',
            vatWarning: true,
          }}
          vatInclusive
          vatEditable
          selected={false}
          onSelect={vi.fn()}
          onModelNameChange={vi.fn()}
          onModelNameBlur={vi.fn()}
          onSpecificationChange={vi.fn()}
          onQuantityChange={vi.fn()}
          onUnitPriceChange={vi.fn()}
          onSupplyAmountChange={onSupplyAmountChange}
          onVatAmountChange={onVatAmountChange}
          onLineTotalChange={onLineTotalChange}
          onDelete={vi.fn()}
          dragHandleProps={{}}
        />
      </div>,
    )

    expect(screen.getByText('공급가액')).toBeTruthy()
    expect(screen.getByText('부가세')).toBeTruthy()
    expect(screen.getByLabelText('라인 1 공급가액')).toBeTruthy()
    expect(screen.getByLabelText('라인 1 부가세')).toBeTruthy()
    expect(screen.getByLabelText('라인 1 합계(VAT포함)')).toBeTruthy()
    expect(screen.getByRole('note').textContent).toBe('⚠ 10%와 다름')

    fireEvent.change(screen.getByLabelText('라인 1 공급가액'), { target: { value: '100006' } })
    fireEvent.change(screen.getByLabelText('라인 1 부가세'), { target: { value: '10001' } })
    fireEvent.change(screen.getByLabelText('라인 1 합계(VAT포함)'), { target: { value: '110007' } })
    expect(onSupplyAmountChange).toHaveBeenCalledWith('100006')
    expect(onVatAmountChange).toHaveBeenCalledWith('10001')
    expect(onLineTotalChange).toHaveBeenCalledWith('110007')
  })

  // BLOCKING-2 계열(#824 R1): 공급/부가세를 아직 보유하지 않은(hydrate 전) 라인의 read-only
  // fallback(computeVatBreakdown)이 BE VatAmountCalculator(0 방향 절사·DOWN)와 다른 HALF_UP
  // 이었다. 단가 7900 은 ÷11 나머지가 5.5 미만이라 100005 류 fixture 와 달리 두 반올림 모드가
  // 실제로 갈린다 — DOWN 이면 공급 7181/부가세 719, HALF_UP 이면 7182/718.
  it('VAT 포함 모드 fallback(공급/부가세 미보유)은 BE 와 같은 절사(DOWN)로 합계를 분해한다', () => {
    render(
      <div role="table">
        <LineTableHeader allSelected={false} onToggleAll={vi.fn()} vatInclusive />
        <LineRow
          lineNumber={1}
          line={{ ...line('USER'), unitPrice: '7900', quantity: '1' }}
          vatInclusive
          selected={false}
          onSelect={vi.fn()}
          onModelNameChange={vi.fn()}
          onModelNameBlur={vi.fn()}
          onSpecificationChange={vi.fn()}
          onQuantityChange={vi.fn()}
          onUnitPriceChange={vi.fn()}
          onDelete={vi.fn()}
          dragHandleProps={{}}
        />
      </div>,
    )

    expect(screen.getByLabelText('라인 1 공급가액/부가세').textContent).toBe('공급 7,181 · VAT 719')
  })

  // D-R4-1: 자동채움 실체 = 제품 등록 화면 '판매가'(sellingPrice) — '정가' 라벨 금지(출고가 별칭 오도).
  it('CATALOG exposes an explicit 판매가 miss state and description', () => {
    renderRow('CATALOG')

    const note = screen.getByRole('note', {
      name: '이 거래처에 저장된 최근단가가 없어 판매가를 적용했습니다',
    })
    expect(note.textContent).toBe('판매가')
    expect(screen.getByLabelText('라인 1 단가').getAttribute('aria-describedby')).toBe(note.id)
  })

  // R4-D2: 라인별 aria-live 는 라인 N개 flip 시 N회 낭독 폭주 — 칩에서 제거(배너 1곳이 전역 고지).
  it.each(['REMEMBERED', 'CATALOG'] as const)('%s marker never carries aria-live (R4-D2)', (source) => {
    renderRow(source)

    expect(screen.getByRole('note').hasAttribute('aria-live')).toBe(false)
  })

  // R4-D4(a): 거래처 미선택이면 CATALOG 설명이 거래처를 단정하지 않는다.
  it('CATALOG without a partner does not claim partner-specific copy', () => {
    renderRow('CATALOG', false, false)

    const note = screen.getByRole('note', { name: '판매가를 적용했습니다' })
    expect(note.textContent).toBe('판매가')
    expect(note.getAttribute('title')).toBe('판매가를 적용했습니다')
    expect(note.getAttribute('aria-label')).not.toContain('거래처')
    expect(screen.getByLabelText('라인 1 단가').getAttribute('aria-describedby')).toBe(note.id)
  })

  // R4-D4(b)·D-R4-4: 거래처 해제 시 마커(저장일 포함)만 해제 — 단가값 유지는 호출자(state) 책임.
  it('REMEMBERED without a partner hides the marker and keeps the unit price rendering', () => {
    renderRow('REMEMBERED', false, false)

    expect(screen.queryByRole('note')).toBeNull()
    const priceInput = screen.getByLabelText('라인 1 단가') as HTMLInputElement
    expect(priceInput.hasAttribute('aria-describedby')).toBe(false)
    // 단가값 유지 — locale 무관 숫자만 비교(toLocaleString 천단위 구분자 회피).
    expect(priceInput.value.replace(/[^0-9]/g, '')).toBe('123000')
  })

  it.each(['USER', null] as const)('%s does not claim an automatic price source', (source) => {
    renderRow(source)

    expect(screen.queryByRole('note')).toBeNull()
    expect(screen.getByLabelText('라인 1 단가').hasAttribute('aria-describedby')).toBe(false)
  })
})
