import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AsyncAutocomplete } from './AsyncAutocomplete'

interface Option {
  id: string
  label: string
}

describe('AsyncAutocomplete', () => {
  it('응답을 만든 검색어를 renderOption context로 전달하고 새 검색 시작 때 이전 후보를 비운다', async () => {
    const oldCandidate: Option = { id: 'old', label: '이전 후보' }
    const newCandidate: Option = { id: 'new', label: '새 후보' }
    let resolveOld: ((value: Option[]) => void) | undefined
    let resolveNew: ((value: Option[]) => void) | undefined
    const search = vi.fn<(q: string) => Promise<Option[]>>((q) => {
      if (q === 'old') {
        return new Promise((resolve) => {
          resolveOld = resolve
        })
      }
      return new Promise((resolve) => {
        resolveNew = resolve
      })
    })
    const renderQueries: string[] = []

    render(
      <AsyncAutocomplete<Option>
        value={null}
        onChange={vi.fn()}
        search={search}
        getKey={(item) => item.id}
        getInputLabel={(item) => item.label}
        renderOption={(item, context) => {
          renderQueries.push(`${item.id}:${context?.query ?? ''}`)
          return <span>{item.label}</span>
        }}
        listboxLabel="검색 목록"
        ariaLabel="검색"
        debounceMs={0}
      />,
    )

    const input = screen.getByRole('combobox', { name: '검색' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'old' } })
    await waitFor(() => expect(search).toHaveBeenCalledWith('old'))
    resolveOld?.([oldCandidate])
    await screen.findByText('이전 후보')
    expect(renderQueries).toContain('old:old')

    fireEvent.change(input, { target: { value: 'new' } })
    await waitFor(() => expect(search).toHaveBeenCalledWith('new'))
    expect(screen.queryByText('이전 후보')).toBeNull()

    resolveNew?.([newCandidate])
    await screen.findByText('새 후보')
    expect(renderQueries).toContain('new:new')
  })

  it('debounce 대기 중 직전 done/error 상태로 "검색 결과 없음"/stale 에러를 오표시하지 않고 "검색 중…"을 표시한다', async () => {
    // 기존 debounceMs=0 테스트는 대기 창이 없어 이 flash 를 못 잡는다 — 명시 debounce 로 검증.
    vi.useFakeTimers()
    try {
      const search = vi.fn<(q: string) => Promise<Option[]>>((q) =>
        q === 'err' ? Promise.reject(new Error('검색 실패')) : Promise.resolve([]),
      )

      render(
        <AsyncAutocomplete<Option>
          value={null}
          onChange={vi.fn()}
          search={search}
          getKey={(item) => item.id}
          getInputLabel={(item) => item.label}
          renderOption={(item) => <span>{item.label}</span>}
          listboxLabel="검색 목록"
          ariaLabel="검색"
          debounceMs={250}
        />,
      )

      const input = screen.getByRole('combobox', { name: '검색' })
      fireEvent.focus(input)

      // 1) 빈 결과 검색 완료 → status='done' + "검색 결과 없음" 도달
      fireEvent.change(input, { target: { value: 'none' } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250)
      })
      expect(screen.getByText('검색 결과 없음')).toBeTruthy()

      // 2) 새 키입력 — debounce 250ms 대기 중 직전 'done' 이 남아
      //    "검색 결과 없음" 이 flash 되면 안 되고 "검색 중…" 이 떠야 한다.
      fireEvent.change(input, { target: { value: 'err' } })
      expect(screen.queryByText('검색 결과 없음')).toBeNull()
      expect(screen.getByText('검색 중…')).toBeTruthy()

      // 3) 검색 실패 → status='error' + 에러행 도달
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250)
      })
      expect(screen.getByText('검색 중 오류가 발생했습니다.')).toBeTruthy()

      // 4) 새 키입력 — debounce 대기 중 stale 에러행이 남으면 안 된다.
      fireEvent.change(input, { target: { value: 'next' } })
      expect(screen.queryByText('검색 중 오류가 발생했습니다.')).toBeNull()
      expect(screen.getByText('검색 중…')).toBeTruthy()

      // debounce 만료 전이므로 서버 재호출은 아직 없다 — 순수 대기 창 상태 검증.
      expect(search).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('Escape 후 닫힌 자동완성은 spinner를 숨기고 재포커스 시 이전 debounce 검색을 부활시키지 않는다', async () => {
    vi.useFakeTimers()
    try {
      const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([
        { id: 'old', label: '이전 후보' },
      ])

      render(
        <AsyncAutocomplete<Option>
          value={null}
          onChange={vi.fn()}
          search={search}
          getKey={(item) => item.id}
          getInputLabel={(item) => item.label}
          renderOption={(item) => <span>{item.label}</span>}
          listboxLabel="검색 목록"
          ariaLabel="검색"
          debounceMs={250}
        />,
      )

      const input = screen.getByRole('combobox', { name: '검색' })
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'old' } })
      expect(input.parentElement?.querySelector('[aria-hidden="true"]')).toBeTruthy()

      fireEvent.keyDown(input, { key: 'Escape' })
      expect(input.getAttribute('aria-expanded')).toBe('false')
      expect(input.parentElement?.querySelector('[aria-hidden="true"]')).toBeNull()

      fireEvent.focus(input)
      expect((input as HTMLInputElement).value).toBe('')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250)
      })

      expect(search).not.toHaveBeenCalled()
      expect(screen.queryByText('이전 후보')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('dropdown listbox 를 body portal 로 렌더해 overflow 컨테이너 클리핑을 피한다', async () => {
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([
      { id: 'p-1', label: '삼한테스트상사' },
    ])

    const view = render(
      <div style={{ height: 48, overflow: 'auto' }}>
        <AsyncAutocomplete<Option>
          value={null}
          onChange={vi.fn()}
          search={search}
          getKey={(item) => item.id}
          getInputLabel={(item) => item.label}
          renderOption={(item) => <span>{item.label}</span>}
          listboxLabel="거래처 목록"
          ariaLabel="거래처"
          debounceMs={0}
        />
      </div>,
    )

    fireEvent.focus(screen.getByRole('combobox', { name: '거래처' }))
    fireEvent.change(screen.getByRole('combobox', { name: '거래처' }), {
      target: { value: '삼한' },
    })

    await screen.findByRole('listbox', { name: '거래처 목록' })

    await waitFor(() => expect(search).toHaveBeenCalledWith('삼한'))
    expect(Array.from(document.body.children).some((child) => (
      child.getAttribute('role') === 'listbox'
      && child.getAttribute('aria-label') === '거래처 목록'
    ))).toBe(true)
    expect(view.container.querySelector('[role="listbox"]')).toBeNull()
  })

  it('open 상태에서 disabled 로 플립되면 선택 라벨을 복원하고 aria-expanded 를 내린다 (R8-QA-9)', () => {
    const selected: Option = { id: 'p-4', label: '한일냉동기술' }
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([])

    const view = render(
      <AsyncAutocomplete<Option>
        value={selected}
        onChange={vi.fn()}
        search={search}
        getKey={(item) => item.id}
        getInputLabel={(item) => item.label}
        renderOption={(item) => <span>{item.label}</span>}
        listboxLabel="거래처 목록"
        ariaLabel="거래처"
        disabled={false}
      />,
    )

    const input = screen.getByRole('combobox', { name: '거래처' }) as HTMLInputElement

    // 포커스 → open + draft='' → 표시값이 빈칸(전표 수정 진입 순간 재현)
    fireEvent.focus(input)
    expect(input.value).toBe('')
    expect(input.getAttribute('aria-expanded')).toBe('true')

    // disabled 로 플립(coedit provider 로딩) — React 는 disabled 요소에 onBlur 미발화
    view.rerender(
      <AsyncAutocomplete<Option>
        value={selected}
        onChange={vi.fn()}
        search={search}
        getKey={(item) => item.id}
        getInputLabel={(item) => item.label}
        renderOption={(item) => <span>{item.label}</span>}
        listboxLabel="거래처 목록"
        ariaLabel="거래처"
        disabled
      />,
    )

    // disabled 감지 effect 가 open 을 닫아 selectedLabel 이 복원돼야 한다.
    expect(input.value).toBe('한일냉동기술')
    expect(input.getAttribute('aria-expanded')).toBe('false')
  })
})
