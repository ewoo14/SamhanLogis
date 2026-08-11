import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  buildSalesSlipLedgerRequest,
  resolveSalesSlipPartnerHeader,
  toSalesSlipLedgerDisplay,
} from './salesSlipLedger'

const salesSlip = {
  partnerName: '삼한공조',
  partnerCode: 'P-001',
  businessNumber: '123-45-67890',
  slipDate: '2026-08-10',
}

describe('PR #1131 S1 판매전표 헤더·전잔·후잔', () => {
  it('RED-A A-1 판매전표 헤더 거래처를 다시 입력하지 않아도 자동 채운다', () => {
    expect(resolveSalesSlipPartnerHeader(salesSlip)).toEqual({
      name: '삼한공조',
      partnerCode: 'P-001',
      businessNumber: '123-45-67890',
    })
  })

  it('RED-A A-2 accounting-service가 계산한 전잔·후잔을 그대로 표시한다', () => {
    const request = buildSalesSlipLedgerRequest(salesSlip)
    expect(request).toEqual({ partnerCode: 'P-001', from: '2026-08-10', to: '2026-08-10' })
    expect(toSalesSlipLedgerDisplay({
      status: 'success',
      openingBalance: '120000',
      closingBalance: '175000',
    })).toEqual({ status: 'success', openingBalance: '120000', closingBalance: '175000' })
  })

  it('저장 후 상세 원장 조회에는 대상 slipNo가 포함된다', () => {
    expect(buildSalesSlipLedgerRequest({ ...salesSlip, slipNo: '2026/08/10-7' })).toEqual({
      partnerCode: 'P-001', from: '2026-08-10', to: '2026-08-10', slipNo: '2026/08/10-7',
    })
  })

  it('성공 응답이어도 잔액 필드가 없으면 조회 실패로 표시한다', () => {
    expect(toSalesSlipLedgerDisplay({ status: 'success' })).toEqual({
      status: 'error', message: '전잔·후잔 잔액 정보가 없습니다.',
    })
  })

  it('RED-B B-1 거래처가 비어 있는 기존 전표도 원장 조회 없이 안전하게 표시한다', () => {
    expect(buildSalesSlipLedgerRequest({ ...salesSlip, partnerCode: null })).toBeNull()
    expect(resolveSalesSlipPartnerHeader({
      ...salesSlip,
      partnerName: null,
      partnerCode: null,
      businessNumber: null,
    })).toEqual({ name: '', partnerCode: '', businessNumber: '' })
  })

  it('RED-B B-2 원장 조회 실패를 실제 0원과 구분한다', () => {
    expect(toSalesSlipLedgerDisplay({ status: 'error' })).toEqual({
      status: 'error',
      message: '전잔·후잔을 불러오지 못했습니다.',
    })
    expect(toSalesSlipLedgerDisplay({
      status: 'success',
      openingBalance: '0',
      closingBalance: '0',
    })).toEqual({ status: 'success', openingBalance: '0', closingBalance: '0' })
  })

  it('RED-B B-3 원장 오류가 기존 전표 상세 열을 제거하지 않는다', () => {
    const source = readFileSync(
      fileURLToPath(new URL('./SlipDetailPage.tsx', import.meta.url)),
      'utf8',
    )
    expect(source).toContain('testId="slip-detail-business-number"')
    expect(source).toContain('testId="slip-detail-delivery-address"')
    expect(source).toContain('testId="slip-detail-payment-due-date"')
  })
})
