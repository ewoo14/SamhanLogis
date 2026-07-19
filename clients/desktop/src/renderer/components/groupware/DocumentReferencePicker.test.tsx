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

function renderPicker(value: DocumentReferenceValue = emptyValue) {
  return render(<DocumentReferencePicker value={value} onChange={vi.fn()} />)
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  searchByTypeMock.mockReset()
})

describe('DocumentReferencePicker 요청 세대 (#837)', () => {
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

  it('Escape와 disabled 전환은 in-flight 응답을 무효화하고 unmount 후 상태를 갱신하지 않는다', async () => {
    vi.useFakeTimers()
    let resolveSearch!: (value: unknown[]) => void
    searchByTypeMock.mockImplementation(() => new Promise((resolve) => { resolveSearch = resolve }))
    const view = renderPicker()
    const input = screen.getByTestId('doc-ref-search-input')
    fireEvent.change(input, { target: { value: '문서' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(300) })
    fireEvent.keyDown(input, { key: 'Escape' })
    await act(async () => { resolveSearch([journal('J-ESCAPE')]) })
    expect(screen.queryByText('J-ESCAPE')).toBeNull()

    view.rerender(<DocumentReferencePicker value={emptyValue} onChange={vi.fn()} disabled />)
    await act(async () => { resolveSearch([journal('J-DISABLED')]) })
    expect(screen.queryByText('J-DISABLED')).toBeNull()

    view.unmount()
    await act(async () => { resolveSearch([journal('J-UNMOUNT')]) })
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
