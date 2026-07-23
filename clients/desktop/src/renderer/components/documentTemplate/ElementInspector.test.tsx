// @vitest-environment jsdom

import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

describe('ElementInspector PR #914 residual gates', () => {
  it('geometry가 없으면 위치 입력값을 저장된 상태가 없는 빈 값으로 표시한다', () => {
    render(<ElementInspector element={textElement} onUpdate={vi.fn()} {...commonProps} />)

    expect((screen.getByLabelText('가로 위치(x, %)') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('세로 위치(y, %)') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('가로 크기(w, %)') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('세로 크기(h, %)') as HTMLInputElement).value).toBe('')
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
