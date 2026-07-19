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
})
