// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DocumentNumberLink } from './DocumentNumberLink'

function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname}</output>
}

describe('DocumentNumberLink', () => {
  it('번호를 클릭하면 전달된 상세 경로로 이동한다', () => {
    render(
      <MemoryRouter initialEntries={['/list']}>
        <DocumentNumberLink number="2026/08/15-1" to="/documents/42" />
        <LocationProbe />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('link', { name: '2026/08/15-1 상세 보기' }))

    expect(screen.getByTestId('location').textContent).toBe('/documents/42')
  })

  it('번호 또는 상세 경로가 비어 있으면 깨진 링크를 만들지 않는다', () => {
    render(
      <MemoryRouter>
        <DocumentNumberLink number="" to="/documents/42" />
        <DocumentNumberLink number="2026/08/15-2" to="" />
      </MemoryRouter>,
    )

    expect(screen.queryAllByRole('link').map((link) => link.textContent)).not.toContain('2026/08/15-2')
    expect(screen.getByText('2026/08/15-2').tagName).toBe('SPAN')
  })
})
