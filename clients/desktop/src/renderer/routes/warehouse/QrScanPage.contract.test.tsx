// @vitest-environment jsdom
import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { QrScanPage } from './QrScanPage'

vi.mock('../../api/slip', () => ({ listSlips: vi.fn().mockResolvedValue({ content: [] }) }))
vi.mock('../../api/inventory', () => ({ confirmQrScan: vi.fn() }))
vi.mock('../../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }))

describe('QrScanPage', () => {
  it('확정 전에는 부분 성공으로 오해할 문구를 표시하지 않고 전체 확정 안내를 표시한다', () => {
    render(<QueryClientProvider client={new QueryClient()}><QrScanPage /></QueryClientProvider>)

    expect(screen.getByText('전부 되거나 전부 취소됩니다')).toBeTruthy()
    expect(screen.getByText(/스캔한 개체는 확정 전까지 재고에 반영되지 않습니다/)).toBeTruthy()
    expect(screen.getByLabelText('QR 스캔 입력')).toBeTruthy()
  })
})
