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
