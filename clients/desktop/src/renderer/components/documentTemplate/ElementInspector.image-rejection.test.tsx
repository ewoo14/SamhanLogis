// @vitest-environment jsdom

import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ElementInspector } from './ElementInspector'
import { GROUPWARE_DEFAULT } from '../../print/approvalDefaultTemplate'
import { maxImageBytesForDocument } from '../../print/templateSchema'

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

  it('큰 미지원 형식은 파일 크기와 무관하게 지원 형식 불일치 사유를 안내한다', async () => {
    const bytes = new Uint8Array(67_854)
    bytes.set(new TextEncoder().encode('BM'))
    renderImageInspector()

    fireEvent.change(screen.getByLabelText('파일에서 선택'), {
      target: { files: [fileOf(bytes, 'large-unsupported.bmp', 'image/bmp')] },
    })

    const alert = await waitFor(() => screen.getByRole('alert'))
    expect(alert.textContent).toContain('비어 있거나 지원되는 PNG/JPEG/WebP 형식이 아니어서')
    expect(alert.textContent).not.toContain('최대')
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

  // ubuntu-latest: jsdom과 Web API만 사용하며 경로 구분자·OS 네이티브 파일 선택기에 의존하지 않는다.
  it('파일을 고르기 전에 허용 형식과 현재 양식의 이미지 최대 크기를 안내한다', () => {
    const document = structuredClone(GROUPWARE_DEFAULT.document)
    document.bands.find((band) => band.kind === 'HEADER')!.elements.push({
      key: 'image-1',
      type: 'IMAGE',
      src: '/print-logo.svg',
      alt: '이미지',
    })
    const maxKilobytes = Math.floor(maxImageBytesForDocument(document, 'image-1') / 1024)

    render(
      <ElementInspector
        element={{ key: 'image-1', type: 'IMAGE', src: '/print-logo.svg', alt: '이미지' }}
        document={document}
        onUpdate={vi.fn()}
        {...commonProps}
      />,
    )

    expect(screen.getByText(/PNG\/JPEG\/WebP/).textContent).toContain(`최대 ${maxKilobytes}KB`)
    expect((screen.getByLabelText('파일에서 선택') as HTMLInputElement).accept).toBe('image/png,image/jpeg,image/webp')
  })

  // ubuntu-latest: jsdom과 Web API만 사용하며 경로 구분자·OS 네이티브 파일 선택기에 의존하지 않는다.
  it('크기 초과 시 이미지 예산을 회복하는 방법을 함께 안내한다', async () => {
    const bytes = new Uint8Array(50 * 1024 + 1)
    bytes.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    renderImageInspector()

    fireEvent.change(screen.getByLabelText('파일에서 선택'), {
      target: { files: [fileOf(bytes, 'over-limit.png', 'image/png')] },
    })

    const alert = await waitFor(() => screen.getByRole('alert'))
    expect(alert.textContent).toContain('더 작은 이미지로 바꾸거나 다른 이미지 요소를 삭제·교체한 뒤 다시 선택하세요.')
  })

  // ubuntu-latest: jsdom과 Web API만 사용하며 경로 구분자·OS 네이티브 파일 선택기에 의존하지 않는다.
  it.each([
    ['PNG', Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), 'image/png'],
    ['JPEG', Uint8Array.from([0xFF, 0xD8, 0xFF]), 'image/jpeg'],
    ['WebP', Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]), 'image/webp'],
  ])('%s는 기존 허용 범위대로 계속 통과한다', async (_format, bytes, type) => {
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    })
    const onUpdate = renderImageInspector()

    fireEvent.change(screen.getByLabelText('파일에서 선택'), {
      target: { files: [fileOf(bytes, `valid.${type.slice(6)}`, type)] },
    })

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith({ src: expect.stringContaining(`data:${type};base64,`) }))
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
