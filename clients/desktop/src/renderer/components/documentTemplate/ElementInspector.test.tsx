// @vitest-environment jsdom

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ElementInspector } from './ElementInspector'

afterEach(() => cleanup())

const textElement = {
  key: 'text-1',
  type: 'TEXT' as const,
  text: '좌표 테스트',
}

const commonProps = {
  onRemove: vi.fn(),
  canEdit: true,
}

const chromiumRejectedVp8lVersionOne = 'UklGRhIAAABXRUJQVlA4TAYAAAAvA8AAIAA='

describe('ElementInspector PR #914 residual gates', () => {
  it('현재 선택한 요소의 exact key를 화면에 노출한다', () => {
    render(
      <ElementInspector
        element={{ key: 'image-row-b', type: 'IMAGE', src: '/print-logo.svg', alt: '동일 대체 문구' }}
        onUpdate={vi.fn()}
        {...commonProps}
      />,
    )

    expect(screen.getByText('요소 key: image-row-b')).toBeTruthy()
  })

  it('geometry가 없으면 위치 입력값을 저장된 상태가 없는 빈 값으로 표시한다', () => {
    render(<ElementInspector element={textElement} onUpdate={vi.fn()} {...commonProps} />)

    expect((screen.getByLabelText('가로 위치(x, %)') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('세로 위치(y, %)') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('가로 크기(w, %)') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('세로 크기(h, %)') as HTMLInputElement).value).toBe('')
  })

  it('C1: Chromium이 디코드하지 못한 WebP는 source를 draft에 반영하지 않고 저장 전에 알린다', async () => {
    const onUpdate = vi.fn()
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new DOMException('The image could not be decoded.', 'EncodingError')),
    })
    const bytes = Uint8Array.from(atob(chromiumRejectedVp8lVersionOne), (character) => character.charCodeAt(0))

    render(
      <ElementInspector
        element={{ key: 'image-1', type: 'IMAGE', src: '/print-logo.svg', alt: '문제 이미지' }}
        onUpdate={onUpdate}
        {...commonProps}
      />,
    )

    fireEvent.change(screen.getByLabelText('파일에서 선택'), {
      target: { files: [new File([bytes], 'undecodable.webp', { type: 'image/webp' })] },
    })

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('표시할 수 없어'))
    expect(onUpdate).not.toHaveBeenCalledWith({ src: expect.stringContaining('data:image/webp;base64') })
  })

  it('빈 좌표 칸에 사용자가 0을 입력하면 기본 geometry를 실제 저장 patch로 생성한다', () => {
    const onUpdate = vi.fn()
    render(<ElementInspector element={textElement} onUpdate={onUpdate} {...commonProps} />)

    fireEvent.change(screen.getByLabelText('가로 위치(x, %)'), { target: { value: '0' } })

    expect(onUpdate).toHaveBeenCalledWith({ geometry: { x: 0, y: 0, w: 100, h: 10 } })
  })

  it('현재 양식의 본문 필드를 직접 입력하지 않고 선택해 binding을 저장한다', () => {
    const onUpdate = vi.fn()
    render(
      <ElementInspector
        element={{ key: 'field-1', type: 'FIELD', binding: 'header.docNo' }}
        onUpdate={onUpdate}
        fieldOptions={[{ fieldKey: 'expenseItem', label: '지출항목' }]}
        {...commonProps}
      />,
    )

    const binding = screen.getByLabelText('표시할 값') as HTMLSelectElement
    expect(binding.querySelector('option[value="body.fieldRow[expenseItem]"]')?.textContent)
      .toBe('본문 필드 · 지출항목')
    fireEvent.change(binding, { target: { value: 'body.fieldRow[expenseItem]' } })

    expect(onUpdate).toHaveBeenCalledWith({ binding: 'body.fieldRow[expenseItem]' })
    expect(screen.queryByLabelText('본문 필드 키')).toBeNull()
  })
})

