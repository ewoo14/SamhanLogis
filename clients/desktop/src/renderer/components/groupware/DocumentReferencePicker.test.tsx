// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DocumentReferencePicker, type DocumentReferenceValue } from './DocumentReferencePicker'

const { searchByTypeMock } = vi.hoisted(() => ({
  searchByTypeMock: vi.fn(),
}))

vi.mock('../../api/documentReferenceSearch', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api/documentReferenceSearch')>()
  return { ...actual, searchByType: searchByTypeMock }
})

const emptyValue: DocumentReferenceValue = {
  refDocType: 'JOURNAL',
  refDocNo: null,
  refDocLabel: null,
  refPartnerCode: null,
  refPartnerName: null,
  refPeriod: null,
}

function journal(no: string) {
  return {
    journalNo: no,
    journalDate: '2026-07-19',
    description: `설명 ${no}`,
    totalAmount: 1000,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function renderPicker(value: DocumentReferenceValue = emptyValue) {
  return render(<DocumentReferencePicker value={value} onChange={vi.fn()} />)
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  searchByTypeMock.mockReset()
})

describe('DocumentReferencePicker 요청 세대 (#837)', () => {
  it('외부 scroll로 닫힌 뒤 focus를 유지한 입력을 클릭하면 기존 후보 dropdown을 다시 연다', async () => {
    vi.useFakeTimers()
    searchByTypeMock.mockResolvedValue([journal('J-RECLICK')])
    renderPicker()

    const input = screen.getByTestId('doc-ref-search-input')
    input.focus()
    fireEvent.change(input, { target: { value: 'J-RECLICK' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(screen.getByRole('listbox')).toBeTruthy()

    fireEvent.scroll(window)
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(document.activeElement).toBe(input)

    fireEvent.click(input)

    expect(screen.getByRole('listbox')).toBeTruthy()
    expect(screen.getByText('J-RECLICK')).toBeTruthy()
  })

  it('scroll close와 같은 paint 경계의 클릭도 후보 dropdown을 다시 연다', async () => {
    vi.useFakeTimers()
    searchByTypeMock.mockResolvedValue([journal('J-RACE')])
    renderPicker()

    const input = screen.getByTestId('doc-ref-search-input')
    input.focus()
    fireEvent.change(input, { target: { value: 'J-RACE' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(screen.getByRole('listbox')).toBeTruthy()

    act(() => {
      fireEvent.scroll(window)
      fireEvent.click(input)
    })

    expect(screen.getByRole('listbox')).toBeTruthy()
    expect(screen.getByText('J-RACE')).toBeTruthy()
  })

  it('검색 결과가 0건이면 클릭해도 기존 계약대로 빈 surface를 만들지 않는다', async () => {
    vi.useFakeTimers()
    searchByTypeMock.mockResolvedValue([])
    renderPicker()

    const input = screen.getByTestId('doc-ref-search-input')
    input.focus()
    fireEvent.change(input, { target: { value: 'NO_MATCHING_DOCUMENT' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })

    expect(screen.queryByRole('listbox')).toBeNull()
    fireEvent.click(input)
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByText('검색 결과 없음')).toBeNull()
  })

  it('검색 dropdown은 body portal로 렌더되고 하단 공간이 부족하면 위로 열린다', async () => {
    vi.useFakeTimers()
    searchByTypeMock.mockResolvedValue([journal('J-PORTAL')])
    renderPicker()

    const picker = document.querySelector('[class*="picker"]')
    expect(picker).not.toBeNull()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
      if (this === picker) return new DOMRect(100, 700, 500, 60)
      return new DOMRect()
    })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })

    fireEvent.change(screen.getByTestId('doc-ref-search-input'), { target: { value: 'J-PORTAL' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })

    const listbox = screen.getByRole('listbox')
    expect(listbox.parentElement).toBe(document.body)
    expect(listbox.style.position).toBe('fixed')
    expect(listbox.style.bottom).not.toBe('')
    expect(screen.getByText('J-PORTAL')).toBeTruthy()
  })

  it('영업수수료 정산서를 기존 지출결의서 참조 유형으로 선택할 수 있다', () => {
    const onChange = vi.fn()
    render(<DocumentReferencePicker value={emptyValue} onChange={onChange} />)

    expect(screen.getByRole('option', { name: '영업수수료 정산서' })).toBeTruthy()
    fireEvent.change(screen.getByTestId('doc-ref-type-select'), {
      target: { value: 'SALES_COMMISSION_SETTLEMENT' },
    })

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      refDocType: 'SALES_COMMISSION_SETTLEMENT',
      refDocNo: null,
    }))
  })

  it('A/B 응답이 역순으로 도착해도 최신 옵션과 loading owner만 유지한다', async () => {
    vi.useFakeTimers()
    let resolveA!: (value: unknown[]) => void
    let resolveB!: (value: unknown[]) => void
    searchByTypeMock
      .mockImplementationOnce(() => new Promise((resolve) => { resolveA = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveB = resolve }))

    renderPicker()
    const input = screen.getByTestId('doc-ref-search-input')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'A' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    fireEvent.change(input, { target: { value: 'B' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(searchByTypeMock).toHaveBeenCalledTimes(2)

    await act(async () => { resolveA([journal('J-A')]) })
    expect(screen.queryByText('J-A')).toBeNull()
    expect(screen.getByRole('status', { name: '문서 검색 중' })).toBeTruthy()

    await act(async () => { resolveB([journal('J-B')]) })
    expect(screen.getByText('J-B')).toBeTruthy()
    expect(screen.queryByText('J-A')).toBeNull()
    expect(screen.queryByRole('status', { name: '문서 검색 중' })).toBeNull()
  })

  it('blur 전에 취소된 debounce와 blur 중 stale 응답은 refocus 최신 검색으로 대체한다', async () => {
    vi.useFakeTimers()
    let resolveOld!: (value: unknown[]) => void
    let resolveLatest!: (value: unknown[]) => void
    searchByTypeMock
      .mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveLatest = resolve }))

    renderPicker()
    const input = screen.getByTestId('doc-ref-search-input')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '문서' } })
    fireEvent.blur(input)
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(searchByTypeMock).not.toHaveBeenCalled()

    fireEvent.focus(input)
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(searchByTypeMock).toHaveBeenCalledTimes(1)

    fireEvent.blur(input)
    await act(async () => { await vi.advanceTimersByTimeAsync(120) })
    await act(async () => { resolveOld([journal('J-STALE')]) })
    expect(screen.queryByText('J-STALE')).toBeNull()

    fireEvent.focus(input)
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(searchByTypeMock).toHaveBeenCalledTimes(2)
    await act(async () => { resolveLatest([journal('J-LATEST')]) })
    expect(screen.getByText('J-LATEST')).toBeTruthy()
  })

  it('disabled 전환은 독립 in-flight 응답의 options/open/loading 갱신을 무효화한다', async () => {
    vi.useFakeTimers()
    const stale = deferred<unknown[]>()
    searchByTypeMock.mockReturnValue(stale.promise)
    const view = renderPicker()
    const input = screen.getByTestId('doc-ref-search-input')
    fireEvent.change(input, { target: { value: '문서' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(screen.getByRole('status', { name: '문서 검색 중' })).toBeTruthy()

    view.rerender(<DocumentReferencePicker value={emptyValue} onChange={vi.fn()} disabled />)
    await act(async () => { stale.resolve([journal('J-DISABLED')]) })
    expect(screen.queryByText('J-DISABLED')).toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByRole('status', { name: '문서 검색 중' })).toBeNull()
  })

  it('unmount 후 독립 in-flight 응답은 options/open/loading을 갱신하지 않는다', async () => {
    vi.useFakeTimers()
    const stale = deferred<unknown[]>()
    searchByTypeMock.mockReturnValue(stale.promise)
    const view = renderPicker()
    const input = screen.getByTestId('doc-ref-search-input')
    fireEvent.change(input, { target: { value: '문서' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(screen.getByRole('status', { name: '문서 검색 중' })).toBeTruthy()

    view.unmount()
    await act(async () => { stale.resolve([journal('J-UNMOUNT')]) })
  })

  it('외부 value 교체는 독립 in-flight 응답의 options/open/loading 갱신을 무효화한다', async () => {
    vi.useFakeTimers()
    const stale = deferred<unknown[]>()
    searchByTypeMock.mockReturnValue(stale.promise)
    const onChange = vi.fn()
    const view = render(<DocumentReferencePicker value={emptyValue} onChange={onChange} />)
    const input = screen.getByTestId('doc-ref-search-input')
    fireEvent.change(input, { target: { value: '문서' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(screen.getByRole('status', { name: '문서 검색 중' })).toBeTruthy()

    const externalValue: DocumentReferenceValue = {
      ...emptyValue,
      refDocNo: 'J-EXTERNAL',
      refDocLabel: '외부 교체값',
    }
    view.rerender(<DocumentReferencePicker value={externalValue} onChange={onChange} />)
    await act(async () => { stale.resolve([journal('J-VALUE-STALE')]) })
    expect((input as HTMLInputElement).value).toBe('J-EXTERNAL')
    expect(screen.queryByText('J-VALUE-STALE')).toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByRole('status', { name: '문서 검색 중' })).toBeNull()
  })

  it('Escape는 독립 in-flight 응답의 options/open/loading 갱신을 무효화한다', async () => {
    vi.useFakeTimers()
    const stale = deferred<unknown[]>()
    searchByTypeMock.mockReturnValue(stale.promise)
    renderPicker()
    const input = screen.getByTestId('doc-ref-search-input')
    fireEvent.change(input, { target: { value: '문서' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(screen.getByRole('status', { name: '문서 검색 중' })).toBeTruthy()

    fireEvent.keyDown(input, { key: 'Escape' })
    await act(async () => { stale.resolve([journal('J-ESCAPE')]) })
    expect(screen.queryByText('J-ESCAPE')).toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByRole('status', { name: '문서 검색 중' })).toBeNull()
  })

  it('stale reject는 최신 요청의 loading owner를 끄지 않는다', async () => {
    vi.useFakeTimers()
    const stale = deferred<unknown[]>()
    const latest = deferred<unknown[]>()
    searchByTypeMock
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(latest.promise)

    renderPicker()
    const input = screen.getByTestId('doc-ref-search-input')
    fireEvent.change(input, { target: { value: '문서A' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    fireEvent.change(input, { target: { value: '문서B' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(searchByTypeMock).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('status', { name: '문서 검색 중' })).toBeTruthy()

    await act(async () => {
      stale.reject(new Error('stale failure'))
      await Promise.resolve()
    })
    expect(screen.getByRole('status', { name: '문서 검색 중' })).toBeTruthy()
    expect(screen.queryByRole('listbox')).toBeNull()

    await act(async () => { latest.resolve([journal('J-LATEST-AFTER-REJECT')]) })
    expect(screen.getByText('J-LATEST-AFTER-REJECT')).toBeTruthy()
    expect(screen.queryByRole('status', { name: '문서 검색 중' })).toBeNull()
  })

  it('IME 조합 중 Arrow/Enter는 활성 후보와 선택을 건드리지 않고 조합 종료 후 정상 동작한다', async () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    searchByTypeMock.mockResolvedValue([journal('J-IME')])
    render(<DocumentReferencePicker value={emptyValue} onChange={onChange} />)

    const input = screen.getByTestId('doc-ref-search-input')
    fireEvent.change(input, { target: { value: '문서' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(screen.getByText('J-IME')).toBeTruthy()

    const activeId = input.getAttribute('aria-activedescendant')
    expect(activeId).not.toBeNull()
    fireEvent.keyDown(input, { key: 'ArrowDown', isComposing: true })
    fireEvent.keyDown(input, { key: 'ArrowUp', isComposing: true })
    expect(input.getAttribute('aria-activedescendant')).toBe(activeId)

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Enter', isComposing: false })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ refDocNo: 'J-IME' }))
  })

  it('유형 변경은 세대를 올려 이전 유형의 in-flight stale 응답이 옵션·open·loading 을 바꾸지 못한다', async () => {
    vi.useFakeTimers()
    let resolveStale!: (value: unknown[]) => void
    searchByTypeMock.mockImplementationOnce(() => new Promise((resolve) => { resolveStale = resolve }))

    renderPicker()
    const input = screen.getByTestId('doc-ref-search-input')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '문서' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(searchByTypeMock).toHaveBeenCalledTimes(1)
    // 검색 in-flight → 로딩 스피너 소유(세대 owner) 표시
    expect(screen.getByRole('status', { name: '문서 검색 중' })).toBeTruthy()

    // 유형 변경(handleTypeChange: requestId++·query=''·옵션 clear) — 이전 JOURNAL 검색은 stale.
    fireEvent.change(screen.getByTestId('doc-ref-type-select'), { target: { value: 'OUTBOUND_SLIP' } })

    // 이전 유형 응답이 뒤늦게 도착 → 세대 불일치로 폐기(옵션·open·loading 미변경).
    await act(async () => { resolveStale([journal('J-STALE')]) })
    expect(screen.queryByText('J-STALE')).toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByRole('status', { name: '문서 검색 중' })).toBeNull()
  })

  it('후보 선택은 세대를 올려 이전 in-flight stale 응답이 선택 후 옵션·open·loading 을 되살리지 못한다', async () => {
    vi.useFakeTimers()
    let resolveStale!: (value: unknown[]) => void
    let resolveFresh!: (value: unknown[]) => void
    searchByTypeMock
      .mockImplementationOnce(() => new Promise((resolve) => { resolveStale = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFresh = resolve }))

    renderPicker()
    const input = screen.getByTestId('doc-ref-search-input')
    fireEvent.focus(input)

    // 검색 A in-flight(미해결) — 이후 stale 이 될 이전 요청.
    fireEvent.change(input, { target: { value: '문서A' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    // 검색 B in-flight(최신) — A 는 여전히 미해결.
    fireEvent.change(input, { target: { value: '문서B' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(searchByTypeMock).toHaveBeenCalledTimes(2)

    // B 응답 → 후보 표시 → 후보 선택(selectOption: requestId++·옵션 clear·onChange).
    await act(async () => { resolveFresh([journal('J-FRESH')]) })
    fireEvent.mouseDown(screen.getByTestId('doc-ref-search-option'))
    expect(screen.queryByText('J-FRESH')).toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()

    // 이전 in-flight A 가 뒤늦게 도착 → 선택 후 세대 불일치로 폐기(옵션·open·loading 미변경).
    await act(async () => { resolveStale([journal('J-STALE')]) })
    expect(screen.queryByText('J-STALE')).toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByRole('status', { name: '문서 검색 중' })).toBeNull()
  })

  it('입력 clear(빈 query)는 세대를 올려 이전 in-flight stale 응답이 옵션·open·loading 을 되살리지 못한다', async () => {
    vi.useFakeTimers()
    let resolveStale!: (value: unknown[]) => void
    searchByTypeMock.mockImplementationOnce(() => new Promise((resolve) => { resolveStale = resolve }))

    renderPicker()
    const input = screen.getByTestId('doc-ref-search-input')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '문서' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    expect(searchByTypeMock).toHaveBeenCalledTimes(1)

    // 입력 clear(handleQueryChange('') + 빈 keyword effect: requestId++·옵션 clear·loading off).
    fireEvent.change(input, { target: { value: '' } })

    // 이전 in-flight 응답이 뒤늦게 도착 → 세대 불일치로 폐기.
    await act(async () => { resolveStale([journal('J-STALE')]) })
    expect(screen.queryByText('J-STALE')).toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.queryByRole('status', { name: '문서 검색 중' })).toBeNull()
  })
})
