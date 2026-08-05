import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { AsyncAutocomplete } from './AsyncAutocomplete'

interface Option {
  id: string
  label: string
}

describe('AsyncAutocomplete', () => {
  it('결과 모달로 이동하는 blur에서는 소비자 exact lookup을 호출하지 않는다', async () => {
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([
      { id: 'first', label: 'AJ 첫 품목' },
      { id: 'second', label: 'AJ 둘째 품목' },
    ])
    const onInputBlur = vi.fn()

    render(
      <AsyncAutocomplete<Option>
        value={null}
        onChange={vi.fn()}
        onInputBlur={onInputBlur}
        search={search}
        getKey={(item) => item.id}
        getInputLabel={(item) => item.label}
        renderOption={(item) => <span>{item.label}</span>}
        listboxLabel="품목 목록"
        ariaLabel="품목"
        resultSelectionMode="single"
        debounceMs={0}
      />,
    )

    const input = screen.getByRole('combobox', { name: '품목' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'AJ' } })
    await screen.findByRole('dialog', { name: '검색 결과 선택' })
    fireEvent.blur(input)

    expect(onInputBlur).not.toHaveBeenCalled()
  })

  it('모달 취소 직후 검색어는 남지만 필드 왕복 후에는 정리된다', async () => {
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([
      { id: 'first', label: 'AJ 첫 품목' },
      { id: 'second', label: 'AJ 둘째 품목' },
    ])

    render(
      <div>
        <AsyncAutocomplete<Option>
          value={null}
          onChange={vi.fn()}
          search={search}
          getKey={(item) => item.id}
          getInputLabel={(item) => item.label}
          renderOption={(item) => <span>{item.label}</span>}
          listboxLabel="품목 목록"
          ariaLabel="품목"
          resultSelectionMode="multiple"
          resultSelectionTitle="품목 검색 결과"
          debounceMs={0}
        />
        <button type="button">다른 필드</button>
      </div>,
    )

    const input = screen.getByRole('combobox', { name: '품목' }) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'AJ' } })
    await screen.findByRole('dialog', { name: '품목 검색 결과' })

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(input.value).toBe('AJ')
    // Modal이 복원하는 첫 focus를 명시적으로 재현한다 — 이 1회는 검색어를 보존해야 한다.
    fireEvent.focus(input)
    expect(input.value).toBe('AJ')

    fireEvent.blur(input)
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 140))
    })
    fireEvent.focus(screen.getByRole('button', { name: '다른 필드' }))
    fireEvent.focus(input)

    expect(input.value).toBe('')
  })

  it.each([
    { caseName: '값 없음·콜백 없음', selected: null, withCommitCallback: false },
    { caseName: '값 없음·콜백 있음', selected: null, withCommitCallback: true },
    { caseName: '값 있음·콜백 없음', selected: { id: 'selected', label: '확정 품목' }, withCommitCallback: false },
    { caseName: '값 있음·콜백 있음', selected: { id: 'selected', label: '확정 품목' }, withCommitCallback: true },
  ])('R27 모달 취소 후 복원은 $caseName 조합에서 검색어를 보존한다', async ({ selected, withCommitCallback }) => {
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([
      { id: 'first', label: 'AJ 첫 품목' },
      { id: 'second', label: 'AJ 둘째 품목' },
    ])

    function ControlledAutocomplete() {
      const [value, setValue] = useState<Option | null>(selected)
      return (
        <AsyncAutocomplete<Option>
          value={value}
          onChange={setValue}
          onInputCommitChange={withCommitCallback
            ? (committed) => {
              if (!committed) setValue(null)
            }
            : undefined}
          search={search}
          getKey={(item) => item.id}
          getInputLabel={(item) => item.label}
          renderOption={(item) => <span>{item.label}</span>}
          listboxLabel="품목 목록"
          ariaLabel="품목"
          resultSelectionMode="multiple"
          resultSelectionTitle="품목 검색 결과"
          debounceMs={0}
        />
      )
    }

    render(<ControlledAutocomplete />)
    const input = screen.getByRole('combobox', { name: '품목' }) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'AJ' } })
    await screen.findByRole('dialog', { name: '품목 검색 결과' })

    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.focus(input)

    expect(input.value).toBe('AJ')
  })

  it('검색 중 행은 비활성 option으로 노출되어 키보드 선택 대상이 아님을 알린다', async () => {
    let resolveSearch: ((value: Option[]) => void) | undefined
    const search = vi.fn<(q: string) => Promise<Option[]>>(
      () => new Promise((resolve) => { resolveSearch = resolve }),
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
        debounceMs={0}
      />,
    )

    const input = screen.getByRole('combobox', { name: '검색' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '검색어' } })
    await waitFor(() => expect(search).toHaveBeenCalledWith('검색어'))

    const loadingOption = await screen.findByRole('option', { name: '검색 중…' })
    expect(loadingOption.getAttribute('aria-disabled')).toBe('true')
    resolveSearch?.([])
  })

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
    // 포커스만으로 listbox가 생성되지는 않으므로 실제 listbox 존재와 정합해야 한다.
    expect(input.getAttribute('aria-expanded')).toBe('false')

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

  it('IME 조합 중 Arrow/Enter는 활성 후보와 선택을 건드리지 않고 조합 종료 후 정상 동작한다', async () => {
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

    fireEvent.keyDown(input, { key: 'ArrowDown', isComposing: false })
    const activeId = input.getAttribute('aria-activedescendant')
    expect(activeId).not.toBeNull()

    fireEvent.keyDown(input, { key: 'ArrowDown', isComposing: true })
    fireEvent.keyDown(input, { key: 'ArrowUp', isComposing: true })
    expect(input.getAttribute('aria-activedescendant')).toBe(activeId)

    fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Enter', isComposing: false })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(first)
  })

  it('getKey는 React key와 선택 동일성(aria-selected + optionSelected class)에 쓰이는 유일 키라는 소비자 계약을 따른다', async () => {
    const first: Option = { id: 'unique-1', label: '첫 상품' }
    const second: Option = { id: 'unique-2', label: '둘째 상품' }
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([first, second])

    // value 는 첫 후보와 "별개 객체 리터럴 + 동일 getKey" 로 준다 — 서버 재조회로 매번 새
    // 객체가 오는 실사용 형태. 참조동일성(value === item) 구현은 이 쌍에서 false 가 되므로
    // 선택 표시(aria-selected·optionSelected class)는 getKey 비교로만 true 가 될 수 있다
    // (tautology 해소 — 동일 레퍼런스를 넘기면 참조비교 회귀도 GREEN 으로 통과해 버린다).
    const selectedTwin: Option = { id: 'unique-1', label: '첫 상품' }
    expect(selectedTwin).not.toBe(first)

    render(
      <AsyncAutocomplete<Option>
        value={selectedTwin}
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
    // 두 채널 모두 단언 — 스크린리더(aria-selected)와 시각 강조(optionSelected class).
    // 한 채널만 검증하면 나머지 채널 분기가 참조비교로 회귀해도 GREEN 이 된다
    // (#825 CODEX LOW: class 분기만 value === item 으로 변이 시 기존 테스트 미포착).
    expect(options[0]!.getAttribute('aria-selected')).toBe('true')
    expect(options[1]!.getAttribute('aria-selected')).toBe('false')
    expect(options[0]!.className).toContain('optionSelected')
    expect(options[1]!.className).not.toContain('optionSelected')
  })

  it('committed 출력은 이름이 아니라 getKey 기반 선택 상태와 편집 상태를 반영한다', async () => {
    const first: Option = { id: 'p-1', label: '같은 이름' }
    const second: Option = { id: 'p-2', label: '같은 이름' }
    const onChange = vi.fn()
    const onCommitChange = vi.fn()
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([second])

    const view = render(
      <AsyncAutocomplete<Option>
        value={first}
        onChange={onChange}
        onInputCommitChange={onCommitChange}
        search={search}
        getKey={(item) => item.id}
        getInputLabel={(item) => item.label}
        renderOption={(item) => <span>{item.label}</span>}
        listboxLabel="검색 목록"
        ariaLabel="검색"
        debounceMs={0}
      />,
    )

    const input = screen.getByRole('combobox', { name: '검색' })
    fireEvent.focus(input)
    expect(onCommitChange).toHaveBeenLastCalledWith(true)

    // P1 이름과 같은 문자열이어도 실제 후보 선택이 아니면 미확정이다.
    fireEvent.change(input, { target: { value: first.label } })
    expect(onCommitChange).toHaveBeenCalledWith(false)

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onCommitChange).toHaveBeenLastCalledWith(true)

    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '같은' } })
    fireEvent.mouseDown(await screen.findByRole('option', { name: '같은 이름' }))
    expect(onChange).toHaveBeenCalledWith(second)
    expect(onCommitChange).toHaveBeenLastCalledWith(true)

    view.rerender(
      <AsyncAutocomplete<Option>
        value={second}
        onChange={onChange}
        onInputCommitChange={onCommitChange}
        search={search}
        getKey={(item) => item.id}
        getInputLabel={(item) => item.label}
        renderOption={(item) => <span>{item.label}</span>}
        listboxLabel="검색 목록"
        ariaLabel="검색"
        debounceMs={0}
      />,
    )
    expect((input as HTMLInputElement).value).toBe(second.label)
  })

  it('R23 RED-B1 확정값에 단순 포커스 후 blur해도 committed와 선택을 해제하지 않는다', async () => {
    const selected: Option = { id: 'selected', label: '확정 품목' }
    const onChange = vi.fn()
    const onCommitChange = vi.fn()
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([])

    render(
      <AsyncAutocomplete<Option>
        value={selected}
        onChange={onChange}
        onInputCommitChange={onCommitChange}
        search={search}
        getKey={(item) => item.id}
        getInputLabel={(item) => item.label}
        renderOption={(item) => <span>{item.label}</span>}
        listboxLabel="품목 목록"
        ariaLabel="품목"
      />,
    )

    const input = screen.getByRole('combobox', { name: '품목' })
    expect(onCommitChange).toHaveBeenLastCalledWith(true)

    fireEvent.focus(input)
    fireEvent.blur(input)
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 140))
    })

    expect(onCommitChange).toHaveBeenLastCalledWith(true)
    expect(onChange).not.toHaveBeenCalled()
    expect((input as HTMLInputElement).value).toBe(selected.label)
  })

  it('R23 RED-A1 입력을 실제로 비우면 확정 해제 콜백을 보내 품목을 지울 수 있다', async () => {
    const selected: Option = { id: 'selected', label: '확정 품목' }
    const onChange = vi.fn()
    const onCommitChange = vi.fn()
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([])

    render(
      <AsyncAutocomplete<Option>
        value={selected}
        onChange={onChange}
        onInputCommitChange={onCommitChange}
        search={search}
        getKey={(item) => item.id}
        getInputLabel={(item) => item.label}
        renderOption={(item) => <span>{item.label}</span>}
        listboxLabel="품목 목록"
        ariaLabel="품목"
      />,
    )

    const input = screen.getByRole('combobox', { name: '품목' })
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 140))
    })

    expect(onCommitChange).toHaveBeenCalledWith(false)
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('R27 A1 확정값에 포커스만 했다가 blur해도 선택을 유지한다', async () => {
    const selected: Option = { id: 'selected', label: '확정 품목' }
    const onChange = vi.fn()
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([])

    render(
      <AsyncAutocomplete<Option>
        value={selected}
        onChange={onChange}
        search={search}
        getKey={(item) => item.id}
        getInputLabel={(item) => item.label}
        renderOption={(item) => <span>{item.label}</span>}
        listboxLabel="품목 목록"
        ariaLabel="품목"
      />,
    )

    const input = screen.getByRole('combobox', { name: '품목' }) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.blur(input)
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 140))
    })

    expect(onChange).not.toHaveBeenCalled()
    expect(input.value).toBe(selected.label)
  })

  it('R27 A2 확정값을 실제로 지우고 blur하면 선택을 해제한다', async () => {
    const selected: Option = { id: 'selected', label: '확정 품목' }
    const onChange = vi.fn()
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([])

    function ControlledAutocomplete() {
      const [value, setValue] = useState<Option | null>(selected)
      return (
        <AsyncAutocomplete<Option>
          value={value}
          onChange={(next) => {
            onChange(next)
            setValue(next)
          }}
          search={search}
          getKey={(item) => item.id}
          getInputLabel={(item) => item.label}
          renderOption={(item) => <span>{item.label}</span>}
          listboxLabel="품목 목록"
          ariaLabel="품목"
        />
      )
    }

    render(<ControlledAutocomplete />)
    const input = screen.getByRole('combobox', { name: '품목' }) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '지울 검색어' } })
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 140))
    })

    expect(onChange).toHaveBeenCalledWith(null)
    expect(input.value).toBe('')
  })

  it.each(['Backspace', 'Delete'])('R28 B 확정값을 바로 %s로 지우고 blur하면 선택을 해제한다', async (key) => {
    const selected: Option = { id: 'selected', label: '확정 품목' }
    const onChange = vi.fn()
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([])

    function ControlledAutocomplete() {
      const [value, setValue] = useState<Option | null>(selected)
      return (
        <AsyncAutocomplete<Option>
          value={value}
          onChange={(next) => {
            onChange(next)
            setValue(next)
          }}
          search={search}
          getKey={(item) => item.id}
          getInputLabel={(item) => item.label}
          renderOption={(item) => <span>{item.label}</span>}
          listboxLabel="품목 목록"
          ariaLabel="품목"
        />
      )
    }

    render(<ControlledAutocomplete />)

    const input = screen.getByRole('combobox', { name: '품목' }) as HTMLInputElement
    fireEvent.focus(input)
    expect(input.value).toBe('')
    fireEvent.keyDown(input, { key })
    fireEvent.blur(input)
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 140))
    })

    expect(onChange).toHaveBeenCalledWith(null)
    expect(input.value).toBe('')
  })

  it('R27 A3 확정값 위에 AJ를 입력하면 AJ가 첫 글자부터 유지된다', () => {
    const selected: Option = { id: 'selected', label: '확정 품목' }
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([])

    function ControlledAutocomplete() {
      const [value, setValue] = useState<Option | null>(selected)
      return (
        <AsyncAutocomplete<Option>
          value={value}
          onChange={setValue}
          onInputCommitChange={(committed) => {
            if (!committed) setValue(null)
          }}
          search={search}
          getKey={(item) => item.id}
          getInputLabel={(item) => item.label}
          renderOption={(item) => <span>{item.label}</span>}
          listboxLabel="품목 목록"
          ariaLabel="품목"
          debounceMs={0}
        />
      )
    }

    render(<ControlledAutocomplete />)
    const input = screen.getByRole('combobox', { name: '품목' }) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'AJ' } })

    expect(input.value).toBe('AJ')
  })

  it('R27 A3 콜백 없이도 확정값 위에 AJ를 입력하면 AJ가 유지된다', () => {
    const selected: Option = { id: 'selected', label: '확정 품목' }
    const onChange = vi.fn()
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([])

    render(
      <AsyncAutocomplete<Option>
        value={selected}
        onChange={onChange}
        search={search}
        getKey={(item) => item.id}
        getInputLabel={(item) => item.label}
        renderOption={(item) => <span>{item.label}</span>}
        listboxLabel="품목 목록"
        ariaLabel="품목"
        debounceMs={0}
      />,
    )

    const input = screen.getByRole('combobox', { name: '품목' }) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'AJ' } })

    expect(input.value).toBe('AJ')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('R28 단일 후보 자동확정은 단일 선택에서도 값을 확정한다', async () => {
    const only: Option = { id: 'only', label: '유일 품목' }
    const onChange = vi.fn()
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([only])

    render(
      <AsyncAutocomplete<Option>
        value={null}
        onChange={onChange}
        search={search}
        getKey={(item) => item.id}
        getInputLabel={(item) => item.label}
        renderOption={(item) => <span>{item.label}</span>}
        listboxLabel="품목 목록"
        ariaLabel="품목"
        resultSelectionMode="single"
        autoSelectSingleResult
        debounceMs={0}
      />,
    )

    const input = screen.getByRole('combobox', { name: '품목' }) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '유일' } })

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(only))
    expect(input.value).toBe(only.label)
    expect(screen.queryByRole('option')).toBeNull()
  })

  it('R23 RED-A2 후보 1건은 단일 선택 모달 없이 종전 listbox 선택을 유지한다', async () => {
    const only: Option = { id: 'only', label: '유일 품목' }
    const onChange = vi.fn()
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([only])

    render(
      <AsyncAutocomplete<Option>
        value={null}
        onChange={onChange}
        search={search}
        getKey={(item) => item.id}
        getInputLabel={(item) => item.label}
        renderOption={(item) => <span>{item.label}</span>}
        listboxLabel="품목 목록"
        ariaLabel="품목"
        resultSelectionMode="single"
        debounceMs={0}
      />,
    )

    const input = screen.getByRole('combobox', { name: '품목' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '유일' } })

    const option = await screen.findByRole('option', { name: '유일 품목' })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.mouseDown(option)

    expect(onChange).toHaveBeenCalledWith(only)
  })

  it('외부 controlled value 교체는 편집을 닫고 새 표시값과 committed 상태를 동기화한다', () => {
    const first: Option = { id: 'p-1', label: '첫 거래처' }
    const second: Option = { id: 'p-2', label: '둘째 거래처' }
    const onCommitChange = vi.fn()
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([])

    const view = render(
      <AsyncAutocomplete<Option>
        value={first}
        onChange={vi.fn()}
        onInputCommitChange={onCommitChange}
        search={search}
        getKey={(item) => item.id}
        getInputLabel={(item) => item.label}
        renderOption={(item) => <span>{item.label}</span>}
        listboxLabel="검색 목록"
        ariaLabel="검색"
      />,
    )
    const input = screen.getByRole('combobox', { name: '검색' }) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '편집 중' } })

    view.rerender(
      <AsyncAutocomplete<Option>
        value={second}
        onChange={vi.fn()}
        onInputCommitChange={onCommitChange}
        search={search}
        getKey={(item) => item.id}
        getInputLabel={(item) => item.label}
        renderOption={(item) => <span>{item.label}</span>}
        listboxLabel="검색 목록"
        ariaLabel="검색"
      />,
    )

    expect(input.value).toBe(second.label)
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(onCommitChange).toHaveBeenLastCalledWith(true)
  })

  it('stale 후보는 키보드와 마우스 선택을 모두 차단하고 aria-disabled를 표시한다', async () => {
    const old: Option = { id: 'old', label: '이전 후보' }
    const onChange = vi.fn()
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([old])

    render(
      <AsyncAutocomplete<Option>
        value={null}
        onChange={onChange}
        search={search}
        getKey={(item) => item.id}
        getInputLabel={(item) => item.label}
        renderOption={(item) => <span>{item.label}</span>}
        listboxLabel="검색 목록"
        ariaLabel="검색"
        debounceMs={0}
      />,
    )
    const input = screen.getByRole('combobox', { name: '검색' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'old' } })
    await screen.findByText('이전 후보')

    fireEvent.change(input, { target: { value: 'new' } })
    const option = screen.getByRole('option', { name: '이전 후보' })
    expect(option.getAttribute('aria-disabled')).toBe('true')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input.getAttribute('aria-activedescendant')).toBeNull()
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.mouseDown(option)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('빈 결과와 오류 상태는 실제 listbox가 없으면 aria-expanded를 false로 유지한다', async () => {
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([])
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
        debounceMs={0}
      />,
    )
    const input = screen.getByRole('combobox', { name: '검색' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '없음' } })
    await screen.findByText('검색 결과 없음')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.getAttribute('aria-controls')).toBeNull()
  })

  it('blur exact 후보가 복수면 onChange 없이 미선택 상태를 유지한다', async () => {
    const duplicateA: Option = { id: 'p-1', label: '동명 거래처' }
    const duplicateB: Option = { id: 'p-2', label: '동명 거래처' }
    const onChange = vi.fn()
    const search = vi.fn<(q: string) => Promise<Option[]>>().mockResolvedValue([duplicateA, duplicateB])

    vi.useFakeTimers()
    try {
      render(
        <AsyncAutocomplete<Option>
          value={null}
          onChange={onChange}
          search={search}
          getKey={(item) => item.id}
          getInputLabel={(item) => item.label}
          renderOption={(item) => <span>{item.id} {item.label}</span>}
          listboxLabel="검색 목록"
          ariaLabel="검색"
          debounceMs={0}
        />,
      )
      const input = screen.getByRole('combobox', { name: '검색' }) as HTMLInputElement
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: '동명' } })
      await act(async () => {
        await vi.runAllTimersAsync()
      })
      expect(screen.getAllByText(/동명 거래처/).length).toBe(2)
      fireEvent.change(input, { target: { value: '동명 거래처' } })
      fireEvent.blur(input)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(130)
      })

      expect(onChange).not.toHaveBeenCalled()
      expect(input.value).toBe('')
    } finally {
      vi.useRealTimers()
    }
  })

  it('검색 오류(reject) 후 새 유효 입력은 즉시 idle 로 중화하고 errorMsg 를 제거한다 (error→retry)', async () => {
    // #834 D-B1A-02 B/E — terminal 'error' 는 새 입력에서 즉시 중화되어야 한다.
    // 첫 검색은 reject → error 표시, 둘째 검색은 성공 후보.
    const hit: Option = { id: 'hit', label: '검색 성공 후보' }
    const search = vi
      .fn<(q: string) => Promise<Option[]>>()
      .mockRejectedValueOnce(new Error('서버 오류'))
      .mockResolvedValueOnce([hit])

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
        debounceMs={0}
      />,
    )

    const input = screen.getByRole('combobox', { name: '검색' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '오류' } })

    // reject → error 상태·errorMsg. 에러 안내는 실제 listbox 가 아니므로 aria-expanded 는 false.
    await screen.findByText('검색 중 오류가 발생했습니다.')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.getAttribute('aria-controls')).toBeNull()

    // 새 유효 입력 — handleChange 가 동기적으로 status='idle' 로 중화해 errorMsg 안내가 즉시 사라진다.
    // (performSearch 는 debounce 매크로태스크라 이 시점엔 미실행 → 순수 동기 중화만 관측한다.
    //  중화가 없으면 errorMsg 가 잔존해 error→retry 대신 stale error 가 새 검색을 오염시킨다.)
    fireEvent.change(input, { target: { value: '성공' } })
    expect(screen.queryByText('검색 중 오류가 발생했습니다.')).toBeNull()

    // 재검색 hit → 후보 listbox 로 전이(error→retry 완료), aria-expanded 는 실제 listbox 존재와 정합.
    await screen.findByText('검색 성공 후보')
    expect(input.getAttribute('aria-expanded')).toBe('true')
  })

  it('빈 결과(done·후보 0) 후 새 유효 입력은 즉시 idle 로 중화하고 새 후보로 전이한다 (empty→hit)', async () => {
    // #834 D-B1A-02 B/E — terminal 'done+빈 후보'(검색 결과 없음)도 새 입력에서 즉시 중화된다.
    const hit: Option = { id: 'hit', label: '결과 있음 후보' }
    const search = vi
      .fn<(q: string) => Promise<Option[]>>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([hit])

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
        debounceMs={0}
      />,
    )

    const input = screen.getByRole('combobox', { name: '검색' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '없음' } })

    // 빈 결과 → '검색 결과 없음'(role=status). 실제 listbox 가 아니므로 aria-expanded false.
    await screen.findByText('검색 결과 없음')
    expect(input.getAttribute('aria-expanded')).toBe('false')

    // 새 유효 입력 — status='idle' 동기 중화로 '검색 결과 없음'(showEmpty=done+빈 후보)이 즉시 사라진다.
    fireEvent.change(input, { target: { value: '있음' } })
    expect(screen.queryByText('검색 결과 없음')).toBeNull()

    // 재검색 hit → 후보 전이.
    await screen.findByText('결과 있음 후보')
    expect(input.getAttribute('aria-expanded')).toBe('true')
  })
})