describe('SONNET5 라운드 fix N-4 — 좌표를 만들 수 있으면 되돌릴 수도 있다', () => {
  it('geometry가 없으면 좌표 해제 버튼이 없다(해제할 것이 없다)', () => {
    render(<ElementInspector element={textElement} onUpdate={vi.fn()} {...commonProps} />)

    expect(screen.queryByRole('button', { name: '좌표 해제' })).toBeNull()
  })

  it('A-4가 보인 갇힌 상태({x:0,y:0,w:0,h:0})도 요소를 삭제하지 않고 좌표 해제로 되돌릴 수 있다', () => {
    const onUpdate = vi.fn()
    const stuckElement = { ...textElement, geometry: { x: 0, y: 0, w: 0, h: 0 } }
    render(<ElementInspector element={stuckElement} onUpdate={onUpdate} {...commonProps} />)

    fireEvent.click(screen.getByRole('button', { name: '좌표 해제' }))

    expect(onUpdate).toHaveBeenCalledWith({ geometry: undefined })
  })

  it('canEdit=false면 좌표 해제 버튼이 비활성화된다', () => {
    const positionedElement = { ...textElement, geometry: { x: 0, y: 0, w: 100, h: 10 } }
    render(<ElementInspector element={positionedElement} onUpdate={vi.fn()} onRemove={vi.fn()} canEdit={false} />)

    expect((screen.getByRole('button', { name: '좌표 해제' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('SONNET5 라운드 fix N-5 — 한 값을 조정했다고 배치 방식이 조용히 바뀌지 않는다(바뀌면 보인다)', () => {
  it('geometry가 없으면(일반 배치) 좌표 배치 상태 문구가 없다', () => {
    render(<ElementInspector element={textElement} onUpdate={vi.fn()} {...commonProps} />)

    expect(screen.queryByText(/좌표로 배치/)).toBeNull()
  })

  it('geometry가 생기면(첫 입력으로 생성됨) 좌표 배치 상태가 화면에 보인다', () => {
    const positionedElement = { ...textElement, geometry: { x: 0, y: 0, w: 100, h: 10 } }
    render(<ElementInspector element={positionedElement} onUpdate={vi.fn()} {...commonProps} />)

    expect(screen.queryByText(/좌표로 배치/)).not.toBeNull()
  })
})

describe('SONNET5 라운드 fix N-3 — 화면은 모르는 것을 안다고 말하지 않는다(조회중/실패/정말없음 구분)', () => {
  const fieldBoundElement = { key: 'field-1', type: 'FIELD' as const, binding: 'body.fieldRow[expenseItem]' as const }

  it('조회 중에는(fieldOptions 미도착) "사용할 수 없는 본문 필드"로 단정하지 않는다', () => {
    render(
      <ElementInspector
        element={fieldBoundElement}
        onUpdate={vi.fn()}
        fieldOptions={[]}
        fieldOptionsStatus="loading"
        {...commonProps}
      />,
    )

    expect(screen.queryByText('현재 양식에서 선택할 수 없는 본문 필드 참조입니다. 목록에서 실제 필드를 선택하세요.')).toBeNull()
    // select 자신이 보여주는 현재 선택 라벨도 "안다고 말하지 않는다" — 로딩 중에는 select value에
    // 매치되는 <option>의 텍스트도 "사용할 수 없는"을 단정해서는 안 된다.
    const binding = screen.getByLabelText('표시할 값') as HTMLSelectElement
    const selectedOption = binding.querySelector(`option[value="${fieldBoundElement.binding}"]`)
    expect(selectedOption?.textContent).not.toContain('사용할 수 없는')
  })

  it('조회 실패는 실패로 고지되고 회복 수단(다시 시도)이 있다', () => {
    const onRetry = vi.fn()
    render(
      <ElementInspector
        element={fieldBoundElement}
        onUpdate={vi.fn()}
        fieldOptions={[]}
        fieldOptionsStatus="error"
        onRetryFieldOptions={onRetry}
        {...commonProps}
      />,
    )

    expect(screen.queryByText('현재 양식에서 선택할 수 없는 본문 필드 참조입니다. 목록에서 실제 필드를 선택하세요.')).toBeNull()
    const retryButton = screen.getByRole('button', { name: '다시 시도' })
    fireEvent.click(retryButton)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('실제로 조회를 마쳤는데(ready) 정말 없는 참조라면 기존처럼 경고한다', () => {
    render(
      <ElementInspector
        element={fieldBoundElement}
        onUpdate={vi.fn()}
        fieldOptions={[]}
        fieldOptionsStatus="ready"
        {...commonProps}
      />,
    )

    expect(screen.queryByText('현재 양식에서 선택할 수 없는 본문 필드 참조입니다. 목록에서 실제 필드를 선택하세요.')).not.toBeNull()
  })

  it('fieldOptionsStatus를 지정하지 않으면 기본은 ready로 취급한다(기존 호출부 하위호환)', () => {
    render(
      <ElementInspector
        element={fieldBoundElement}
        onUpdate={vi.fn()}
        fieldOptions={[]}
        {...commonProps}
      />,
    )

    expect(screen.queryByText('현재 양식에서 선택할 수 없는 본문 필드 참조입니다. 목록에서 실제 필드를 선택하세요.')).not.toBeNull()
  })
})

describe('SONNET5 라운드2 fix(#914) — docType 미선택("모른다")은 조회완료+정말없음("없다")과 다른 사건이다', () => {
  // 실측 재현 경로: 유형=지출결의서 → FIELD 추가 → binding=body.fieldRow[amount](금액, 정상 필드) →
  // 유형을 다시 미선택으로 되돌림. amount 는 실서버 지출결의서의 정상 필드이지 깨진 참조가 아니다.
  const staleAmountBinding = { key: 'field-1', type: 'FIELD' as const, binding: 'body.fieldRow[amount]' as const }

  it('P-2: docType 미선택(enabled:false→빈 배열)에서는 이미 저장된 정상 바인딩을 "사용할 수 없는"이라 단정하지 않는다', () => {
    render(
      <ElementInspector
        element={staleAmountBinding}
        onUpdate={vi.fn()}
        fieldOptions={[]}
        fieldOptionsStatus="unselected"
        {...commonProps}
      />,
    )

    // select 자신이 보여주는 현재 선택 라벨이 "사용할 수 없는"을 단정해서는 안 된다 — N-3가 loading/error에
    // 이미 세운 것과 같은 기준을 unselected에도 적용한다.
    const binding = screen.getByLabelText('표시할 값') as HTMLSelectElement
    const selectedOption = binding.querySelector('option[value="body.fieldRow[amount]"]')
    expect(selectedOption?.textContent).not.toContain('사용할 수 없는')
  })

  it('P-3: docType 미선택에서는 "목록에서 실제 필드를 선택하세요"(이행 불가능한 지시)를 띄우지 않는다', () => {
    render(
      <ElementInspector
        element={staleAmountBinding}
        onUpdate={vi.fn()}
        fieldOptions={[]}
        fieldOptionsStatus="unselected"
        {...commonProps}
      />,
    )

    expect(screen.queryByText('현재 양식에서 선택할 수 없는 본문 필드 참조입니다. 목록에서 실제 필드를 선택하세요.')).toBeNull()
  })

  it('회귀 확인: ready(조회완료)에서 정말 없는 참조는 여전히 기존처럼 경고한다(F-3 계승)', () => {
    render(
      <ElementInspector
        element={staleAmountBinding}
        onUpdate={vi.fn()}
        fieldOptions={[]}
        fieldOptionsStatus="ready"
        {...commonProps}
      />,
    )

    const binding = screen.getByLabelText('표시할 값') as HTMLSelectElement
    const selectedOption = binding.querySelector('option[value="body.fieldRow[amount]"]')
    expect(selectedOption?.textContent).toContain('사용할 수 없는')
    expect(screen.queryByText('현재 양식에서 선택할 수 없는 본문 필드 참조입니다. 목록에서 실제 필드를 선택하세요.')).not.toBeNull()
  })

  it('P-1: 빈 필드 목록 문구가 "문서 유형 미선택"(모른다)과 "정말 필드 0개"(안다·ready)에서 서로 다른 문장이다(Live QA ①/④)', () => {
    const { unmount } = render(
      <ElementInspector
        element={{ key: 'field-2', type: 'FIELD', binding: 'header.docNo' }}
        onUpdate={vi.fn()}
        fieldOptions={[]}
        fieldOptionsStatus="unselected"
        {...commonProps}
      />,
    )
    const unselectedPlaceholder = screen.getByLabelText('표시할 값').querySelector('option[value=""]')?.textContent
    unmount()

    render(
      <ElementInspector
        element={{ key: 'field-3', type: 'FIELD', binding: 'header.docNo' }}
        onUpdate={vi.fn()}
        fieldOptions={[]}
        fieldOptionsStatus="ready"
        {...commonProps}
      />,
    )
    const readyEmptyPlaceholder = screen.getByLabelText('표시할 값').querySelector('option[value=""]')?.textContent

    expect(unselectedPlaceholder).not.toBe(readyEmptyPlaceholder)
    expect(unselectedPlaceholder).toMatch(/문서 유형/)
  })
})
