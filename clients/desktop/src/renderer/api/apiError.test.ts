import { describe, expect, it } from 'vitest'
import { AxiosError } from 'axios'
import {
  extractApiErrorMessage,
  extractApiErrorResponseMessage,
  extractSalesSlipUserReason,
  getApiErrorInfo,
  isPartnerLookupUnavailableError,
} from './apiError'

function axiosError(status: number, data: unknown): AxiosError {
  return new AxiosError(
    'Request failed',
    undefined,
    undefined,
    undefined,
    {
      data,
      status,
      statusText: 'Error',
      headers: {},
      config: {} as never,
    },
  )
}

describe('apiError helpers', () => {
  it('매출전표 저장 409의 사용자용 사유를 반환한다', () => {
    expect(extractSalesSlipUserReason(axiosError(409, {
      success: false,
      code: 'CONFLICT',
      message: '일마감 금액 검증이 완료되지 않았습니다. 금액 검증을 완료해 주세요.',
    }))).toBe('일마감 금액 검증이 완료되지 않았습니다. 금액 검증을 완료해 주세요.')
  })

  it('매출전표 저장 사유가 없거나 내부 문자열이면 null을 반환한다', () => {
    expect(extractSalesSlipUserReason(axiosError(409, {
      success: false,
      code: 'CONFLICT',
      message: '  ',
    }))).toBeNull()
    expect(extractSalesSlipUserReason(axiosError(409, {
      success: false,
      code: 'CONFLICT',
      message: 'java.lang.IllegalStateException: source=00000000-0000-4000-8000-000000000001',
    }))).toBeNull()
  })

  it('409가 아닌 오류와 다른 오류 코드는 사용자용 사유로 취급하지 않는다', () => {
    expect(extractSalesSlipUserReason(axiosError(422, {
      success: false,
      code: 'SAS_LINE_AMOUNT_MISMATCH',
      message: '라인 합계가 일치하지 않습니다.',
    }))).toBeNull()
    expect(extractSalesSlipUserReason(new Error('boom'))).toBeNull()
  })

  it('extracts backend message before axios message', () => {
    const err = axiosError(409, {
      success: false,
      code: 'CONFLICT',
      message: '원분개 일자가 마감된 회계 기간입니다.',
    })

    expect(extractApiErrorMessage(err)).toBe('원분개 일자가 마감된 회계 기간입니다.')
  })

  it('falls back to Error.message when backend message is absent', () => {
    expect(extractApiErrorMessage(new Error('Request failed with status code 409'))).toBe(
      'Request failed with status code 409',
    )
  })

  it('returns status and response data for axios errors', () => {
    const data = { message: 'blocked' }
    const err = axiosError(422, data)

    expect(getApiErrorInfo(err)).toEqual({ status: 422, data })
  })

  it('keeps combined closing and cutoff guidance for the desktop error surface', () => {
    const message = 'REGION 당일 마감(12:00) 초과 — 익일 출고로 생성하세요'

    expect(extractApiErrorResponseMessage(axiosError(409, {
      success: false,
      code: 'CONFLICT',
      message,
    }))).toBe(message)
  })

  it('returns null when axios response has no usable backend message (원본 에러 보존 분기)', () => {
    expect(extractApiErrorResponseMessage(axiosError(500, {}))).toBeNull()
    expect(extractApiErrorResponseMessage(axiosError(500, { message: '   ' }))).toBeNull()
    expect(extractApiErrorResponseMessage(new Error('boom'))).toBeNull()
  })

  describe('isPartnerLookupUnavailableError (#831 후속 — 거래처 조회 UNAVAILABLE 502 분류)', () => {
    it('502 + code=PARTNER_IDENTITY_LOOKUP_UNAVAILABLE 이면 true', () => {
      const err = axiosError(502, {
        success: false,
        code: 'PARTNER_IDENTITY_LOOKUP_UNAVAILABLE',
        message: '거래처 조회를 일시적으로 할 수 없습니다. 잠시 후 다시 시도해 주세요.',
      })
      expect(isPartnerLookupUnavailableError(err)).toBe(true)
    })

    it('같은 502 라도 code 가 다르면(예: ETAX_SUBMIT_FAILED) false — 다른 502 원인과 혼동 금지', () => {
      const err = axiosError(502, { success: false, code: 'ETAX_SUBMIT_FAILED', message: 'e-Tax 전송 중 오류' })
      expect(isPartnerLookupUnavailableError(err)).toBe(false)
    })

    it('code 는 일치해도 status 가 502 가 아니면 false', () => {
      const err = axiosError(500, { success: false, code: 'PARTNER_IDENTITY_LOOKUP_UNAVAILABLE', message: 'x' })
      expect(isPartnerLookupUnavailableError(err)).toBe(false)
    })

    it('axios 오류가 아닌 일반 Error 는 false', () => {
      expect(isPartnerLookupUnavailableError(new Error('boom'))).toBe(false)
    })

    it('undefined/null 입력도 안전하게 false', () => {
      expect(isPartnerLookupUnavailableError(undefined)).toBe(false)
      expect(isPartnerLookupUnavailableError(null)).toBe(false)
    })
  })
})
