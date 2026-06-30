// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as Y from 'yjs'
import { CollaborativeSlipInput } from './CollaborativeSlipInput'
import type { DocCoeditProvider, RemoteFieldEdit } from '../../realtime/createCoeditProvider'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

type TestDocCoeditProvider = DocCoeditProvider & {
  __emitAwareness: () => void
}

function providerStub(): TestDocCoeditProvider {
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
    setLocalLastEdit: vi.fn(),
    getRemoteEdits: vi.fn((): RemoteFieldEdit[] => []),
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
    __emitAwareness: () => {
      awarenessListeners.forEach((listener) => listener())
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

  it('원격 편집 lastEdit 수신 시 펄스와 수정 배지를 표시하고 2.5초 후 소멸한다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const provider = providerStub()
    const edit: RemoteFieldEdit = {
      clientId: 78,
      displayName: '김영업',
      color: '#DB2777',
      fieldPath: 'header.memo',
      ts: 0,
    }
    provider.getRemoteEdits = vi.fn((fieldPath?: string) => (
      fieldPath === 'header.memo' && Date.now() - edit.ts < 2_500 ? [edit] : []
    ))

    render(
      <CollaborativeSlipInput
        provider={provider}
        fieldPath="header.memo"
        value=""
        onValueChange={() => undefined}
        aria-label="적요"
      />,
    )

    act(() => provider.__emitAwareness())

    expect(screen.getByTestId('slip-coedit-edit-pulse')).toBeTruthy()
    expect(screen.getByText('김영업 수정')).toBeTruthy()

    act(() => vi.advanceTimersByTime(2_500))

    expect(screen.queryByTestId('slip-coedit-edit-pulse')).toBeNull()
    expect(screen.queryByText('김영업 수정')).toBeNull()
  })

  it('coedit 로딩 중(coeditPending)에는 입력을 잠가 Y.Doc 과 modal state 분리를 막는다', () => {
    const onValueChange = vi.fn()

    render(
      <CollaborativeSlipInput
        provider={null}
        fieldPath="header.memo"
        value="기존 적요"
        onValueChange={onValueChange}
        coeditPending
        aria-label="적요"
      />,
    )

    const input = screen.getByLabelText('적요')
    expect((input as HTMLInputElement).readOnly).toBe(true)

    fireEvent.change(input, { target: { value: 'provider 전 입력' } })

    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('coedit 로드 실패/비활성(provider=null·로딩완료) 시엔 평문 편집을 허용해 영구잠금 회귀를 막는다', () => {
    // 콜랩 서버 다운 등으로 provider 가 끝내 null 이어도 사용자가 전표를 편집할 수 있어야 함(리뷰 Opus 라운드2 BLOCKING).
    const onValueChange = vi.fn()

    render(
      <CollaborativeSlipInput
        provider={null}
        fieldPath="header.memo"
        value="기존 적요"
        onValueChange={onValueChange}
        aria-label="적요"
      />,
    )

    const input = screen.getByLabelText('적요')
    expect((input as HTMLInputElement).readOnly).toBe(false)

    fireEvent.change(input, { target: { value: '평문 편집' } })

    expect(onValueChange).toHaveBeenCalledWith('평문 편집')
  })
})
