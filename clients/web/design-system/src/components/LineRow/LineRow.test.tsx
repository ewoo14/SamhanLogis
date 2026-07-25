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

  it('VAT 포함 모드는 공급가액·부가세 입력 열과 경고를 표시하고, 합계는 읽기전용이다(P1)', () => {
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
    expect(screen.getByRole('note').textContent).toBe('⚠ 10%와 다름')

    fireEvent.change(screen.getByLabelText('라인 1 공급가액'), { target: { value: '100006' } })
    fireEvent.change(screen.getByLabelText('라인 1 부가세'), { target: { value: '10001' } })
    expect(onSupplyAmountChange).toHaveBeenCalledWith('100006')
    expect(onVatAmountChange).toHaveBeenCalledWith('10001')

    // P1(개발책임자 결정 2026-07-25 — 금액 열 편집 정책): 합계는 편집 불가다. input 이 아닌
    // 읽기전용 표시여야 하고, onLineTotalChange 는 어떤 경우에도 호출되지 않는다.
    const total = screen.getByLabelText('라인 1 합계(VAT포함)')
    expect(total.tagName).not.toBe('INPUT')
    expect(total.textContent).toBe('100,005')
    expect(onLineTotalChange).not.toHaveBeenCalled()
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
    // P1: 합계는 이제 읽기전용 표시라 HTMLInputElement가 아니다 — textContent로 확인한다.
    expect(screen.getByLabelText('라인 1 합계(VAT포함)').textContent).toBe('0')
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

    // P1: 합계는 읽기전용 표시 — textContent로 확인한다.
    expect(screen.getByLabelText('라인 1 합계(VAT포함)').textContent).toBe('2,000')
  })

  // H7′(개발책임자 회귀 지시 — #902 R3 S5, H7 대체): 종전 D8 fix 는 문자 단위로 숫자가
  // 아닌 문자만 제거해 "2.7"→"27"(10배 오주문), "0.5"→"05"→5, "-3"→"3", "1e3"→"13" 처럼
  // 자릿수가 재조합되어 사용자가 의도하지 않은 다른 수량이 조용히 만들어졌다 — 원래 결함
  // (BE 에서 2.7→2 절사)보다 더 나빴다(PM 실측). 전체 문자열이 순수 자연수(빈 값 포함)일
  // 때만 그대로 받아들이고, 아니면 이 입력 자체를 반영하지 않는다(controlled input 이라
  // 다음 렌더에서 이전 값으로 자동 복귀 — 자릿수 재조합 없이 "받지 않음"으로 처리).
  // (참고) "2..7" 처럼 type="number" 자체가 무효로 보는 문법은 jsdom/브라우저가 change 발화
  // 전에 이미 e.target.value 를 ''로 sanitize 한다 — 그 케이스는 이 필터 로직 대상이 아니다.
  // 아래 4건은 전부 HTML5 number input 문법상 유효해(sanitize 되지 않아) 실제로 이 필터를
  // 거치는, PM 실측과 동일한 raw 문자열이다.
  it.each([
    ['2.7', '10배 오주문(2.7→27) 방지'],
    ['0.5', '0.5→05→5 재조합 방지'],
    ['-3', '음수 부호 제거로 다른 값이 되는 것 방지'],
    ['1e3', '지수 표기 e 제거로 다른 값이 되는 것 방지'],
  ])('수량 입력 "%s" 은 %s — onQuantityChange 가 호출되지 않는다(H7′)', (raw) => {
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

    fireEvent.change(screen.getByLabelText('라인 1 수량'), { target: { value: raw } })

    expect(onQuantityChange).not.toHaveBeenCalled()
  })

  // 정상 경로(순수 자연수·빈 값)는 자릿수 재조합 없이 그대로 반영된다 — 무회귀 확인.
  it.each([
    ['5', '5'],
    ['', ''],
    ['007', '007'],
    ['12', '12'],
  ])('수량 입력 "%s" 은 그대로 반영된다(H7′ 정상 경로 무회귀)', (raw, expected) => {
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

    fireEvent.change(screen.getByLabelText('라인 1 수량'), { target: { value: raw } })

    expect(onQuantityChange).toHaveBeenCalledWith(expected)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// #902 R3 — 개발책임자 직접 발견 회귀: 이전 라운드(D7·H6 fix)가 excludedFromSave=true 일 때
// amountDisplay 를 무조건 '0' 으로 강제해, 그 값이 controlled input 의 value 라서 사용자가
// 공급가액/부가세/합계 칸에 입력해도 다음 렌더에서 곧바로 '0' 으로 되돌아갔다(H6′·H8 회귀).
// 아래는 그 회귀를 재현하는 RED-first 테스트 + 고친 뒤의 GREEN 확인이다.
// ────────────────────────────────────────────────────────────────────────────
describe('LineRow #902 R3 회귀 가드 — 제외 행에서도 사용자가 직접 입력한 금액은 남는다(H6′·H8)', () => {
  const excludedNoProductLine = (): LineDraft => ({
    ...line('USER'),
    productId: null,
    quantity: '1',
    unitPrice: '0',
    supplyAmount: '0',
    vatAmount: '0',
    lineTotal: '0',
  })

  const excludedZeroQtyLine = (): LineDraft => ({
    ...line('USER'),
    productId: 'product-1',
    quantity: '0',
    unitPrice: '2000',
    supplyAmount: '0',
    vatAmount: '0',
    lineTotal: '0',
  })

  function renderExcluded(initialLine: LineDraft, onSupplyAmountChange = vi.fn()) {
    return render(
      <div role="table">
        <LineTableHeader allSelected={false} onToggleAll={vi.fn()} vatInclusive />
        <LineRow
          lineNumber={1}
          line={initialLine}
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
          onSupplyAmountChange={onSupplyAmountChange}
          onVatAmountChange={vi.fn()}
          onLineTotalChange={vi.fn()}
          onDelete={vi.fn()}
          dragHandleProps={{}}
        />
      </div>,
    )
  }

  // 품목 미선택 행(NEEDS_PRODUCT) — "신규 전표 1행" 개발책임자 실측 재현.
  it('품목 미선택 행: 공급가액 칸에 입력한 값이 화면에 남는다(H6′·H8)', () => {
    const onSupplyAmountChange = vi.fn()
    const { rerender } = renderExcluded(excludedNoProductLine(), onSupplyAmountChange)

    fireEvent.change(screen.getByLabelText('라인 1 공급가액'), { target: { value: '12345' } })
    expect(onSupplyAmountChange).toHaveBeenCalledWith('12345')

    // 부모(SlipFormPage.updateVatAmount → lineVat.editLineVat)가 공급가액을 권위(authority)로
    // 승격시켜 재렌더한 상황을 재현 — 이 권위 승격이 "사용자가 직접 친 값"의 신호다.
    rerender(
      <div role="table">
        <LineTableHeader allSelected={false} onToggleAll={vi.fn()} vatInclusive />
        <LineRow
          lineNumber={1}
          line={{ ...excludedNoProductLine(), authority: 'SUPPLY', supplyAmount: '12345', vatAmount: '1235', lineTotal: '13580' }}
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
          onSupplyAmountChange={onSupplyAmountChange}
          onVatAmountChange={vi.fn()}
          onLineTotalChange={vi.fn()}
          onDelete={vi.fn()}
          dragHandleProps={{}}
        />
      </div>,
    )

    expect((screen.getByLabelText('라인 1 공급가액') as HTMLInputElement).value).toBe('12,345')
  })

  // 수량 0 행(NEEDS_POSITIVE_QUANTITY) — PM 실측 "[수량=2로 바꾼 뒤 공급가액] '50000' 입력 후 0" 대응.
  it('수량 0 행: 부가세 칸에 입력한 값이 화면에 남는다(H6′·H8)', () => {
    const onVatAmountChange = vi.fn()
    const { rerender } = render(
      <div role="table">
        <LineTableHeader allSelected={false} onToggleAll={vi.fn()} vatInclusive />
        <LineRow
          lineNumber={1}
          line={excludedZeroQtyLine()}
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
          onVatAmountChange={onVatAmountChange}
          onLineTotalChange={vi.fn()}
          onDelete={vi.fn()}
          dragHandleProps={{}}
        />
      </div>,
    )

    fireEvent.change(screen.getByLabelText('라인 1 부가세'), { target: { value: '999' } })
    expect(onVatAmountChange).toHaveBeenCalledWith('999')

    rerender(
      <div role="table">
        <LineTableHeader allSelected={false} onToggleAll={vi.fn()} vatInclusive />
        <LineRow
          lineNumber={1}
          line={{ ...excludedZeroQtyLine(), authority: 'VAT', vatAmount: '999' }}
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
          onVatAmountChange={onVatAmountChange}
          onLineTotalChange={vi.fn()}
          onDelete={vi.fn()}
          dragHandleProps={{}}
        />
      </div>,
    )

    expect((screen.getByLabelText('라인 1 부가세') as HTMLInputElement).value).toBe('999')
  })

  // P1(개발책임자 결정 2026-07-25): 합계는 편집 불가다 — 종전 H6′·H8은 "직접 입력한 값이
  // 남는다"였으나, 합계는 이제 입력 자체가 불가능하므로 "편집 수단이 없고, 공급가액+부가세
  // 파생값을 읽기전용으로 보여준다"로 대체한다. 제외 예정 행에서도 동일하다.
  it('품목 미선택 행: 합계(VAT포함) 칸은 편집할 수 없고 공급가액+부가세 파생값을 보여준다(P1)', () => {
    const onLineTotalChange = vi.fn()
    render(
      <div role="table">
        <LineTableHeader allSelected={false} onToggleAll={vi.fn()} vatInclusive />
        <LineRow
          lineNumber={1}
          line={{ ...excludedNoProductLine(), authority: 'SUPPLY', supplyAmount: '49383', vatAmount: '4938', lineTotal: '54321' }}
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
          onLineTotalChange={onLineTotalChange}
          onDelete={vi.fn()}
          dragHandleProps={{}}
        />
      </div>,
    )

    const total = screen.getByLabelText('라인 1 합계(VAT포함)')
    expect(total.tagName).not.toBe('INPUT')
    expect(total.textContent).toBe('54,321')
    expect(onLineTotalChange).not.toHaveBeenCalled()
  })

  // H9(원 D7 모순 재발 방지 회귀 가드): authority 가 여전히 'PRICE'(또는 미설정)이고 —
  // 즉 사용자가 공급가액/부가세/합계 중 어느 것도 직접 편집한 적이 없고 — 실제 수량이
  // 0 이하(클램프가 실제로 왜곡)이면, 클램프 계산값이 아니라 0 을 보여준다. 이 케이스는
  // 위 excludedZeroQtyLine()(authority 미설정) 자체가 이미 이 조건이다.
  it('수량 0 이고 아직 아무 금액도 직접 편집하지 않은 행은 클램프 계산값 대신 0 을 보여준다(H9)', () => {
    render(
      <div role="table">
        <LineTableHeader allSelected={false} onToggleAll={vi.fn()} vatInclusive />
        <LineRow
          lineNumber={1}
          line={{
            ...excludedZeroQtyLine(),
            // lineVat.recalculateLineVat 가 수량을 1로 클램프해 계산한 "가짜" 저장값 재현.
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
    // P1: 합계는 읽기전용 표시 — textContent로 확인한다.
    expect(screen.getByLabelText('라인 1 합계(VAT포함)').textContent).toBe('0')
  })

  // 설계 결정 확인: authority='PRICE' 라도 실제 수량이 유효(>0)하면 클램프가 아무 것도
  // 왜곡하지 않은 것이므로 억제하지 않는다 — "제외 예정"(품목 미선택) 그 자체는 억제 사유가
  // 아니다. 이카운트 방식(금액 먼저 입력) 흐름에서 단가만 먼저 친 행도 합계를 보여줘야 한다.
  it('품목 미선택이라도 수량이 유효(1)하고 단가만 입력한 행은 합계를 그대로 보여준다(H8 확장)', () => {
    render(
      <div role="table">
        <LineTableHeader allSelected={false} onToggleAll={vi.fn()} vatInclusive />
        <LineRow
          lineNumber={1}
          line={{
            ...excludedNoProductLine(),
            quantity: '1',
            unitPrice: '100000',
            authority: 'PRICE',
            supplyAmount: '90909',
            vatAmount: '9091',
            lineTotal: '100000',
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

    // P1: 합계는 읽기전용 표시 — textContent로 확인한다.
    expect(screen.getByLabelText('라인 1 합계(VAT포함)').textContent).toBe('100,000')
  })
})
