// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getExternalSalesUrl, SalesExternalLink } from './SalesExternalLink'

describe('SalesExternalLink', () => {
  afterEach(() => cleanup())

  it('권한이 없으면 외부 웹앱 진입구를 렌더링하지 않는다', () => {
    render(<SalesExternalLink show={false} envKey="VITE_WEB_ORDER_URL" label="웹 주문서" />)

    expect(screen.queryByRole('button', { name: '웹 주문서 ↗' })).toBeNull()
  })

  it('URL이 설정되면 Electron bridge로 외부 웹앱을 연다', async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined)
    Object.assign(window, { samhanLegacy: { openExternal } })
    render(<SalesExternalLink show envKey="VITE_WEB_ORDER_URL" label="웹 주문서" url="https://orders.example" />)

    const button = screen.getByRole('button', { name: '웹 주문서 ↗' })
    expect(button.classList.contains('app-sidebar-link')).toBe(true)
    expect(button.getAttribute('style')).toBeNull()
    fireEvent.click(button)

    expect(openExternal).toHaveBeenCalledWith('https://orders.example')
  })

  it('URL이 없으면 외부 앱을 열지 않고 fail-closed 안내를 표시한다', () => {
    const openExternal = vi.fn()
    Object.assign(window, { samhanLegacy: { openExternal } })
    render(<SalesExternalLink show envKey="VITE_WEB_ORDER_URL" label="웹 주문서" />)

    fireEvent.click(screen.getByRole('button', { name: '웹 주문서 ↗' }))

    expect(openExternal).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toContain('외부 웹앱 주소가 운영 빌드에 설정되지 않았습니다')
  })

  it('빌드 환경변수 값을 그대로 사용한다', () => {
    expect(getExternalSalesUrl('https://estimate.example')).toBe('https://estimate.example')
    expect(getExternalSalesUrl('')).toBeNull()
    expect(getExternalSalesUrl(undefined)).toBeNull()
  })
})
