import { describe, expect, it } from 'vitest'
import { AxiosError } from 'axios'
import { extractApiErrorMessage, getApiErrorInfo } from './apiError'

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
})
