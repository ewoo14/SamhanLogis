// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import * as Y from 'yjs'
import { CollaborativeTextField } from './CollaborativeTextField'
import type { CoeditProvider } from '../../realtime/createCoeditProvider'

afterEach(() => cleanup())

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
})
