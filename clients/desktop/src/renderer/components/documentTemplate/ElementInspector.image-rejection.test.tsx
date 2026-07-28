// @vitest-environment jsdom

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ElementInspector } from './ElementInspector'

const originalDecode = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'decode')

const commonProps = {
  onRemove: vi.fn(),
  canEdit: true,
}

function renderImageInspector() {
  const onUpdate = vi.fn()
  render(
    <ElementInspector
      element={{ key: 'image-1', type: 'IMAGE', src: '/print-logo.svg', alt: '이미지' }}
      onUpdate={onUpdate}
      {...commonProps}
    />,
  )
  return onUpdate
}

function fileOf(bytes: Uint8Array, name: string, type: string) {
  return new File([bytes], name, { type })
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  if (originalDecode) {
    Object.defineProperty(HTMLImageElement.prototype, 'decode', originalDecode)
  } else {
    delete (HTMLImageElement.prototype as HTMLImageElement & { decode?: unknown }).decode
  }
})

describe('#968 SOL 결함2 — 파일 거부 사유', () => {
  it.each([
    ['zero-byte.png', fileOf(new Uint8Array(), 'zero-byte.png', 'image/png')],
    ['text-renamed.png', fileOf(new TextEncoder().encode('this is not an image'), 'text-renamed.png', 'image/png')],
  ])('%s는 용량 초과가 아니라 빈 파일·지원 형식 불일치 사유를 안내한다', async (_name, file) => {
    const onUpdate = renderImageInspector()

    fireEvent.change(screen.getByLabelText('파일에서 선택'), { target: { files: [file] } })

    const alert = await waitFor(() => screen.getByRole('alert'))
    expect(alert.textContent).toContain('비어 있거나 지원되는 PNG/JPEG/WebP 형식이 아니어서')
    expect(alert.textContent).not.toContain('최대')
    expect(onUpdate).not.toHaveBeenCalledWith({ src: expect.stringContaining('data:image/png;base64') })
  })

  it('실제 파일이 허용 상한을 넘으면 용량 초과 사유를 유지한다', async () => {
    const bytes = new Uint8Array(50 * 1024 + 1)
    bytes.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    renderImageInspector()

    fireEvent.change(screen.getByLabelText('파일에서 선택'), {
      target: { files: [fileOf(bytes, 'over-limit.png', 'image/png')] },
    })

    const alert = await waitFor(() => screen.getByRole('alert'))
    expect(alert.textContent).toContain('최대')
    expect(alert.textContent).toContain('KB')
  })

  it('허용 시그니처지만 구조가 손상된 이미지는 디코드 실패 사유를 안내한다', async () => {
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new DOMException('디코드 실패', 'EncodingError')),
    })
    const pngHeaderOnly = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    const onUpdate = renderImageInspector()

    fireEvent.change(screen.getByLabelText('파일에서 선택'), {
      target: { files: [fileOf(pngHeaderOnly, 'truncated.png', 'image/png')] },
    })

    const alert = await waitFor(() => screen.getByRole('alert'))
    expect(alert.textContent).toContain('표시할 수 없어')
    expect(alert.textContent).not.toContain('최대')
    expect(onUpdate).not.toHaveBeenCalledWith({ src: expect.stringContaining('data:image/png;base64') })
  })
})
