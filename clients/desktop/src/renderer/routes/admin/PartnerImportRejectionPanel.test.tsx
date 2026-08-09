// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { PartnerImportRejectionPanel } from './PartnerImportRejectionPanel'

const listMock = vi.fn()
vi.mock('../../api/partnerImportApi', () => ({
  listPartnerImportRejections: (...args: unknown[]) => listMock(...args),
}))

describe('PartnerImportRejectionPanel', () => {
  it('보류 0건이면 빈 상태를 표시한다', async () => {
    listMock.mockResolvedValueOnce({ content: [], totalElements: 0, totalPages: 0, number: 0, size: 100, first: true, last: true })
    render(<PartnerImportRejectionPanel sourceFileHash="hash-0" />)
    expect(await screen.findByText('보류·거부 행이 없습니다.')).toBeTruthy()
  })

  it('페이지 API의 보류 행에 행 번호·사유·코드·상호를 표시한다', async () => {
    listMock.mockResolvedValueOnce({
      content: [{ rowNumber: 1002, reason: 'CSV_ENCODING', rawPartnerCode: '읽을 수 없음', rawName: '읽을 수 없음' }],
      totalElements: 1000, totalPages: 10, number: 9, size: 100, first: false, last: true,
    })
    render(<PartnerImportRejectionPanel sourceFileHash="hash-1000" />)
    expect(await screen.findByText('1002')).toBeTruthy()
    expect(screen.getByText('CSV_ENCODING')).toBeTruthy()
    expect(screen.getAllByText('읽을 수 없음')).toHaveLength(2)
    expect(screen.getByText(/1,000건/)).toBeTruthy()
  })
})
