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

// ────────────────────────────────────────────────────────────────────────────
// #902 R2 8건 결함 리뷰(OPUS+SOL 적대검증) 회귀 가드 — D7(제외 행 금액 표시)·D8(소수 수량).
// ────────────────────────────────────────────────────────────────────────────
describe('LineRow #902 R2 결함 회귀 가드', () => {
  // D7·H6: lineVat.ts 는 수량을 Math.max(1, ...)로 클램프해 계산하므로(계산 로직은 동결 —
  // 다른 화면·BE parity 걸림), 수량 0(저장 제외 예정) 행의 supplyAmount/vatAmount/lineTotal
  // 은 "수량 1 로 계산된" 값이 저장돼 있다. excludedFromSave=true 면 그 값 대신 0 을 표시한다.
  it('excludedFromSave=true 면 클램프 계산값 대신 0 을 표시한다(D7)', () => {
    render(
      <div role="table">
        <LineTableHeader allSelected={false} onToggleAll={vi.fn()} vatInclusive />
        <LineRow
          lineNumber={1}
          line={{
            ...line('USER'),
            quantity: '0',
            unitPrice: '2000',
            // 부모(lineVat.recalculateLineVat)가 수량을 1로 클램프해 계산한 값 — 화면에 그대로
            // 보이면 "저장에서 제외됩니다" 밴드와 함께 공급 1,818/부가세 182/합계 2,000 이
            // 동시에 뜨는 정면 모순이 재현된다.
            supplyAmount: '1818',
            vatAmount: '182',
            lineTotal: '2000',
          }}
          vatInclusive
          vatEditable
          excludedFromSave
          selected={false}
          onSelect={vi.fn()}
          onModelNameChange={vi.fn()}
          onModelNameBlur={vi.fn()}
          onSpecificationChange={vi.fn()}
          onQuantityChange={vi.fn()}
          onUnitPriceChange={vi.fn()}
          onSupplyAmountChange={vi.fn()}
          onVatAmountChange={vi.fn()}
          onLineTotalChange={vi.fn()}
          onDelete={vi.fn()}
          dragHandleProps={{}}
        />
      </div>,
    )

    expect((screen.getByLabelText('라인 1 공급가액') as HTMLInputElement).value).toBe('0')
    expect((screen.getByLabelText('라인 1 부가세') as HTMLInputElement).value).toBe('0')
    expect((screen.getByLabelText('라인 1 합계(VAT포함)') as HTMLInputElement).value).toBe('0')
  })

  // 저장 대상(excludedFromSave 미지정/false)인 정상 행은 종전처럼 실제 값을 그대로 보여준다(무회귀).
  it('excludedFromSave 가 아니면 실제 저장값을 그대로 표시한다(무회귀)', () => {
    render(
      <div role="table">
        <LineTableHeader allSelected={false} onToggleAll={vi.fn()} vatInclusive />
        <LineRow
          lineNumber={1}
          line={{
            ...line('USER'),
            quantity: '1',
            unitPrice: '2000',
            supplyAmount: '1818',
            vatAmount: '182',
            lineTotal: '2000',
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
          onSupplyAmountChange={vi.fn()}
          onVatAmountChange={vi.fn()}
          onLineTotalChange={vi.fn()}
          onDelete={vi.fn()}
          dragHandleProps={{}}
        />
      </div>,
    )

    expect((screen.getByLabelText('라인 1 합계(VAT포함)') as HTMLInputElement).value).toBe('2,000')
  })

  // D8·H7: BE CreateSlipRequest.SlipLineRequest.quantity 는 @NotNull @Positive Integer.
  // 소수(2.7→2 절사, 0.5→0→400)가 안내 없이 넘어가지 않도록 입력 단계에서 자릿수만 남긴다.
  it('수량 입력은 소수점 등 비정수 문자를 제거한다(D8)', () => {
    const onQuantityChange = vi.fn()
    render(
      <div role="table">
        <LineRow
          lineNumber={1}
          line={line('USER')}
          selected={false}
          onSelect={vi.fn()}
          onModelNameChange={vi.fn()}
          onModelNameBlur={vi.fn()}
          onSpecificationChange={vi.fn()}
          onQuantityChange={onQuantityChange}
          onUnitPriceChange={vi.fn()}
          onDelete={vi.fn()}
          dragHandleProps={{}}
        />
      </div>,
    )

    fireEvent.change(screen.getByLabelText('라인 1 수량'), { target: { value: '2.7' } })

    expect(onQuantityChange).toHaveBeenCalledWith('27')
  })
})
