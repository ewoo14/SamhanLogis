// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { createCoeditProviderMock } = vi.hoisted(() => ({
  createCoeditProviderMock: vi.fn(),
}))

vi.mock('../../realtime/createCoeditProvider', async () => {
  const actual = await vi.importActual<typeof import('../../realtime/createCoeditProvider')>(
    '../../realtime/createCoeditProvider',
  )
  return {
    ...actual,
    createCoeditProvider: createCoeditProviderMock,
  }
})

import { CollaborativeTextField } from './CollaborativeTextField'

afterEach(() => {
  cleanup()
  createCoeditProviderMock.mockReset()
  vi.restoreAllMocks()
})

describe('CollaborativeTextField provider 초기화 상태', () => {
  it('provider 로딩 중에는 저장되지 않는 로컬 입력을 막는다', () => {
    createCoeditProviderMock.mockReturnValue(new Promise(() => undefined))

    render(
      <CollaborativeTextField
        documentId="order-1"
        basePath="/partner-orders/order-1"
        fieldName="memo"
        label="협업 메모"
      />,
    )

    const textarea = screen.getByLabelText('협업 메모') as HTMLTextAreaElement
    expect(textarea.readOnly).toBe(true)
    expect(screen.getByText('협업 메모 연결 중...')).toBeTruthy()

    fireEvent.change(textarea, { target: { value: '저장되지 않아야 하는 입력' } })
    expect(textarea.value).toBe('')
  })

  it('provider 초기화 실패 시 입력을 잠그고 사용자에게 실패 상태를 표시한다', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    createCoeditProviderMock.mockRejectedValueOnce(new Error('network down'))

    render(
      <CollaborativeTextField
        documentId="order-1"
        basePath="/partner-orders/order-1"
        fieldName="memo"
        label="협업 메모"
      />,
    )

    const textarea = screen.getByLabelText('협업 메모') as HTMLTextAreaElement

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('협업 메모 연결에 실패했습니다')
    })
    expect(textarea.readOnly).toBe(true)

    fireEvent.change(textarea, { target: { value: '유실되면 안 되는 입력' } })
    expect(textarea.value).toBe('')
    warnSpy.mockRestore()
  })
})
