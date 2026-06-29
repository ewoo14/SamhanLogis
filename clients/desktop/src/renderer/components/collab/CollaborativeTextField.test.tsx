// @vitest-environment jsdom
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CollaborativeTextField } from './CollaborativeTextField'
import type { CoeditProvider } from '../../realtime/createCoeditProvider'

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
})
