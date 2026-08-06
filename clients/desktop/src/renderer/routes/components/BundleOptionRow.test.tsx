// @vitest-environment jsdom
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { BundleOptionRow } from './BundleOptionRow'

describe('BundleOptionRow 판넬 옵션 계약', () => {
  it('RED-A: 화면 안내가 서버 도메인의 선택값을 제공하고 선택값을 전달한다', () => {
    const onChange = vi.fn()

    render(
      <BundleOptionRow
        line={{ modelName: '세트 1', setOptions: { panelOption: '' } }}
        index={0}
        onChange={onChange}
      />,
    )

    const panelSelect = screen.getByRole('combobox', { name: '판넬 옵션 (미입력=기본)' })
    expect(screen.getByRole('option', { name: '블랙판넬' })).toBeTruthy()

    fireEvent.change(panelSelect, { target: { value: '블랙판넬' } })

    expect(onChange).toHaveBeenCalledWith({ panelOption: '블랙판넬' })
  })
})
