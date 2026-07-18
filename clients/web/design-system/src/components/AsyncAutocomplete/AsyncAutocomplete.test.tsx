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

  it('debounce 대기 중 직전 후보를 유지하고 "검색 결과 없음" false-empty 를 오표시하지 않는다', async () => {
    // #825 CI 회귀 fix — "listbox 표시 ⟹ 후보 존재" 불변식:
    // debounce 대기 창에는 직전 후보가 그대로 유지되고(빈 후보 + "검색 중…" listbox 금지),
    // loading 전환·후보 교체는 performSearch 실행 시점에 원자적으로 일어난다.
    vi.useFakeTimers()
    try {
      const resultsByQuery: Record<string, Option[]> = {
        first: [{ id: 'first', label: '첫 후보' }],
        second: [{ id: 'second', label: '둘째 후보' }],
        none: [],
      }
      const search = vi.fn<(q: string) => Promise<Option[]>>((q) =>
        Promise.resolve(resultsByQuery[q] ?? []),
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

      // 1) 첫 검색 완료 → 후보 표시 (status='done')
      fireEvent.change(input, { target: { value: 'first' } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250)
      })
      expect(screen.getByText('첫 후보')).toBeTruthy()
      expect(search).toHaveBeenCalledTimes(1)

      // 2) 새 키입력 — debounce 250ms 대기 중 직전 후보가 유지되고
      //    "검색 결과 없음"(false-empty)도 "검색 중…"(빈 loading listbox)도 뜨지 않는다.
      fireEvent.change(input, { target: { value: 'second' } })
      expect(screen.getByText('첫 후보')).toBeTruthy()
      expect(screen.queryByText('검색 결과 없음')).toBeNull()
      expect(screen.queryByText('검색 중…')).toBeNull()
      // debounce 만료 전이므로 서버 재호출도 아직 없다 — 순수 대기 창 상태 검증.
      expect(search).toHaveBeenCalledTimes(1)

      // 3) debounce 만료 → 새 검색 실행 → 후보 원자 교체
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250)
      })
      expect(screen.getByText('둘째 후보')).toBeTruthy()
      expect(screen.queryByText('첫 후보')).toBeNull()
      expect(search).toHaveBeenCalledTimes(2)

      // 4) 빈 결과 쿼리 입력 — 대기 중엔 직전 후보 유지, "검색 결과 없음"은
      //    검색이 실제로 완료된 뒤에만 나타난다 (genuine empty ≠ false-empty).
      fireEvent.change(input, { target: { value: 'none' } })
      expect(screen.getByText('둘째 후보')).toBeTruthy()
      expect(screen.queryByText('검색 결과 없음')).toBeNull()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250)
      })
      expect(screen.queryByText('둘째 후보')).toBeNull()
      expect(screen.getByText('검색 결과 없음')).toBeTruthy()
      expect(search).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
    }
  })

  it('Escape 후 닫힌 자동완성은 spinner를 숨기고 재포커스 시 이전 debounce 검색을 부활시키지 않는다', async () => {
    vi.useFakeTimers()
    try {
      let resolveSearch: ((value: Option[]) => void) | undefined
      const search = vi.fn<(q: string) => Promise<Option[]>>(
        () =>
          new Promise((resolve) => {
            resolveSearch = resolve
          }),
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

      // ── phase 1: debounce 대기 중 Escape → 예약된 검색이 재포커스로 부활하지 않는다
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: 'old' } })
      // #825 fix: debounce 대기 창은 loading 이 아니므로 spinner 미표시.
      expect(input.parentElement?.querySelector('[aria-hidden="true"]')).toBeNull()

      fireEvent.keyDown(input, { key: 'Escape' })
      expect(input.getAttribute('aria-expanded')).toBe('false')

      fireEvent.focus(input)
      expect((input as HTMLInputElement).value).toBe('')
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250)
      })

      expect(search).not.toHaveBeenCalled()
      expect(screen.queryByText('이전 후보')).toBeNull()

      // ── phase 2: 실제 검색 in-flight 중에는 spinner 표시 → Escape 로 숨기고
      //             뒤늦게 도착한 stale 응답은 폐기된다
      fireEvent.change(input, { target: { value: 'old' } })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250)
      })
      expect(search).toHaveBeenCalledTimes(1)
      expect(input.parentElement?.querySelector('[aria-hidden="true"]')).toBeTruthy()
      expect(screen.getByText('검색 중…')).toBeTruthy()

      fireEvent.keyDown(input, { key: 'Escape' })
      expect(input.getAttribute('aria-expanded')).toBe('false')
      expect(input.parentElement?.querySelector('[aria-hidden="true"]')).toBeNull()

      await act(async () => {
        resolveSearch?.([{ id: 'old', label: '이전 후보' }])
      })
      expect(screen.queryByText('이전 후보')).toBeNull()
      expect(input.getAttribute('aria-expanded')).toBe('false')
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

  it('활성 옵션을 index 기반 opaque id로 가리키고 UUID나 업무키를 DOM id에 넣지 않는다', async () => {
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([
      { id: '550e8400-e29b-41d4-a716-446655440000', label: '상품 A' },
      { id: 'PRODUCT-CODE-002', label: '상품 B' },
    ])

    render(
      <AsyncAutocomplete<Option>
        value={null}
        onChange={vi.fn()}
        search={search}
        getKey={(item) => item.id}
        getInputLabel={(item) => item.label}
        renderOption={(item) => <span>{item.label}</span>}
        listboxLabel="상품 목록"
        ariaLabel="상품"
        debounceMs={0}
      />,
    )

    const input = screen.getByRole('combobox', { name: '상품' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '상품' } })

    const options = await screen.findAllByRole('option', { name: /상품/ })
    fireEvent.keyDown(input, { key: 'ArrowDown' })

    const activeId = input.getAttribute('aria-activedescendant')
    expect(activeId).toBe(options[0]!.id)
    expect(document.getElementById(activeId!)?.getAttribute('role')).toBe('option')
    expect(activeId).toMatch(/^ds-aac-list-.*-opt-0$/)
    expect(activeId).not.toContain('550e8400-e29b-41d4-a716-446655440000')
    expect(activeId).not.toContain('PRODUCT-CODE-002')
    expect(options[0]!.id).toMatch(/^ds-aac-list-.*-opt-0$/)
    expect(options[1]!.id).toMatch(/^ds-aac-list-.*-opt-1$/)
  })

  it('ArrowDown으로 활성화한 정확한 객체를 Enter로 선택한다', async () => {
    const first: Option = { id: 'first', label: '첫 상품' }
    const second: Option = { id: 'second', label: '둘째 상품' }
    const onChange = vi.fn()
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([first, second])

    render(
      <AsyncAutocomplete<Option>
        value={null}
        onChange={onChange}
        search={search}
        getKey={(item) => item.id}
        getInputLabel={(item) => item.label}
        renderOption={(item) => <span>{item.label}</span>}
        listboxLabel="상품 목록"
        ariaLabel="상품"
        debounceMs={0}
      />,
    )

    const input = screen.getByRole('combobox', { name: '상품' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '상품' } })
    await screen.findByText('둘째 상품')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(second)
  })

  it('getKey는 React key와 선택 동일성에 쓰이는 유일 키라는 소비자 계약을 따른다', async () => {
    const first: Option = { id: 'unique-1', label: '첫 상품' }
    const second: Option = { id: 'unique-2', label: '둘째 상품' }
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([first, second])

    render(
      <AsyncAutocomplete<Option>
        value={first}
        onChange={vi.fn()}
        search={search}
        getKey={(item) => item.id}
        getInputLabel={(item) => item.label}
        renderOption={(item) => <span>{item.label}</span>}
        listboxLabel="상품 목록"
        ariaLabel="상품"
        debounceMs={0}
      />,
    )

    const input = screen.getByRole('combobox', { name: '상품' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '상품' } })

    const options = await screen.findAllByRole('option', { name: /상품/ })
    expect(new Set([first.id, second.id]).size).toBe(2)
    expect(options[0]!.getAttribute('aria-selected')).toBe('true')
    expect(options[1]!.getAttribute('aria-selected')).toBe('false')
  })
})
