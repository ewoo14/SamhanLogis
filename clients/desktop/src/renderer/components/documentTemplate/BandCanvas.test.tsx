// @vitest-environment jsdom

import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { BandCanvas } from './BandCanvas'

afterEach(() => cleanup())

describe('BandCanvas image identity', () => {
  it('동일 alt 네 이미지 행도 각 exact key를 화면과 접근 가능한 이름으로 노출한다', () => {
    const keys = ['image-row-a', 'image-row-b', 'image-row-c', 'image-row-d']
    const bands = [{
      key: 'header-band',
      kind: 'HEADER' as const,
      elements: keys.map((key) => ({
        key,
        type: 'IMAGE' as const,
        src: '/print-logo.svg',
        alt: '동일 대체 문구',
      })),
    }]

    render(<BandCanvas bands={bands} selectedKey={null} onSelect={vi.fn()} onMove={vi.fn()} canEdit />)

    for (const key of keys) {
      expect(screen.getByText(`요소 key: ${key}`)).toBeTruthy()
      expect(screen.getByTestId(`template-element-${key}`).getAttribute('aria-label')).toContain(key)
    }
  })
})
