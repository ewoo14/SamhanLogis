// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as Y from 'yjs'
import { CollaborativeTextField } from './CollaborativeTextField'
import type { CoeditProvider, RemoteFieldEdit } from '../../realtime/createCoeditProvider'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('CollaborativeTextField', () => {
  it('remote awareness cursor label을 렌더하고 내부 식별자는 노출하지 않는다', () => {
    const provider: CoeditProvider = {
      text: { toString: () => '협업 메모' } as CoeditProvider['text'],
      awareness: {} as CoeditProvider['awareness'],
      applyRemoteUpdate: vi.fn(),
      applyRemoteAwareness: vi.fn(),
      setLocalCursor: vi.fn(),
      getRemoteCursors: () => [
        {
          clientId: 123,
          displayName: '원격 사용자',
          color: '#16A34A',
          anchor: 1,
          head: 3,
        },
      ],
      setLocalLastEdit: vi.fn(),
      getRemoteEdits: vi.fn((): RemoteFieldEdit[] => []),
      subscribeText: () => () => undefined,
      subscribeAwareness: () => () => undefined,
      destroy: vi.fn(),
    }

    render(
      <CollaborativeTextField
        slipId="10000000-0000-0000-0000-000000000001"
        fieldName="memo"
        label="협업 메모"
        providerOverride={provider}
      />,
    )

    expect((screen.getByLabelText('협업 메모') as HTMLTextAreaElement).value).toBe('협업 메모')
    expect(screen.getByTestId('coedit-remote-cursor-123').textContent).toContain('원격 사용자')
    expect(screen.queryByText('10000000-0000-0000-0000-000000000001')).toBeNull()
    expect(screen.queryByText('123')).toBeNull()
  })

  it('preserves remote text updates that arrive during IME composition', () => {
    const doc = new Y.Doc()
    const text = doc.getText('memo')
    text.insert(0, 'base')
    let textListener: (() => void) | null = null
    const provider: CoeditProvider = {
      text,
      awareness: {} as CoeditProvider['awareness'],
      applyRemoteUpdate: vi.fn(),
      applyRemoteAwareness: vi.fn(),
      setLocalCursor: vi.fn(),
      getRemoteCursors: () => [],
      setLocalLastEdit: vi.fn(),
      getRemoteEdits: vi.fn((): RemoteFieldEdit[] => []),
      subscribeText: (listener) => {
        textListener = listener
        return () => undefined
      },
      subscribeAwareness: () => () => undefined,
      destroy: vi.fn(),
    }

    render(
      <CollaborativeTextField
        slipId="10000000-0000-0000-0000-000000000001"
        fieldName="memo"
        label="memo"
        providerOverride={provider}
      />,
    )

    const textarea = screen.getByLabelText('memo') as HTMLTextAreaElement
    textarea.setSelectionRange(4, 4)
    fireEvent.compositionStart(textarea)
    fireEvent.change(textarea, { target: { value: 'base가' } })

    act(() => {
      text.insert(0, 'remote ')
      textListener?.()
    })

    expect(textarea.value).toBe('base가')
    fireEvent.compositionEnd(textarea)

    expect(textarea.value).toBe('remote base가')
    expect(text.toString()).toContain('remote ')
    expect(text.toString()).toContain('가')
  })

  it('keeps the local caret position when remote text is inserted before it', async () => {
    const doc = new Y.Doc()
    const text = doc.getText('memo')
    text.insert(0, 'base')
    let textListener: (() => void) | null = null
    const provider: CoeditProvider = {
      text,
      awareness: {} as CoeditProvider['awareness'],
      applyRemoteUpdate: vi.fn(),
      applyRemoteAwareness: vi.fn(),
      setLocalCursor: vi.fn(),
      getRemoteCursors: () => [],
      setLocalLastEdit: vi.fn(),
      getRemoteEdits: vi.fn((): RemoteFieldEdit[] => []),
      subscribeText: (listener) => {
        textListener = listener
        return () => undefined
      },
      subscribeAwareness: () => () => undefined,
      destroy: vi.fn(),
    }

    render(
      <CollaborativeTextField
        slipId="10000000-0000-0000-0000-000000000001"
        fieldName="memo"
        label="memo"
        providerOverride={provider}
      />,
    )

    const textarea = screen.getByLabelText('memo') as HTMLTextAreaElement
    textarea.setSelectionRange(4, 4)
    fireEvent.select(textarea)

    act(() => {
      text.insert(0, 'remote ')
      textListener?.()
    })
    await Promise.resolve()

    expect(textarea.value).toBe('remote base')
    expect(textarea.selectionStart).toBe('remote base'.length)
    expect(textarea.selectionEnd).toBe('remote base'.length)
  })

  it('메모 원격 lastEdit 펄스를 표시하고 로컬 변경 시 lastEdit를 송신한다', () => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    const text = new Y.Doc().getText('memo')
    const edit: RemoteFieldEdit = {
      clientId: 456,
      displayName: '김영업',
      color: '#DB2777',
      fieldPath: 'header.memo',
      ts: 0,
    }
    const setLocalLastEdit = vi.fn()
    const provider: CoeditProvider = {
      text,
      awareness: {} as CoeditProvider['awareness'],
      applyRemoteUpdate: vi.fn(),
      applyRemoteAwareness: vi.fn(),
      setLocalCursor: vi.fn(),
      getRemoteCursors: () => [],
      setLocalLastEdit,
      getRemoteEdits: vi.fn((fieldPath?: string) => (
        fieldPath === 'header.memo' && Date.now() - edit.ts < 2_500 ? [edit] : []
      )),
      subscribeText: () => () => undefined,
      subscribeAwareness: () => () => undefined,
      destroy: vi.fn(),
    }

    render(
      <CollaborativeTextField
        slipId="10000000-0000-0000-0000-000000000001"
        fieldName="memo"
        label="memo"
        providerOverride={provider}
      />,
    )

    expect(screen.getByTestId('memo-coedit-edit-pulse')).toBeTruthy()
    expect(screen.getByText('김영업 수정')).toBeTruthy()

    const textarea = screen.getByLabelText('memo') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: '로컬 메모' } })
    expect(setLocalLastEdit).toHaveBeenCalledWith('header.memo')

    act(() => vi.advanceTimersByTime(2_500))

    expect(screen.queryByTestId('memo-coedit-edit-pulse')).toBeNull()
    expect(screen.queryByText('김영업 수정')).toBeNull()
  })
})
