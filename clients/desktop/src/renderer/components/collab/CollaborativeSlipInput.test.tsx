// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as Y from 'yjs'
import { CollaborativeSlipInput } from './CollaborativeSlipInput'
import type { DocCoeditProvider } from '../../realtime/createCoeditProvider'

afterEach(() => cleanup())

function providerStub(): DocCoeditProvider {
  const doc = new Y.Doc()
  const header = doc.getMap<unknown>('header')
  const items = doc.getArray<Y.Map<unknown>>('items')
  const docListeners = new Set<() => void>()
  const awarenessListeners = new Set<() => void>()
  return {
    doc,
    header,
    items,
    awareness: {} as DocCoeditProvider['awareness'],
    applyRemoteUpdate: vi.fn(),
    applyRemoteAwareness: vi.fn(),
    setLocalCursor: vi.fn(),
    getRemoteCursors: (fieldPath?: string) => (fieldPath === 'items.0.quantity'
      ? [{
          clientId: 77,
          displayName: '김영업',
          color: '#2563EB',
          fieldPath: 'items.0.quantity',
          anchor: 0,
          head: 1,
        }]
      : []),
    getHeaderValue: (fieldName) => String(header.get(fieldName) ?? ''),
    setHeaderValue: (fieldName, value) => {
      header.set(fieldName, value)
      docListeners.forEach((listener) => listener())
    },
    getItemValue: (index, cellName) => String(items.get(index)?.get(cellName) ?? ''),
    setItemValue: (index, cellName, value) => {
      while (items.length <= index) items.push([new Y.Map<unknown>()])
      items.get(index).set(cellName, value)
      docListeners.forEach((listener) => listener())
    },
    replaceItems: vi.fn(),
    isEmpty: () => false,
    subscribeDoc: (listener) => {
      docListeners.add(listener)
      return () => docListeners.delete(listener)
    },
    subscribeAwareness: (listener) => {
      awarenessListeners.add(listener)
      listener()
      return () => awarenessListeners.delete(listener)
    },
    destroy: vi.fn(),
  }
}

describe('CollaborativeSlipInput', () => {
  it('입력값을 Yjs fieldPath 에 쓰고 원격 awareness 라벨은 이름만 표시한다', () => {
    const provider = providerStub()
    const onValueChange = vi.fn()

    render(
      <CollaborativeSlipInput
        provider={provider}
        fieldPath="items.0.quantity"
        value="1"
        onValueChange={onValueChange}
        aria-label="수량 1"
      />,
    )

    fireEvent.change(screen.getByLabelText('수량 1'), { target: { value: '3' } })

    expect(provider.getItemValue(0, 'quantity')).toBe('3')
    expect(onValueChange).toHaveBeenCalledWith('3')
    expect(screen.getByTestId('slip-coedit-field-items-0-quantity').textContent).toContain('김영업')
    expect(screen.queryByText('77')).toBeNull()
  })

  it('provider 문서 변경을 controlled input 값으로 반영한다', () => {
    const provider = providerStub()
    const onValueChange = vi.fn()

    render(
      <CollaborativeSlipInput
        provider={provider}
        fieldPath="header.memo"
        value=""
        onValueChange={onValueChange}
        aria-label="적요"
      />,
    )

    act(() => provider.setHeaderValue('memo', '원격 적요'))

    expect(onValueChange).toHaveBeenCalledWith('원격 적요')
  })
})
